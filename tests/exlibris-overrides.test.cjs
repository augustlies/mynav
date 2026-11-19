"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

function createStorage() {
  const m = new Map();
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(String(k), String(v)); },
    removeItem(k) { m.delete(String(k)); },
    clear() { m.clear(); },
  };
}

function loadBrowserModules(files) {
  const localStorage = createStorage();
  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
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
    AbortController,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    Event: class Event {
      constructor(type) { this.type = type; }
    },
    document: {
      readyState: "complete",
      documentElement: { style: { setProperty() {} }, setAttribute() {}, getAttribute() { return null; }, removeAttribute() {} },
      body: { appendChild() {}, classList: { add() {}, remove() {}, contains() { return false; } } },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getElementById() { return null; },
      addEventListener() {},
      dispatchEvent() {},
      createElement() {
        return {
          style: {},
          setAttribute() {},
          appendChild() {},
          addEventListener() {},
          click() {},
          remove() {},
        };
      },
    },
    localStorage,
    addEventListener() {},
    dispatchEvent() {},
  };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), context, { filename: f });
  }
  return context;
}

test("favorites.remove / reload and deleteSite clean up orphan favorites cleanly", () => {
  const ctx = loadBrowserModules([
    "data.js",
    "js/storage.js",
    "js/ledger.js",
    "js/favorites.js",
    "js/overrides.js",
  ]);
  ctx.NavFavorites.init();
  const added = ctx.NavOverrides.addSite({
    name: "Temp Tool",
    url: "https://temp.example.com/",
    category: "tools",
  });
  ctx.NavFavorites.toggle(added.id);
  assert.equal(ctx.NavFavorites.has(added.id), true);

  ctx.NavOverrides.deleteSite(added.id);
  assert.equal(ctx.NavFavorites.has(added.id), false);

  ctx.NavFavorites.toggle("chatgpt");
  assert.equal(ctx.NavFavorites.has("chatgpt"), true);
  ctx.NavStorage.set(ctx.NavStorage.KEYS.FAVORITES, []);
  ctx.NavFavorites.reload();
  assert.equal(ctx.NavFavorites.has("chatgpt"), false);
});

test("exportDataJsString reads NavLedger marginalia fallback when site.notes is empty", () => {
  const ctx = loadBrowserModules([
    "data.js",
    "js/storage.js",
    "js/ledger.js",
    "js/overrides.js",
  ]);
  ctx.NavLedger.setMarginalia("ai-chatgpt", "账本里的馆主批注");
  const exported = ctx.NavOverrides.exportDataJsString();
  assert.ok(exported.includes("notes: \"账本里的馆主批注\""));
});

test("NavSortable preserves omitted cards in 'all' view and refuses to save 'frequent'", () => {
  const ctx = loadBrowserModules([
    "data.js",
    "js/storage.js",
    "js/sortable.js",
  ]);
  ctx.NavSortable.saveCategoryOrder("ai", ["a1", "fav_card", "a2", "a3"]);
  // Simulate dragging inside "all" view where fav_card was lifted to Favorites section
  ctx.NavSortable.saveCategoryOrder("ai", ["a3", "a1", "a2"]);
  assert.deepEqual(ctx.NavSortable.getCategoryOrder("ai"), ["a3", "fav_card", "a1", "a2"]);

  // "frequent" view must never persist a static sort order
  ctx.NavSortable.saveCategoryOrder("frequent", ["x", "y"]);
  assert.equal(ctx.NavSortable.getCategoryOrder("frequent"), null);
});

test("NavExLibris supports social theme palette", () => {
  const ctx = loadBrowserModules(["js/exlibris.js"]);
  const svg = ctx.NavExLibris.renderSvg({
    id: "social-demo",
    name: "Social Demo",
    url: "https://social.example.com",
    category: "social",
  });
  assert.ok(svg.includes("COMMUNITAS ET SERMO HUMANUS"));
});

