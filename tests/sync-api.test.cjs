"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

class MockKV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.has(key) ? this.values.get(key) : null; }
  async put(key, value) { this.values.set(key, String(value)); }
  async delete(key) { this.values.delete(key); }
  async list({ prefix = "" } = {}) {
    return { keys: Array.from(this.values.keys()).filter((key) => key.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
  }
}

const apiPromise = import(pathToFileURL(path.join(__dirname, "../functions/api/sync.js")).href);
const username = "owner";
const session = "automated-test-session";

function context(method, body) {
  return {
    env: { MYNAV_KV: this.kv },
    request: new Request("https://mynav.test/api/sync", {
      method,
      headers: { authorization: "Bearer " + session, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  };
}

function data(favorites) {
  return { theme: "auto", favorites, visits: {}, order: {}, overrides: { modified: {}, added: [], hidden: [], deleted: [], unhidden: [] } };
}

async function setup() {
  const api = await apiPromise;
  const kv = new MockKV();
  await kv.put("session:" + session, JSON.stringify({ username, expiresAt: Date.now() + 60000 }));
  return { api, kv, request: context.bind({ kv }) };
}

test("无会话返回 401；空档案返回 404 empty", async () => {
  const { api, request } = await setup();
  const unauthorized = await api.onRequestGet({ env: { MYNAV_KV: new MockKV() }, request: new Request("https://mynav.test/api/sync") });
  assert.equal(unauthorized.status, 401);
  const empty = await api.onRequestGet(request("GET"));
  assert.equal(empty.status, 404);
  assert.deepEqual(await empty.json(), { empty: true });
});

test("baseUpdatedAt 阻止 stale 客户端覆盖另一台设备", async () => {
  const { api, kv, request } = await setup();
  const first = await api.onRequestPut(request("PUT", { updatedAt: 100, baseUpdatedAt: 0, data: data(["a"]) }));
  assert.equal(first.status, 200);

  const stale = await api.onRequestPut(request("PUT", { updatedAt: 200, baseUpdatedAt: 0, data: data(["b"]) }));
  assert.equal(stale.status, 409);
  assert.deepEqual(JSON.parse(await kv.get("profile:v2:" + username)).data.favorites, ["a"]);

  const merged = await api.onRequestPut(request("PUT", { updatedAt: 201, baseUpdatedAt: 100, data: data(["a", "b"]) }));
  assert.equal(merged.status, 200);
  assert.deepEqual(JSON.parse(await kv.get("profile:v2:" + username)).data.favorites, ["a", "b"]);
});

test("profile:v1 只读迁移：先返回旧版，再按旧版本号写入 v2", async () => {
  const { api, kv, request } = await setup();
  const legacy = { updatedAt: 50, data: data(["legacy"]) };
  await kv.put("profile:v1", JSON.stringify(legacy));

  const downloaded = await api.onRequestGet(request("GET"));
  assert.equal(downloaded.status, 200);
  assert.deepEqual((await downloaded.json()).data.favorites, ["legacy"]);

  const stale = await api.onRequestPut(request("PUT", { updatedAt: 100, baseUpdatedAt: 0, data: data(["local"]) }));
  assert.equal(stale.status, 409);

  const migrated = await api.onRequestPut(request("PUT", { updatedAt: 101, baseUpdatedAt: 50, data: data(["legacy", "local"]) }));
  assert.equal(migrated.status, 200);
  assert.deepEqual(JSON.parse(await kv.get("profile:v2:" + username)).data.favorites, ["legacy", "local"]);
  assert.equal(await kv.get("profile:v1"), JSON.stringify(legacy));
});

test("相同版本不允许用相同时间戳重复覆盖", async () => {
  const { api, request } = await setup();
  const first = await api.onRequestPut(request("PUT", { updatedAt: 100, baseUpdatedAt: 0, data: data(["a"]) }));
  assert.equal(first.status, 200);
  const duplicate = await api.onRequestPut(
    request("PUT", { updatedAt: 100, baseUpdatedAt: 100, data: data(["b"]) })
  );
  assert.equal(duplicate.status, 409);
});
