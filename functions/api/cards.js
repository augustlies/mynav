/**
 * Cloudflare Pages Function: /api/cards —— Notion 卡片覆盖层
 *
 * GET  /api/cards            只读 KV 中的已发布版本；无缓存时返回 404
 * GET  /api/cards?v=<ver>    版本相同返回 { unchanged: true }
 * POST /api/cards            用 NOTION_TOKEN / NOTION_DB_ID 拉取 Notion 并覆盖发布
 *
 * 安全：POST 需要请求头 x-mynav-refresh-token，值来自环境变量
 *       MYNAV_CARDS_REFRESH_TOKEN。令牌只走环境变量，不出现在 URL。
 * 缓存：KV 键 cards:v1:published；过期数据只有在显式刷新成功后才替换。
 * 失败：保留上一版并返回错误，不返回空数组覆盖。
 */

const KV_KEY = "cards:v1:published";
const NOTION_VERSION = "2025-09-03";
const NOTION_DATA_SOURCE_PREFIX = "https://api.notion.com/v1/data_sources/";
const DEFAULT_SITES_DATA_SOURCE_ID = "35983911-5875-438a-9777-7737a18cf94e";
const DEFAULT_CATEGORIES_DATA_SOURCE_ID = "e27ec9e3-4644-4a04-9999-ccdacff6dc57";
const REFRESH_LOCK_KEY = "cards:v1:refresh-lock";
const REFRESH_INTERVAL_MS = 120000;
const MAX_PAGES = 12;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign(
      {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      extraHeaders
    ),
  });
}

function fail(message, status, code) {
  return json({ error: message, code: code }, status);
}

function firstProp(props, names) {
  for (const name of names) {
    if (props && props[name]) return props[name];
  }
  return null;
}

function richText(prop) {
  if (!prop) return "";
  const arr = prop.title || prop.rich_text || [];
  if (!Array.isArray(arr)) return "";
  return arr.map((item) => (item && (item.plain_text || (item.text && item.text.content))) || "").join("").trim();
}

function textValue(prop, names) {
  const p = firstProp(prop, names);
  if (!p) return "";
  if (typeof p === "string") return p.trim();
  if (typeof p.url === "string") return p.url.trim();
  if (p.select && p.select.name) return String(p.select.name).trim();
  if (Number.isFinite(p.number)) return String(p.number);
  return richText(p);
}

function urlValue(prop) {
  const p = firstProp(prop, ["URL", "Link", "链接", "网址"]);
  if (!p) return "";
  if (typeof p.url === "string") return p.url.trim();
  return richText(p);
}

function numberValue(prop) {
  const p = firstProp(prop, ["Sort", "排序", "顺序"]);
  if (!p) return null;
  if (Number.isFinite(p.number)) return p.number;
  const n = Number(richText(p));
  return Number.isFinite(n) ? n : null;
}

function checkboxValue(prop) {
  const p = firstProp(prop, ["Hidden", "隐藏", "是否隐藏"]);
  return Boolean(p && p.checkbox === true);
}

function tagsValue(prop) {
  const p = firstProp(prop, ["Tags", "标签"]);
  if (!p) return [];
  if (Array.isArray(p.multi_select)) {
    return p.multi_select.map((item) => String((item && item.name) || "").trim()).filter(Boolean);
  }
  return richText(p)
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function hash(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function isSafeHttpUrl(raw) {
  return typeof raw === "string" && /^https?:\/\/[^\s"'<>]+$/i.test(raw.trim());
}

function subLinksValue(props) {
  const raw = textValue(props, ["SubLinks", "Sub Links", "子路由"]);
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item) => item && typeof item === "object" && isSafeHttpUrl(item.url))
          .slice(0, 4)
          .map((item) => ({
            label: String(item.label || "子路由").trim().slice(0, 60),
            url: item.url.trim(),
          }));
      }
    } catch (e) {}
  }
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const idx = line.indexOf("|");
      if (idx <= 0) return null;
      const label = line.slice(0, idx).trim().slice(0, 60);
      const url = line.slice(idx + 1).trim();
      return label && isSafeHttpUrl(url) ? { label, url } : null;
    })
    .filter(Boolean)
    .slice(0, 4);
}

