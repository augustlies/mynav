"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(String(k), String(v));
    },
    removeItem(k) {
      store.delete(String(k));
    },
    clear() {
      store.clear();
    },
  };
}

function createMemoryKv() {
  const store = new Map();
  return {
    store,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, val) {
      store.set(key, String(val));
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

function createBrowserEnv({ fetchImpl, onReload } = {}) {
  const localStorage = createMemoryStorage();
  const listeners = new Map();
  const docListeners = new Map();
  const docAttrs = {};

  class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    }
  }
  class Event {
    constructor(type) {
      this.type = type;
    }
  }

  const documentElement = {
    setAttribute(k, v) {
      docAttrs[k] = String(v);
    },
    getAttribute(k) {
      return docAttrs[k] !== undefined ? docAttrs[k] : null;
    },
    removeAttribute(k) {
      delete docAttrs[k];
    },
  };

  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval() { return 0; },
    clearInterval,
    Date,
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Set,
    Map,
    RegExp,
    Error,
    URL,
    Promise,
    CustomEvent,
    Event,
    navigator: { onLine: true },
    location: {
      reload() {
        if (onReload) onReload();
      },
    },
    document: {
      readyState: "complete",
      documentElement,
      head: { appendChild() {} },
      body: { appendChild() {} },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getElementById() { return null; },
      addEventListener(type, fn) {
        if (!docListeners.has(type)) docListeners.set(type, []);
        docListeners.get(type).push(fn);
      },
      dispatchEvent(ev) {
        for (const fn of docListeners.get(ev.type) || []) fn(ev);
      },
      createElement(tag) {
        return {
          tagName: tag.toUpperCase(),
          style: {},
          className: "",
          attributes: {},
          setAttribute(k, v) { this.attributes[k] = String(v); },
          appendChild() {},
          addEventListener() {},
        };
      },
    },
    localStorage,
    fetch: fetchImpl,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatchEvent(ev) {
      for (const fn of listeners.get(ev.type) || []) fn(ev);
    },
  };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);

  const load = (relPath) => {
    const code = fs.readFileSync(path.join(ROOT, relPath), "utf8");
    vm.runInContext(code, context, { filename: relPath });
  };

  load("data.js");
  load("js/storage.js");
  load("js/ledger.js");
  load("js/favorites.js");
  load("js/theme.js");
  load("js/overrides.js");
  load("js/cloud-sync.js");

  context.NavTheme.init();
  context.NavFavorites.init();
  context.NavCloudSync.init();
  return context;
}

function makeServerFetch(syncMod, kv, token) {
  return async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const request = new Request("https://mynav.example" + url, {
      method,
      headers: Object.assign({}, init.headers || {}, { authorization: "Bearer " + token }),
      body: init.body,
    });
    const ctx = { request, env: { MYNAV_KV: kv } };
    if (url.startsWith("/api/sync")) {
      return method === "PUT" ? syncMod.onRequestPut(ctx) : syncMod.onRequestGet(ctx);
    }
    return new Response(JSON.stringify({ error: "not-found" }), { status: 404 });
  };
}

