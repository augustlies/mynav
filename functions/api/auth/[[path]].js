/**
 * Cloudflare Pages Function: /api/auth/* —— 账号体系（用户名 + 密码）
 *
 * 路由（catch-all，[[path]] 可零段可多段）：
 *   POST /api/auth/register  {username, password} → {token, username, recoveryCode}
 *   POST /api/auth/login     {username, password} → {token, username}
 *   GET  /api/auth/me        Bearer 会话       → {username}
 *   POST /api/auth/logout    Bearer 会话       → {ok: true}
 *   POST /api/auth/recovery-code  Bearer 会话  → {recoveryCode}（重新生成）
 *   POST /api/auth/recover   {username, recoveryCode, newPassword} → 新会话 + 新恢复码
 *
 * 存储（沿用 Pages 现有 KV 绑定 MYNAV_KV，不需要新绑定）：
 *   users:index       已注册用户名数组（小写），非空即关闭注册
 *   user:<name>       {salt, hash, createdAt}，salt/hash 均为 base64
 *   session:<token>   {username, expiresAt}，put 时带 expirationTtl = 30 天
 *   recovery:<name>   一次性恢复码的 PBKDF2 摘要，不明文保存
 *
 * 安全：
 * - 密码只以 PBKDF2-HMAC-SHA256（迭代 100000，随机 16 字节 salt）的摘要形式落库，
 *   绝不明文、绝不进日志、绝不回显。
 * - 登录失败统一 401 + 同一文案，不区分「用户不存在」与「密码错误」，防账号枚举。
 * - 摘要比较走恒定时间，防时序侧信道。
 */

const KV_USERS_INDEX = "users:index";
const KV_USER_PREFIX = "user:";
const KV_SESSION_PREFIX = "session:";
const KV_RECOVERY_PREFIX = "recovery:";

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const SESSION_BYTES = 32;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 天

const USERNAME_RE = /^[a-z0-9_-]{3,32}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// ---------- 编码工具 ----------

function bytesToBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

// 恒定时间字符串比对，防时序攻击
function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ---------- 密码学 ----------

async function deriveHash(password, saltBytes) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- 输入校验 ----------

function normalizeUsername(raw) {
  if (typeof raw !== "string") return null;
  const name = raw.trim().toLowerCase();
  if (!USERNAME_RE.test(name)) return null;
  return name;
}

function validPassword(raw) {
  return typeof raw === "string" && raw.length >= MIN_PASSWORD && raw.length <= MAX_PASSWORD;
}

// ---------- KV 辅助 ----------

async function readUsersIndex(kv) {
  const raw = await kv.get(KV_USERS_INDEX);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : [];
  } catch (e) {
    return [];
  }
}

async function readUser(kv, name) {
  const raw = await kv.get(KV_USER_PREFIX + name);
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw);
    if (!rec || typeof rec.salt !== "string" || typeof rec.hash !== "string") return null;
    return rec;
  } catch (e) {
    return null;
  }
}

// users:index 只是加速索引，不作为账号是否存在的唯一事实来源。
// 同时核对 user: 记录并自愈索引，避免残留索引锁死注册、丢失索引放号。
async function readValidAccounts(kv) {
  const names = new Set(await readUsersIndex(kv));
  if (typeof kv.list === "function") {
    let cursor;
    do {
      const page = await kv.list({ prefix: KV_USER_PREFIX, cursor });
      (page.keys || []).forEach((entry) => {
        const name = String(entry.name || "").slice(KV_USER_PREFIX.length);
        if (USERNAME_RE.test(name)) names.add(name);
      });
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }
  const valid = [];
  for (const name of names) {
    if (await readUser(kv, name)) valid.push(name);
  }
  valid.sort();
  const previous = (await readUsersIndex(kv)).slice().sort();
  if (JSON.stringify(previous) !== JSON.stringify(valid)) {
    await kv.put(KV_USERS_INDEX, JSON.stringify(valid));
  }
  return valid;
}

async function createSession(kv, username) {
  const token = bytesToBase64Url(randomBytes(SESSION_BYTES));
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  await kv.put(
    KV_SESSION_PREFIX + token,
    JSON.stringify({ username, expiresAt }),
    { expirationTtl: SESSION_TTL_SECONDS }
  );
  return { token, username, expiresAt };
}

async function issueRecoveryCode(kv, username) {
  const code = bytesToBase64Url(randomBytes(SESSION_BYTES));
  const saltBytes = randomBytes(SALT_BYTES);
  const hashBytes = await deriveHash(code, saltBytes);
  await kv.put(KV_RECOVERY_PREFIX + username, JSON.stringify({
    salt: bytesToBase64(saltBytes),
    hash: bytesToBase64(hashBytes),
    createdAt: Date.now(),
  }));
  return code;
}

async function readRecoveryUser(kv, username, code) {
  if (!validPassword(code)) return null;
  const raw = await kv.get(KV_RECOVERY_PREFIX + username);
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw);
    const saltBytes = base64ToBytes(rec.salt);
    const hashBytes = await deriveHash(code, saltBytes);
    return timingSafeEqualStr(bytesToBase64(hashBytes), rec.hash) ? rec : null;
  } catch (e) {
    return null;
  }
}

