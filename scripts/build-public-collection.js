/**
 * 生成器：根目录 public-collection.json（D7 联邦星图公开馆藏清单）
 *
 * 直接从 data.js 的 NAV_DATA 读取 36 张官方馆藏，附带与浏览器端
 * NavApp.Federation.buildPublicManifest() 一致的字段结构、馆名、卷号与
 * 恒星时签名。任何 visibility === "shadow" 的条目都会被硬过滤。
 *
 * 用法：node scripts/build-public-collection.js
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "data.js");
const OUT_PATH = path.join(ROOT, "public-collection.json");

const LIBRARY_NAME = "EX LIBRIS · 个人数字收藏馆";
const VOLUME = "VOL. 2026";

/** FNV-1a 32-bit，与浏览器端 NavFederation.hashString 完全一致。 */
function hashString(value) {
  const text = String(value || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function siderealSignature(seed) {
  const base = hashString(seed);
  return "LST " + pad(base % 24) + "h " + pad((base >>> 5) % 60) + "m " + pad((base >>> 11) % 60) + "s";
}

function loadNavData() {
  const source = fs.readFileSync(DATA_PATH, "utf8");
  const sandbox = { window: {}, NAV_DATA: null };
  vm.createContext(sandbox);
  vm.runInContext(source + "\n;window.NAV_DATA = NAV_DATA;", sandbox, { filename: "data.js" });
  const data = sandbox.window.NAV_DATA || sandbox.NAV_DATA;
  if (!data || !Array.isArray(data.sites)) {
    throw new Error("data.js 未能提供 NAV_DATA.sites");
  }
  return data;
}

function build() {
  const data = loadNavData();
  const publicSites = data.sites.filter((site) => {
    if (!site || !site.url) return false;
    if (site.visibility === "shadow") return false;
    if (site.status && site.status !== "catalogued") return false;
    return true;
  });

  const entries = publicSites.map((site, index) => ({
    id: site.id,
    callNumber: String(index + 1).padStart(2, "0"),
    title: site.name || site.title || site.id,
    url: site.url,
    category: site.category || "",
    description: site.description || site.desc || "",
    tags: Array.isArray(site.tags) ? site.tags.slice() : [],
    whySaved: site.whySaved || ""
  }));

  const signatureSeed = entries.map((entry) => entry.id + "|" + entry.url).join("~");

  return {
    schema: "mynav.public-collection",
    version: "2.0",
    library: {
      name: LIBRARY_NAME,
      volume: VOLUME,
      curator: "馆主 · The Archivist",
      motto: "EX LIBRIS · 以星图为目录，以拓片为备份"
    },
    printedAt: new Date().toISOString(),
    siderealSignature: siderealSignature(signatureSeed),
    signatureHash: hashString(signatureSeed).toString(16).padStart(8, "0"),
    visibilityPolicy: "public-only",
    total: entries.length,
    shadowExcluded: 0,
    entries
  };
}

function main() {
  const manifest = build();
  const shadowLeak = manifest.entries.filter((entry) => entry.visibility === "shadow");
  if (shadowLeak.length) {
    throw new Error("隐私红线：清单中出现 shadow 条目 " + shadowLeak.map((e) => e.id).join(", "));
  }
  if (manifest.entries.length !== 36) {
    throw new Error("公开馆藏数量异常：" + manifest.entries.length + "（应为 36）");
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({
    out: OUT_PATH,
    total: manifest.total,
    signature: manifest.siderealSignature,
    shadowExcluded: manifest.shadowExcluded
  }, null, 2));
}

main();