test("visits, ledger slices, and preferences sync end-to-end without location.reload or leaking secrets", async () => {
  const syncMod = await import("../functions/api/sync.js");
  const kv = createMemoryKv();
  await kv.put("session:tok-a", JSON.stringify({ username: "alice", expiresAt: Date.now() + 3600_000 }));
  await kv.put("session:tok-b", JSON.stringify({ username: "alice", expiresAt: Date.now() + 3600_000 }));

  let reloadCountA = 0;
  let reloadCountB = 0;
  const devA = createBrowserEnv({
    fetchImpl: makeServerFetch(syncMod, kv, "tok-a"),
    onReload: () => { reloadCountA += 1; },
  });
  const devB = createBrowserEnv({
    fetchImpl: makeServerFetch(syncMod, kv, "tok-b"),
    onReload: () => { reloadCountB += 1; },
  });

  devA.localStorage.setItem("mynav_arch_sync_token", "tok-a");
  devA.localStorage.setItem("mynav_arch_sync_user", "alice");
  devB.localStorage.setItem("mynav_arch_sync_token", "tok-b");
  devB.localStorage.setItem("mynav_arch_sync_user", "alice");

  // Local-only secrets/snapshots must never enter sync payload
  devA.NavLedger.setAiConfig({ apiKey: "sk-secret-device-a", model: "deepseek-reasoner" });
  devA.NavLedger.setAmberRubbing("chatgpt", { title: "Local Snapshot", html: "<p>local</p>" });
  devB.NavLedger.setAiConfig({ apiKey: "sk-secret-device-b", model: "gpt-4o-mini" });
  devB.NavLedger.setAmberRubbing("github", { title: "Device B Snapshot", html: "<p>b</p>" });

  // Verify aiConfig change alone didn't mark Device A dirty with secrets in payload
  const prePayload = devA.NavCloudSync.buildPayloadData();
  assert.equal(JSON.stringify(prePayload).includes("sk-secret-device-a"), false);
  assert.equal(JSON.stringify(prePayload).includes("Local Snapshot"), false);

  // Device A creates visits, marginalia, constellations, snippets, theme, nierBg, and a site edit
  devA.NavTheme.setMode("dark");
  devA.NavTheme.toggleNierBg();
  devA.NavFavorites.toggle("chatgpt");
  devA.NavLedger.recordAccess("chatgpt");
  devA.NavLedger.recordAccess("chatgpt");
  devA.NavLedger.setMarginalia("chatgpt", "主站入口与 API 文档备注");
  devA.NavLedger.setConstellations([{ id: "c-ai", name: "常驻模型", siteIds: ["chatgpt", "claude"] }]);
  devA.NavOverrides.addSite({ name: "My Site", url: "https://example.org/app", category: "tools" });
  devA.localStorage.setItem("mynav_arch_particles", "false");
  devA.localStorage.setItem("mynav_search_engine_v2", "bing");
  devA.localStorage.setItem("mynav_probe_ignored_v1", JSON.stringify(["internal-site"]));

  const syncedA = await devA.NavCloudSync.syncNow();
  assert.equal(syncedA, true);
  assert.equal(reloadCountA, 0);

  // Device B initially downloads everything without reloading the page
  const syncedB = await devB.NavCloudSync.syncNow();
  assert.equal(syncedB, true);
  assert.equal(reloadCountB, 0);
  assert.equal(devB.NavFavorites.has("chatgpt"), true);
  assert.equal(devB.NavLedger.getStat("chatgpt").count, 2);
  assert.equal(devB.NavLedger.getMarginalia("chatgpt"), "主站入口与 API 文档备注");
  assert.equal(devB.NavLedger.getConstellations().length, 1);
  assert.equal(devB.NavTheme.getMode(), "dark");
  assert.equal(devB.NavTheme.isNierBg(), true);
  assert.equal(devB.localStorage.getItem("mynav_search_engine_v2"), "bing");
  assert.equal(devB.localStorage.getItem("mynav_arch_particles"), "false");
  // Device B kept its own local-only API key and amber vault!
  assert.equal(devB.NavLedger.getAiConfig().apiKey, "sk-secret-device-b");
  assert.ok(devB.NavLedger.getAmberVault().github);
  assert.equal(devB.NavLedger.getAmberVault().chatgpt, undefined);

  // Concurrent offline changes on A and B -> conflict 409 -> 3-way merge of ledger access counts
  devA.NavLedger.recordAccess("chatgpt"); // A +1 => 3
  devA.NavFavorites.toggle("github");
  devB.NavLedger.recordAccess("chatgpt"); // B +1 => 3
  devB.NavLedger.recordAccess("chatgpt"); // B +2 => 4
  devB.NavLedger.setMarginalia("github", "代码主仓");

  assert.equal(await devA.NavCloudSync.syncNow(), true);
  assert.equal(await devB.NavCloudSync.syncNow(), true);
  assert.equal(await devA.NavCloudSync.syncNow(), true);

  // 2 base + 1 (A) + 2 (B) = 5 accesses preserved across both!
  assert.equal(devA.NavLedger.getStat("chatgpt").count, 5);
  assert.equal(devB.NavLedger.getStat("chatgpt").count, 5);
  assert.equal(devB.NavFavorites.has("github"), true);
  assert.equal(devA.NavLedger.getMarginalia("github"), "代码主仓");
  assert.equal(reloadCountA, 0);
  assert.equal(reloadCountB, 0);
});

test("functions/api/sync strips unsafe URLs and local-only ledger secrets before writing KV", async () => {
  const syncMod = await import("../functions/api/sync.js");
  const kv = createMemoryKv();
  await kv.put("session:tok", JSON.stringify({ username: "bob", expiresAt: Date.now() + 3600_000 }));

  const putRes = await syncMod.onRequestPut({
    request: new Request("https://mynav.example/api/sync", {
      method: "PUT",
      headers: {
        authorization: "Bearer tok",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        updatedAt: 1000,
        baseUpdatedAt: 0,
        data: {
          theme: "light",
          favorites: ["ok"],
          visits: {},
          order: {},
          overrides: {
            added: [
              { id: "bad", name: "Bad", url: "javascript:alert(1)", category: "dev" },
              {
                id: "good",
                name: "Good",
                url: "https://good.example/",
                snapshotUrl: "data:text/html,<script>",
                favicon: "vbscript:x",
                subLinks: [
                  { label: "BadLink", url: "javascript:void(0)" },
                  { label: "GoodLink", url: "https://good.example/docs" },
                ],
                category: "dev",
              },
            ],
            modified: {
              chatgpt: {
                url: "javascript:alert(2)",
                name: "Safe Name",
                subLinks: [{ label: "Docs", url: "https://platform.openai.com/" }],
              },
            },
            hidden: [],
            deleted: [],
            unhidden: [],
          },
          ledger: {
            accessLog: { chatgpt: { count: 3, lastVisited: 1000, history: [{ date: "2026-11-17", count: 3 }] } },
            marginalia: { chatgpt: "ok" },
            aiConfig: { apiKey: "should-be-stripped" },
            amberVault: { chatgpt: { html: "strip-me" } },
          },
          preferences: {
            nierBg: true,
            particles: false,
            searchEngine: "duckduckgo",
            probeIgnored: ["site1"],
          },
        },
      }),
    }),
    env: { MYNAV_KV: kv },
  });
  assert.equal(putRes.status, 200);

  const getRes = await syncMod.onRequestGet({
    request: new Request("https://mynav.example/api/sync", {
      headers: { authorization: "Bearer tok" },
    }),
    env: { MYNAV_KV: kv },
  });
  const doc = await getRes.json();
  assert.equal(doc.data.overrides.added.length, 1);
  assert.equal(doc.data.overrides.added[0].id, "good");
  assert.equal(doc.data.overrides.added[0].snapshotUrl, undefined);
  assert.equal(doc.data.overrides.added[0].favicon, undefined);
  assert.deepEqual(doc.data.overrides.added[0].subLinks, [{ label: "GoodLink", url: "https://good.example/docs" }]);
  assert.equal(doc.data.overrides.modified.chatgpt.url, undefined);
  assert.equal(doc.data.overrides.modified.chatgpt.name, "Safe Name");
  assert.equal(doc.data.ledger.aiConfig, undefined);
  assert.equal(doc.data.ledger.amberVault, undefined);
  assert.equal(doc.data.preferences.nierBg, true);
});
