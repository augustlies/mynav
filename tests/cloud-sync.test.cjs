"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

class LocalStorageMock {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

class MockKV extends LocalStorageMock {}
MockKV.prototype.get = MockKV.prototype.getItem;
MockKV.prototype.put = async function (key, value) { this.setItem(key, value); };
MockKV.prototype.delete = MockKV.prototype.removeItem;
MockKV.prototype.list = async function ({ prefix = "" } = {}) {
  return { keys: Array.from(this.values.keys()).filter((key) => key.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
};

const placeholder = new LocalStorageMock();
global.window = {
  localStorage: placeholder,
  fetch: null,
  location: { reload() {} },
  addEventListener() {},
  NavShortcuts: { showToast() {} },
};
Object.defineProperty(global, "navigator", { value: { onLine: true }, configurable: true });

const storage = require("../js/storage.js");
const sync = require("../js/cloud-sync.js");
const mergeData = sync.__test.mergeData;
const apiPromise = import(pathToFileURL(path.join(__dirname, "../functions/api/sync.js")).href);

function emptyData() {
  return { theme: "auto", favorites: [], visits: {}, order: {}, overrides: { modified: {}, added: [], hidden: [], deleted: [], unhidden: [] } };
}

function read(key, fallback) {
  const raw = window.localStorage.getItem(key);
  return raw === null ? fallback : JSON.parse(raw);
}

function makeDevice(token, initial) {
  const localStorage = new LocalStorageMock();
  localStorage.setItem("mynav_arch_sync_token", token);
  localStorage.setItem("mynav_arch_sync_user", "owner");
  localStorage.setItem("mynav_arch_theme", JSON.stringify("auto"));
  localStorage.setItem("mynav_arch_favorites", JSON.stringify(initial.favorites || []));
  localStorage.setItem("mynav_arch_visits", JSON.stringify(initial.visits || {}));
  localStorage.setItem("mynav_arch_order", JSON.stringify(initial.order || {}));
  localStorage.setItem("nav_site_overrides", JSON.stringify(initial.overrides || emptyData().overrides));
  return { localStorage, reloads: 0 };
}

test("三方合并保留新增、同步删除、累加访问增量并合并卡片字段", () => {
  const base = emptyData();
  base.favorites = ["a", "b"];
  base.visits.a = { count: 10, lastVisit: 100 };
  base.overrides.modified.a = { name: "旧名", desc: "旧描述" };
  const local = JSON.parse(JSON.stringify(base));
  const remote = JSON.parse(JSON.stringify(base));
  local.favorites = ["a"]; // 本机删除 b
  remote.favorites = ["a", "b", "c"]; // 另一台新增 c
  local.visits.a = { count: 12, lastVisit: 120 };
  remote.visits.a = { count: 15, lastVisit: 150 };
  local.overrides.modified.a.name = "本机名称";
  remote.overrides.modified.a.desc = "云端描述";

  const merged = mergeData(base, local, remote, "local");
  assert.deepEqual(merged.favorites, ["a", "c"]);
  assert.deepEqual(merged.visits.a, { count: 17, lastVisit: 150 });
  assert.deepEqual(merged.overrides.modified.a, { name: "本机名称", desc: "云端描述" });
});

test("没有历史基准时，空云端不会吃掉本机收藏和编辑", () => {
  const local = emptyData();
  local.favorites = ["keep"];
  local.overrides.modified.keep = { name: "保留编辑" };
  const merged = mergeData(null, local, emptyData(), "remote");
  assert.deepEqual(merged.favorites, ["keep"]);
  assert.equal(merged.overrides.modified.keep.name, "保留编辑");
});

test("两个独立会话经过上传、下载、冲突合并后数据一致", async () => {
  const api = await apiPromise;
  const kv = new MockKV();
  for (const token of ["device-a", "device-b"]) {
    await kv.put("session:" + token, JSON.stringify({ username: "owner", expiresAt: Date.now() + 60000 }));
  }
  const devices = {
    a: makeDevice("device-a", { favorites: ["a"], overrides: { modified: { a: { name: "A 本机" } }, added: [], hidden: [], deleted: [], unhidden: [] } }),
    b: makeDevice("device-b", {}),
  };
  let active = devices.a;
  function activate(device) {
    active = device;
    window.localStorage = device.localStorage;
    window.location.reload = () => { device.reloads += 1; };
  }
  async function router(input, options = {}) {
    const request = new Request("https://mynav.test/api/sync", {
      method: options.method || "GET",
      headers: options.headers,
      body: options.body,
    });
    const context = { env: { MYNAV_KV: kv }, request };
    return (options.method || "GET") === "PUT" ? api.onRequestPut(context) : api.onRequestGet(context);
  }
  global.fetch = router;
  window.fetch = router;

  activate(devices.a);
  assert.equal(await sync.syncNow(), true, "A 首次上传");
  assert.equal(JSON.parse(await kv.get("profile:v2:owner")).data.favorites[0], "a");

  activate(devices.b);
  assert.equal(await sync.syncNow(), true, "B 首次下载");
  assert.deepEqual(read("mynav_arch_favorites", []), ["a"]);
  assert.equal(read("nav_site_overrides", {}).modified.a.name, "A 本机");

  const bOverrides = read("nav_site_overrides", emptyData().overrides);
  bOverrides.modified.b = { name: "B 新增" };
  window.localStorage.setItem("nav_site_overrides", JSON.stringify(bOverrides));
  window.localStorage.setItem("mynav_arch_favorites", JSON.stringify(["a", "b"]));
  assert.equal(await sync.syncNow(), true, "B 上传自己的编辑");

  activate(devices.a);
  const aOverrides = read("nav_site_overrides", emptyData().overrides);
  aOverrides.modified.a2 = { name: "A 同时新增" };
  window.localStorage.setItem("nav_site_overrides", JSON.stringify(aOverrides));
  window.localStorage.setItem("mynav_arch_favorites", JSON.stringify(["a", "a2"]));
  assert.equal(await sync.syncNow(), true, "A 合并 B 后上传");
  const cloud = JSON.parse(await kv.get("profile:v2:owner"));
  assert.deepEqual(new Set(cloud.data.favorites), new Set(["a", "a2", "b"]));
  assert.equal(cloud.data.overrides.modified.a.name, "A 本机");
  assert.equal(cloud.data.overrides.modified.a2.name, "A 同时新增");
  assert.equal(cloud.data.overrides.modified.b.name, "B 新增");

  activate(devices.b);
  assert.equal(await sync.syncNow(), true, "B 再拉取合并结果");
  assert.deepEqual(new Set(read("mynav_arch_favorites", [])), new Set(["a", "a2", "b"]));
  assert.equal(read("nav_site_overrides", {}).modified.a2.name, "A 同时新增");

  activate(devices.a);
  window.localStorage.setItem("mynav_arch_favorites", JSON.stringify(["a2"]));
  assert.equal(await sync.syncNow(), true, "A 删除收藏并同步");
  activate(devices.b);
  assert.equal(await sync.syncNow(), true, "B 同步删除后的版本");
  assert.deepEqual(new Set(JSON.parse(await kv.get("profile:v2:owner")).data.favorites), new Set(["a2"]));
});
