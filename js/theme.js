/**
 * 模块：典雅双色与时序自适应主题管理 (js/theme.js)
 * 支持三态流转：浅色象牙纸 ☼ ➔ 炭黑夜读室 ☾ ➔ 自然时序自适应 ◐
 * 自动时序遵循自然光照作息（06:00 ~ 18:00 为白昼，18:00 ~ 06:00 为夜间），定时心跳平滑过渡
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./storage.js"));
  } else {
    root.NavTheme = factory(root.NavStorage);
  }
})(typeof self !== "undefined" ? self : this, function (NavStorage) {
  "use strict";

  const MODES = {
    LIGHT: "light",
    DARK: "dark",
    AUTO: "auto"
  };

  let currentMode = MODES.AUTO;
  let effectiveTheme = "light";
  let themeToggleBtn = null;
  let autoTimer = null;

  function resolveAutoTheme(customHour) {
    const hour = typeof customHour === "number" ? customHour : new Date().getHours();
    return (hour >= 6 && hour < 18) ? "light" : "dark";
  }

  function applyMode(mode, save = true) {
    if (mode !== MODES.LIGHT && mode !== MODES.DARK && mode !== MODES.AUTO) {
      mode = MODES.AUTO;
    }

    currentMode = mode;
    effectiveTheme = mode === MODES.AUTO ? resolveAutoTheme() : mode;

    if (typeof document !== "undefined") {
      const rootEl = document.documentElement;
      if (rootEl.getAttribute("data-theme") !== effectiveTheme) rootEl.setAttribute("data-theme", effectiveTheme);
      if (rootEl.getAttribute("data-theme-mode") !== currentMode) rootEl.setAttribute("data-theme-mode", currentMode);
    }

    if (save && NavStorage) {
      NavStorage.set(NavStorage.KEYS.THEME, currentMode);
    }

    updateButtonUI();
  }

  function updateButtonUI() {
    if (!themeToggleBtn) return;
    const iconSpan = themeToggleBtn.querySelector(".theme-icon");
    const textSpan = themeToggleBtn.querySelector(".theme-label");

    if (currentMode === MODES.LIGHT) {
      if (iconSpan) iconSpan.textContent = "☼";
      if (textSpan) textSpan.textContent = "浅色";
      themeToggleBtn.setAttribute("aria-label", "主题模式：浅色纸张（点击切换为炭黑深色）");
      themeToggleBtn.setAttribute("title", "主题：浅色纸张（点击切换深色）");
    } else if (currentMode === MODES.DARK) {
      if (iconSpan) iconSpan.textContent = "☾";
      if (textSpan) textSpan.textContent = "深色";
      themeToggleBtn.setAttribute("aria-label", "主题模式：炭黑夜读（点击切换为自动时序）");
      themeToggleBtn.setAttribute("title", "主题：炭黑夜读（点击切换自动时序）");
    } else {
      // AUTO 自动时序
      const periodName = effectiveTheme === "light" ? "白昼暖白" : "夜间炭黑";
      if (iconSpan) iconSpan.textContent = "◐";
      if (textSpan) textSpan.textContent = "自动";
      themeToggleBtn.setAttribute(
        "aria-label",
        `主题模式：自动时序（当前呈现${periodName}，点击切换为浅色）`
      );
      themeToggleBtn.setAttribute(
        "title",
        `主题：自动时序（当前${periodName}，点击切换浅色）`
      );
    }
  }

  function startAutoTick() {
    if (autoTimer) clearInterval(autoTimer);
    if (typeof window === "undefined") return;

    // 每 60 秒校准一次自然时序变化（例如早 6 点或晚 18 点交界）
    autoTimer = setInterval(() => {
      if (currentMode === MODES.AUTO) {
        const nextEffective = resolveAutoTheme();
        if (nextEffective !== effectiveTheme) {
          applyMode(MODES.AUTO, false);
        }
      }
    }, 60000);
  }

  return {
    MODES,

    init(btnElement) {
      if (btnElement) {
        themeToggleBtn = btnElement;
        themeToggleBtn.addEventListener("click", () => this.toggle());
      }

      // 优先读取持久化配置；若无配置则默认开启自然时序 AUTO
      const saved = NavStorage ? NavStorage.get(NavStorage.KEYS.THEME) : null;
      const initial = (saved === "light" || saved === "dark" || saved === "auto") ? saved : MODES.AUTO;
      applyMode(initial, false);

      startAutoTick();

      // 初始化可选尼尔工程纸张底色偏好
      if (NavStorage && typeof document !== "undefined") {
        const isNier = NavStorage.get(NavStorage.KEYS.NIER_BG, false);
        if (isNier) {
          document.documentElement.setAttribute("data-nier-bg", "true");
        }
      }

      // 监听系统偏好变化（若处于 AUTO 模式时提供备用参考）
      if (typeof window !== "undefined" && window.matchMedia) {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
          if (currentMode === MODES.AUTO) {
            applyMode(MODES.AUTO, false);
          }
        });
      }
    },

    toggleNierBg() {
      const isCurrently = typeof document !== "undefined" && document.documentElement.getAttribute("data-nier-bg") === "true";
      const next = !isCurrently;
      if (typeof document !== "undefined") {
        if (next) {
          document.documentElement.setAttribute("data-nier-bg", "true");
        } else {
          document.documentElement.removeAttribute("data-nier-bg");
        }
      }
      if (NavStorage) {
        NavStorage.set(NavStorage.KEYS.NIER_BG, next);
      }
      return next;
    },

    isNierBg() {
      return typeof document !== "undefined" && document.documentElement.getAttribute("data-nier-bg") === "true";
    },

    toggle() {
      let nextMode;
      if (currentMode === MODES.LIGHT) {
        nextMode = MODES.DARK;
      } else if (currentMode === MODES.DARK) {
        nextMode = MODES.AUTO;
      } else {
        nextMode = MODES.LIGHT;
      }

      applyMode(nextMode, true);
      return {
        mode: currentMode,
        theme: effectiveTheme
      };
    },

    setMode(mode) {
      applyMode(mode, true);
    },

    getMode() {
      return currentMode;
    },

    getCurrent() {
      return effectiveTheme;
    },

    resolveAutoTheme
  };
});
