/**
 * Cloudflare Pages Function: /api/sync —— 个人数据的云端读写
 *
 * - GET  /api/sync  读取云端数据 → { updatedAt, data } / 404 { empty: true }
 * - PUT  /api/sync  写入云端数据，body { updatedAt, baseUpdatedAt, data }；
 *                    baseUpdatedAt 与当前有效版本不一致时返回 409 + 云端版本，
 *                    由客户端基于上次同步快照做三方合并
 *
 * 认证：账号会话制。请求头 Authorization: Bearer <会话 token>，
 * 服务端查 KV 的 session:<token> 得到用户名；无/过期 → 401。
 * 会话由 /api/auth/login 或 /api/auth/register 签发。
 * （旧的口令制 SYNC_TOKEN 已弃用，本文件不再读取该环境变量。）
 *
 * 档案键：profile:v2:<用户名小写>。
 * 迁移：v2 档案不存在且旧键 profile:v1 存在时，把 v1 视为该用户的初始档案
 * （GET 返回它、PUT 的 409 比较以它为准）；首次成功 PUT 写入 v2 后即以 v2 为准。
 * 旧键 profile:v1 保留不删，只读遗留。
 *
 * 需要在 Pages 项目设置里配置：
 * 1. KV 绑定：变量名 MYNAV_KV
 */

const KV_KEY_V1 = "profile:v1";
const KV_PROFILE_PREFIX = "profile:v2:";
const KV_SESSION_PREFIX = "session:";
const MAX_BYTES = 256 * 1024; // 单份档案上限 256KB，防滥用

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// 解析 Bearer 会话 → { username, token }；无/过期/伪造一律 null
async function getSession(context, kv) {
  const header = context.request.headers.get("authorization") || "";
  const m = /^Bearer (.+)$/.exec(header);
  if (!m) return null;
  const raw = await kv.get(KV_SESSION_PREFIX + m[1]);
  if (!raw) return null;
  let s;
  try {
    s = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  if (!s || typeof s.username !== "string") return null;
  if (typeof s.expiresAt === "number" && s.expiresAt < Date.now()) return null;
  return { username: s.username, token: m[1] };
}

function profileKey(username) {
  return KV_PROFILE_PREFIX + String(username).toLowerCase();
}

// 读取该用户的有效档案：优先 v2，缺失时回落到旧键 v1（迁移期只读遗留）
// 返回 { doc } | { corrupt: true }
async function loadProfile(kv, username) {
  const v2raw = await kv.get(profileKey(username));
  if (v2raw) {
    try {
      return { doc: JSON.parse(v2raw) };
    } catch (e) {
      return { corrupt: true };
    }
  }
  const v1raw = await kv.get(KV_KEY_V1);
  if (v1raw) {
    try {
      return { doc: JSON.parse(v1raw) };
    } catch (e) {
      return { corrupt: true };
    }
  }
  return { doc: null };
}

// 修改层（站内卡片编辑）的空结构
function emptyOverrides() {
  return { modified: {}, added: [], hidden: [], deleted: [], unhidden: [] };
}

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// 清洗修改层：结构不合法的字段各自降级为空，不整单拒绝
function sanitizeOverrides(raw) {
  const out = emptyOverrides();
  if (!isPlainObject(raw)) return out;
  if (isPlainObject(raw.modified)) out.modified = raw.modified;
  if (Array.isArray(raw.added)) {
    out.added = raw.added.filter((s) => isPlainObject(s)).slice(0, 500);
  }
  ["hidden", "deleted", "unhidden"].forEach((k) => {
    if (Array.isArray(raw[k])) {
      out[k] = raw[k].filter((s) => typeof s === "string").slice(0, 2000);
    }
  });
  return out;
}

// 只保留白名单字段并做基本类型校验，防止脏数据进 KV
function sanitize(data) {
  if (!data || typeof data !== "object") return null;
  const out = {};
  if (typeof data.theme === "string") out.theme = data.theme.slice(0, 16);
  if (Array.isArray(data.favorites)) {
    out.favorites = data.favorites.filter((s) => typeof s === "string").slice(0, 2000);
  } else {
    out.favorites = [];
  }
  if (data.visits && typeof data.visits === "object" && !Array.isArray(data.visits)) {
    out.visits = data.visits;
  } else {
    out.visits = {};
  }
  if (data.order && typeof data.order === "object" && !Array.isArray(data.order)) {
    out.order = data.order;
  } else {
    out.order = {};
  }
  out.overrides = sanitizeOverrides(data.overrides);
  return out;
}

export async function onRequestGet(context) {
  const kv = context.env.MYNAV_KV;
  if (!kv) {
    return json({ error: "KV 未绑定：请在 Pages 设置里添加 MYNAV_KV 绑定" }, 500);
  }

  const auth = await getSession(context, kv);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const loaded = await loadProfile(kv, auth.username);
  if (loaded.corrupt) return json({ error: "云端数据损坏" }, 500);
  if (!loaded.doc) {
    // 该账号下还没有档案（首次使用）
    return json({ empty: true }, 404);
  }
  return json(loaded.doc, 200);
}

export async function onRequestPut(context) {
  const kv = context.env.MYNAV_KV;
  if (!kv) {
    return json({ error: "KV 未绑定：请在 Pages 设置里添加 MYNAV_KV 绑定" }, 500);
  }

  const auth = await getSession(context, kv);
  if (!auth) return json({ error: "unauthorized" }, 401);

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ error: "请求体不是合法 JSON" }, 400);
  }

  if (!body || typeof body.updatedAt !== "number" || !body.data) {
    return json({ error: "缺少 updatedAt / data" }, 400);
  }

  const clean = sanitize(body.data);
  if (!clean) {
    return json({ error: "data 格式无效" }, 400);
  }

  const doc = { updatedAt: body.updatedAt, data: clean };
  if (JSON.stringify(doc).length > MAX_BYTES) {
    return json({ error: "数据过大，拒绝写入" }, 413);
  }

  // 乐观并发：新客户端必须声明本次编辑基于哪个云端版本。
  // 这样另一台设备已先写入时会返回 409，由客户端三方合并，而不是整份覆盖。
  const loaded = await loadProfile(kv, auth.username);
  if (loaded.corrupt) return json({ error: "云端数据损坏" }, 500);
  const remoteUpdatedAt = loaded.doc && Number.isFinite(loaded.doc.updatedAt)
    ? Math.max(0, loaded.doc.updatedAt)
    : 0;
  const hasBaseVersion = body.baseUpdatedAt !== undefined && body.baseUpdatedAt !== null;
  if (hasBaseVersion &&
      (!Number.isFinite(body.baseUpdatedAt) || body.baseUpdatedAt < 0)) {
    return json({ error: "baseUpdatedAt 格式无效" }, 400);
  }
  const conflict = hasBaseVersion
    ? body.baseUpdatedAt !== remoteUpdatedAt || doc.updatedAt <= remoteUpdatedAt
    : remoteUpdatedAt > doc.updatedAt;
  if (conflict) {
    return json(loaded.doc || { empty: true, updatedAt: 0 }, 409);
  }

  // 写入 v2；此后该用户以 v2 为准（v1 保持原样，只读遗留）
  await kv.put(profileKey(auth.username), JSON.stringify(doc));
  return json({ updatedAt: doc.updatedAt }, 200);
}
