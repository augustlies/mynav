#!/usr/bin/env node
/**
 * 生成 sw.js 的离线预缓存清单（Batch 2 · 离线开馆）
 * 用法：改完 index.html 引用或 icons/ 后运行 `node scripts/build-sw.js`
 * 规则：index.html 中所有本地 <script src> / <link href> + favicon + icons/ 全部图标。
 * CACHE_VERSION 取清单内容的哈希，清单一变旧缓存自动作废。
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const urls = new Set(["./", "./index.html", "./404.html"]);
for (const m of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
  const u = m[1];
  if (/^(https?:)?\/\//.test(u) || u.startsWith("data:") || u.startsWith("#")) continue;
  urls.add("./" + u.replace(/^\.?\//, ""));
}
for (const f of fs.readdirSync(path.join(root, "icons"))) {
  if (!f.startsWith(".")) urls.add("./icons/" + f);
}
const list = [...urls];
const hash = crypto.createHash("sha1");
for (const u of list) {
  const file = path.join(root, u.replace(/\?.*$/, "").replace(/^\.\//, "") || "index.html");
  hash.update(u);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) hash.update(fs.readFileSync(file));
}
const version = hash.digest("hex").slice(0, 10);
const swPath = path.join(root, "sw.js");
let sw = fs.readFileSync(swPath, "utf8");
sw = sw.replace(/const CACHE_VERSION = "[^"]*";/, `const CACHE_VERSION = "${version}";`);
sw = sw.replace(/const PRECACHE = \[[\s\S]*?\];/, "const PRECACHE = " + JSON.stringify(list, null, 2) + ";");
fs.writeFileSync(swPath, sw);
console.log(`sw.js 已更新：${list.length} 个文件，版本 ${version}`);
