/**
 * 模块：云同步（口令登录 + 个人数据跨设备同步）(js/cloud-sync.js)
 * 职责：
 * 1. 通过 /api/sync 与 Cloudflare KV 同步收藏、访问统计、排序与主题
 * 2. 登录 = 你自己定的口令（存在本机 localStorage），新设备输入一次即可
 * 3. 本地优先渲染：启动即读本地，后台静默同步；云端更新才拉取并刷新页面
 * 4. 冲突策略：整份档案 last-write-wins（单人使用足够且可预测）
 * 5. 任何网络/登录异常都不影响本地功能，静默降级
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
  const TOKEN_KEY = "mynav_arch_sync_token";
  const META_KEY = "mynav_arch_sync_meta";
  const PUSH_DEBOUNCE_MS = 8000;

  // 参与云同步的键（其余键只存本地）
  const SYNCED_KEYS = new Set(
    NavStorage
      ? [NavStorage.KEYS.THEME, NavStorage.KEYS.FAVORITES, NavStorage.KEYS.VISITS, NavStorage.KEYS.ORDER]
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

  function authHeaders() {
    const t = getToken();
    return t ? { authorization: "Bearer " + t } : {};
  }

  function getMeta() {
    const m = NavStorage ? NavStorage.get(META_KEY, null) : null;
    return m && typeof m === "object" ? m : { updatedAt: 0, lastSyncAt: 0 };
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

  // 本地是否有值得同步的数据（避免空档案覆盖云端）
  function localHasData() {
    if (!NavStorage) return false;
    const favs = NavStorage.get(NavStorage.KEYS.FAVORITES, []);
    const visits = NavStorage.get(NavStorage.KEYS.VISITS, {});
    const order = NavStorage.get(NavStorage.KEYS.ORDER, {});
    return (
      (Array.isArray(favs) && favs.length > 0) ||
      (visits && Object.keys(visits).length > 0) ||
      (order && Object.keys(order).length > 0)
    );
  }

  function setStatus(next, labelText) {
    status = next;
    if (syncBtn) {
      syncBtn.setAttribute("data-sync-status", next);
      syncBtn.setAttribute("aria-label", "云同步：" + (labelText || next));
      syncBtn.title = "云同步（" + (labelText || next) + "）";
    }
    if (syncLabel && labelText) {
      syncLabel.textContent = labelText;
    }
  }

  function needLoginError() {
    const err = new Error("need-login");
    err.code = "need-login";
    return err;
  }

  async function apiGet() {
    const res = await fetch(API, {
      credentials: "same-origin",
      headers: authHeaders(),
    });
    if (res.status === 401) throw needLoginError();
    if (res.status === 404) return { empty: true };
    if (!res.ok) {
      const err = new Error("http-" + res.status);
      err.code = "http";
      throw err;
    }
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
      const err = new Error("http-" + res.status);
      err.code = "http";
      throw err;
    }
    return data;
  }

  // 把云端档案应用到本地（经 importBackup 校验），然后刷新页面让各模块重读
  function applyRemoteDoc(doc) {
    if (!doc || !doc.data || !NavStorage) return;
    applyingRemote = true;
    try {
      NavStorage.importBackup({ data: doc.data });
    } finally {
      applyingRemote = false;
    }
    setMeta({ updatedAt: doc.updatedAt || Date.now(), lastSyncAt: Date.now() });
    // 各模块已按本地旧数据渲染完毕，直接刷新是最稳的生效方式
    window.location.reload();
  }

  async function pushNow(keepalive) {
    if (!NavStorage || status === "syncing") return;
    if (!getToken()) {
      setStatus("logged-out", "登录");
      return;
    }
    setStatus("syncing", "同步…");
    try {
      const meta = getMeta();
      const backup = NavStorage.exportBackup();
      await apiPut({ updatedAt: meta.updatedAt || Date.now(), data: backup.data }, keepalive);
      setMeta({ lastSyncAt: Date.now() });
      setStatus("synced", "已同步");
    } catch (e) {
      if (e.code === "need-login") {
        setToken(null);
        setStatus("logged-out", "登录");
      } else if (e.code === "conflict" && e.serverDoc) {
        // 云端更新：拉下来覆盖本地
        applyRemoteDoc(e.serverDoc);
      } else {
        setStatus("error", "重试");
      }
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
    setMeta({ updatedAt: Date.now() });
    if (status === "synced" || status === "error") {
      schedulePush();
    }
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

  async function initialSync() {
    if (!NavStorage || !window.fetch) {
      setStatus("disabled", "不可用");
      return;
    }
    if (!getToken()) {
      setStatus("logged-out", "登录");
      return;
    }
    if (navigator.onLine === false) {
      setStatus("error", "重试");
      return;
    }
    setStatus("syncing", "同步…");
    try {
      const remote = await apiGet();

      if (remote.empty) {
        if (localHasData()) {
          // 首次使用：把本地数据推上云
          const meta = getMeta();
          await apiPut({
            updatedAt: meta.updatedAt || Date.now(),
            data: NavStorage.exportBackup().data,
          });
          setMeta({ updatedAt: meta.updatedAt || Date.now(), lastSyncAt: Date.now() });
        }
        setStatus("synced", "已同步");
        return;
      }

      const meta = getMeta();
      const remoteTs = remote.updatedAt || 0;
      if (remoteTs > (meta.updatedAt || 0)) {
        // 云端更新：拉取并刷新
        applyRemoteDoc(remote);
        return;
      }
      if ((meta.updatedAt || 0) > remoteTs && localHasData()) {
        // 本地更新：推送
        await apiPut({ updatedAt: meta.updatedAt, data: NavStorage.exportBackup().data });
        setMeta({ lastSyncAt: Date.now() });
      }
      setStatus("synced", "已同步");
    } catch (e) {
      if (e.code === "need-login") {
        setToken(null);
        setStatus("logged-out", "登录");
      } else {
        setStatus("error", "重试");
      }
    }
  }

  function promptForToken() {
    const t = window.prompt("请输入云同步口令（新设备首次使用时输入一次即可）：");
    if (t && t.trim()) {
      setToken(t.trim());
      initialSync();
    }
  }

  function onButtonClick() {
    if (status === "logged-out" || status === "unknown") {
      promptForToken();
    } else if (status === "synced" || status === "error") {
      pushNow(false);
    }
  }

  function init() {
    if (typeof document === "undefined" || !NavStorage) return;
    hookStorage();

    syncBtn = document.getElementById("btn-cloud-sync");
    if (syncBtn) {
      syncLabel = syncBtn.querySelector(".cloud-label");
      syncBtn.addEventListener("click", onButtonClick);
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

    // 后台静默首轮同步，不阻塞页面渲染
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => setTimeout(initialSync, 600));
    } else {
      setTimeout(initialSync, 600);
    }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  return {
    init,
    syncNow: () => pushNow(false),
    logout: () => {
      setToken(null);
      setStatus("logged-out", "登录");
    },
    getStatus: () => status,
  };
});
