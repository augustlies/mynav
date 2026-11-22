import { catalogue } from "./_catalogue.js";

const API = "https://api.notion.com/v1";
const SITES = "35983911-5875-438a-9777-7737a18cf94e";
const CATEGORIES = "e27ec9e3-4644-4a04-9999-ccdacff6dc57";
const OWNER = "sueexin";
const BASELINE_KEY = "cards:v1:baseline-imported";
const PROFILE_PREFIX = "profile:v2:";
const SESSION_PREFIX = "session:";

function prop(props, names) {
  for (const name of names) if (props && props[name]) return props[name];
  return null;
}

function text(props, names) {
  const value = prop(props, names);
  const items = value && (value.title || value.rich_text);
  return Array.isArray(items) ? items.map((item) => item.plain_text || item.text?.content || "").join("").trim() : "";
}

function idOf(page, names) {
  return text(page.properties || {}, names);
}

function rich(value) {
  const valueText = String(value || "");
  const parts = [];
  for (let i = 0; i < valueText.length; i += 1900) parts.push({ text: { content: valueText.slice(i, i + 1900) } });
  return { rich_text: parts };
}

function categoryId(page) {
  return idOf(page, ["专栏ID", "CategoryID", "分类ID"]).toLowerCase();
}

function siteId(page) {
  return idOf(page, ["CardID", "卡片ID", "站点ID", "ID"]);
}

function categoryProps(item) {
  return {
    Name: { title: [{ text: { content: String(item.name || "").slice(0, 2000) } }] },
    "专栏ID": rich(item.id), "代号": rich(item.code), "简介": rich(item.desc),
  };
}

function siteProps(site, categoryPageId, status, full) {
  const out = {};
  const set = (key, value) => { out[key] = value; };
  if (full || "name" in site) set("Name", { title: [{ text: { content: String(site.name || "").slice(0, 2000) } }] });
  if (full) set("站点ID", rich(site.id));
  if (full || "url" in site) set("链接", { url: site.url || null });
  if (full || "category" in site) {
    if (!categoryPageId) throw new Error("Notion 分类不存在: " + site.category);
    set("专栏", { relation: [{ id: categoryPageId }] });
  }
  if (full || "description" in site) set("介绍", rich(site.description));
  if (full || "icon" in site) set("图标", rich(site.icon));
  if (full || "tags" in site) set("标签", rich(Array.isArray(site.tags) ? site.tags.join(", ") : ""));
  if (full || "notes" in site) set("备注", rich(site.notes));
  if (full || "sort" in site) set("Sort", { number: Number.isFinite(site.sort) ? site.sort : 0 });
  if (status || full) set("状态", { select: { name: status || (site.hidden ? "待检查" : "活跃") } });
  if (full || "favicon" in site) set("Favicon", { url: site.favicon || null });
  if (full || "subLinks" in site) set("SubLinks", rich(Array.isArray(site.subLinks) ? JSON.stringify(site.subLinks) : ""));
  return out;
}

async function query(source, token) {
  const result = [];
  let cursor;
  for (let i = 0; i < 12; i += 1) {
    const response = await fetch(API + "/data_sources/" + encodeURIComponent(source) + "/query", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "notion-version": "2025-09-03", "content-type": "application/json" },
      body: JSON.stringify(Object.assign({ page_size: 100 }, cursor ? { start_cursor: cursor } : {})),
    });
    if (!response.ok) throw Object.assign(new Error("Notion query " + response.status), { status: response.status });
    const page = await response.json();
    result.push.apply(result, page.results || []);
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return result;
}

async function write(env, pageId, source, properties) {
  await new Promise((resolve) => setTimeout(resolve, 350));
  const creating = !pageId;
  const response = await fetch(API + (creating ? "/pages" : "/pages/" + encodeURIComponent(pageId)), {
    method: creating ? "POST" : "PATCH",
    headers: { authorization: "Bearer " + env.NOTION_TOKEN, "notion-version": "2025-09-03", "content-type": "application/json" },
    body: JSON.stringify(creating
      ? { parent: { type: "data_source_id", data_source_id: source }, properties }
      : { properties }),
  });
  if (!response.ok) throw Object.assign(new Error("Notion write " + response.status), { status: response.status });
  return response.json();
}

async function profile(kv) {
  for (const key of [PROFILE_PREFIX + OWNER, "profile:v1"]) {
    const raw = await kv.get(key);
    if (!raw) continue;
    try {
      const doc = JSON.parse(raw);
      if (doc && Number.isFinite(doc.updatedAt) && doc.data) return doc;
    } catch (error) {
      throw Object.assign(new Error("云档案损坏"), { code: "PROFILE_CORRUPT" });
    }
  }
  return { updatedAt: 0, data: { overrides: {} } };
}

