"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); }
  };
}

const storage = memoryStorage();
global.localStorage = storage;
global.window = {
  localStorage: storage,
  dispatchEvent() { return true; },
  NAV_DATA: {
    categories: [
      { id: "ai", name: "AI" },
      { id: "tools", name: "工具" }
    ],
    sites: [
      { id: "a", name: "A", url: "https://a.example", description: "A", category: "ai", tags: ["a"], icon: "A" },
      { id: "b", name: "B", url: "https://b.example", description: "B", category: "ai", tags: ["b"], icon: "B" }
    ]
  }
};

const overlay = require("../js/notion-cards.js");
const overrides = require("../js/overrides.js");

test("Notion 目录替换离线底稿，新增和删除均生效", () => {
  const payload = {
    version: "v1-test",
    categories: [
      { id: "ai", name: "AI 新名", desc: "AI 描述", code: "AI" },
      { id: "tools", name: "工具" }
    ],
    updatedAt: 100,
    sites: [
      { id: "b", name: "B 新名", url: "https://b.example/new", description: "新说明", category: "ai", icon: "BB", tags: ["b2"], sort: 1, hidden: true },
      { id: "a", name: "A 新名", url: "https://a.example", description: "A", category: "ai", icon: "AA", tags: ["a"], sort: 2, hidden: false },
      { id: "notion-new", name: "新卡", url: "https://new.example", description: "新", category: "tools", icon: "N", tags: ["n"], sort: 1, hidden: false }
    ]
  };
  assert.equal(overlay.applyPayload(payload), true);
  assert.deepEqual(window.NAV_DATA.sites.map((site) => site.id), ["b", "a", "notion-new"]);
  assert.equal(window.NAV_DATA.categories[0].name, "AI 新名");
  const all = overrides.getAllMergedSites(true);
  const b = all.find((site) => site.id === "b");
  assert.equal(b.name, "B 新名");
  assert.equal(b.hidden, true);
  const added = all.find((site) => site.id === "notion-new");
  assert.equal(added.category, "tools");
  assert.equal(overrides.getAllMergedSites(false).some((site) => site.id === "b"), false);
});

test("站内 overrides 按字段覆盖 Notion，个人修改优先", () => {
  storage.setItem("nav_site_overrides", JSON.stringify({
    modified: { a: { name: "本机改名", icon: "LOCAL" } },
    added: [],
    hidden: [],
    deleted: [],
    unhidden: []
  }));
  const all = overrides.getAllMergedSites(true);
  const a = all.find((site) => site.id === "a");
  assert.equal(a.name, "本机改名");
  assert.equal(a.icon, "LOCAL");
  assert.equal(a.description, "A");
});

test("坏行和非法 ID 被丢弃，整包全坏时拒绝覆盖", () => {
  const bad = overlay.normalizePayload({
    version: "v1-bad",
    sites: [
      { id: "<script>", name: "X", url: "https://x.example", category: "ai" },
      { id: "ok", name: "", url: "https://x.example", category: "ai" },
      { id: "bad-url", name: "X", url: "javascript:alert(1)", category: "ai" }
    ]
  });
  assert.equal(bad, null);

  const mixed = overlay.normalizePayload({
    version: "v1-mixed",
    sites: [
      { id: "good", name: "Good", url: "https://good.example", category: "ai", tags: ["ok"], sort: 1 },
      { id: "bad-url", name: "X", url: "ftp://x", category: "ai" }
    ]
  });
  assert.equal(mixed.count, 1);
  assert.equal(mixed.skipped, 1);
  assert.equal(mixed.sites[0].url, "https://good.example");
});
