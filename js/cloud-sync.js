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

  function emptyOverrides() {
    return { modified: {}, added: [], hidden: [], deleted: [], unhidden: [] };
  }

  // 参与云同步的键（其余键只存本地）
  const SYNCED_KEYS = new Set(
    NavStorage
      ? [NavStorage.KEYS.THEME, NavStorage.KEYS.FAVORITES, NavStorage.KEYS.VISITS, NavStorage.KEYS.ORDER, OVERRIDES_KEY]
      : []
  );

  // 状态：unknown | logged-out | syncing | synced | error | disabled
  let status = "unknown";
  let applyingRemote = false;
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
      headers: { "content-type": "application/json" },
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
  function buildPayloadData() {
    const data = NavStorage.exportBackup().data;
    data.overrides = getOverrides();
    return data;
  }

  // 本地是否有值得同步的数据（避免空档案覆盖云端）
  function localHasData() {
    if (!NavStorage) return false;
    const favs = NavStorage.get(NavStorage.KEYS.FAVORITES, []);
    const visits = NavStorage.get(NavStorage.KEYS.VISITS, {});
    const order = NavStorage.get(NavStorage.KEYS.ORDER, {});
    return (
      (Array.isArray(favs) && favs.length > 0) ||
      (visits && Object.keys(visits).length > 0) ||
      (order && Object.keys(order).length > 0) ||
      hasOverridesData(getOverrides())
    );
  }

  // ---------- 三方合并：base = 上次与云端一致的快照 ----------
  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
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

  function mergeData(base, local, remote, prefer) {
    base = normalizeData(base);
    local = normalizeData(local);
    remote = normalizeData(remote);
    return {
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
  }

  let syncDetail = "";

  function setStatus(next, labelText, detail) {
    status = next;
    syncDetail = detail || "";
    if (syncBtn) {
      syncBtn.setAttribute("data-sync-status", next);
      syncBtn.setAttribute("aria-label", "云同步：" + (labelText || next) + (syncDetail ? "。" + syncDetail : ""));
      syncBtn.title = "云同步（" + (labelText || next) + "）" + (syncDetail ? "：" + syncDetail : "");
    }
    if (typeof document !== "undefined") {
      const statusEl = document.querySelector("#cloud-sync-status");
      if (statusEl) {
        statusEl.textContent = (labelText || next) + (syncDetail ? "：" + syncDetail : "");
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

  // 写入本机但不刷新；合并上传失败时，合并结果也已经安全留在本机。
  function writeDocData(data) {
    if (!data || !NavStorage) throw new Error("本机存储模块尚未就绪");
    applyingRemote = true;
    try {
      const result = NavStorage.importBackup({ data: normalizeData(data) });
      if (!result || result.success !== true) {
        throw new Error("本机数据写入失败" + (result && result.message ? "：" + result.message : ""));
      }
      NavStorage.set(OVERRIDES_KEY, normalizeData(data).overrides);
    } finally {
      applyingRemote = false;
    }
  }

  function finishSynced(doc) {
    setMeta({
      updatedAt: doc.updatedAt || 0,
      baseUpdatedAt: doc.updatedAt || 0,
      baseData: normalizeData(doc.data),
      lastSyncAt: Date.now(),
    });
    setStatus("synced", "已同步", "收藏、访问记录、排序和书目编辑已同步");
  }

  function applyDoc(doc) {
    if (!doc || !doc.data || !NavStorage) return;
    const normalized = normalizeData(doc.data);
    writeDocData(normalized);
    finishSynced({ updatedAt: doc.updatedAt || 0, data: normalized });
    window.location.reload();
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

  // 包裹 NavStorage.set：同步键变更即标记脏（导入云端数据时不触发）
  function hookStorage() {
    if (!NavStorage || NavStorage.__cloudSyncHooked) return;
    const origSet = NavStorage.set.bind(NavStorage);
    NavStorage.set = function (key, value) {
      const r = origSet(key, value);
      if (r && !applyingRemote && SYNCED_KEYS.has(key)) {
        markDirty();
      }
      return r;
    };
    NavStorage.__cloudSyncHooked = true;
  }

  async function initialSync(options) {
    options = options || {};
    if (!NavStorage || !window.fetch) {
      setStatus("disabled", "不可用", "当前浏览器不支持云同步");
      return false;
    }
    if (status === "syncing") return false;
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
            await apiPut({ updatedAt: ts, baseUpdatedAt: 0, data: local });
            finishSynced({ updatedAt: ts, data: local });
          } else {
            finishSynced({ updatedAt: 0, data: local });
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
          applyDoc({ updatedAt: remoteTs, data: remoteData });
          return true;
        }
        if (hasBase && localMatchesBase && (meta.baseUpdatedAt || 0) !== remoteTs) {
          applyDoc({ updatedAt: remoteTs, data: remoteData });
          return true;
        }

        let merged;
        if (hasBase && (meta.baseUpdatedAt || 0) === remoteTs) {
          if (localMatchesBase) {
            finishSynced({ updatedAt: remoteTs, data: remoteData });
            return true;
          }
          merged = local; // 只有本机变了，直接上传；baseUpdatedAt 防止期间被另一台覆盖。
        } else {
          const prefer = (meta.updatedAt || 0) > remoteTs ? "local" : "remote";
          merged = mergeData(baseData, local, remoteData, prefer);
          if (equal(merged, remoteData)) {
            applyDoc({ updatedAt: remoteTs, data: remoteData });
            return true;
          }
        }

        const ts = Math.max(Date.now(), (meta.updatedAt || 0) + 1, remoteTs + 1);
        const changedLocal = !equal(local, merged);
        if (changedLocal) writeDocData(merged);
        setMeta({ updatedAt: ts });
        try {
          await apiPut({ updatedAt: ts, baseUpdatedAt: remoteTs, data: merged });
        } catch (e) {
          if (e.code === "conflict" && attempt < 2) continue;
          throw e;
        }
        finishSynced({ updatedAt: ts, data: merged });
        if (changedLocal) window.location.reload();
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
      ".nav-auth-switch button{background:none;border:0;color:inherit;text-decoration:underline;cursor:pointer;font:inherit;padding:0}",
      ".nav-account-menu{position:absolute;z-index:9998;background:var(--paper,#fbf7ef);color:var(--ink,#2a2118);border:1px solid rgba(0,0,0,.14);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.22);padding:6px;min-width:150px;font:13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif}",
      ".nav-account-menu button{display:block;width:100%;text-align:left;padding:8px 10px;border:0;border-radius:6px;background:none;color:inherit;font:inherit;cursor:pointer}",
      ".nav-account-menu button:hover{background:rgba(0,0,0,.06)}",
    ].join("");
    document.head.appendChild(style);
    uiStylesInjected = true;
  }

  function authErrorMessage(r) {
    if (r.status === 403) return "注册已关闭：本站已有账号，请直接登录。";
    if (r.status === 409) return "用户名已被占用，换一个试试。";
    if (r.status === 401) return "用户名或密码不正确。";
    if (r.status === 400) return (r.data && r.data.error) || "输入不合法。";
    return "操作失败（" + r.status + "），请稍后重试。";
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

    let currentMode = mode === "register" ? "register" : "login";

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
    const passField = makeField("密码", "password", "current-password");
    userField.input.value = getUser() || "";

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
    switchWrap.appendChild(switchBtn);

    form.appendChild(userField.wrap);
    form.appendChild(passField.wrap);
    form.appendChild(errEl);
    form.appendChild(actions);
    card.appendChild(title);
    card.appendChild(hint);
    card.appendChild(form);
    card.appendChild(switchWrap);

    function paint() {
      const isReg = currentMode === "register";
      title.textContent = isReg ? "注册账号" : "登录账号";
      hint.textContent = isReg
        ? "仅当本站还没有任何账号时可注册；注册成功后注册入口即关闭。"
        : (reason || "用你的用户名和密码登录，收藏、访问记录、排序、主题与站内编辑会在多设备间同步。");
      submitBtn.textContent = isReg ? "注册" : "登录";
      passField.input.autocomplete = isReg ? "new-password" : "current-password";
      switchBtn.textContent = isReg ? "已有账号？去登录" : "没有账号？去注册";
      errEl.textContent = "";
    }

    switchBtn.addEventListener("click", function () {
      currentMode = currentMode === "register" ? "login" : "register";
      paint();
      userField.input.focus();
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
      if (!username || !password) {
        errEl.textContent = "请填写用户名和密码。";
        return;
      }
      submitBtn.disabled = true;
      const original = submitBtn.textContent;
      submitBtn.textContent = currentMode === "register" ? "注册中…" : "登录中…";
      try {
        const r = await authPost(currentMode, { username: username, password: password });
        if (!r.ok) {
          errEl.textContent = authErrorMessage(r);
          submitBtn.disabled = false;
          submitBtn.textContent = original;
          return;
        }
        if (!adoptSession(r.data)) throw new Error("登录响应缺少会话信息");
        closeAuthDialog();
        renderButton();
        await initialSync();
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

  function init() {
    if (typeof document === "undefined" || !NavStorage) return;
    hookStorage();

    syncBtn = document.getElementById("btn-cloud-sync");
    if (syncBtn) {
      syncLabel = syncBtn.querySelector(".cloud-label");
      syncBtn.addEventListener("click", onButtonClick);
      renderButton();
    }

    // 页面切后台前把未推送的变更刷出去
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && pushTimer) {
        clearTimeout(pushTimer);
        pushTimer = null;
        pushNow(true);
      }
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
    api.__test = { normalizeData, mergeData, mergeIdList, equal, writeDocData, finishSynced };
  }
  return api;
});
