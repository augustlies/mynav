#!/usr/bin/env node
/**
 * scripts/notion-import.js — 把 data.js 现有卡片一次性导入 Notion 卡片数据库
 *
 * 只读 data.js，不改它，不重新部署。导入前默认只演练，不加 --apply 不会写入 Notion。
 *
 * 用法：
 *   NOTION_TOKEN=ntn_xxx NOTION_DB_ID=xxxxxxxx node scripts/notion-import.js
 *   NOTION_TOKEN=ntn_xxx NOTION_DB_ID=xxxxxxxx node scripts/notion-import.js --apply
 *
 * 可选：
 *   --apply          真正写入 Notion
 *   --limit <n>      只处理前 n 张（演练或分批导入）
 *   --update         已存在的 CardID 也更新卡片字段（默认跳过，避免覆盖手改）
 *
 * 数据库字段必须与 NOTION_CARDS.md 一致：
 *   CardID(title), Name(rich_text), URL(url), Category(select),
 *   Description(rich_text), Icon(rich_text), Tags(rich_text),
 *   Sort(number), Hidden(checkbox)
 */
"use strict";

const path = require("node:path");
const NAV_DATA = require(path.join(__dirname, "..", "data.js"));

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const UPDATE = args.includes("--update");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  const n = i >= 0 ? Number(args[i + 1]) : 0;
  return Number.isInteger(n) && n > 0 ? n : 0;
})();

const NOTION_VERSION = "2022-06-28";
const TOKEN = process.env.NOTION_TOKEN || "";
const DB_ID = process.env.NOTION_DB_ID || "";

function rich(content) {
  const text = String(content == null ? "" : content).slice(0, 1900);
  return { rich_text: text ? [{ type: "text", text: { content: text } }] : [] };
}

function propertiesFor(site, sort) {
  return {
    CardID: { title: [{ type: "text", text: { content: site.id } }] },
    Name: rich(site.name),
    URL: { url: site.url },
    Category: { select: { name: site.category } },
    Description: rich(site.description || ""),
    Icon: rich(site.icon || ""),
    Tags: rich(Array.isArray(site.tags) ? site.tags.join(", ") : ""),
    Sort: { number: sort },
    Hidden: { checkbox: site.hidden === true }
  };
}

function plain(prop) {
  if (!prop) return "";
  const arr = prop.title || prop.rich_text || [];
  return arr.map((item) => (item && item.plain_text) || "").join("").trim();
}

async function notionRequest(pathname, body) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch("https://api.notion.com/v1" + pathname, {
      method: "POST",
      headers: {
        authorization: "Bearer " + TOKEN,
        "notion-version": NOTION_VERSION,
        "content-type": "application/json"
      },
      body: JSON.stringify(body || {})
    });
    if (res.status === 429 && attempt === 0) {
      const wait = Number(res.headers.get("retry-after")) || 1;
      await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 5) * 1000));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error("Notion API " + res.status + ": " + text.slice(0, 300));
    }
    return res.json();
  }
  throw new Error("Notion API 限流重试失败");
}

async function listExisting() {
  const existing = new Set();
  let cursor = null;
  for (;;) {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notionRequest("/databases/" + encodeURIComponent(DB_ID) + "/query", body);
    (data.results || []).forEach((page) => {
      const id = plain(page.properties && page.properties.CardID);
      if (id) existing.add(id);
    });
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return existing;
}

function sortValue(site, index) {
  const list = NAV_DATA.sites.filter((item) => item.category === site.category);
  const position = list.findIndex((item) => item.id === site.id);
  return position >= 0 ? position + 1 : index + 1;
}

async function main() {
  const sites = NAV_DATA.sites.slice(0, LIMIT || undefined);
  console.log("data.js 卡片：" + NAV_DATA.sites.length + " 张；本次处理 " + sites.length + " 张");
  console.log("模式：" + (APPLY ? "写入 Notion" : "演练（不写入，加 --apply 才会写入）"));

  if (!APPLY) {
    sites.slice(0, 8).forEach((site, index) => {
      const props = propertiesFor(site, sortValue(site, index));
      console.log(
        "- " + site.id + " | " + props.Name.rich_text[0]?.text.content + " | " +
        site.category + " | sort=" + props.Sort.number
      );
    });
    console.log("演练结束，未连接 Notion、未写入任何数据。");
    return;
  }

  if (!TOKEN || !DB_ID) {
    throw new Error("缺少 NOTION_TOKEN 或 NOTION_DB_ID 环境变量");
  }

  console.log("读取 Notion 现有 CardID…");
  const existing = await listExisting();
  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (let i = 0; i < sites.length; i += 1) {
    const site = sites[i];
    if (existing.has(site.id) && !UPDATE) {
      skipped += 1;
      continue;
    }
    const props = propertiesFor(site, sortValue(site, i));
    await notionRequest("/pages", { parent: { database_id: DB_ID }, properties: props });
    if (existing.has(site.id)) updated += 1;
    else created += 1;
    if ((i + 1) % 10 === 0) console.log("进度 " + (i + 1) + "/" + sites.length);
    await new Promise((resolve) => setTimeout(resolve, 320));
  }

  console.log("完成：新建 " + created + "，更新 " + updated + "，已存在跳过 " + skipped);
  console.log("下一步：在 Cloudflare 配好 NOTION_TOKEN / NOTION_DB_ID，然后调用 POST /api/cards 发布。");
}

main().catch((error) => {
  console.error("导入失败：" + error.message);
  process.exit(1);
});