async function authorized(context, kv) {
  const match = /^Bearer (.+)$/.exec(context.request.headers.get("authorization") || "");
  if (!match) return false;
  const raw = await kv.get(SESSION_PREFIX + match[1]);
  if (!raw) return false;
  try {
    const session = JSON.parse(raw);
    return session && String(session.username).toLowerCase() === OWNER &&
      !(typeof session.expiresAt === "number" && session.expiresAt < Date.now());
  } catch (error) {
    return false;
  }
}

async function importBaseline(env, kv) {
  const siteSource = env.NOTION_SITES_DATA_SOURCE_ID || SITES;
  const categorySource = env.NOTION_CATEGORIES_DATA_SOURCE_ID || CATEGORIES;
  let progress = null;
  const rawProgress = await kv.get("cards:v1:baseline-progress");
  if (rawProgress) {
    try {
      const parsed = JSON.parse(rawProgress);
      if (parsed.version === catalogue.version) progress = parsed;
    } catch (error) {}
  }

  if (!progress) {
    const [sites, categories] = await Promise.all([
      query(siteSource, env.NOTION_TOKEN), query(categorySource, env.NOTION_TOKEN),
    ]);
    const oldCategories = new Map(categories.map((page) => [categoryId(page), page]).filter(([id]) => id));
    const categoryPages = new Map();
    for (const item of catalogue.categories) {
      const saved = await write(env, oldCategories.get(item.id)?.id, categorySource, categoryProps(item));
      categoryPages.set(item.id, saved.id);
    }
    const oldSites = new Map();
    for (const page of sites) {
      const id = siteId(page);
      if (id && !oldSites.has(id)) oldSites.set(id, page);
    }
    const wanted = new Set(catalogue.sites.map((site) => site.id));
    const stalePageIds = sites.filter((page) => {
      const id = siteId(page);
      const status = prop(page.properties, ["状态"]);
      return id && (!wanted.has(id) || oldSites.get(id) !== page) && status?.select?.name !== "失效";
    }).map((page) => page.id);
    progress = {
      version: catalogue.version,
      categoryPages: Object.fromEntries(categoryPages),
      sitePageIds: Object.fromEntries(Array.from(oldSites, ([id, page]) => [id, page.id])),
      stalePageIds,
      siteIndex: 0,
      staleIndex: 0,
    };
    await kv.put("cards:v1:baseline-progress", JSON.stringify(progress));
  }

  const currentSites = await query(siteSource, env.NOTION_TOKEN);
  const currentSitePageIds = new Map(currentSites.map((page) => [siteId(page), page.id]).filter(([id, pageId]) => id && pageId));
  for (let index = progress.siteIndex; index < catalogue.sites.length; index += 1) {
    const site = catalogue.sites[index];
    if (!progress.sitePageIds[site.id] && currentSitePageIds.has(site.id)) {
      progress.sitePageIds[site.id] = currentSitePageIds.get(site.id);
    }
  }
  await kv.put("cards:v1:baseline-progress", JSON.stringify(progress));

  let writes = 0;
  while (progress.siteIndex < catalogue.sites.length && writes < 20) {
    const site = catalogue.sites[progress.siteIndex];
    const saved = await write(env, progress.sitePageIds[site.id], siteSource,
      siteProps(site, progress.categoryPages[site.category], site.hidden ? "待检查" : "活跃", true));
    progress.sitePageIds[site.id] = saved.id;
    progress.siteIndex += 1;
    writes += 1;
    await kv.put("cards:v1:baseline-progress", JSON.stringify(progress));
  }
  while (progress.siteIndex === catalogue.sites.length &&
      progress.staleIndex < progress.stalePageIds.length && writes < 20) {
    const pageId = progress.stalePageIds[progress.staleIndex];
    await write(env, pageId, siteSource, { 状态: { select: { name: "失效" } } });
    progress.staleIndex += 1;
    writes += 1;
    await kv.put("cards:v1:baseline-progress", JSON.stringify(progress));
  }
  return progress.siteIndex === catalogue.sites.length &&
    progress.staleIndex === progress.stalePageIds.length;
}

function hasOverrides(value) {
  const data = value || {};
  return Object.keys(data.modified || {}).length > 0 ||
    ["added", "hidden", "deleted", "unhidden"].some((key) => Array.isArray(data[key]) && data[key].length);
}

