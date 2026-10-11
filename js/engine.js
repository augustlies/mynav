/**
 * 模块：搜索引擎切换器 (js/engine.js)
 * 职责：
 * 1. 管理默认 Google 搜索、站内书目检索与 GitHub 快捷检索配置
 * 2. 外部引擎模式下，捕获阶段拦截 input 事件防站内实时筛选
 * 3. 外部引擎模式下回车跳转（带 encodeURIComponent 与 noopener,noreferrer）
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
      placeholder: "用 Google 搜索全网，回车打开... (Tab 切换引擎)",
      url: "https://www.google.com/search?q=关键词"
    },
    {
      id: "site",
      name: "站内",
      placeholder: "检索书目名称、简介、标签或域名... (按 / 快捷聚焦)",
      url: null
    },
    {
      id: "github",
      name: "GitHub",
      placeholder: "用 GitHub 搜索全网，回车打开... (Tab 切换引擎)",
      url: "https://github.com/search?q=关键词&type=repositories"
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
      return engine.placeholder || "检索书目名称、简介、标签或域名... (按 / 快捷聚焦)";
    }
    return `用 ${engine.name} 搜索全网，回车打开... (Tab 切换引擎)`;
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

    // 处理已输入文字与站内筛选的联动
    if (options.userInitiated && searchInput) {
      const currentText = searchInput.value;

      if (prevEngineId === "site" && currentEngineId !== "site") {
        // 从站内切到外部：保留文字，但撤销站内筛选（恢复完整目录）
        if (currentText.trim().length > 0) {
          const resetBtn = document.getElementById("btn-reset-filter");
          if (resetBtn) {
            resetBtn.click();
          }
          searchInput.value = currentText;
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
        const tip = currentEngineId === "site" ? "实时检索馆藏书目" : `回车跳转 ${targetEngine.name} 搜索全网`;
        window.NavShortcuts.showToast(`搜索引擎：${targetEngine.name}`, tip, "🔍");
      }
    }
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

    // 捕获阶段拦截 input 事件：选外部引擎时阻止事件冒泡到 app.js
    document.addEventListener(
      "input",
      function (e) {
        if (e.target && e.target.id === "archive-search-input") {
          if (currentEngineId !== "site") {
            e.stopImmediatePropagation();
            // 外部引擎输入时，维护清空按钮 (✕) 的显示状态
            const clearBtn = document.getElementById("btn-clear-search");
            if (clearBtn) {
              clearBtn.style.display = e.target.value.trim().length > 0 ? "block" : "none";
            }
          }
        }
      },
      true // 捕获阶段
    );

    // 捕获阶段拦截 keydown 事件：Tab 循环切引擎、Enter 触发外部搜索、防输入法回车
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

          // 2. Enter 键：外部引擎在新标签页打开搜索结果
          if (e.key === "Enter") {
            // 中文输入法选词时的回车不要触发搜索 (多层防误触保护)
            if (e.isComposing || isComposing || e.keyCode === 229) {
              return;
            }

            // 特工暗号彩蛋拦截 (7355608 直达哪吒探针面板)
            const rawVal = (e.target.value || "").trim();
            if (rawVal === "7355608") {
              e.preventDefault();
              e.stopImmediatePropagation();
              e.target.value = "";
              const clearBtn = document.getElementById("btn-clear-search");
              if (clearBtn) clearBtn.style.display = "none";
              window.open("http://8.235.22.83:8008", "_blank");
              return;
            }

            if (currentEngineId !== "site") {
              e.preventDefault();
              e.stopImmediatePropagation();
              const val = e.target.value.trim();
              if (!val) {
                if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
                  window.NavShortcuts.showToast("请输入搜索关键词", "回车即可跳转外部搜索", "ℹ");
                }
                return;
              }

              const engine = getEngineById(currentEngineId);
              if (engine && engine.url) {
                const targetUrl = engine.url.replace("关键词", encodeURIComponent(val));
                window.open(targetUrl, "_blank", "noopener,noreferrer");
                if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
                  window.NavShortcuts.showToast(`已通过 ${engine.name} 搜索`, val, "↗");
                }
              }
            }
          }
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
    cyclePrev
  };
});
