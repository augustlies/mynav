"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

test("build-sw.js --check passes with matching sw.js precache and 404.html CSS version", () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, "scripts", "build-sw.js"), "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.ok(out.includes("校验通过"));
});

test("all scripts and stylesheets referenced by index.html and js/lazy.js exist on disk", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const lazy = fs.readFileSync(path.join(ROOT, "js", "lazy.js"), "utf8");
  const refs = [];

  for (const m of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
    const u = m[1];
    if (/^(https?:)?\/\//.test(u) || u.startsWith("data:") || u.startsWith("#")) continue;
    refs.push(u);
  }
  for (const m of lazy.matchAll(/\b(?:src|css):\s*"([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)) {
    refs.push(m[1]);
  }
  for (const ref of refs) {
    const rel = ref.replace(/\?.*$/, "").replace(/^\.?\//, "");
    assert.equal(fs.existsSync(path.join(ROOT, rel)), true, `Missing asset: ${rel}`);
  }
});

test("global key/modal checks avoid getElementById so lazy DOM templates do not expand eagerly", () => {
  const shortcuts = fs.readFileSync(path.join(ROOT, "js", "shortcuts.js"), "utf8");
  const folioKeys = fs.readFileSync(path.join(ROOT, "js", "folio-keys.js"), "utf8");
  const cloudSync = fs.readFileSync(path.join(ROOT, "js", "cloud-sync.js"), "utf8");
  const librarian = fs.readFileSync(path.join(ROOT, "js", "librarian.js"), "utf8");

  const isAnyModalMatch = /function isAnyModalOpen\(\) \{[\s\S]*?\n  \}/.exec(shortcuts);
  assert.ok(isAnyModalMatch);
  assert.equal(isAnyModalMatch[0].includes("getElementById"), false);

  const folioModalMatch = /function isModalOpen\(\) \{[\s\S]*?\n  \}/.exec(folioKeys);
  assert.ok(folioModalMatch);
  assert.equal(folioModalMatch[0].includes("getElementById"), false);

  const syncBtnMatch = /function refreshSyncButtonRefs\(\) \{[\s\S]*?\n  \}/.exec(cloudSync);
  assert.ok(syncBtnMatch);
  assert.equal(syncBtnMatch[0].includes("getElementById"), false);

  const bindEventsMatch = /function bindEvents\(\) \{[\s\S]*?\n  \}/.exec(librarian);
  assert.ok(bindEventsMatch);
  assert.equal(bindEventsMatch[0].includes('getElementById("librarian-config-modal")'), false);
});

test("card URL rendering paths guard against javascript: URLs", () => {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const uncataloguedJs = fs.readFileSync(path.join(ROOT, "js", "uncatalogued.js"), "utf8");
  assert.ok(appJs.includes("function safeHttpUrl"));
  assert.ok(appJs.includes("safeHttpUrl(site.url)"));
  assert.ok(uncataloguedJs.includes("function safeHttpUrl"));
  assert.ok(uncataloguedJs.includes("safeHttpUrl(site.url)"));
});
