/**
 * 模块：典雅双色主题管理 (js/theme.js)
 * 支持暖象牙白（浅色）与炭黑书籍（深色）平滑切换，默认遵从系统偏好
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./storage.js"));
  } else {
    root.NavTheme = factory(root.NavStorage);
  }
})(typeof self !== "undefined" ? self : this, function (NavStorage) {
  "use strict";

  let currentTheme = "light";
  let themeToggleBtn = null;

  function getSystemPreference() {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  }

  function applyTheme(theme, save = true) {
    currentTheme = theme;
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
    if (save && NavStorage) {
      NavStorage.set(NavStorage.KEYS.THEME, theme);
    }
    updateButtonUI();
  }

  function updateButtonUI() {
    if (!themeToggleBtn) return;
    const isDark = currentTheme === "dark";
    const iconSpan = themeToggleBtn.querySelector(".theme-icon");
    const textSpan = themeToggleBtn.querySelector(".theme-label");

    if (iconSpan) {
      iconSpan.textContent = isDark ? "☼" : "☾";
    }
    if (textSpan) {
      textSpan.textContent = isDark ? "浅色" : "深色";
    }
    themeToggleBtn.setAttribute(
      "aria-label",
      isDark ? "切换为暖白浅色主题" : "切换为炭黑深色主题"
    );
    themeToggleBtn.setAttribute("title", isDark ? "切换为浅色主题" : "切换为深色主题");
  }

  return {
    init(btnElement) {
      if (btnElement) {
        themeToggleBtn = btnElement;
        themeToggleBtn.addEventListener("click", () => this.toggle());
      }

      // 优先读取用户已保存的主题偏好，其次使用操作系统偏好
      const saved = NavStorage ? NavStorage.get(NavStorage.KEYS.THEME) : null;
      const initial = saved || getSystemPreference();
      applyTheme(initial, false);

      // 监听系统主题变化（若用户尚未手动锁定偏好）
      if (typeof window !== "undefined" && window.matchMedia) {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
          const userSaved = NavStorage ? NavStorage.get(NavStorage.KEYS.THEME) : null;
          if (!userSaved) {
            applyTheme(e.matches ? "dark" : "light", false);
          }
        });
      }
    },

    toggle() {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      applyTheme(nextTheme, true);
      return nextTheme;
    },

    getCurrent() {
      return currentTheme;
    }
  };
});