test("NavLibrarian close() aborts in-flight LLM call and clears busy deadlock", async () => {
  const ctx = loadBrowserModules([
    "data.js",
    "js/ledger.js",
    "js/librarian.js",
  ]);
  let abortedSignal = null;
  let releaseFetch;
  ctx.fetch = (_url, init) => new Promise((resolve, reject) => {
    abortedSignal = init.signal;
    init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    releaseFetch = resolve;
  });
  // Minimal folio element so open() marks opened=true and close() aborts
  const fakeFolio = { hidden: true, classList: { remove() {}, add() {} }, scrollHeight: 100 };
  const fakeBadge = { textContent: "", dataset: {} };
  const fakeOut = { innerHTML: "", textContent: "" };
  const fakeStatus = { textContent: "" };
  ctx.document.getElementById = (id) => ({
    "librarian-folio": fakeFolio,
    "librarian-mode-badge": fakeBadge,
    "librarian-folio-output": fakeOut,
    "librarian-folio-status": fakeStatus,
  }[id] || null);
  ctx.NavLibrarian.init();
  ctx.NavLibrarian.setAiConfig({ apiKey: "sk-test", model: "test-model", baseUrl: "https://api.example/v1" });

  const firstRun = ctx.NavLibrarian.run("?", "hello");
  await new Promise((r) => setTimeout(r, 20));
  ctx.NavLibrarian.close();
  assert.equal(abortedSignal && abortedSignal.aborted, true);
  assert.equal(await firstRun, false);

  // Subsequent run without closing must not stay wedged by busy=true
  ctx.fetch = async () => ({
    ok: true,
    async json() { return { choices: [{ message: { content: "Fresh answer" } }] }; },
  });
  const secondRun = await ctx.NavLibrarian.run("!", "git reset");
  assert.equal(secondRun, true);
  assert.equal(typeof releaseFetch, "function");
});

test("cards API and Notion overlay support optional enriched fields safely and reject bad tokens", async () => {
  const cardsMod = await import("../functions/api/cards.js");
  const { row } = cardsMod.__test__.normalizeRow({
    id: "page-1",
    properties: {
      CardID: { title: [{ plain_text: "custom-card" }] },
      Name: { rich_text: [{ plain_text: "Custom Card" }] },
      URL: { url: "https://custom.example/" },
      Category: { select: { name: "tools" } },
      Description: { rich_text: [{ plain_text: "Desc" }] },
      Icon: { rich_text: [{ plain_text: "CC" }] },
      Tags: { multi_select: [{ name: "Tool" }] },
      Sort: { number: 1 },
      Hidden: { checkbox: false },
      WhySaved: { rich_text: [{ plain_text: "Very helpful" }] },
      Notes: { rich_text: [{ plain_text: "Tip line" }] },
      Favicon: { url: "javascript:alert(1)" },
      SubLinks: { rich_text: [{ plain_text: "Docs | https://custom.example/docs\nBad | javascript:1" }] },
    },
  }, 0);
  assert.equal(row.whySaved, "Very helpful");
  assert.equal(row.notes, "Tip line");
  assert.equal(row.favicon, undefined);
  assert.deepEqual(row.subLinks, [{ label: "Docs", url: "https://custom.example/docs" }]);

  const badAuthRes = await cardsMod.onRequestPost({
    request: new Request("https://mynav.example/api/cards", {
      method: "POST",
      headers: { "x-mynav-refresh-token": "wrong-token" },
    }),
    env: {
      MYNAV_KV: { async get() { return null; }, async put() {} },
      MYNAV_CARDS_REFRESH_TOKEN: "expected-secret",
    },
  });
  assert.equal(badAuthRes.status, 403);
});

test("notion-import --apply --update uses PATCH /pages/<id> instead of creating duplicate POST pages", () => {
  const preloadCode = `
    const calls = [];
    global.fetch = async (url, init) => {
      calls.push({ url, method: init.method });
      if (url.includes("/query")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              results: [{
                id: "notion-page-uuid-chatgpt",
                properties: { CardID: { title: [{ plain_text: "ai-hark" }] } }
              }],
              has_more: false
            };
          }
        };
      }
      return { ok: true, status: 200, async json() { return { id: "ok" }; } };
    };
    process.on("exit", () => {
      process.stdout.write("MOCK_CALLS=" + JSON.stringify(calls) + "\\n");
    });
  `;
  const tmpPreload = path.join(ROOT, ".tmp-notion-mock.cjs");
  fs.writeFileSync(tmpPreload, preloadCode);
  try {
    const out = execFileSync(
      process.execPath,
      ["-r", tmpPreload, path.join(ROOT, "scripts", "notion-import.js"), "--apply", "--update", "--limit", "1"],
      {
        cwd: ROOT,
        env: Object.assign({}, process.env, {
          NOTION_TOKEN: "ntn_dummy",
          NOTION_DB_ID: "db_dummy",
        }),
        encoding: "utf8",
      }
    );
    const match = /MOCK_CALLS=(.+)/.exec(out);
    assert.ok(match);
    const calls = JSON.parse(match[1]);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].method, "PATCH");
    assert.ok(calls[1].url.endsWith("/pages/notion-page-uuid-chatgpt"));
  } finally {
    fs.unlinkSync(tmpPreload);
  }
});
