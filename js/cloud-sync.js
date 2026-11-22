/**
 * 模块：云同步（账号登录 + 个人数据跨设备同步）(js/cloud-sync.js)
 * 职责：
 * 1. 通过 /api/auth 登录/注册账号，通过 /api/sync 与 Cloudflare KV 同步
 *    收藏、访问统计、排序、主题与站内卡片编辑（overrides）
 * 2. 登录 = 用户名 + 密码（会话 token 存本机 localStorage），新设备输入一次即可
 * 3. 本地优先渲染：启动即读本地，后台静默同步；云端更新才拉取并刷新页面
 * 4. 冲突策略：记录上次同步快照，云端/本地基于同一版本做三方合并
 * 5. 网络/登录异常不影响本地功能，并明确显示失败原因
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./storage.js"));
  } else {
    root.NavCloudSync = factory(root.NavStorage);
  }
})(typeof self !== "undefined" ? self : this, function (NavStorage) {
  "use strict";

  const API = "/api/sync";
  const AUTH_API = "/api/auth";
  const TOKEN_KEY = "mynav_arch_sync_token";
  const USER_KEY = "mynav_arch_sync_user";
  const META_KEY = "mynav_arch_sync_meta";
  const PUSH_DEBOUNCE_MS = 8000;

  // 站内卡片编辑（修改层）的存储键。overrides.js 用这个字面键经 NavStorage.set 保存，
  // 它不在 NavStorage.KEYS 里，所以单独列出并一并纳入同步白名单。
  const OVERRIDES_KEY = "nav_site_overrides";
  const PARTICLES_KEY = "mynav_arch_particles";
  const ENGINE_KEY = "mynav_search_engine_v2";
  const ENGINE_LEGACY_KEY = "mynav_search_engine";
  const PROBE_IGNORED_KEY = "mynav_probe_ignored_v1";
  const BUILTIN_SNIPPET_IDS = new Set([
    "snippet-architecture",
    "snippet-port-forward",
    "snippet-academic-polish",
    "snippet-review",
  ]);

  function emptyOverrides() {
    return { modified: {}, added: [], hidden: [], deleted: [], unhidden: [] };
  }

  // 参与云同步的键（其余键只存本地）
  const SYNCED_KEYS = new Set(
    NavStorage
      ? [
          NavStorage.KEYS.THEME,
          NavStorage.KEYS.FAVORITES,
          NavStorage.KEYS.VISITS,
          NavStorage.KEYS.ORDER,
          NavStorage.KEYS.NIER_BG,
          OVERRIDES_KEY,
        ]
      : []
  );

  // 状态：unknown | logged-out | syncing | synced | error | disabled
  let status = "unknown";
  let applyingRemote = false;
  let syncPending = false;
  let lastPayloadSig = "";
  let pushTimer = null;
  let syncBtn = null;
  let syncLabel = null;

  function getToken() {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function setToken(t) {
    try {
      if (t) window.localStorage.setItem(TOKEN_KEY, t);
      else window.localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  function getUser() {
    try {
      return window.localStorage.getItem(USER_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function setUser(name) {
    try {
      if (name) window.localStorage.setItem(USER_KEY, name);
      else window.localStorage.removeItem(USER_KEY);
    } catch (e) {}
  }

  function authHeaders() {
    const t = getToken();
    return t ? { authorization: "Bearer " + t } : {};
  }

  // ---------- 账号接口 ----------

  // 统一 POST /api/auth/<action>；返回 { ok, status, data }
  async function authPost(action, body) {
    const res = await fetch(AUTH_API + "/" + action, {
      method: "POST",
      credentials: "same-origin",
      headers: Object.assign({ "content-type": "application/json" }, authHeaders()),
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: data };
  }

  async function authMe() {
    const res = await fetch(AUTH_API + "/me", {
      credentials: "same-origin",
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data && typeof data.username === "string" ? data.username : null;
  }

  async function authLogout() {
    try {
      await fetch(AUTH_API + "/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: authHeaders(),
      });
    } catch (e) {
      // 网络失败也要清本地会话，避免卡在「已登录但用不了」的状态
    }
  }

  // 登录/注册成功后的落地：存会话与用户名
  function adoptSession(data) {
    if (!data || typeof data.token !== "string" || typeof data.username !== "string") return false;
    const previousUser = getUser();
    setToken(data.token);
    setUser(data.username);
    if (previousUser && previousUser !== data.username && NavStorage) NavStorage.remove(META_KEY);
    return true;
  }

  // 清掉本地会话（不动业务数据）
  function clearSession(preserveUser) {
    setToken(null);
    if (!preserveUser) setUser(null);
    if (NavStorage) {
      applyingRemote = true;
      try {
        NavStorage.remove(META_KEY);
      } finally {
        applyingRemote = false;
      }
    }
  }

  function getMeta() {
    const m = NavStorage ? NavStorage.get(META_KEY, null) : null;
    return m && typeof m === "object"
      ? Object.assign({ updatedAt: 0, baseUpdatedAt: 0, lastSyncAt: 0, baseData: null }, m)
      : { updatedAt: 0, baseUpdatedAt: 0, lastSyncAt: 0, baseData: null };
  }

  function setMeta(patch) {
    if (!NavStorage) return;
    const m = Object.assign(getMeta(), patch);
    applyingRemote = true;
    try {
      NavStorage.set(META_KEY, m);
    } finally {
      applyingRemote = false;
    }
  }

  // 读取本地修改层（站内卡片编辑），结构不合法时退回空结构
  function getOverrides() {
    if (!NavStorage) return emptyOverrides();
    const raw = NavStorage.get(OVERRIDES_KEY, null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyOverrides();
    return raw;
  }

  // 修改层是否有内容（决定它能不能算作「本地有数据」）
  function hasOverridesData(o) {
    if (!o || typeof o !== "object") return false;
    if (o.modified && typeof o.modified === "object" && Object.keys(o.modified).length > 0) return true;
    return ["added", "hidden", "deleted", "unhidden"].some(
      (k) => Array.isArray(o[k]) && o[k].length > 0
    );
  }

  // 统一的推送档案组装：基础四项 + 修改层。
  // pushNow 与 initialSync 共用，避免两处漏并 overrides。
  function readLocalItem(key) {
    try {
      return typeof window !== "undefined" && window.localStorage
        ? window.localStorage.getItem(key)
        : null;
    } catch (e) {
      return null;
    }
  }

  function writeLocalItem(key, rawValue) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, rawValue);
      }
    } catch (e) {}
  }

  function readLedgerSyncSlice() {
    if (typeof window !== "undefined" && window.NavLedger &&
      typeof window.NavLedger.exportSyncSlice === "function") {
      return window.NavLedger.exportSyncSlice();
    }
    return null;
  }

  function deriveLegacyVisits(accessLog) {
    const visits = {};
    if (!isObject(accessLog)) return visits;
    Object.keys(accessLog).forEach((id) => {
      const entry = accessLog[id];
      if (!isObject(entry)) return;
      const count = Number.isFinite(entry.count) ? Math.max(0, Math.floor(entry.count)) : 0;
      const lastVisit = Number.isFinite(entry.lastVisited)
        ? Math.max(0, entry.lastVisited)
        : (Number.isFinite(entry.lastVisit) ? Math.max(0, entry.lastVisit) : 0);
      if (count > 0 || lastVisit > 0) visits[id] = { count, lastVisit };
    });
    return visits;
  }

  function readLocalPreferences() {
    const prefs = {};
    let hasAny = false;
    if (NavStorage) {
      const nierBg = NavStorage.get(NavStorage.KEYS.NIER_BG, null);
      if (typeof nierBg === "boolean") {
        prefs.nierBg = nierBg;
        hasAny = true;
      }
    }
    const rawParticles = readLocalItem(PARTICLES_KEY);
    if (rawParticles !== null) {
      try {
        const parsed = JSON.parse(rawParticles);
        if (typeof parsed === "boolean") {
          prefs.particles = parsed;
          hasAny = true;
        }
      } catch (e) {}
    }
    const rawEngine = readLocalItem(ENGINE_KEY);
    if (typeof rawEngine === "string" && rawEngine.trim()) {
      prefs.searchEngine = rawEngine.trim().slice(0, 32);
      hasAny = true;
    }
    const rawIgnored = readLocalItem(PROBE_IGNORED_KEY);
    if (rawIgnored !== null) {
      try {
        const parsed = JSON.parse(rawIgnored);
        if (Array.isArray(parsed)) {
          prefs.probeIgnored = Array.from(new Set(parsed.filter((id) => typeof id === "string" && id)));
          hasAny = true;
        }
      } catch (e) {}
    }
    return hasAny ? prefs : null;
  }

  function buildPayloadData() {
    const data = NavStorage.exportBackup().data;
    data.overrides = getOverrides();
    const ledgerSlice = readLedgerSyncSlice();
    if (ledgerSlice) {
      data.ledger = ledgerSlice;
      if (!isObject(data.visits) || Object.keys(data.visits).length === 0) {
        data.visits = deriveLegacyVisits(ledgerSlice.accessLog);
      }
    }
    const prefs = readLocalPreferences();
    if (prefs) {
      data.preferences = prefs;
    }
    return data;
  }

  function hasCustomSnippets(snippets) {
    if (!Array.isArray(snippets) || snippets.length === 0) return false;
    if (snippets.length !== BUILTIN_SNIPPET_IDS.size) return true;
    return snippets.some((s) => !s || typeof s !== "object" || !BUILTIN_SNIPPET_IDS.has(s.id));
  }

  // 本地是否有值得同步的数据（避免空档案覆盖云端）
  function localHasData() {
    if (!NavStorage) return false;
    const favs = NavStorage.get(NavStorage.KEYS.FAVORITES, []);
    const visits = NavStorage.get(NavStorage.KEYS.VISITS, {});
    const order = NavStorage.get(NavStorage.KEYS.ORDER, {});
    const ledgerSlice = readLedgerSyncSlice();
    const hasLedgerData = Boolean(
      ledgerSlice && (
        Object.keys(ledgerSlice.accessLog || {}).length > 0 ||
        Object.keys(ledgerSlice.marginalia || {}).length > 0 ||
        Object.keys(ledgerSlice.almanac || {}).length > 0 ||
        (Array.isArray(ledgerSlice.constellations) && ledgerSlice.constellations.length > 0) ||
        hasCustomSnippets(ledgerSlice.snippets)
      )
    );
    return (
      (Array.isArray(favs) && favs.length > 0) ||
      (visits && Object.keys(visits).length > 0) ||
      (order && Object.keys(order).length > 0) ||
      hasOverridesData(getOverrides()) ||
      hasLedgerData
    );
  }

  // ---------- 三方合并：base = 上次与云端一致的快照 ----------
  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeAccessHistory(history) {
    if (!Array.isArray(history)) return [];
    const byDay = {};
    history.forEach((item) => {
      if (!isObject(item)) return;
      const day = String(item.date || item.day || "");
      const count = Number.isFinite(item.count) ? Math.max(0, Math.floor(item.count)) : 0;
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && count > 0) {
        byDay[day] = (byDay[day] || 0) + count;
      }
    });
    return Object.keys(byDay).sort().slice(-180).map((date) => ({ date, count: byDay[date] }));
  }

  function normalizeLedgerSlice(raw) {
    const src = isObject(raw) ? raw : {};
    const accessLog = {};
    if (isObject(src.accessLog)) {
      Object.keys(src.accessLog).forEach((id) => {
        if (!id || !isObject(src.accessLog[id])) return;
        const e = src.accessLog[id];
        accessLog[id] = {
          count: Number.isFinite(e.count) ? Math.max(0, Math.floor(e.count)) : 0,
          lastVisited: Number.isFinite(e.lastVisited)
            ? Math.max(0, e.lastVisited)
            : (Number.isFinite(e.lastVisit) ? Math.max(0, e.lastVisit) : 0),
          firstSeenAt: Number.isFinite(e.firstSeenAt) ? Math.max(0, e.firstSeenAt) : 0,
          history: normalizeAccessHistory(e.history),
        };
      });
    }
    const almanac = {};
    if (isObject(src.almanac)) {
      Object.keys(src.almanac).forEach((day) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isObject(src.almanac[day])) return;
        const a = src.almanac[day];
        const clicks = Number.isFinite(a.clicks) ? Math.max(0, Math.floor(a.clicks)) : 0;
        const count = Number.isFinite(a.count) ? Math.max(0, Math.floor(a.count)) : clicks;
        const aiCalls = Number.isFinite(a.aiCalls) ? Math.max(0, Math.floor(a.aiCalls)) : 0;
        const sites = Array.isArray(a.sites)
          ? Array.from(new Set(a.sites.filter((s) => typeof s === "string" && s)))
          : [];
        almanac[day] = { count, clicks, aiCalls, sites };
      });
    }
    const marginalia = {};
    if (isObject(src.marginalia)) {
      Object.keys(src.marginalia).forEach((id) => {
        if (typeof src.marginalia[id] === "string" && src.marginalia[id]) {
          marginalia[id] = src.marginalia[id];
        }
      });
    }
    return {
      accessLog,
      almanac,
      marginalia,
      snippets: Array.isArray(src.snippets) ? clone(src.snippets) : [],
      constellations: Array.isArray(src.constellations) ? clone(src.constellations) : [],
      dustResetAt: Number.isFinite(src.dustResetAt) ? Math.max(0, src.dustResetAt) : 0,
    };
  }

  function normalizePreferences(raw) {
    const src = isObject(raw) ? raw : {};
    const out = {};
    if (typeof src.nierBg === "boolean") out.nierBg = src.nierBg;
    if (typeof src.particles === "boolean") out.particles = src.particles;
    if (typeof src.searchEngine === "string" && src.searchEngine) {
      out.searchEngine = src.searchEngine.trim().slice(0, 32);
    }
    if (Array.isArray(src.probeIgnored)) {
      out.probeIgnored = Array.from(new Set(src.probeIgnored.filter((id) => typeof id === "string" && id)));
    }
    return out;
  }

  function normalizeData(raw) {
    const data = isObject(raw) ? raw : {};
    const overrides = isObject(data.overrides) ? data.overrides : {};
    const normalized = {
      theme: ["auto", "light", "dark"].includes(data.theme) ? data.theme : "auto",
      favorites: Array.isArray(data.favorites)
        ? Array.from(new Set(data.favorites.filter((id) => typeof id === "string" && id))) : [],
      visits: isObject(data.visits) ? clone(data.visits) : {},
      order: isObject(data.order) ? clone(data.order) : {},
      overrides: {
        modified: isObject(overrides.modified) ? clone(overrides.modified) : {},
        added: Array.isArray(overrides.added) ? clone(overrides.added) : [],
        hidden: Array.isArray(overrides.hidden) ? clone(overrides.hidden) : [],
        deleted: Array.isArray(overrides.deleted) ? clone(overrides.deleted) : [],
        unhidden: Array.isArray(overrides.unhidden) ? clone(overrides.unhidden) : [],
      },
    };
    ["hidden", "deleted", "unhidden"].forEach((key) => {
      normalized.overrides[key] = Array.from(new Set(
        normalized.overrides[key].filter((id) => typeof id === "string" && id)
      ));
    });
    normalized.overrides.added = normalized.overrides.added.filter(
      (site) => isObject(site) && site.id && site.name && site.url
    );
    if (isObject(data.ledger)) {
      normalized.ledger = normalizeLedgerSlice(data.ledger);
    }
    if (isObject(data.preferences)) {
      normalized.preferences = normalizePreferences(data.preferences);
    }
    return normalized;
  }

  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (isObject(value)) {
      return "{" + Object.keys(value).sort().filter((key) => value[key] !== undefined).map(
        (key) => JSON.stringify(key) + ":" + canonical(value[key])
      ).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  function equal(a, b) { return canonical(a) === canonical(b); }

  function pickThreeWay(base, local, remote, prefer) {
    if (equal(local, remote)) return clone(local);
    if (equal(local, base)) return clone(remote);
    if (equal(remote, base)) return clone(local);
    return clone(prefer === "local" ? local : remote);
  }

  function mergeFields(base, local, remote, prefer) {
    base = isObject(base) ? base : {};
    local = isObject(local) ? local : {};
    remote = isObject(remote) ? remote : {};
    const result = {};
    const keys = Array.from(new Set(Object.keys(base).concat(Object.keys(local), Object.keys(remote))));
    keys.forEach((key) => {
      const picked = pickThreeWay(base[key], local[key], remote[key], prefer);
      if (picked !== undefined) result[key] = picked;
    });
    return result;
  }

  function mergeIdList(base, local, remote, prefer) {
    base = Array.isArray(base) ? base : [];
    local = Array.isArray(local) ? local : [];
    remote = Array.isArray(remote) ? remote : [];
    if (equal(local, remote)) return clone(local);
    if (equal(local, base)) return clone(remote);
    if (equal(remote, base)) return clone(local);
    const b = new Set(base);
    const l = new Set(local);
    const r = new Set(remote);
    const ordered = prefer === "local" ? local.concat(remote, base) : remote.concat(local, base);
    return Array.from(new Set(ordered)).filter((id) => (
      b.has(id) ? l.has(id) && r.has(id) : l.has(id) || r.has(id)
    ));
  }

  function mergeVisits(base, local, remote) {
    base = isObject(base) ? base : {};
    local = isObject(local) ? local : {};
    remote = isObject(remote) ? remote : {};
    const result = {};
    const keys = Array.from(new Set(Object.keys(base).concat(Object.keys(local), Object.keys(remote))));
    keys.forEach((id) => {
      const hasBase = isObject(base[id]);
      const b = hasBase ? base[id] : {};
      const l = isObject(local[id]) ? local[id] : {};
      const r = isObject(remote[id]) ? remote[id] : {};
      const bc = Number(b.count) || 0;
      const count = hasBase
        ? Math.max(0, bc + ((Number(l.count) || 0) - bc) + ((Number(r.count) || 0) - bc))
        : Math.max(Number(l.count) || 0, Number(r.count) || 0);
      const lastVisit = Math.max(
        Number(l.lastVisit) || Number(l.lastVisited) || 0,
        Number(r.lastVisit) || Number(r.lastVisited) || 0
      );
      if (count > 0 || lastVisit > 0) result[id] = { count, lastVisit };
    });
    return result;
  }

  function mergeModified(base, local, remote, prefer) {
    base = isObject(base) ? base : {};
    local = isObject(local) ? local : {};
    remote = isObject(remote) ? remote : {};
    const result = {};
    const ids = Array.from(new Set(Object.keys(base).concat(Object.keys(local), Object.keys(remote))));
    ids.forEach((id) => {
      const fields = mergeFields(base[id], local[id], remote[id], prefer);
      if (Object.keys(fields).length) result[id] = fields;
    });
    return result;
  }

  function mergeAdded(base, local, remote, prefer) {
    const toMap = (list) => {
      const map = {};
      (Array.isArray(list) ? list : []).forEach((site) => { if (site && site.id) map[site.id] = site; });
      return map;
    };
    const b = toMap(base);
    const l = toMap(local);
    const r = toMap(remote);
    const ids = mergeIdList(
      Object.keys(b), Object.keys(l), Object.keys(r), prefer
    );
    return ids.map((id) => mergeFields(b[id], l[id], r[id], prefer))
      .filter((site) => site.id && site.name && site.url);
  }

  function mergeListById(base, local, remote, prefer) {
    const pickKey = (item) => (isObject(item) && typeof item.id === "string" && item.id ? item.id : null);
    const toMap = (list) => {
      const map = {};
      (Array.isArray(list) ? list : []).forEach((item, idx) => {
        const key = pickKey(item) || ("__str:" + idx + ":" + canonical(item));
        map[key] = item;
      });
      return map;
    };
    const b = toMap(base);
    const l = toMap(local);
    const r = toMap(remote);
    const ids = mergeIdList(Object.keys(b), Object.keys(l), Object.keys(r), prefer);
    return ids.map((id) => {
      if (isObject(l[id]) || isObject(r[id])) {
        return mergeFields(b[id], l[id], r[id], prefer);
      }
      return pickThreeWay(b[id], l[id], r[id], prefer);
    }).filter((item) => item !== undefined);
  }

  function mergeAccessLog(base, local, remote) {
    base = isObject(base) ? base : {};
    local = isObject(local) ? local : {};
    remote = isObject(remote) ? remote : {};
    if (equal(local, remote)) return clone(local);
    if (equal(local, base)) return clone(remote);
    if (equal(remote, base)) return clone(local);
    const result = {};
    const ids = Array.from(new Set(Object.keys(base).concat(Object.keys(local), Object.keys(remote))));
    ids.forEach((id) => {
      const hasBase = isObject(base[id]);
      const b = hasBase ? base[id] : {};
      const l = isObject(local[id]) ? local[id] : {};
      const r = isObject(remote[id]) ? remote[id] : {};
      const bc = Number(b.count) || 0;
      const count = hasBase
        ? Math.max(0, bc + ((Number(l.count) || 0) - bc) + ((Number(r.count) || 0) - bc))
        : Math.max(Number(l.count) || 0, Number(r.count) || 0);
      const lastVisited = Math.max(
        Number(l.lastVisited) || Number(l.lastVisit) || 0,
        Number(r.lastVisited) || Number(r.lastVisit) || 0
      );
      const firstSeenCandidates = [Number(b.firstSeenAt) || 0, Number(l.firstSeenAt) || 0, Number(r.firstSeenAt) || 0]
        .filter((v) => v > 0);
      const firstSeenAt = firstSeenCandidates.length ? Math.min(...firstSeenCandidates) : 0;

      const histToMap = (arr) => {
        const m = {};
        (Array.isArray(arr) ? arr : []).forEach((h) => {
          if (h && /^\d{4}-\d{2}-\d{2}$/.test(String(h.date || ""))) {
            m[h.date] = (m[h.date] || 0) + (Number(h.count) || 0);
          }
        });
        return m;
      };
      const bh = histToMap(b.history);
      const lh = histToMap(l.history);
      const rh = histToMap(r.history);
      const days = Array.from(new Set(Object.keys(bh).concat(Object.keys(lh), Object.keys(rh)))).sort().slice(-180);
      const history = days.map((date) => {
        const bDay = bh[date] || 0;
        const c = (hasBase && bDay > 0)
          ? Math.max(0, bDay + ((lh[date] || 0) - bDay) + ((rh[date] || 0) - bDay))
          : Math.max(lh[date] || 0, rh[date] || 0);
        return { date, count: c };
      }).filter((item) => item.count > 0);

      if (count > 0 || lastVisited > 0 || history.length > 0) {
        result[id] = { count, lastVisited, firstSeenAt, history };
      }
    });
    return result;
  }

  function mergeAlmanac(base, local, remote) {
    base = isObject(base) ? base : {};
    local = isObject(local) ? local : {};
    remote = isObject(remote) ? remote : {};
    if (equal(local, remote)) return clone(local);
    if (equal(local, base)) return clone(remote);
    if (equal(remote, base)) return clone(local);
    const result = {};
    const days = Array.from(new Set(Object.keys(base).concat(Object.keys(local), Object.keys(remote)))).sort();
    days.forEach((day) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
      const hasBase = isObject(base[day]);
      const b = hasBase ? base[day] : {};
      const l = isObject(local[day]) ? local[day] : {};
      const r = isObject(remote[day]) ? remote[day] : {};
      const bClicks = Number(b.clicks) || Number(b.count) || 0;
      const lClicks = Number(l.clicks) || Number(l.count) || 0;
      const rClicks = Number(r.clicks) || Number(r.count) || 0;
      const clicks = hasBase
        ? Math.max(0, bClicks + (lClicks - bClicks) + (rClicks - bClicks))
        : Math.max(lClicks, rClicks);
      const bAi = Number(b.aiCalls) || 0;
      const aiCalls = hasBase
        ? Math.max(0, bAi + ((Number(l.aiCalls) || 0) - bAi) + ((Number(r.aiCalls) || 0) - bAi))
        : Math.max(Number(l.aiCalls) || 0, Number(r.aiCalls) || 0);
      const sites = mergeIdList(b.sites, l.sites, r.sites, "local");
      const count = Math.max(clicks, hasBase
        ? Math.max(0, (Number(b.count) || 0) + ((Number(l.count) || 0) - (Number(b.count) || 0)) + ((Number(r.count) || 0) - (Number(b.count) || 0)))
        : Math.max(Number(l.count) || 0, Number(r.count) || 0));
      if (count > 0 || clicks > 0 || aiCalls > 0 || sites.length > 0) {
        result[day] = { count, clicks, aiCalls, sites };
      }
    });
    return result;
  }

  function mergeLedgerSlice(base, local, remote, prefer) {
    const b = normalizeLedgerSlice(base);
    const l = normalizeLedgerSlice(local);
    const r = normalizeLedgerSlice(remote);
    const dustResetAt = l.dustResetAt === b.dustResetAt
      ? r.dustResetAt
      : (r.dustResetAt === b.dustResetAt ? l.dustResetAt : Math.max(l.dustResetAt, r.dustResetAt));
    return {
      accessLog: mergeAccessLog(b.accessLog, l.accessLog, r.accessLog),
      almanac: mergeAlmanac(b.almanac, l.almanac, r.almanac),
      marginalia: mergeFields(b.marginalia, l.marginalia, r.marginalia, prefer),
      snippets: mergeListById(b.snippets, l.snippets, r.snippets, prefer),
      constellations: mergeListById(b.constellations, l.constellations, r.constellations, prefer),
      dustResetAt,
    };
  }

  function mergePreferences(base, local, remote, prefer) {
    const b = normalizePreferences(base);
    const l = normalizePreferences(local);
    const r = normalizePreferences(remote);
    const out = mergeFields(b, l, r, prefer);
    if (b.probeIgnored || l.probeIgnored || r.probeIgnored) {
      out.probeIgnored = mergeIdList(b.probeIgnored, l.probeIgnored, r.probeIgnored, prefer);
    }
    return normalizePreferences(out);
  }

  function mergeData(base, local, remote, prefer) {
    base = normalizeData(base);
    local = normalizeData(local);
    remote = normalizeData(remote);
    const merged = {
      theme: pickThreeWay(base.theme, local.theme, remote.theme, prefer),
      favorites: mergeIdList(base.favorites, local.favorites, remote.favorites, prefer),
      visits: mergeVisits(base.visits, local.visits, remote.visits),
      order: mergeFields(base.order, local.order, remote.order, prefer),
      overrides: {
        modified: mergeModified(base.overrides.modified, local.overrides.modified, remote.overrides.modified, prefer),
        added: mergeAdded(base.overrides.added, local.overrides.added, remote.overrides.added, prefer),
        hidden: mergeIdList(base.overrides.hidden, local.overrides.hidden, remote.overrides.hidden, prefer),
        deleted: mergeIdList(base.overrides.deleted, local.overrides.deleted, remote.overrides.deleted, prefer),
        unhidden: mergeIdList(base.overrides.unhidden, local.overrides.unhidden, remote.overrides.unhidden, prefer),
      },
    };
    if (base.ledger || local.ledger || remote.ledger) {
      merged.ledger = mergeLedgerSlice(base.ledger, local.ledger, remote.ledger, prefer);
    }
    if (base.preferences || local.preferences || remote.preferences) {
      merged.preferences = mergePreferences(base.preferences, local.preferences, remote.preferences, prefer);
    }
    return merged;
  }

  let syncStatusLabel = "";
  let syncDetail = "";

  function setStatus(next, labelText, detail) {
    status = next;
    syncStatusLabel = labelText || "";
    syncDetail = detail || "";
    if (syncBtn) {
      syncBtn.setAttribute("data-sync-status", next);
      syncBtn.setAttribute("aria-label", "云同步：" + (syncStatusLabel || next) + (syncDetail ? "。" + syncDetail : ""));
      syncBtn.title = "云同步（" + (syncStatusLabel || next) + "）" + (syncDetail ? "：" + syncDetail : "");
    }
    if (typeof document !== "undefined") {
      const statusEl = document.querySelector("#cloud-sync-status");
      if (statusEl) {
        statusEl.textContent = (syncStatusLabel || next) + (syncDetail ? "：" + syncDetail : "");
        statusEl.setAttribute("data-state", next);
      }
    }
    renderButton();
  }

  // 按钮文案：未登录「登录」；已登录显示用户名，同步中/出错时显示状态
  function renderButton() {
    if (!syncLabel) return;
    if (!getToken()) {
      syncLabel.textContent = "登录";
      return;
    }
    if (status === "syncing") {
      syncLabel.textContent = "同步…";
      return;
    }
    if (status === "error") {
      syncLabel.textContent = "重试";
      return;
    }
    const name = getUser();
    syncLabel.textContent = name ? name : "已同步";
  }

  function needLoginError() {
    const err = new Error("need-login");
    err.code = "need-login";
    err.status = 401;
    return err;
  }

  async function responseError(res) {
    const data = await res.json().catch(() => ({}));
    const err = new Error((data && (data.message || data.error)) || ("http-" + res.status));
    err.code = "http";
    err.status = res.status;
    return err;
  }

  function friendlyError(error) {
    if (!error) return "未知错误";
    if (error.status === 400) return error.message || "云端拒绝了数据格式";
    if (error.status === 413) return "数据超过 256 KB，请先导出备份并精简内容";
    if (error.status === 500) return error.message || "云同步服务异常，请检查 KV 绑定或稍后重试";
    if (error.name === "TypeError" || /fetch|network|网络/i.test(error.message || "")) {
      return "网络连接失败，请检查网络后重试";
    }
    return error.message || "未知错误";
  }

  function notify(title, message, icon) {
    if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
      window.NavShortcuts.showToast(title, message || "", icon || "☁");
    }
  }

  function handleNeedLogin() {
    const message = "登录已过期或无效，请重新登录后继续同步";
    clearSession(true);
    setStatus("logged-out", "需要重新登录", message);
    notify("需要重新登录", message, "⚠");
    openAuthDialog("login", message);
  }

  async function apiGet() {
    const res = await fetch(API, {
      credentials: "same-origin",
      headers: authHeaders(),
    });
    if (res.status === 401) throw needLoginError();
    if (res.status === 404) return { empty: true };
    if (!res.ok) throw await responseError(res);
    return res.json();
  }

  async function apiPut(payload, keepalive) {
    const res = await fetch(API, {
      method: "PUT",
      credentials: "same-origin",
      keepalive: !!keepalive,
      headers: Object.assign({ "content-type": "application/json" }, authHeaders()),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw needLoginError();
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) {
      const err = new Error("conflict");
      err.code = "conflict";
      err.serverDoc = data;
      throw err;
    }
    if (!res.ok) {
      const err = new Error((data && (data.message || data.error)) || ("http-" + res.status));
      err.code = "http";
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function applyRemotePreferences(prefs) {
    if (!isObject(prefs)) return;
    if (typeof prefs.nierBg === "boolean" && NavStorage && NavStorage.KEYS.NIER_BG) {
      NavStorage.set(NavStorage.KEYS.NIER_BG, prefs.nierBg);
    }
    if (typeof prefs.particles === "boolean") {
      writeLocalItem(PARTICLES_KEY, JSON.stringify(prefs.particles));
    }
    if (typeof prefs.searchEngine === "string" && prefs.searchEngine) {
      writeLocalItem(ENGINE_KEY, prefs.searchEngine);
      writeLocalItem(ENGINE_LEGACY_KEY, prefs.searchEngine);
    }
    if (Array.isArray(prefs.probeIgnored)) {
      writeLocalItem(PROBE_IGNORED_KEY, JSON.stringify(prefs.probeIgnored));
    }
  }

  function refreshUiAfterSync() {
    if (typeof window === "undefined") return;
    try {
      if (window.NavTheme && typeof window.NavTheme.reload === "function") window.NavTheme.reload();
      if (window.NavFavorites && typeof window.NavFavorites.reload === "function") window.NavFavorites.reload();
      if (window.NavParticlesBg && typeof window.NavParticlesBg.reload === "function") window.NavParticlesBg.reload();
      if (window.NavEngine && typeof window.NavEngine.reload === "function") window.NavEngine.reload();
      if (window.NavProbe && typeof window.NavProbe.reloadIgnored === "function") window.NavProbe.reloadIgnored();
      if (window.NavConstellations && typeof window.NavConstellations.renderRail === "function") {
        window.NavConstellations.renderRail();
      }
      if (window.NavAlmanac && typeof window.NavAlmanac.refresh === "function") window.NavAlmanac.refresh();
      if (window.NavUncatalogued && typeof window.NavUncatalogued.renderDrawer === "function") {
        window.NavUncatalogued.renderDrawer();
      }
      if (window.NavApp && typeof window.NavApp.refresh === "function") {
        window.NavApp.refresh();
      }
    } catch (e) {}
  }

  // 写入本机但不刷新；合并上传失败时，合并结果也已经安全留在本机。
  function writeDocData(data) {
    if (!data || !NavStorage) throw new Error("本机存储模块尚未就绪");
    applyingRemote = true;
    try {
      const normalized = normalizeData(data);
      const result = NavStorage.importBackup({ data: normalized });
      if (!result || result.success !== true) {
        throw new Error("本机数据写入失败" + (result && result.message ? "：" + result.message : ""));
      }
      NavStorage.set(OVERRIDES_KEY, normalized.overrides);
      if (typeof window !== "undefined" && window.NavLedger &&
        typeof window.NavLedger.applySyncSlice === "function") {
        window.NavLedger.applySyncSlice(normalized.ledger, normalized.visits, { notify: false });
      }
      if (normalized.preferences) {
        applyRemotePreferences(normalized.preferences);
      }
    } finally {
      applyingRemote = false;
    }
  }

  function finishSynced(doc) {
    const normalized = normalizeData(doc.data);
    lastPayloadSig = canonical(normalized);
    setMeta({
      updatedAt: doc.updatedAt || 0,
      baseUpdatedAt: doc.updatedAt || 0,
      baseData: normalized,
      lastSyncAt: Date.now(),
    });
    setStatus("synced", "已同步", "收藏、访问账本、排序、批注与书目编辑已同步");
  }

  function applyDoc(doc) {
    if (!doc || !doc.data || !NavStorage) return;
    const normalized = normalizeData(doc.data);
    writeDocData(normalized);
    finishSynced({ updatedAt: doc.updatedAt || 0, data: normalized });
    refreshUiAfterSync();
  }

  async function syncOwnerCatalogue(doc) {
    if (String(getUser() || "").toLowerCase() !== "sueexin") return;
    let result = null;
    for (let batch = 0; batch < 5; batch += 1) {
      const response = await fetch("/api/cards", {
        method: "POST",
        credentials: "same-origin",
        headers: Object.assign({ "content-type": "application/json" }, authHeaders()),
        body: JSON.stringify({ profileUpdatedAt: doc.updatedAt || 0 }),
      });
      if (response.status === 409) {
        syncPending = true;
        return;
      }
      if (response.status === 401) throw needLoginError();
      result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(result.error || "Notion 目录写回失败");
        error.code = result.code || "catalogue-write";
        throw error;
      }
      if (!result.inProgress) break;
    }
    if (result && result.inProgress) {
      syncPending = true;
      return;
    }
    if (!result.clearOverrides) return;

    const cleanData = normalizeData(doc.data);
    cleanData.overrides = emptyOverrides();
    const meta = getMeta();
    const updatedAt = Math.max(Date.now(), (meta.updatedAt || 0) + 1, (doc.updatedAt || 0) + 1);
    let saved;
    try {
      saved = await apiPut({ updatedAt, baseUpdatedAt: doc.updatedAt || 0, data: cleanData });
    } catch (error) {
      if (error.code === "conflict") {
        syncPending = true;
        return;
      }
      throw error;
    }
    writeDocData(cleanData);
    finishSynced({ updatedAt: saved.updatedAt || updatedAt, data: cleanData });
    refreshUiAfterSync();
  }

  async function finalizeSync(doc, apply) {
    if (apply) applyDoc(doc);
    else finishSynced(doc);
    await syncOwnerCatalogue(doc);
  }

  async function pushNow(keepalive) {
    if (!keepalive) {
      if (status === "syncing") {
        schedulePush();
        return false;
      }
      return initialSync();
    }
    if (!NavStorage || status === "syncing") return false;
    if (!getToken()) {
      setStatus("logged-out", "登录");
      return false;
    }
    const meta = getMeta();
    const data = buildPayloadData();
    const ts = Math.max(Date.now(), (meta.updatedAt || 0) + 1, (meta.baseUpdatedAt || 0) + 1);
    setStatus("syncing", "同步…");
    setMeta({ updatedAt: ts });
    try {
      await apiPut({ updatedAt: ts, baseUpdatedAt: meta.baseUpdatedAt || 0, data }, true);
      finishSynced({ updatedAt: ts, data });
      return true;
    } catch (e) {
      if (e.code === "need-login") {
        handleNeedLogin();
      } else if (e.code === "conflict") {
        setStatus("error", "等待合并", "另一台设备已更新云端，下次打开或手动同步时合并");
      } else {
        setStatus("error", "上传失败", friendlyError(e));
      }
      return false;
    }
  }

  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      pushNow(false);
    }, PUSH_DEBOUNCE_MS);
  }

  function markDirty() {
    const meta = getMeta();
    setMeta({ updatedAt: Math.max(Date.now(), (meta.updatedAt || 0) + 1, (meta.baseUpdatedAt || 0) + 1) });
    // 即使在首轮同步进行中发生编辑，也要再排一轮，不能让这次变更被旧快照吞掉。
    if (getToken()) schedulePush();
  }

  function maybeMarkDirty() {
    if (applyingRemote) return;
    const nextSig = canonical(normalizeData(buildPayloadData()));
    if (nextSig === lastPayloadSig) return;
    lastPayloadSig = nextSig;
    markDirty();
  }

  // 包裹 NavStorage.set / remove + 监听账本与偏好变化：仅在可同步数据实质改变时标记脏
  function hookStorage() {
    if (!NavStorage || NavStorage.__cloudSyncHooked) return;
    lastPayloadSig = canonical(normalizeData(buildPayloadData()));
    const origSet = NavStorage.set.bind(NavStorage);
    NavStorage.set = function (key, value) {
      const r = origSet(key, value);
      if (r && !applyingRemote && SYNCED_KEYS.has(key)) {
        maybeMarkDirty();
      }
      return r;
    };
    if (typeof NavStorage.remove === "function") {
      const origRemove = NavStorage.remove.bind(NavStorage);
      NavStorage.remove = function (key) {
        const r = origRemove(key);
        if (r && !applyingRemote && SYNCED_KEYS.has(key)) {
          maybeMarkDirty();
        }
        return r;
      };
    }
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("mynav-ledger-changed", (ev) => {
        if (applyingRemote || (ev && ev.detail && ev.detail.syncOrigin === "remote")) return;
        maybeMarkDirty();
      });
      window.addEventListener("mynav-preferences-changed", () => {
        if (applyingRemote) return;
        maybeMarkDirty();
      });
      window.addEventListener("nav-overrides-changed", () => {
        if (applyingRemote) return;
        maybeMarkDirty();
      });
    }
    NavStorage.__cloudSyncHooked = true;
  }

  async function initialSync(options) {
    options = options || {};
    if (!NavStorage || !window.fetch) {
      setStatus("disabled", "不可用", "当前浏览器不支持云同步");
      return false;
    }
    if (status === "syncing") {
      syncPending = true;
      return false;
    }
    if (!getToken()) {
      setStatus("logged-out", "登录", "登录后可跨设备同步");
      return false;
    }
    if (navigator.onLine === false) {
      setStatus("error", "当前离线", "数据仅保存在本机，联网后会自动同步");
      return false;
    }
    setStatus("syncing", "同步…");
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const remote = await apiGet();
        const meta = getMeta();
        const local = normalizeData(buildPayloadData());

        // 云端还没有档案：仅在本地确实有业务数据时建档，绝不用空档案覆盖。
        if (remote.empty) {
          if (localHasData()) {
            const ts = Math.max(Date.now(), (meta.updatedAt || 0) + 1);
            const saved = await apiPut({ updatedAt: ts, baseUpdatedAt: 0, data: local });
            await finalizeSync({ updatedAt: saved.updatedAt || ts, data: local }, false);
          } else {
            await finalizeSync({ updatedAt: 0, data: local }, false);
          }
          return true;
        }
        if (!remote.data || typeof remote.data !== "object") {
          throw new Error("云端返回的数据格式不完整");
        }

        const remoteTs = Number.isFinite(remote.updatedAt) ? Math.max(0, remote.updatedAt) : 0;
        const remoteData = normalizeData(remote.data);
        const hasBase = isObject(meta.baseData);
        const baseData = hasBase ? normalizeData(meta.baseData) : null;
        const localMatchesBase = hasBase && equal(local, baseData);

        // 新设备没有本地数据，直接下载；本地与上次同步快照一致，也可安全采用云端新版。
        if (!hasBase && !localHasData()) {
          await finalizeSync({ updatedAt: remoteTs, data: remoteData }, true);
          return true;
        }
        if (hasBase && localMatchesBase && (meta.baseUpdatedAt || 0) !== remoteTs) {
          await finalizeSync({ updatedAt: remoteTs, data: remoteData }, true);
          return true;
        }

        let merged;
        if (hasBase && (meta.baseUpdatedAt || 0) === remoteTs) {
          if (localMatchesBase) {
            await finalizeSync({ updatedAt: remoteTs, data: remoteData }, false);
            return true;
          }
          merged = local; // 只有本机变了，直接上传；baseUpdatedAt 防止期间被另一台覆盖。
        } else {
          const prefer = (meta.updatedAt || 0) > remoteTs ? "local" : "remote";
          merged = mergeData(baseData, local, remoteData, prefer);
          if (equal(merged, remoteData)) {
            await finalizeSync({ updatedAt: remoteTs, data: remoteData }, true);
            return true;
          }
        }

        const ts = Math.max(Date.now(), (meta.updatedAt || 0) + 1, remoteTs + 1);
        const changedLocal = !equal(local, merged);
        if (changedLocal) writeDocData(merged);
        setMeta({ updatedAt: ts });
        try {
          const saved = await apiPut({ updatedAt: ts, baseUpdatedAt: remoteTs, data: merged });
          await finalizeSync({ updatedAt: saved.updatedAt || ts, data: merged }, false);
        } catch (e) {
          if (e.code === "conflict" && attempt < 2) continue;
          throw e;
        }
        if (changedLocal) refreshUiAfterSync();
        return true;
      }
      throw new Error("云端持续有其他设备更新，请稍后重试");
    } catch (e) {
      if (e.code === "need-login") {
        handleNeedLogin();
      } else {
        const message = friendlyError(e);
        setStatus("error", "同步失败", message);
        if (!options.silent) notify("云同步失败", message, "⚠");
      }
      return false;
    } finally {
      if (syncPending) {
        syncPending = false;
        setTimeout(() => {
          if (getToken() && !document.hidden) {
            initialSync({ silent: true });
          }
        }, 0);
      }
    }
  }

  // ---------- 账号 UI（弹窗与菜单由 JS 生成，index.html 不需要额外 DOM） ----------

  let uiStylesInjected = false;
  let authOverlayEl = null;
  let accountMenuEl = null;

  function ensureUiStyles() {
    if (uiStylesInjected || typeof document === "undefined") return;
    if (document.getElementById("nav-auth-style")) {
      uiStylesInjected = true;
      return;
    }
    const style = document.createElement("style");
    style.id = "nav-auth-style";
    style.textContent = [
      ".nav-auth-overlay{position:fixed;inset:0;background:rgba(20,16,12,.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}",
      ".nav-auth-card{background:var(--paper,#fbf7ef);color:var(--ink,#2a2118);border:1px solid rgba(0,0,0,.12);border-radius:14px;box-shadow:0 18px 48px rgba(0,0,0,.28);width:min(360px,100%);padding:20px 20px 16px;font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif}",
      ".nav-auth-card h3{margin:0 0 4px;font-size:16px}",
      ".nav-auth-hint{margin:0 0 14px;font-size:12px;opacity:.72}",
      ".nav-auth-field{display:block;margin-bottom:10px}",
      ".nav-auth-field span{display:block;font-size:12px;margin-bottom:4px;opacity:.8}",
      ".nav-auth-field input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid rgba(0,0,0,.18);border-radius:8px;background:transparent;color:inherit;font:inherit}",
      ".nav-auth-error{color:#b3261e;font-size:12px;min-height:16px;margin:2px 0 8px}",
      ".nav-auth-actions{display:flex;gap:8px;justify-content:flex-end}",
      ".nav-auth-btn{padding:7px 14px;border-radius:8px;border:1px solid rgba(0,0,0,.18);background:transparent;color:inherit;font:inherit;cursor:pointer}",
      ".nav-auth-btn--primary{background:#2a2118;color:#fbf7ef;border-color:#2a2118}",
      ".nav-auth-switch{margin-top:10px;font-size:12px;text-align:center}",
      ".nav-auth-switch button{background:none;border:0;color:inherit;text-decoration:underline;cursor:pointer;font:inherit;padding:0;margin:0 4px}",
      ".nav-recovery-code{width:100%;box-sizing:border-box;min-height:84px;resize:vertical;padding:10px;border:1px solid rgba(0,0,0,.18);border-radius:8px;background:transparent;color:inherit;font:12px/1.5 ui-monospace,monospace;word-break:break-all}",
      ".nav-account-menu{position:absolute;z-index:9998;background:var(--paper,#fbf7ef);color:var(--ink,#2a2118);border:1px solid rgba(0,0,0,.14);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.22);padding:6px;min-width:150px;font:13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif}",
      ".nav-account-menu button{display:block;width:100%;text-align:left;padding:8px 10px;border:0;border-radius:6px;background:none;color:inherit;font:inherit;cursor:pointer}",
      ".nav-account-menu button:hover{background:rgba(0,0,0,.06)}",
    ].join("");
    document.head.appendChild(style);
    uiStylesInjected = true;
  }

  function authErrorMessage(r) {
    if (r.status === 403) return "注册已关闭：本站已有账号，请直接登录或使用恢复码。";
    if (r.status === 409) return "用户名已被占用，换一个试试。";
    if (r.status === 401) return "用户名或密码不正确。";
    if (r.status === 400) return (r.data && r.data.error) || "输入不合法。";
    return (r.data && (r.data.message || r.data.error)) || "操作失败（" + r.status + "），请稍后重试。";
  }

  function closeAuthDialog() {
    if (authOverlayEl && authOverlayEl.parentNode) authOverlayEl.parentNode.removeChild(authOverlayEl);
    authOverlayEl = null;
  }

  function openAuthDialog(mode, reason) {
    if (typeof document === "undefined") return;
    ensureUiStyles();
    closeAuthDialog();
    closeAccountMenu();

    let currentMode = mode === "register" ? "register" : (mode === "recover" ? "recover" : "login");

    const overlay = document.createElement("div");
    overlay.className = "nav-auth-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const card = document.createElement("div");
    card.className = "nav-auth-card";
    overlay.appendChild(card);

    const title = document.createElement("h3");
    const hint = document.createElement("p");
    hint.className = "nav-auth-hint";

    const form = document.createElement("form");
    form.setAttribute("novalidate", "novalidate");

    function makeField(labelText, type, autocomplete) {
      const wrap = document.createElement("label");
      wrap.className = "nav-auth-field";
      const span = document.createElement("span");
      span.textContent = labelText;
      const input = document.createElement("input");
      input.type = type;
      input.autocomplete = autocomplete;
      input.required = true;
      wrap.appendChild(span);
      wrap.appendChild(input);
      return { wrap: wrap, input: input };
    }

    const userField = makeField("用户名", "text", "username");
    const recoveryField = makeField("恢复码", "text", "off");
    const passField = makeField("密码", "password", "current-password");
    userField.input.value = getUser() || "";
    recoveryField.input.spellcheck = false;

    const errEl = document.createElement("div");
    errEl.className = "nav-auth-error";
    errEl.setAttribute("role", "alert");

    const actions = document.createElement("div");
    actions.className = "nav-auth-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "nav-auth-btn";
    cancelBtn.textContent = "取消";
    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = "nav-auth-btn nav-auth-btn--primary";
    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);

    const switchWrap = document.createElement("div");
    switchWrap.className = "nav-auth-switch";
    const switchBtn = document.createElement("button");
    switchBtn.type = "button";
    const forgotBtn = document.createElement("button");
    forgotBtn.type = "button";
    forgotBtn.textContent = "忘记密码？用恢复码";
    switchWrap.appendChild(switchBtn);
    switchWrap.appendChild(forgotBtn);

    form.appendChild(userField.wrap);
    form.appendChild(recoveryField.wrap);
    form.appendChild(passField.wrap);
    form.appendChild(errEl);
    form.appendChild(actions);
    card.appendChild(title);
    card.appendChild(hint);
    card.appendChild(form);
    card.appendChild(switchWrap);

    function paint() {
      const isReg = currentMode === "register";
      const isRecover = currentMode === "recover";
      title.textContent = isReg ? "注册账号" : (isRecover ? "用恢复码重置密码" : "登录账号");
      hint.textContent = isReg
        ? "仅当本站还没有任何账号时可注册；注册成功后会发放一次性恢复码。"
        : (isRecover
          ? "输入站长保存的恢复码和至少 8 位新密码。成功后旧密码、旧会话和旧恢复码都会失效。"
          : (reason || "用你的用户名和密码登录，收藏、访问记录、排序、主题与站内编辑会在多设备间同步。"));
      submitBtn.textContent = isReg ? "注册" : (isRecover ? "重置密码并登录" : "登录");
      passField.wrap.querySelector("span").textContent = isRecover ? "新密码" : "密码";
      passField.input.autocomplete = isReg || isRecover ? "new-password" : "current-password";
      recoveryField.wrap.hidden = !isRecover;
      recoveryField.input.required = isRecover;
      switchBtn.textContent = isRecover ? "返回登录" : (isReg ? "已有账号？去登录" : "没有账号？去注册");
      forgotBtn.hidden = isReg || isRecover;
      errEl.textContent = "";
    }

    switchBtn.addEventListener("click", function () {
      currentMode = currentMode === "recover" ? "login" : (currentMode === "register" ? "login" : "register");
      paint();
      userField.input.focus();
    });
    forgotBtn.addEventListener("click", function () {
      currentMode = "recover";
      paint();
      recoveryField.input.focus();
    });

    cancelBtn.addEventListener("click", closeAuthDialog);
    overlay.addEventListener("click", function (ev) {
      if (ev.target === overlay) closeAuthDialog();
    });

    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      errEl.textContent = "";
      const username = userField.input.value.trim();
      const password = passField.input.value;
      const recoveryCode = recoveryField.input.value.trim();
      if (!username || !password || (currentMode === "recover" && !recoveryCode)) {
        errEl.textContent = currentMode === "recover" ? "请填写用户名、恢复码和新密码。" : "请填写用户名和密码。";
        return;
      }
      submitBtn.disabled = true;
      const original = submitBtn.textContent;
      submitBtn.textContent = currentMode === "register" ? "注册中…" : (currentMode === "recover" ? "重置中…" : "登录中…");
      try {
        const body = currentMode === "recover"
          ? { username, recoveryCode, newPassword: password }
          : { username, password };
        const r = await authPost(currentMode, body);
        if (!r.ok) {
          errEl.textContent = currentMode === "recover" && r.status === 401
            ? "用户名或恢复码不正确。" : authErrorMessage(r);
          submitBtn.disabled = false;
          submitBtn.textContent = original;
          return;
        }
        if (!adoptSession(r.data)) throw new Error("登录响应缺少会话信息");
        renderButton();
        if (r.data && r.data.recoveryCode) {
          showRecoveryCode(r.data.recoveryCode);
        } else {
          closeAuthDialog();
          await initialSync();
        }
      } catch (e) {
        errEl.textContent = "网络异常，请稍后重试。";
        submitBtn.disabled = false;
        submitBtn.textContent = original;
      }
    });

    paint();
    document.body.appendChild(overlay);
    authOverlayEl = overlay;
    userField.input.focus();
  }

  function showRecoveryCode(code) {
    if (typeof document === "undefined" || !code) return;
    ensureUiStyles();
    closeAuthDialog();
    closeAccountMenu();
    const overlay = document.createElement("div");
    overlay.className = "nav-auth-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    const card = document.createElement("div");
    card.className = "nav-auth-card";
    overlay.appendChild(card);
    const title = document.createElement("h3");
    title.textContent = "保存这次恢复码";
    const hint = document.createElement("p");
    hint.className = "nav-auth-hint";
    hint.textContent = "它只显示这一次。忘记密码时可用它重置；下次使用或重新生成后，这枚恢复码即失效。不要发给其他人。";
    const codeEl = document.createElement("textarea");
    codeEl.className = "nav-recovery-code";
    codeEl.readOnly = true;
    codeEl.value = code;
    codeEl.setAttribute("aria-label", "一次性恢复码");
    const actions = document.createElement("div");
    actions.className = "nav-auth-actions";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "nav-auth-btn";
    copyBtn.textContent = "复制恢复码";
    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "nav-auth-btn nav-auth-btn--primary";
    doneBtn.textContent = "我已保存，开始同步";
    actions.appendChild(copyBtn);
    actions.appendChild(doneBtn);
    card.appendChild(title);
    card.appendChild(hint);
    card.appendChild(codeEl);
    card.appendChild(actions);
    copyBtn.addEventListener("click", async function () {
      codeEl.focus();
      codeEl.select();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(code);
        else document.execCommand("copy");
        copyBtn.textContent = "已复制";
      } catch (e) {
        copyBtn.textContent = "请手动复制";
      }
    });
    doneBtn.addEventListener("click", function () {
      closeAuthDialog();
      initialSync();
    });
    document.body.appendChild(overlay);
    authOverlayEl = overlay;
    codeEl.focus();
    codeEl.select();
  }

  function closeAccountMenu() {
    if (accountMenuEl && accountMenuEl.parentNode) accountMenuEl.parentNode.removeChild(accountMenuEl);
    accountMenuEl = null;
  }

  function openAccountMenu(anchor) {
    if (typeof document === "undefined") return;
    ensureUiStyles();
    closeAccountMenu();

    const menu = document.createElement("div");
    menu.className = "nav-account-menu";
    menu.setAttribute("role", "menu");

    function item(text, handler) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitem");
      b.textContent = text;
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        closeAccountMenu();
        handler();
      });
      menu.appendChild(b);
    }

    item("立即同步", function () {
      pushNow(false);
    });
    item("设置恢复码", async function () {
      try {
        const r = await authPost("recovery-code", {});
        if (r.ok && r.data && r.data.recoveryCode) showRecoveryCode(r.data.recoveryCode);
        else if (r.status === 401) handleNeedLogin();
        else notify("设置恢复码失败", authErrorMessage(r), "⚠");
      } catch (e) {
        notify("设置恢复码失败", friendlyError(e), "⚠");
      }
    });
    item("退出登录", function () {
      doLogout();
    });

    document.body.appendChild(menu);
    accountMenuEl = menu;

    // 贴着按钮下方弹出，超出视口则上翻
    const rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
    if (rect) {
      const mw = menu.offsetWidth || 160;
      const mh = menu.offsetHeight || 80;
      let left = rect.left + window.pageXOffset;
      let top = rect.bottom + window.pageYOffset + 6;
      if (left + mw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - mw - 8);
      if (rect.bottom + mh + 12 > window.innerHeight) {
        top = rect.top + window.pageYOffset - mh - 6;
      }
      menu.style.left = left + "px";
      menu.style.top = Math.max(8, top) + "px";
    }

    setTimeout(function () {
      document.addEventListener(
        "click",
        function onDocClick(ev) {
          if (accountMenuEl && !accountMenuEl.contains(ev.target)) closeAccountMenu();
        },
        { once: true }
      );
    }, 0);
  }

  async function doLogout() {
    await authLogout();
    clearSession();
    setStatus("logged-out", "登录");
  }

  function onButtonClick(ev) {
    if (!getToken()) {
      openAuthDialog("login");
      return;
    }
    openAccountMenu(ev && ev.currentTarget ? ev.currentTarget : syncBtn);
  }

  function refreshSyncButtonRefs() {
    if (typeof document === "undefined") return;
    // 用 querySelector 读取已挂载 DOM，避免未展开时意外触发 data-lazy-dom 模板水合
    syncBtn = document.querySelector("#btn-cloud-sync");
    syncLabel = syncBtn ? syncBtn.querySelector(".cloud-label") : null;
    if (status !== "unknown") {
      setStatus(status, syncStatusLabel, syncDetail);
    } else if (syncBtn) {
      renderButton();
    }
  }

  function init() {
    if (typeof document === "undefined" || !NavStorage) return;
    hookStorage();
    refreshSyncButtonRefs();

    document.addEventListener("click", (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest("#btn-cloud-sync") : null;
      if (!btn) return;
      syncBtn = btn;
      syncLabel = btn.querySelector(".cloud-label");
      onButtonClick(ev);
    });
    window.addEventListener("mynav-lazy-ready", () => {
      refreshSyncButtonRefs();
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      if (accountMenuEl) closeAccountMenu();
      if (authOverlayEl) closeAuthDialog();
    });

    // 页面切后台前把未推送的变更刷出去
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && pushTimer) {
        clearTimeout(pushTimer);
        pushTimer = null;
        pushNow(true);
      }
      if (!document.hidden && getToken()) {
        initialSync({ silent: true });
      }
    });
    window.addEventListener("pageshow", () => {
      if (getToken()) initialSync({ silent: true });
    });
    window.addEventListener("pagehide", () => {
      if (pushTimer) {
        clearTimeout(pushTimer);
        pushTimer = null;
        pushNow(true);
      }
    });
    window.addEventListener("online", () => {
      if (getToken()) initialSync({ silent: true });
    });
    let lastFocusSync = 0;
    window.addEventListener("focus", () => {
      const now = Date.now();
      if (getToken() && now - lastFocusSync > 30000) {
        lastFocusSync = now;
        initialSync({ silent: true });
      }
    });
    window.setInterval(() => {
      if (getToken() && document.visibilityState === "visible") {
        initialSync({ silent: true });
      }
    }, 60000);

    // 后台静默首轮同步，不阻塞页面渲染；401 仍会明确要求重新登录。
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => setTimeout(() => initialSync({ silent: true }), 600));
    } else {
      setTimeout(() => initialSync({ silent: true }), 600);
    }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  const api = {
    init,
    syncNow: () => initialSync(),
    logout: () => doLogout(),
    openAuth: (mode) => openAuthDialog(mode),
    getStatus: () => status,
    getUser: () => getUser(),
    getMeta: () => clone(getMeta()),
    getLastError: () => syncDetail,
    buildPayloadData: () => normalizeData(buildPayloadData()),
    adoptSession,
  };

  if (typeof module === "object" && module.exports) {
    api.__test = { normalizeData, mergeData, mergeIdList, equal, writeDocData, finishSynced, hookStorage };
  }
  return api;
});
