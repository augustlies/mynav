/**
 * Cloudflare Pages Function: /api/sync —— 个人数据的云端读写
 *
 * - GET  /api/sync  读取云端数据 → { updatedAt, data } / 404 { empty: true }
 * - PUT  /api/sync  写入云端数据，body { updatedAt, data }；
 *                    云端更新时返回 409 + 云端版本（last-write-wins）
 *
 * 认证：口令制。请求头 Authorization: Bearer <口令>，
 * 与 Pages 环境变量 SYNC_TOKEN 比对（恒定时间比对）。
 * 未带口令/口令错误 → 401；未配置 SYNC_TOKEN → 500（fail closed）。
 *
 * 需要在 Pages 项目设置里配置：
 * 1. KV 绑定：变量名 MYNAV_KV
 * 2. 环境变量：SYNC_TOKEN = 你自己定的口令（不要告诉任何人，包括 AI）
 */

const KV_KEY = "profile:v1";
const MAX_BYTES = 256 * 1024; // 单份档案上限 256KB，防滥用

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// 恒定时间字符串比对，防时序攻击
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function checkAuth(request, env) {
  const expected = env.SYNC_TOKEN;
  if (!expected) {
    return { ok: false, status: 500, error: "SYNC_TOKEN 未配置：请在 Pages 设置里添加环境变量" };
  }
  const header = request.headers.get("authorization") || "";
  const m = /^Bearer (.+)$/.exec(header);
  if (!m || !safeEqual(m[1], expected)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
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
  return out;
}

export async function onRequestGet(context) {
  const auth = checkAuth(context.request, context.env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const kv = context.env.MYNAV_KV;
  if (!kv) {
    return json({ error: "KV 未绑定：请在 Pages 设置里添加 MYNAV_KV 绑定" }, 500);
  }

  const raw = await kv.get(KV_KEY);
  if (!raw) {
    // 云端还没有数据（首次使用）
    return json({ empty: true }, 404);
  }

  try {
    return json(JSON.parse(raw), 200);
  } catch (e) {
    return json({ error: "云端数据损坏" }, 500);
  }
}

export async function onRequestPut(context) {
  const auth = checkAuth(context.request, context.env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const kv = context.env.MYNAV_KV;
  if (!kv) {
    return json({ error: "KV 未绑定：请在 Pages 设置里添加 MYNAV_KV 绑定" }, 500);
  }

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

  // last-write-wins：云端更新则拒绝，并把云端版本还给客户端
  const raw = await kv.get(KV_KEY);
  if (raw) {
    try {
      const current = JSON.parse(raw);
      if (typeof current.updatedAt === "number" && current.updatedAt > doc.updatedAt) {
        return json(current, 409);
      }
    } catch (e) {
      // 云端数据损坏则直接覆盖
    }
  }

  await kv.put(KV_KEY, JSON.stringify(doc));
  return json({ updatedAt: doc.updatedAt }, 200);
}