async function deleteSessionsForUser(kv, username) {
  if (typeof kv.list !== "function") return;
  let cursor;
  do {
    const page = await kv.list({ prefix: KV_SESSION_PREFIX, cursor });
    for (const entry of page.keys || []) {
      const raw = await kv.get(entry.name);
      try {
        const session = JSON.parse(raw);
        if (session && session.username === username) await kv.delete(entry.name);
      } catch (e) {}
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

async function readSession(context) {
  const kv = context.env.MYNAV_KV;
  if (!kv) return { error: { status: 500, message: "KV 未绑定：请在 Pages 设置里添加 MYNAV_KV 绑定" } };
  const header = context.request.headers.get("authorization") || "";
  const m = /^Bearer (.+)$/.exec(header);
  if (!m) return { error: { status: 401, message: "unauthorized" } };
  const raw = await kv.get(KV_SESSION_PREFIX + m[1]);
  if (!raw) return { error: { status: 401, message: "unauthorized" } };
  let s;
  try {
    s = JSON.parse(raw);
  } catch (e) {
    return { error: { status: 401, message: "unauthorized" } };
  }
  if (!s || typeof s.username !== "string") return { error: { status: 401, message: "unauthorized" } };
  if (typeof s.expiresAt === "number" && s.expiresAt < Date.now()) {
    return { error: { status: 401, message: "unauthorized" } };
  }
  return { kv, username: s.username, token: m[1] };
}

async function readBody(context) {
  try {
    return await context.request.json();
  } catch (e) {
    return null;
  }
}

// ---------- 端点 ----------

async function handleRegister(context) {
  const kv = context.env.MYNAV_KV;
  if (!kv) return json({ error: "KV 未绑定：请在 Pages 设置里添加 MYNAV_KV 绑定" }, 500);

  const body = await readBody(context);
  if (!body) return json({ error: "请求体不是合法 JSON" }, 400);

  const name = normalizeUsername(body.username);
  if (!name) {
    return json({ error: "用户名需为 3–32 位，仅限字母、数字、下划线、连字符" }, 400);
  }
  if (!validPassword(body.password)) {
    return json({ error: "密码至少 8 位（上限 200 位）" }, 400);
  }

  // 注册开放条件：KV 中尚无任何有效账号；残留索引会被自动清理。
  const accounts = await readValidAccounts(kv);
  if (accounts.length > 0) {
    return json({ error: "registration closed", message: "注册已关闭：本站已有账号，请直接登录或使用恢复码" }, 403);
  }

  // 防止并发请求在索引修复后重复占用同一用户名。
  const existing = await readUser(kv, name);
  if (existing) {
    return json({ error: "username taken", message: "用户名已被占用" }, 409);
  }

  const saltBytes = randomBytes(SALT_BYTES);
  const hashBytes = await deriveHash(body.password, saltBytes);

  await kv.put(
    KV_USER_PREFIX + name,
    JSON.stringify({
      salt: bytesToBase64(saltBytes),
      hash: bytesToBase64(hashBytes),
      createdAt: Date.now(),
    })
  );
  await kv.put(KV_USERS_INDEX, JSON.stringify([name]));

  const session = await createSession(kv, name);
  const recoveryCode = await issueRecoveryCode(kv, name);
  return json({ token: session.token, username: name, recoveryCode }, 200);
}

async function handleLogin(context) {
  const kv = context.env.MYNAV_KV;
  if (!kv) return json({ error: "KV 未绑定：请在 Pages 设置里添加 MYNAV_KV 绑定" }, 500);

  const body = await readBody(context);
  if (!body) return json({ error: "请求体不是合法 JSON" }, 400);

  const name = normalizeUsername(body.username);
  const password = typeof body.password === "string" ? body.password : "";

  // 统一失败文案，不区分用户不存在 / 密码错误
  const fail = () => json({ error: "unauthorized", message: "用户名或密码不正确" }, 401);

  if (!name || !password) return fail();

  const rec = await readUser(kv, name);
  if (!rec) return fail();

  let saltBytes;
  try {
    saltBytes = base64ToBytes(rec.salt);
  } catch (e) {
    return fail();
  }

  const hashBytes = await deriveHash(password, saltBytes);
  if (!timingSafeEqualStr(bytesToBase64(hashBytes), rec.hash)) return fail();

  const session = await createSession(kv, name);
  return json({ token: session.token, username: name }, 200);
}

async function handleMe(context) {
  const s = await readSession(context);
  if (s.error) return json({ error: s.error.message }, s.error.status);
  return json({ username: s.username }, 200);
}

async function handleLogout(context) {
  const s = await readSession(context);
  if (s.error) return json({ error: s.error.message }, s.error.status);
  await s.kv.delete(KV_SESSION_PREFIX + s.token);
  return json({ ok: true }, 200);
}

async function handleRecoveryCode(context) {
  const s = await readSession(context);
  if (s.error) return json({ error: s.error.message }, s.error.status);
  const recoveryCode = await issueRecoveryCode(s.kv, s.username);
  return json({ recoveryCode }, 200);
}

async function handleRecover(context) {
  const kv = context.env.MYNAV_KV;
  if (!kv) return json({ error: "KV 未绑定：请在 Pages 设置里添加 MYNAV_KV 绑定" }, 500);
  const body = await readBody(context);
  if (!body) return json({ error: "请求体不是合法 JSON" }, 400);
  const name = normalizeUsername(body.username);
  const code = typeof body.recoveryCode === "string" ? body.recoveryCode.trim() : "";
  if (!name || !validPassword(body.newPassword)) {
    return json({ error: "请输入有效用户名、恢复码和至少 8 位的新密码" }, 400);
  }
  const user = await readUser(kv, name);
  const recovery = user ? await readRecoveryUser(kv, name, code) : null;
  if (!user || !recovery) return json({ error: "unauthorized", message: "用户名或恢复码不正确" }, 401);

  const saltBytes = randomBytes(SALT_BYTES);
  const hashBytes = await deriveHash(body.newPassword, saltBytes);
  await kv.put(KV_USER_PREFIX + name, JSON.stringify({
    salt: bytesToBase64(saltBytes),
    hash: bytesToBase64(hashBytes),
    createdAt: user.createdAt || Date.now(),
  }));
  const recoveryCode = await issueRecoveryCode(kv, name); // 旧恢复码一次性失效
  await deleteSessionsForUser(kv, name);
  const session = await createSession(kv, name);
  return json({ token: session.token, username: name, recoveryCode }, 200);
}

// ---------- 路由 ----------

function segments(context) {
  const p = context.params && context.params.path;
  if (Array.isArray(p)) return p.join("/");
  return typeof p === "string" ? p : "";
}

export async function onRequestPost(context) {
  switch (segments(context)) {
    case "register":
      return handleRegister(context);
    case "login":
      return handleLogin(context);
    case "logout":
      return handleLogout(context);
    case "recovery-code":
      return handleRecoveryCode(context);
    case "recover":
      return handleRecover(context);
    default:
      return json({ error: "not found" }, 404);
  }
}

export async function onRequestGet(context) {
  switch (segments(context)) {
    case "me":
      return handleMe(context);
    default:
      return json({ error: "not found" }, 404);
  }
}
