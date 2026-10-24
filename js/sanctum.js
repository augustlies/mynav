/**
 * Module: D2 twin sanctums — shadow moon and focus lock.
 *
 * /shadow is deliberately handled after commands and after the hidden
 * probe route. Nothing in this module can intercept that secret.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavSanctum = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SHADOW_ALIASES = new Set(["/shadow", "/moon", "/暗月", ">shadow", ">moon"]);
  const FOCUS_ALIASES = new Set(["/focus", ">focus"]);
  const FOCUS_ALLOWED = new Set(["ai", "dev", "knowledge", "tools"]);
  const DEFAULT_SHADOW_SITES = [
    {
      id: "shadow-private-notes",
      name: "私人手记（暗月占位）",
      url: "https://example.com/private-notes",
      description: "暗月密室示例：仅在此结界中可见的私密入口。",
      category: "tools",
      tags: ["shadow", "private", "notes"],
      icon: "私",
      status: "catalogued",
      visibility: "shadow",
      createdAt: 0
    },
    {
      id: "shadow-private-vault",
      name: "私人保险库（暗月占位）",
      url: "https://example.com/private-vault",
      description: "暗月密室示例：用于验收私密卷宗渲染。",
      category: "tools",
      tags: ["shadow", "private", "vault"],
      icon: "库",
      status: "catalogued",
      visibility: "shadow",
      createdAt: 0
    }
  ];
  let timerId = null;
  let focusStartedAt = 0;
  let bound = false;

  function toast(title, subtitle, icon) {
    if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
      window.NavShortcuts.showToast(title, subtitle || "", icon || "◐");
    }
  }

  function getState() {
    return window.NavLedger && typeof window.NavLedger.getModeState === "function"
      ? window.NavLedger.getModeState()
      : { shadowMoon: false, focusLock: false };
  }

  function setState(patch) {
    if (window.NavLedger && typeof window.NavLedger.setModeState === "function") {
      return window.NavLedger.setModeState(patch);
    }
    return Object.assign(getState(), patch || {});
  }

  function isShadow() {
    return Boolean(getState().shadowMoon);
  }

  function isFocus() {
    return Boolean(getState().focusLock);
  }

  function shouldSeal(site) {
    if (!isFocus() || !site) return false;
    return !FOCUS_ALLOWED.has(site.category);
  }

  function applyVisualState() {
    const shadow = isShadow();
    const focus = isFocus();
    document.documentElement.setAttribute("data-sanctum", shadow ? "shadow" : "day");
    document.documentElement.setAttribute("data-focus-lock", focus ? "true" : "false");
    document.body.classList.toggle("sanctum-shadow", shadow);
    document.body.classList.toggle("focus-lock", focus);
    const title = document.querySelector(".colophon-sub-title");
    if (title) title.textContent = shadow ? "EX LIBRIS · 暗月卷宗" : "个人数字收藏馆";
    const mastheadTitle = document.querySelector(".masthead-headline");
    if (mastheadTitle) {
      mastheadTitle.textContent = shadow ? "EX LIBRIS · 暗月卷宗" : "个人数字收藏馆";
    }
    const focusPanel = document.getElementById("focus-timer");
    if (focusPanel) {
      focusPanel.hidden = !focus;
      if (focus) startFocusClock();
      else stopFocusClock();
    }
  }

  function getDefaultSites() {
    return DEFAULT_SHADOW_SITES.map(function (site) {
      return Object.assign({}, site, { tags: site.tags.slice() });
    });
  }

  function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return String(h).padStart(2, "0") + ":" +
      String(m).padStart(2, "0") + ":" +
      String(s).padStart(2, "0");
  }

  function startFocusClock() {
    stopFocusClock();
    if (!focusStartedAt) focusStartedAt = Date.now();
    const tick = function () {
      const value = document.getElementById("focus-timer-value");
      if (value) value.textContent = formatDuration(Math.floor((Date.now() - focusStartedAt) / 1000));
    };
    tick();
    timerId = setInterval(tick, 1000);
  }

  function stopFocusClock() {
    if (timerId) clearInterval(timerId);
    timerId = null;
    focusStartedAt = 0;
  }

  function setShadow(value) {
    const next = typeof value === "boolean" ? value : !isShadow();
    setState({ shadowMoon: next });
    applyVisualState();
    if (next) {
      document.body.classList.add("sanctum-shadow");
      toast("已转入暗月卷宗", "EX LIBRIS · 暗月密室", "☾");
    } else {
      document.body.classList.remove("sanctum-shadow");
      toast("已返回表世界", "个人数字收藏馆", "☼");
    }
    if (window.NavApp && typeof window.NavApp.switchCategory === "function") {
      window.NavApp.switchCategory("all");
    }
    return next;
  }

  function toggleShadow() {
    return setShadow(!isShadow());
  }

  function setFocus(value) {
    const next = typeof value === "boolean" ? value : !isFocus();
    setState({ focusLock: next });
    applyVisualState();
    if (next) {
      toast("考场结界已展开", "司天监封条 · 沉浸研习中", "⌛");
      focusStartedAt = Date.now();
      startFocusClock();
    } else {
      stopFocusClock();
      toast("考场结界已解除", "已恢复全馆通行", "☼");
    }
    // Render after the state is committed so cards receive .card--sealed.
    if (window.NavApp && typeof window.NavApp.renderContent === "function") {
      window.NavApp.renderContent();
    }
    return next;
  }

  function toggleFocus() {
    return setFocus(!isFocus());
  }

  function normalizeCommand(value) {
    return String(value || "").trim().toLowerCase();
  }

  function matchesCommand(value) {
    const command = normalizeCommand(value);
    return SHADOW_ALIASES.has(command) || FOCUS_ALIASES.has(command);
  }

  function handleCommand(value) {
    const command = normalizeCommand(value);
    if (SHADOW_ALIASES.has(command)) {
      toggleShadow();
      return true;
    }
    if (FOCUS_ALIASES.has(command)) {
      toggleFocus();
      return true;
    }
    return false;
  }

  function bindEvents() {
    if (bound) return;
    bound = true;
    const shadowBtn = document.getElementById("btn-shadow-toggle");
    const focusBtn = document.getElementById("btn-focus-toggle");
    if (shadowBtn) shadowBtn.addEventListener("click", toggleShadow);
    if (focusBtn) focusBtn.addEventListener("click", toggleFocus);
    const timerStop = document.getElementById("btn-stop-focus");
    if (timerStop) timerStop.addEventListener("click", function () { setFocus(false); });
    const form = document.getElementById("sanctum-command-form");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        const input = document.getElementById("sanctum-command-input");
        if (input) handleCommand(input.value);
      });
    }
  }

  function init() {
    bindEvents();
    applyVisualState();
  }

  return {
    init,
    isShadow,
    isFocus,
    shouldSeal,
    getDefaultSites,
    setShadow,
    toggleShadow,
    setFocus,
    toggleFocus,
    handleCommand,
    matchesCommand,
    applyVisualState,
    normalizeCommand,
    FOCUS_ALLOWED,
    DEFAULT_SHADOW_SITES
  };
});