function normalizeRow(page, index) {
  const props = (page && page.properties) || {};
  const id = textValue(props, ["CardID", "卡片ID", "站点ID", "ID"]);
  const name = textValue(props, ["Name", "名称", "标题"]);
  const url = urlValue(props);
  const category = textValue(props, ["Category", "分类", "分类ID"]).toLowerCase();
  const description = textValue(props, ["Description", "描述", "介绍"]);
  const icon = textValue(props, ["Icon", "图标"]);
  const sort = numberValue(props);
  const hidden = checkboxValue(props);
  const tags = tagsValue(props);
  const whySaved = textValue(props, ["WhySaved", "Why Saved", "收录动机"]);
  const notes = textValue(props, ["Notes", "Note", "批注", "备注"]);
  const favicon = textValue(props, ["Favicon", "IconURL", "Icon URL", "图标URL"]);
  const subLinks = subLinksValue(props);

  const errors = [];
  if (!id) errors.push("缺少 CardID");
  if (!name) errors.push("缺少 Name");
  if (!isSafeHttpUrl(url)) errors.push("URL 必须是 http/https");
  if (!VALID_CATEGORIES.includes(category)) errors.push("Category 不在已支持分类");

  if (errors.length) {
    return { error: { id: id || "(无 ID)", pageId: page && page.id, errors } };
  }

  const row = {
    id,
    name,
    url,
    description,
    category,
    icon,
    tags,
    sort: sort === null ? index : sort,
    hidden,
  };
  if (whySaved) row.whySaved = whySaved;
  if (notes) row.notes = notes;
  if (isSafeHttpUrl(favicon)) row.favicon = favicon.trim();
  if (subLinks.length > 0) row.subLinks = subLinks;

  return { row };
}

