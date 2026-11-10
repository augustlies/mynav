/**
 * 模块：云同步（账号登录 + 个人数据跨设备同步）(js/cloud-sync.js)
 * 职责：
 * 1. 通过 /api/auth 登录/注册账号，通过 /api/sync 与 Cloudflare KV 同步
 *    收藏、访问统计、排序、主题与站内卡片编辑（overrides）
 * 2. 登录 = 用户名 + 密码（会话 token 存本机 localStorage），新设备输入一次即可
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
    if (!data || typeof data.token !== "string") return false;
    setToken(data.token);
    setUser(typeof data.username === "string" ? data.username : null);
    return true;
  }

  // 清掉本地会话（不动业务数据）
  function clearSession() {
    setToken(null);
    setUser(null);
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

  function setStatus(next, labelText) {
    status = next;
    if (syncBtn) {
      syncBtn.setAttribute("data-sync-status", next);
      syncBtn.setAttribute("aria-label", "云同步：" + (labelText || next));
      syncBtn.title = "云同步（" + (labelText || next) + "）";
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

  // 把一份档案应用到本地（经 importBackup 校验），然后刷新页面让各模块重读
  function applyDoc(doc) {
    if (!doc || !doc.data || !NavStorage) return;
    applyingRemote = true;
    try {
      NavStorage.importBackup({ data: doc.data });
      // 修改层不在 importBackup 的白名单里，单独回写；applyingRemote 保护下不会反向标脏
      const remoteOverrides = doc.data.overrides;
      if (remoteOverrides && typeof remoteOverrides === "object" && !Array.isArray(remoteOverrides)) {
        NavStorage.set(OVERRIDES_KEY, remoteOverrides);
      }
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
      await apiPut({ updatedAt: meta.updatedAt || Date.now(), data: buildPayloadData() }, keepalive);
      setMeta({ lastSyncAt: Date.now() });
      setStatus("synced", "已同步");
    } catch (e) {
      if (e.code === "need-login") {
        clearSession();
        setStatus("logged-out", "登录");
      } else if (e.code === "conflict" && e.serverDoc) {
        // 云端更新：拉下来覆盖本地
        applyDoc(e.serverDoc);
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

      // 规则 1：账号下还没有档案。本地有数据就整份推上去；本地也没数据就不建档。
      if (remote.empty) {
        if (localHasData()) {
          const meta = getMeta();
          const ts = meta.updatedAt || Date.now();
          await apiPut({ updatedAt: ts, data: buildPayloadData() });
          setMeta({ updatedAt: ts, lastSyncAt: Date.now() });
        }
        setStatus("synced", "已同步");
        return;
      }

      const meta = getMeta();
      const remoteTs = remote.updatedAt || 0;
      const localOverrides = getOverrides();
      const remoteOverrides = remote.data ? remote.data.overrides : null;

      // 规则 2（优先于时间戳比较）：云端 overrides 为空、本地 overrides 非空
      // —— 存量旧编辑是旧版本攒下的、从未 bump 过时间戳，只靠时间戳会「只拉不推」而搁浅。
      // 处理：以云端档案为基础、overrides 换成本地的，推回云端，再把合并结果落到本地。
      if (!hasOverridesData(remoteOverrides) && hasOverridesData(localOverrides)) {
        const mergedData = Object.assign({}, remote.data, { overrides: localOverrides });
        const ts = Math.max(Date.now(), remoteTs + 1);
        try {
          await apiPut({ updatedAt: ts, data: mergedData });
          applyDoc({ updatedAt: ts, data: mergedData });
        } catch (e) {
          if (e.code === "conflict" && e.serverDoc) {
            applyDoc(e.serverDoc);
          } else {
            throw e;
          }
        }
        return;
      }

      // 规则 3：其余维持原状——时间戳较新者胜
      if (remoteTs > (meta.updatedAt || 0)) {
        // 云端更新：拉取并刷新
        applyDoc(remote);
        return;
      }
      if ((meta.updatedAt || 0) > remoteTs && localHasData()) {
        // 本地更新：推送
        await apiPut({ updatedAt: meta.updatedAt, data: buildPayloadData() });
        setMeta({ lastSyncAt: Date.now() });
      }
      setStatus("synced", "已同步");
    } catch (e) {
      if (e.code === "need-login") {
        clearSession();
        setStatus("logged-out", "登录");
      } else {
        setStatus("error", "重试");
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

  function openAuthDialog(mode) {
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
        : "用你的用户名和密码登录，收藏、访问记录、排序、主题与站内编辑会在多设备间同步。";
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
        adoptSession(r.data);
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
    logout: () => doLogout(),
    openAuth: (mode) => openAuthDialog(mode),
    getStatus: () => status,
    getUser: () => getUser(),
  };
});
