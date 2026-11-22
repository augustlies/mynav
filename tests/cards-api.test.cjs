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

function page(id, props) {
  return { id, last_edited_time: new Date(Date.now() + 1000).toISOString(), properties: props };
}

function rich(value) {
  return { rich_text: [{ plain_text: value }] };
}

function row(id, extra = {}) {
  return page("page-" + id, {
    "站点ID": rich(id),
    Name: { title: [{ plain_text: "卡片 " + id }] },
    "链接": { url: "https://example.com/" + id },
    "专栏": { relation: [{ id: "category-ai" }] },
    "介绍": rich("说明"),
    "图标": rich("AI"),
    "标签": rich("ai, 测试"),
    "状态": { select: { name: "活跃" } },
    ...extra
  });
}

function category(id, pageId = "category-" + id) {
  return page(pageId, {
    "专栏ID": rich(id),
    Name: { title: [{ plain_text: "分类 " + id }] },
    "代号": rich(id.toUpperCase()),
    "简介": rich("分类说明")
  });
}

function notionResponse(results) {
  return new Response(JSON.stringify({ results, has_more: false, next_cursor: null }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

const apiPromise = import(pathToFileURL(path.join(__dirname, "../functions/api/cards.js")).href);

test("口令保护的发布跳过坏行、缓存有效行并保持版本号稳定", async () => {
  const api = await apiPromise;
  const kv = new MockKV();
  const results = [
    row("ai-good"),
    row("bad-url", { "链接": { url: "javascript:alert(1)" } }),
    row("bad-category", { "专栏": { relation: [{ id: "category-missing" }] } }),
    row("ai-good", { Name: { title: [{ plain_text: "重复" }] } })
  ];
  const original = global.fetch;
  global.fetch = async (url) => url.includes("e27ec9e3-4644-4a04-9999-ccdacff6dc57")
    ? notionResponse([category("ai")])
    : notionResponse(results);
  try {
    const res = await api.onRequestPost({
      env: {
        MYNAV_KV: kv,
        NOTION_TOKEN: "token",
        NOTION_DB_ID: "db",
        MYNAV_CARDS_REFRESH_TOKEN: "refresh-secret",
      },
      request: new Request("https://mynav.test/api/cards", {
        method: "POST",
        headers: { "x-mynav-refresh-token": "refresh-secret" },
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.count, 1);
    assert.equal(body.skippedCount, 3);
    assert.equal(kv.values.size, 1);

    const cached = await kv.get("cards:v1:published");
    const published = JSON.parse(cached);
    assert.equal(published.version, body.version);
    assert.equal(published.sites[0].id, "ai-good");
  } finally {
    global.fetch = original;
  }
});

test("公开 GET 在缓存为空时返回内置目录，不访问 Notion 或写入 KV", async () => {
  const api = await apiPromise;
  const kv = new MockKV();
  const original = global.fetch;
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    return notionResponse([row("should-not-publish")]);
  };
  try {
    const res = await api.onRequestGet({
      env: { MYNAV_KV: kv },
      request: new Request("https://mynav.test/api/cards"),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.version, /^catalogue-/);
    assert.ok(body.count > 0);
    assert.equal(fetchCount, 0);
    assert.equal(kv.values.size, 0);
  } finally {
    global.fetch = original;
  }
});

test("有缓存时 Notion 失败仍返回上一版", async () => {
  const api = await apiPromise;
  const kv = new MockKV();
  await kv.put("cards:v1:published", JSON.stringify({
    version: "v1-old", updatedAt: Date.now() + 1, fetchedAt: 1, count: 1, skipped: [], sites: [{ id: "old" }]
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
  global.fetch = async (url) => url.includes("e27ec9e3-4644-4a04-9999-ccdacff6dc57")
    ? notionResponse([category("ai")])
    : notionResponse([]);
  try {
    const empty = await api.onRequestPost({ env, request: request("secret") });
    assert.equal(empty.status, 422);
    assert.equal(JSON.parse(kv.values.get("cards:v1:published")).version, "v1-old");
  } finally {
    global.fetch = original;
  }

  global.fetch = async (url) => url.includes("e27ec9e3-4644-4a04-9999-ccdacff6dc57")
    ? notionResponse([category("ai")])
    : notionResponse([row("ai-new")]);
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

test("GET 在目录缓存缺失时自动从 Notion 发布两个数据源", async () => {
  const api = await apiPromise;
  const kv = new MockKV();
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, headers: init.headers });
    return url.includes("e27ec9e3-4644-4a04-9999-ccdacff6dc57")
      ? notionResponse([category("ai")])
      : notionResponse([row("ai-live")]);
  };
  try {
    const res = await api.onRequestGet({
      env: { MYNAV_KV: kv, NOTION_TOKEN: "token" },
      request: new Request("https://mynav.test/api/cards")
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.sites[0].id, "ai-live");
    assert.equal(body.categories[0].id, "ai");
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.url.includes("/v1/data_sources/")));
    assert.ok(calls.every((call) => call.headers["notion-version"] === "2025-09-03"));
  } finally {
    global.fetch = original;
  }
});

test("相同版本返回 unchanged，减少传输", async () => {
  const api = await apiPromise;
  const kv = new MockKV();
  await kv.put("cards:v1:published", JSON.stringify({
    version: "v1-same", updatedAt: Date.now() + 1, fetchedAt: Date.now() + 1, count: 1, skipped: [], sites: [{ id: "a" }]
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
