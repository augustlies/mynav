/**
 * 模块：搜索引擎切换器 (js/engine.js)
 * 职责：
 * 1. 管理默认 Google 搜索、站内书目检索与 GitHub 快捷检索配置
 * 2. 无论当前引擎为何，输入始终驱动馆内实时筛选
 * 3. Enter 在唯一命中时开卷；否则或 Shift+Enter 跳转当前外部引擎
 * 4. 防中文输入法回车误触 (e.isComposing / compositionstart / keyCode: 229)
 * 5. 输入框内按 Tab 循环切换引擎，placeholder 动态更新
 * 6. 本地持久化记住用户引擎选择 (localStorage: mynav_search_engine_v2)
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STORAGE_KEY = "mynav_search_engine_v2";
  const DEFAULT_ENGINE = "google";

  // 搜索引擎配置列表 (默认 Google，支持站内书目与 GitHub)
  const ENGINES = [
    {
      id: "google",
      name: "Google",
      placeholder: "馆内实时检索，/ 调出命令，⇧Enter 全网 Google... (Tab 切换引擎)",
      url: "https://www.google.com/search?q=关键词"
    },
    {
      id: "site",
      name: "站内",
      placeholder: "检索书名、简介、标签或域名，/ 调出馆内命令...",
      url: null
    },
    {
      id: "github",
      name: "GitHub",
      placeholder: "馆内实时检索，/ 调出命令，⇧Enter 全网 GitHub... (Tab 切换引擎)",
      url: "https://github.com/search?q=关键词&type=repositories"
    },
    {
      id: "constellation",
      name: "✦ 群星会诊",
      placeholder: "馆内实时检索；⇧Enter 同时投射 Google / GitHub / Bing...",
      url: null,
      multicast: true
    }
  ];

  let currentEngineId = DEFAULT_ENGINE;
  let selectEl = null;
  let pickerEl = null;
  let searchInput = null;
  let isComposing = false;

  function getEngineById(id) {
    return ENGINES.find(e => e.id === id) || ENGINES[0];
  }

  function getEnginePlaceholder(engine) {
    if (engine.id === "site") {
      return engine.placeholder || "检索书名、简介、标签或域名，/ 调出馆内命令...";
    }
    return `馆内实时检索，/ 调出命令，⇧Enter 全网 ${engine.name}... (Tab 切换引擎)`;
  }

  function isSiteSearch() {
    return currentEngineId === "site";
  }

  function getCurrent() {
    return getEngineById(currentEngineId);
  }

  // 切换搜索引擎
  function setEngine(engineId, options = {}) {
    const prevEngineId = currentEngineId;
    const targetEngine = getEngineById(engineId);
    currentEngineId = targetEngine.id;

    if (!selectEl) selectEl = document.getElementById("search-engine-select");
    if (!pickerEl) pickerEl = document.getElementById("search-engine-picker");
    if (!searchInput) searchInput = document.getElementById("archive-search-input");

    if (selectEl && selectEl.value !== currentEngineId) {
      selectEl.value = currentEngineId;
    }

    if (pickerEl) {
      pickerEl.classList.toggle("is-external", currentEngineId !== "site");
    }

    if (searchInput) {
      searchInput.setAttribute("placeholder", getEnginePlaceholder(targetEngine));
    }

    // 持久化存储
    try {
      localStorage.setItem(STORAGE_KEY, currentEngineId);
      localStorage.setItem("mynav_search_engine", currentEngineId);
    } catch (e) {}

    // 处理已输入文字与站内筛选的联动。文字本身不应驱动筛选状态，
    // app.js 的 input 监听会维护 state.searchQuery。
    if (options.userInitiated && searchInput) {
      const currentText = searchInput.value;

      if (prevEngineId === "site" && currentEngineId !== "site") {
        // 从站内切到外部：保留文字与当前馆内筛选结果，以便继续编辑。
        if (currentText.trim().length > 0) {
          searchInput.dispatchEvent(new Event("input", { bubbles: true }));
          const clearBtn = document.getElementById("btn-clear-search");
          if (clearBtn) clearBtn.style.display = "block";
        }
      } else if (prevEngineId !== "site" && currentEngineId === "site") {
        // 从外部切回站内：用当前文字重新触发站内筛选
        if (currentText.trim().length > 0) {
          searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }

      if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
        const tip = currentEngineId === "site"
          ? "实时检索馆藏书目；唯一命中按 Enter 开卷"
          : `馆内实时过滤；Shift+Enter 跳转 ${targetEngine.name}`;
        window.NavShortcuts.showToast(`搜索引擎：${targetEngine.name}`, tip, "🔍");
      }
    }
  }

  function searchExternal(value) {
    const val = String(value || "").trim();
    if (!val) {
      if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
        window.NavShortcuts.showToast("请输入搜索关键词", "输入普通检索词后按 Shift+Enter", "ℹ");
      }
      return false;
    }

    const engine = getEngineById(currentEngineId);
    if (engine && engine.id === "constellation") {
      if (window.NavConstellations && typeof window.NavConstellations.multicast === "function") {
        return window.NavConstellations.multicast(val);
      }
      if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
        window.NavShortcuts.showToast("群星会诊尚未就绪", "请稍后重试", "ℹ");
      }
      return false;
    }
    if (!engine || !engine.url) {
      if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
        window.NavShortcuts.showToast("站内模式不跳外网", "Tab 切换到 Google 或 GitHub", "ℹ");
      }
      return false;
    }

    const targetUrl = engine.url.replace("关键词", encodeURIComponent(val));
    window.open(targetUrl, "_blank", "noopener,noreferrer");
    if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
      window.NavShortcuts.showToast(`已通过 ${engine.name} 搜索`, val, "↗");
    }
    return true;
  }

  function multicast(value) {
    if (window.NavConstellations && typeof window.NavConstellations.multicast === "function") {
      return window.NavConstellations.multicast(value);
    }
    return false;
  }

  // 循环切换下一个/上一个引擎
  function cycleNext() {
    const currentIndex = ENGINES.findIndex(e => e.id === currentEngineId);
    const nextIndex = (currentIndex + 1) % ENGINES.length;
    setEngine(ENGINES[nextIndex].id, { userInitiated: true });
    if (searchInput) searchInput.focus();
  }

  function cyclePrev() {
    const currentIndex = ENGINES.findIndex(e => e.id === currentEngineId);
    const prevIndex = (currentIndex - 1 + ENGINES.length) % ENGINES.length;
    setEngine(ENGINES[prevIndex].id, { userInitiated: true });
    if (searchInput) searchInput.focus();
  }

  // 初始化 DOM 与捕获阶段监听
  function init() {
    selectEl = document.getElementById("search-engine-select");
    pickerEl = document.getElementById("search-engine-picker");
    searchInput = document.getElementById("archive-search-input");

    // 填充下拉选项（保证与 ENGINES 数组严格同步）
    if (selectEl) {
      selectEl.innerHTML = ENGINES.map(
        e => `<option value="${e.id}">${e.name}</option>`
      ).join("");

      selectEl.addEventListener("change", function (e) {
        setEngine(e.target.value, { userInitiated: true });
        if (searchInput) searchInput.focus();
      });
    }

    if (searchInput) {
      searchInput.addEventListener("compositionstart", function () {
        isComposing = true;
      });
      searchInput.addEventListener("compositionend", function () {
        isComposing = false;
      });
    }

    // 读取持久化配置（默认 Google，已选选项优先且校验存在性）
    let savedEngine = DEFAULT_ENGINE;
    try {
      const v2 = localStorage.getItem(STORAGE_KEY);
      if (v2 && ENGINES.some(e => e.id === v2)) {
        savedEngine = v2;
      }
    } catch (e) {}
    setEngine(savedEngine, { userInitiated: false });

    // 捕获阶段只接管 Tab；Enter 交给 app.js 的馆内路由，
    // 从而保留隐藏口令、唯一命中开卷与 Shift+Enter 外搜。
    document.addEventListener(
      "keydown",
      function (e) {
        if (e.target && e.target.id === "archive-search-input") {
          // 1. Tab 键：循环切换搜索引擎
          if (e.key === "Tab") {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.shiftKey) {
              cyclePrev();
            } else {
              cycleNext();
            }
            return;
          }

          // Enter 由馆内路由处理：唯一命中开卷，否则按当前引擎外搜。
        }
      },
      true // 捕获阶段
    );
  }

  // 页面加载完成后自启动
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  return {
    ENGINES,
    init,
    isSiteSearch,
    getCurrent,
    setEngine,
    cycleNext,
    cyclePrev,
    searchExternal,
    multicast
  };
});