async function writeOverrides(env, overrides) {
  const siteSource = env.NOTION_SITES_DATA_SOURCE_ID || SITES;
  const categorySource = env.NOTION_CATEGORIES_DATA_SOURCE_ID || CATEGORIES;
  const [sites, categories] = await Promise.all([
    query(siteSource, env.NOTION_TOKEN), query(categorySource, env.NOTION_TOKEN),
  ]);
  const pages = new Map(sites.map((page) => [siteId(page), page]).filter(([id]) => id));
  const categoriesById = new Map(categories.map((page) => [categoryId(page), page.id]).filter(([id]) => id));
  const changes = new Map();
  const addedIds = new Set((overrides.added || []).map((item) => item && item.id).filter(Boolean));
  for (const [id, fields] of Object.entries(overrides.modified || {})) {
    if (!pages.has(id) && !addedIds.has(id)) throw new Error("Notion 卡片不存在: " + id);
    changes.set(id, { fields, full: false });
  }
  for (const item of overrides.added || []) {
    if (!item || !item.id) continue;
    const previous = changes.get(item.id);
    changes.set(item.id, {
      fields: Object.assign({}, item, previous && previous.fields),
      full: true,
      status: previous && previous.status,
    });
  }
  for (const id of overrides.hidden || []) if (pages.has(id) || changes.has(id)) {
    changes.set(id, Object.assign(changes.get(id) || { fields: {}, full: false }, { status: "待检查" }));
  }
  for (const id of overrides.unhidden || []) if (pages.has(id) || changes.has(id)) {
    changes.set(id, Object.assign(changes.get(id) || { fields: {}, full: false }, { status: "活跃" }));
  }
  for (const id of overrides.deleted || []) if (pages.has(id) || changes.has(id)) {
    changes.set(id, Object.assign(changes.get(id) || { fields: {}, full: false }, { status: "失效" }));
  }
  for (const [id, change] of changes) {
    const categoryPageId = change.fields.category && categoriesById.get(change.fields.category);
    const props = siteProps(change.fields, categoryPageId, change.status, change.full);
    if (change.status && !props["状态"]) props["状态"] = { select: { name: change.status } };
    await write(env, pages.get(id)?.id, siteSource, props);
  }
}

export async function syncOwnerCatalogue(context, env, kv, fetchCatalogue, json) {
  if (!(await authorized(context, kv))) return null;
  if (!env.NOTION_TOKEN) return json({ error: "Notion 环境变量未配置", code: "NOTION_ENV_MISSING" }, 503);
  let body;
  try {
    body = await context.request.json();
  } catch (error) {
    return json({ error: "请求体不是合法 JSON", code: "INVALID_JSON" }, 400);
  }
  if (!body || !Number.isFinite(body.profileUpdatedAt) || body.profileUpdatedAt < 0) {
    return json({ error: "缺少有效的 profileUpdatedAt", code: "INVALID_PROFILE_VERSION" }, 400);
  }
  try {
    const current = await profile(kv);
    if (current.updatedAt !== body.profileUpdatedAt) return json({ conflict: true, updatedAt: current.updatedAt }, 409);
    const imported = !(await kv.get(BASELINE_KEY));
    const overrides = current.data.overrides || {};
    const changed = imported || hasOverrides(overrides);
    if (imported) {
      const complete = await importBaseline(env, kv);
      if (!complete) {
        const latest = await profile(kv);
        if (latest.updatedAt !== current.updatedAt) return json({ conflict: true, updatedAt: latest.updatedAt }, 409);
        return json({ ok: true, inProgress: true, clearOverrides: false }, 202);
      }
    } else if (hasOverrides(overrides)) {
      await writeOverrides(env, overrides);
    }
    if (changed) {
      const result = await fetchCatalogue(env);
      if (!result.sites.length) return json({ error: "Notion 返回空目录", code: "EMPTY_PAYLOAD" }, 422);
      await kv.put("cards:v1:published", JSON.stringify(result));
    }
    if (imported) {
      await kv.put(BASELINE_KEY, catalogue.version);
      if (typeof kv.delete === "function") await kv.delete("cards:v1:baseline-progress");
    }
    const latest = await profile(kv);
    if (latest.updatedAt !== current.updatedAt) return json({ conflict: true, updatedAt: latest.updatedAt }, 409);
    return json({ ok: true, baselineImported: imported, clearOverrides: changed });
  } catch (error) {
    const code = error && error.code === "PROFILE_CORRUPT" ? "PROFILE_CORRUPT" : "NOTION_WRITE_FAILED";
    return json({ error: "Notion 写回失败，账号云档案中的目录修改仍保留", code }, error && error.status === 429 ? 503 : 502);
  }
}
