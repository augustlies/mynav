"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

class MockKV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.has(key) ? this.values.get(key) : null; }
  async put(key, value) { this.values.set(key, String(value)); }
}

function page(props) {
  return { id: "page-" + props.CardID.title[0].plain_text, last_edited_time: "2026-11-14T10:00:00.000Z", properties: props };
}

function row(id, extra = {}) {
  return page({
    CardID: { title: [{ plain_text: id }] },
    Name: { rich_text: [{ plain_text: "卡片 " + id }] },
    URL: { url: "https://example.com/" + id },
    Category: { select: { name: "ai" } },
    Description: { rich_text: [{ plain_text: "说明" }] },
    Icon: { rich_text: [{ plain_text: "AI" }] },
    Tags: { rich_text: [{ plain_text: "ai, 测试" }] },
    Sort: { number: 1 },
    Hidden: { checkbox: false },
    ...extra
  });
}

function notionResponse(results) {
  return new Response(JSON.stringify({ results, has_more: false, next_cursor: null }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

const apiPromise = import(pathToFileURL(path.join(__dirname, "../functions/api/cards.js")).href);

test("坏行跳过，有效行缓存进 KV，版本号稳定", async () => {
  const api = await apiPromise;
  const kv = new MockKV();
  const results = [
    row("ai-good"),
    row("bad-url", { URL: { url: "javascript:alert(1)" } }),
    row("bad-category", { Category: { select: { name: "unknown" } } }),
    row("ai-good", { Name: { rich_text: [{ plain_text: "重复" }] } })
  ];
  const original = global.fetch;
  global.fetch = async () => notionResponse(results);
  try {
    const res = await api.onRequestGet({
      env: { MYNAV_KV: kv, NOTION_TOKEN: "token", NOTION_DB_ID: "db" },
      request: new Request("https://mynav.test/api/cards")
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.count, 1);
    assert.equal(body.skippedCount, 3);
    assert.equal(body.sites[0].id, "ai-good");
    assert.equal(kv.values.size, 1);

    const cached = await kv.get("cards:v1:published");
    assert.equal(JSON.parse(cached).version, body.version);
  } finally {
    global.fetch = original;
  }
});

test("有缓存时 Notion 失败仍返回上一版", async () => {
  const api = await apiPromise;
  const kv = new MockKV();
  await kv.put("cards:v1:published", JSON.stringify({
    version: "v1-old", updatedAt: 1, fetchedAt: 1, count: 1, skipped: [], sites: [{ id: "old" }]
  }));
  const original = global.fetch;
  global.fetch = async () => new Response("boom", { status: 500 });
  try {
    const res = await api.onRequestGet({
      env: { MYNAV_KV: kv, NOTION_TOKEN: "token", NOTION_DB_ID: "db" },
      request: new Request("https://mynav.test/api/cards")
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).version, "v1-old");
  } finally {
    global.fetch = original;
  }
});

test("刷新口令保护，成功后才替换缓存；空数据不覆盖", async () => {
  const api = await apiPromise;
  const kv = new MockKV();
  await kv.put("cards:v1:published", JSON.stringify({
    version: "v1-old", updatedAt: 1, fetchedAt: 1, count: 1, skipped: [], sites: [{ id: "old" }]
  }));

  const env = { MYNAV_KV: kv, NOTION_TOKEN: "token", NOTION_DB_ID: "db", MYNAV_CARDS_REFRESH_TOKEN: "secret" };
  const request = (token) => new Request("https://mynav.test/api/cards", {
    method: "POST",
    headers: token ? { "x-mynav-refresh-token": token } : {}
  });

  const denied = await api.onRequestPost({ env, request: request("") });
  assert.equal(denied.status, 403);

  const original = global.fetch;
  global.fetch = async () => notionResponse([]);
  try {
    const empty = await api.onRequestPost({ env, request: request("secret") });
    assert.equal(empty.status, 422);
    assert.equal(JSON.parse(kv.values.get("cards:v1:published")).version, "v1-old");
  } finally {
    global.fetch = original;
  }

  global.fetch = async () => notionResponse([row("ai-new")]);
  try {
    const ok = await api.onRequestPost({ env, request: request("secret") });
    assert.equal(ok.status, 200);
    const published = JSON.parse(kv.values.get("cards:v1:published"));
    assert.equal(published.sites[0].id, "ai-new");
    assert.notEqual(published.version, "v1-old");
  } finally {
    global.fetch = original;
  }
});

test("相同版本返回 unchanged，减少传输", async () => {
  const api = await apiPromise;
  const kv = new MockKV();
  await kv.put("cards:v1:published", JSON.stringify({
    version: "v1-same", updatedAt: 1, fetchedAt: 1, count: 1, skipped: [], sites: [{ id: "a" }]
  }));
  const res = await api.onRequestGet({
    env: { MYNAV_KV: kv },
    request: new Request("https://mynav.test/api/cards?v=v1-same")
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.unchanged, true);
  assert.equal(body.version, "v1-same");
});
