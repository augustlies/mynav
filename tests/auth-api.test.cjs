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

const apiPromise = import(pathToFileURL(path.join(__dirname, "../functions/api/auth/[[path]].js")).href);

async function call(api, kv, route, { method = "POST", body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = "Bearer " + token;
  return api[method === "GET" ? "onRequestGet" : "onRequestPost"]({
    env: { MYNAV_KV: kv },
    params: { path: [route] },
    request: new Request("https://mynav.test/api/auth/" + route, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  });
}

test("单账号注册、索引自愈和一次性恢复码完整可用", async () => {
  const api = await apiPromise;
  const kv = new MockKV();
  await kv.put("users:index", JSON.stringify(["stale-without-user"])); // 残留索引不应锁死站长

  const registered = await call(api, kv, "register", { body: { username: "owner", password: "initial-test-pass" } });
  assert.equal(registered.status, 200);
  const account = await registered.json();
  assert.ok(account.token);
  assert.ok(account.recoveryCode.length >= 40);
  assert.deepEqual(JSON.parse(await kv.get("users:index")), ["owner"]);

  const closed = await call(api, kv, "register", { body: { username: "other", password: "other-test-pass" } });
  assert.equal(closed.status, 403);

  await kv.delete("users:index"); // 索引丢失也不能绕过单账号限制
  const stillClosed = await call(api, kv, "register", { body: { username: "other", password: "other-test-pass" } });
  assert.equal(stillClosed.status, 403);
  assert.deepEqual(JSON.parse(await kv.get("users:index")), ["owner"]);

  const badLogin = await call(api, kv, "login", { body: { username: "owner", password: "wrong-test-pass" } });
  assert.equal(badLogin.status, 401);
  const login = await call(api, kv, "login", { body: { username: "owner", password: "initial-test-pass" } });
  assert.equal(login.status, 200);

  const rotated = await call(api, kv, "recovery-code", { token: account.token });
  assert.equal(rotated.status, 200);
  const rotatedCode = (await rotated.json()).recoveryCode;
  assert.notEqual(rotatedCode, account.recoveryCode);

  const oldCode = await call(api, kv, "recover", { body: { username: "owner", recoveryCode: account.recoveryCode, newPassword: "new-test-pass" } });
  assert.equal(oldCode.status, 401);

  const recovered = await call(api, kv, "recover", { body: { username: "owner", recoveryCode: rotatedCode, newPassword: "new-test-pass" } });
  assert.equal(recovered.status, 200);
  const recoveredAccount = await recovered.json();
  assert.ok(recoveredAccount.recoveryCode);
  assert.notEqual(recoveredAccount.recoveryCode, rotatedCode);

  const oldSession = await call(api, kv, "me", { method: "GET", token: account.token });
  assert.equal(oldSession.status, 401);
  const oldPassword = await call(api, kv, "login", { body: { username: "owner", password: "initial-test-pass" } });
  assert.equal(oldPassword.status, 401);
  const newPassword = await call(api, kv, "login", { body: { username: "owner", password: "new-test-pass" } });
  assert.equal(newPassword.status, 200);
  const reusedCode = await call(api, kv, "recover", { body: { username: "owner", recoveryCode: rotatedCode, newPassword: "third-test-pass" } });
  assert.equal(reusedCode.status, 401);
});