async function queryAllPages(dataSourceId, token) {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(NOTION_DATA_SOURCE_PREFIX + encodeURIComponent(dataSourceId) + "/query", {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "notion-version": NOTION_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error("Notion query " + res.status);
    }
    const data = await res.json();
    const list = Array.isArray(data.results) ? data.results : [];
    rows.push.apply(rows, list);
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return rows;
}

async function fetchNotion(env) {
  const token = env.NOTION_TOKEN;
  if (!token) {
    throw Object.assign(new Error("Notion 环境变量未配置"), { code: "NOTION_ENV_MISSING" });
  }
  const sitesSourceId = env.NOTION_SITES_DATA_SOURCE_ID || DEFAULT_SITES_DATA_SOURCE_ID;
  const categoriesSourceId = env.NOTION_CATEGORIES_DATA_SOURCE_ID || DEFAULT_CATEGORIES_DATA_SOURCE_ID;
  const [pages, categoryPages] = await Promise.all([
    queryAllPages(sitesSourceId, token),
    queryAllPages(categoriesSourceId, token),
  ]);

  const categories = [];
  const categoryByPageId = new Map();
  categoryPages.forEach((page, index) => {
    const props = (page && page.properties) || {};
    const id = textValue(props, ["专栏ID", "CategoryID", "分类ID"])
      .toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const name = textValue(props, ["Name", "名称", "标题"]);
    if (!id || !name || categories.some((category) => category.id === id)) return;
    categories.push({
      id,
      name,
      desc: textValue(props, ["简介", "Description", "描述"]),
      code: textValue(props, ["代号", "Code"]) || String(index + 1),
    });
    if (page.id) categoryByPageId.set(page.id, id);
  });
  if (!categories.length) {
    throw Object.assign(new Error("Notion 分类数据为空"), { code: "NOTION_CATEGORIES_EMPTY" });
  }

  const sites = [];
  const skipped = [];
  const seen = new Set();
  pages.forEach((page, index) => {
    const props = (page && page.properties) || {};
    const status = textValue(props, ["状态"]);
    if (status && status !== "活跃") return;
    const relation = firstProp(props, ["专栏", "Category", "分类"]);
    const relatedPage = relation && Array.isArray(relation.relation) && relation.relation[0];
    if (relatedPage && relatedPage.id) {
      props.Category = { select: { name: categoryByPageId.get(relatedPage.id) || "" } };
    }
    const result = normalizeRow(page, index);
    if (result.error) {
      skipped.push(Object.assign({}, result.error, { pageIndex: index }));
      return;
    }
    if (seen.has(result.row.id)) {
      skipped.push({ id: result.row.id, pageId: page.id, errors: ["站点ID 重复"] });
      return;
    }
    seen.add(result.row.id);
    sites.push(result.row);
  });

  const categoryOrder = new Map(categories.map((category, index) => [category.id, index]));
  sites.sort((a, b) => {
    const ca = categoryOrder.has(a.category) ? categoryOrder.get(a.category) : 999;
    const cb = categoryOrder.has(b.category) ? categoryOrder.get(b.category) : 999;
    if (ca !== cb) return ca - cb;
    return a.sort - b.sort;
  });

  const version = "v1-" + hash(JSON.stringify({ categories, sites }));
  const updatedAt = pages.concat(categoryPages).reduce((latest, page) => {
    const t = page && page.last_edited_time ? Date.parse(page.last_edited_time) : 0;
    return Number.isFinite(t) && t > latest ? t : latest;
  }, 0);

  return {
    version,
    updatedAt: updatedAt || Date.now(),
    fetchedAt: Date.now(),
    count: sites.length,
    categories,
    skipped: skipped.slice(0, 20),
    skippedCount: skipped.length,
    sites,
  };
}

function timingSafeEqualStr(a, b) {
  const enc = new TextEncoder();
  const ba = enc.encode(String(a || ""));
  const bb = enc.encode(String(b || ""));
  const len = Math.max(ba.length, bb.length);
  let diff = ba.length ^ bb.length;
  for (let i = 0; i < len; i += 1) {
    diff |= (ba[i] || 0) ^ (bb[i] || 0);
  }
  return diff === 0;
}

function authorizedRefresh(context, env) {
  const secret = env.MYNAV_CARDS_REFRESH_TOKEN;
  if (!secret) return { ok: false, code: "REFRESH_TOKEN_MISSING" };
  const provided = context.request.headers.get("x-mynav-refresh-token") || "";
  if (!provided || !timingSafeEqualStr(provided, secret)) return { ok: false, code: "UNAUTHORIZED" };
  return { ok: true };
}

async function readCache(kv) {
  const raw = await kv.get(KV_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.sites)) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

async function refreshIfDue(env, kv, cached) {
  if (!env.NOTION_TOKEN) return cached;
  const age = cached ? Date.now() - Number(cached.fetchedAt || 0) : Infinity;
  if (age < REFRESH_INTERVAL_MS) return cached;
  if (await kv.get(REFRESH_LOCK_KEY)) return cached;
  await kv.put(REFRESH_LOCK_KEY, String(Date.now()), { expirationTtl: 120 });
  try {
    const fresh = await fetchNotion(env);
    if (!fresh.sites.length) return cached;
    await kv.put(KV_KEY, JSON.stringify(fresh));
    return fresh;
  } catch (error) {
    return cached;
  }
}

export async function onRequestGet(context) {
  const env = context.env || {};
  const kv = env.MYNAV_KV;
  if (!kv) return fail("KV 未绑定：请在 Pages 设置里添加 MYNAV_KV 绑定", 500, "KV_MISSING");

  const cached = await refreshIfDue(env, kv, await readCache(kv));
  const requestedVersion = new URL(context.request.url).searchParams.get("v");
  if (cached) {
    if (requestedVersion && requestedVersion === cached.version) {
      return json({
        unchanged: true,
        version: cached.version,
        updatedAt: cached.updatedAt,
        count: cached.count,
      });
    }
    return json(cached);
  }
  return json({ empty: true }, 404);
}

export async function onRequestPost(context) {
  const env = context.env || {};
  const kv = env.MYNAV_KV;
  if (!kv) return fail("KV 未绑定：请在 Pages 设置里添加 MYNAV_KV 绑定", 500, "KV_MISSING");

  const auth = authorizedRefresh(context, env);
  if (!auth.ok) {
    if (auth.code === "REFRESH_TOKEN_MISSING") {
      return fail("刷新口令未配置：请在 Pages 环境变量里添加 MYNAV_CARDS_REFRESH_TOKEN", 503, auth.code);
    }
    return fail("刷新口令无效", 403, auth.code);
  }

  try {
    const fresh = await fetchNotion(env);
    if (!fresh.sites.length) {
      return fail("Notion 返回 0 张有效卡片，已保留上一版", 422, "EMPTY_PAYLOAD");
    }
    await kv.put(KV_KEY, JSON.stringify(fresh));
    return json({
      ok: true,
      version: fresh.version,
      updatedAt: fresh.updatedAt,
      count: fresh.count,
      skippedCount: fresh.skippedCount,
      skipped: fresh.skipped,
    });
  } catch (e) {
    const code = e && e.code === "NOTION_ENV_MISSING" ? "NOTION_ENV_MISSING" : "NOTION_FETCH_FAILED";
    return fail("Notion 拉取失败，已保留上一版", 502, code);
  }
}

export const __test__ = { normalizeRow, fetchNotion, hash };
