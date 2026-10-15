#!/usr/bin/env node
/**
 * notion-sync.js — 把 Notion「馆藏 CMS」同步为 data.js
 *
 * 数据流：Notion 数据库（馆藏专栏 / 馆藏站点）
 *       → 本脚本 → data.js → node validate.js → git push → Cloudflare Pages 自动部署
 *
 * 用法：
 *   # 1) 先在 Notion 里建一个内部集成，拿到 token（只需做一次）：
 *   #    点左下角头像 →「设置」→ 左侧栏「功能」分组里的「开发者」
 *   #    →「新建集成」→ 类型选「内部」，填个名字（如 mynav-sync）
 *   #    → 复制 Internal Integration Token（ntn_ 开头）
 *   # 2) 把「馆藏专栏」「馆藏站点」两个数据库右上角「···」→「连接」→ 添加该集成
 *   # 3) 运行：
 *        NOTION_TOKEN=ntn_xxx node notion-sync.js
 *
 * 可选参数：
 *   --out <path>       输出文件，默认 ./data.js
 *   --include-inactive  把「待检查/失效」状态的站点也同步（默认只同步「活跃」）
 *   --fixture <path>    用本地 JSON 夹具代替网络请求（用于测试）
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── 数据库 ID（Notion 页面 URL 里那串，去掉连字符也可） ──
const DB = {
  categories: "6f9da4f5-ff6f-43ba-800a-67347c0bf045", // 馆藏专栏
  sites: "9d2b8038-69b0-4142-9058-539a2148e735",      // 馆藏站点
};

// 分类在 data.js 里的固定顺序（对应站内数字快捷键 1~7，不要随意改）
const CATEGORY_ORDER = ["ai", "dev", "knowledge", "tools"];

const NOTION_VERSION = "2022-06-28";

// ── 参数解析 ──
const args = process.argv.slice(2);
function opt(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const OUT_FILE = opt("--out", path.join(__dirname, "data.js"));
const INCLUDE_INACTIVE = args.includes("--include-inactive");
const FIXTURE = opt("--fixture", null);

// ── Notion API ──
async function notion(pathname, body) {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw new Error("缺少 NOTION_TOKEN 环境变量（用法见文件头注释）");
  }
  const res = await fetch(`https://api.notion.com/v1${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function queryAll(dbId) {
  const rows = [];
  let cursor = undefined;
  for (;;) {
    const data = await notion(`/databases/${dbId}/query`, {
      start_cursor: cursor,
      page_size: 100,
      sorts: [{ timestamp: "created_time", direction: "ascending" }],
    });
    rows.push(...data.results);
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return rows;
}

// ── 属性解析（防御式：缺字段就给空值，不炸） ──
function rich(prop) {
  if (!prop) return "";
  const arr = prop.title || prop.rich_text || [];
  return arr.map((t) => t.plain_text || "").join("");
}
function text(prop, fallback = "") {
  if (prop == null) return fallback;
  if (typeof prop === "string") return prop;
  if (prop.type === "url" || typeof prop.url === "string") return prop.url || fallback;
  if (prop.type === "select" || prop.select) return (prop.select && prop.select.name) || fallback;
  if (prop.type === "date" || prop.date) return (prop.date && prop.date.start) || fallback;
  return rich(prop) || fallback;
}
function relationIds(prop) {
  if (!prop || !Array.isArray(prop.relation)) return [];
  return prop.relation.map((r) => r.id).filter(Boolean);
}

// ── 主流程 ──
async function main() {
  let catPages, sitePages;
  if (FIXTURE) {
    const fx = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
    catPages = fx.categories;
    sitePages = fx.sites;
    console.log(`[fixture] 读入 ${catPages.length} 个专栏 / ${sitePages.length} 个站点`);
  } else {
    console.log("正在从 Notion 拉取「馆藏专栏」…");
    catPages = await queryAll(DB.categories);
    console.log("正在从 Notion 拉取「馆藏站点」…");
    sitePages = await queryAll(DB.sites);
  }

  // 专栏：pageId → {id, name, code, desc}
  const catByPage = new Map();
  const categories = [];
  for (const p of catPages) {
    const props = p.properties || {};
    const cat = {
      id: text(props["专栏ID"]).trim(),
      name: rich(props["Name"]).trim(),
      desc: rich(props["简介"]).trim(),
      code: text(props["代号"]).trim().toUpperCase(),
    };
    if (!cat.id) {
      console.warn(`[跳过] 专栏行缺少「专栏ID」: ${p.id}`);
      continue;
    }
    catByPage.set(p.id.replace(/-/g, ""), cat);
    categories.push(cat);
  }

  // 站点
  const skipped = { inactive: 0, noCategory: 0, noId: 0 };
  const sites = [];
  for (const p of sitePages) {
    const props = p.properties || {};
    const status = text(props["状态"]);
    if (!INCLUDE_INACTIVE && status && status !== "活跃") {
      skipped.inactive++;
      continue;
    }
    const id = text(props["站点ID"]).trim();
    if (!id) {
      skipped.noId++;
      console.warn(`[跳过] 站点行缺少「站点ID」: ${p.id}`);
      continue;
    }
    const rel = relationIds(props["专栏"]);
    const cat = rel.map((rid) => catByPage.get(rid.replace(/-/g, ""))).find(Boolean);
    if (!cat) {
      skipped.noCategory++;
      console.warn(`[跳过] 站点「${id}」未关联到有效专栏`);
      continue;
    }
    const tags = text(props["标签"])
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);
    sites.push({
      id,
      name: rich(props["Name"]).trim(),
      url: text(props["链接"]).trim(),
      description: rich(props["介绍"]).trim(),
      category: cat.id,
      tags,
      icon: rich(props["图标"]).trim(),
      _created: p.created_time || "",
    });
  }

  // 排序：专栏按固定顺序，组内按创建时间（≈ 录入顺序）
  const order = new Map(CATEGORY_ORDER.map((id, i) => [id, i]));
  categories.sort(
    (a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999)
  );
  sites.sort((a, b) => {
    const d = (order.get(a.category) ?? 999) - (order.get(b.category) ?? 999);
    if (d !== 0) return d;
    return a._created < b._created ? -1 : a._created > b._created ? 1 : 0;
  });

  // 生成 data.js（结构与手写版保持一致）
  const lines = [];
  lines.push("/**");
  lines.push(" * 个人数字收藏馆 · 网站与分类数据源 (data.js)");
  lines.push(" *");
  lines.push(" * ⚠️ 本文件由 notion-sync.js 从 Notion「馆藏 CMS」自动生成，请勿手改。");
  lines.push(" *    改法：在 Notion 里编辑「馆藏站点 / 馆藏专栏」数据库后重新运行同步。");
  lines.push(" *");
  lines.push(" * 🏛 架构原则：");
  lines.push(" * 1. 内容与展示彻底分离：页面结构不硬编码任何具体网站或分类。");
  lines.push(" * 2. 稳定标识：每个分类与网站使用全局唯一且稳定的 id，收藏与点击统计基于此 ID 绑定。");
  lines.push(" * 3. 极简维护：在 Notion 里新增一行即可，无需碰代码。");
  lines.push(" */");
  lines.push("");
  lines.push("const NAV_DATA = {");
  lines.push("  // 藏馆分类定义列表");
  lines.push("  categories: [");
  for (const c of categories) {
    lines.push("    {");
    lines.push(`      id: ${JSON.stringify(c.id)},`);
    lines.push(`      name: ${JSON.stringify(c.name)},`);
    lines.push(`      desc: ${JSON.stringify(c.desc)},`);
    lines.push(`      code: ${JSON.stringify(c.code)},`);
    lines.push("    },");
  }
  lines.push("  ],");
  lines.push("");
  lines.push(`  // 馆藏网站条目列表 (共 ${sites.length} 卷)`);
  lines.push("  sites: [");
  let lastCat = null;
  let n = 0;
  for (const s of sites) {
    if (s.category !== lastCat) {
      lastCat = s.category;
      n = 0;
      const catName = (categories.find((c) => c.id === s.category) || {}).name || s.category;
      const count = sites.filter((x) => x.category === s.category).length;
      lines.push("");
      lines.push(`    // --- ${catName} (${count} 卷) ---`);
    }
    n++;
    lines.push("    {");
    lines.push(`      id: ${JSON.stringify(s.id)},`);
    lines.push(`      name: ${JSON.stringify(s.name)},`);
    lines.push(`      url: ${JSON.stringify(s.url)},`);
    lines.push(`      description: ${JSON.stringify(s.description)},`);
    lines.push(`      category: ${JSON.stringify(s.category)},`);
    lines.push(`      tags: [${s.tags.map((t) => JSON.stringify(t)).join(", ")}],`);
    lines.push(`      icon: ${JSON.stringify(s.icon)},`);
    lines.push("    },");
  }
  lines.push("  ],");
  lines.push("};");
  lines.push("");
  lines.push("// 挂载到全局，供静态网页无构建直接运行");
  lines.push('if (typeof window !== "undefined") {');
  lines.push("  window.NAV_DATA = NAV_DATA;");
  lines.push("}");
  lines.push("");
  lines.push("// 供 Node.js 验证脚本与测试用例直接引用");
  lines.push('if (typeof module !== "undefined" && module.exports) {');
  lines.push("  module.exports = NAV_DATA;");
  lines.push("}");
  lines.push("");

  fs.writeFileSync(OUT_FILE, lines.join("\n"), "utf8");
  console.log(`✅ 已生成 ${OUT_FILE}`);
  console.log(`   专栏 ${categories.length} 个，站点 ${sites.length} 个`);
  if (skipped.inactive) console.log(`   （${skipped.inactive} 个非活跃站点未同步，加 --include-inactive 可包含）`);
  if (skipped.noCategory) console.log(`   （${skipped.noCategory} 个站点因未关联专栏被跳过）`);
  if (skipped.noId) console.log(`   （${skipped.noId} 个站点因缺少站点ID被跳过）`);

  // 顺手跑校验
  const validateJs = path.join(path.dirname(OUT_FILE), "validate.js");
  if (fs.existsSync(validateJs)) {
    console.log("正在运行 node validate.js …");
    try {
      execSync(`node ${JSON.stringify(validateJs)}`, {
        cwd: path.dirname(OUT_FILE),
        stdio: "inherit",
      });
    } catch (e) {
      console.error("❌ validate.js 未通过，请检查上面的报错");
      process.exit(2);
    }
  }
}

main().catch((e) => {
  console.error("❌ 同步失败:", e.message);
  process.exit(1);
});
