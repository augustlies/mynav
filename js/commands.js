/**
 * Module: A1 command deck for the folio search bar (js/commands.js)
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavCommands = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  let input = null;
  let panel = null;
  let commands = [];
  let filtered = [];
  let activeIndex = 0;
  let bound = false;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function notify(title, subtitle, icon) {
    if (window.NavShortcuts && window.NavShortcuts.showToast) {
      window.NavShortcuts.showToast(title, subtitle || "", icon || "✦");
    }
  }

  function downloadJson(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // Batch 2：按需加载模块的命令先经 NavLazy 载入，再执行。
  function withModule(name, fn) {
    if (window.NavLazy && typeof window.NavLazy.run === "function") return window.NavLazy.run(name, fn);
    return Promise.resolve(fn());
  }

  function resetInput() {
    close();
    if (!input) return;
    input.value = "";
    input.setAttribute("aria-expanded", "false");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function executeExport() {
    const base = window.NavOverrides && typeof window.NavOverrides.getLedgerExport === "function"
      ? window.NavOverrides.getLedgerExport()
      : (window.NavOverrides && typeof window.NavOverrides.exportBackupObject === "function"
        ? window.NavOverrides.exportBackupObject()
        : { app: "mynav" });
    const payload = Object.assign({}, base, {
      app: "mynav",
      version: 2,
      exportedAt: new Date().toISOString(),
      ledger: window.NavLedger ? window.NavLedger.getAll() : null,
      sites: window.NavOverrides && typeof window.NavOverrides.getAllMergedSites === "function"
        ? window.NavOverrides.getAllMergedSites(true)
        : (window.NAV_DATA ? window.NAV_DATA.sites : [])
    });
    const today = new Date();
    const date = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    ].join("-");
    downloadJson(payload, "mynav-ledger-" + date + ".json");
    notify("全馆 JSON 与借阅账本已导出", "备份文件已下载", "💾");
  }

  function buildCommands() {
    return [
      {
        id: "theme",
        command: "/theme",
        label: "切换观星台 / 日晷",
        hint: "Theme",
        run: function () {
          if (!window.NavTheme) return;
          const next = window.NavTheme.getCurrent() === "dark" ? "light" : "dark";
          window.NavTheme.setMode(next);
          notify(next === "dark" ? "已转入观星台" : "已转入日晷阅览室", "Theme", next === "dark" ? "☾" : "☼");
        }
      },
      {
        id: "random",
        command: "/random",
        label: "今日开卷 · 随机寻星",
        hint: "Serendipity",
        drawer: { group: "find", order: 20, icon: "✦", title: "今日开卷", desc: "从全馆随机抽一卷，冷门书优先", key: "R", id: "btn-random-open", selfBound: true },
        run: function () {
          if (window.NavApp && typeof window.NavApp.openRandom === "function") {
            window.NavApp.openRandom();
          }
        }
      },
      {
        id: "export",
        command: "/export",
        label: "导出全馆 JSON + 借阅账本",
        hint: "Backup",
        run: executeExport
      },
      {
        id: "clear-dust",
        command: "/clear-dust",
        label: "重置全馆蒙尘状态",
        hint: "Dusting",
        run: function () {
          if (!window.NavLedger) return;
          window.NavLedger.clearDust();
          if (window.NavApp && window.NavApp.refresh) window.NavApp.refresh();
          notify("蒙尘已拂去", "所有藏书恢复清晰", "✦");
        }
      },
      {
        id: "uncatalogued",
        command: "/uncatalogued",
        label: "打开待编目匣 · 暗星带",
        hint: "Uncatalogued",
        drawer: { group: "collect", order: 10, icon: "⌘", title: "待编目匣", desc: "暂存还没归类的候选网址", key: "U", id: "btn-uncatalogued-entry", selfBound: true, badge: "<span id=\"uncatalogued-entry-count\">00</span>" },
        run: function () {
          if (window.NavUncatalogued && typeof window.NavUncatalogued.open === "function") {
            window.NavUncatalogued.open();
          } else if (window.NavLazy && typeof window.NavLazy.run === "function") {
            window.NavLazy.run("uncatalogued", function (mod) { mod.open(); });
          }
        }
      },
      {
        id: "snippets",
        command: "/snippets",
        label: "打开活字秘卷匣",
        hint: "Snippets",
        drawer: { group: "collect", order: 30, icon: "📜", title: "活字秘卷", desc: "常用 Prompt 与脚本片段，一键复制", key: "S", id: "btn-snippets-entry", selfBound: true },
        run: function () {
          withModule("snippets", function () {
            if (window.NavSnippets && typeof window.NavSnippets.open === "function") window.NavSnippets.open();
          });
        }
      },
      {
        id: "shadow",
        command: "/shadow",
        label: "切换暗月密室 · 里世界",
        hint: "Shadow Moon",
        drawer: { group: "hall", order: 10, icon: "☾", title: "暗月", desc: "切换暗月密室 · 里世界书架", key: "/shadow", id: "btn-shadow-toggle", selfBound: true },
        run: function () {
          if (window.NavSanctum && typeof window.NavSanctum.toggleShadow === "function") {
            window.NavSanctum.toggleShadow();
          }
        }
      },
      {
        id: "focus",
        command: "/focus",
        label: "切换考场沉浸结界",
        hint: "Focus Lock",
        drawer: { group: "hall", order: 20, icon: "⌛", title: "考场结界", desc: "封住娱乐书卷，专心研习", key: "/focus", id: "btn-focus-toggle", selfBound: true },
        run: function () {
          if (window.NavSanctum && typeof window.NavSanctum.toggleFocus === "function") {
            window.NavSanctum.toggleFocus();
          }
        }
      },
      {
        id: "tools",
        command: "/tools",
        label: "拉开黄铜工具尺 · 炼金实验台",
        hint: "Brass Instruments",
        drawer: { group: "collect", order: 40, icon: "📐", title: "黄铜工具尺", desc: "罗盘探测 · 编解码转盘 · 时间戳刻漏", key: "T", id: "btn-brass-tools-entry", selfBound: true },
        run: function () {
          withModule("brass", function () {
            if (window.NavBrassTools && typeof window.NavBrassTools.open === "function") window.NavBrassTools.open("compass");
          });
        }
      },
      {
        id: "graph",
        command: "/graph",
        label: "展开穹顶引力星图",
        hint: "Knowledge Graph",
        drawer: { group: "find", order: 10, icon: "📖", title: "书本目录 ⇄ 穹顶星图", desc: "在卡片目录与知识关系星图之间切换", key: "V", options: [{ id: "btn-catalog-view", label: "书本目录", icon: "📖", attrs: { "data-archive-view": "grid", "aria-pressed": "true" }, cls: "folio-view-btn is-active" }, { id: "btn-star-map-view", label: "穹顶星图", icon: "🌌", attrs: { "data-archive-view": "star-map", "aria-pressed": "false" }, cls: "folio-view-btn" }] },
        run: function () {
          if (window.NavApp && typeof window.NavApp.setArchiveView === "function") {
            window.NavApp.setArchiveView("star-map");
            notify("已展开穹顶星图", "拖拽星体 · 双击调阅 · G 返回目录", "🌌");
          }
        }
      },
      {
        id: "ask",
        command: "/ask",
        label: "司天监荐书顾问 · 懂全馆藏书的 RAG",
        hint: "Librarian RAG",
        run: function () {
          const inputEl = document.getElementById("archive-search-input");
          if (!inputEl) return;
          inputEl.focus();
          inputEl.value = "? ";
          inputEl.dispatchEvent(new Event("input", { bubbles: true }));
          notify("司天监已就位", "在 ? 之后写下所问，回车由馆长批阅全馆目录", "🔭");
        }
      },
      {
        id: "exec",
        command: "/exec",
        label: "司天监就地处决 · 原地羊皮纸执行",
        hint: "In-Place Execution",
        run: function () {
          const inputEl = document.getElementById("archive-search-input");
          if (!inputEl) return;
          inputEl.focus();
          inputEl.value = "! ";
          inputEl.dispatchEvent(new Event("input", { bubbles: true }));
          notify("司天监已就位", "在 ! 之后写下轻任务，回车就地作答，不跳转外部网页", "⚡");
        }
      },
      {
        id: "ai-config",
        command: "/ai-config",
        label: "配置司天监密钥（Base URL / Key / Model）",
        hint: "Librarian Secret",
        run: function () {
          withModule("librarian", function () {
            if (window.NavLibrarian && typeof window.NavLibrarian.openConfig === "function") {
              window.NavLibrarian.openConfig();
              notify("司天监密钥", "密钥仅保存在本机，绝不上传第三方", "⚙️");
            }
          });
        }
      },
      {
        id: "ping",
        command: "/ping",
        label: "巡检星轨 · 探测全馆连通性与延迟",
        hint: "Star Probe",
        run: function (options) {
          // `/ping sandbox` exercises the deterministic drill so automated
          // runs never fan out into 36 cross-origin requests.
          const mock = Boolean(options && options.mock);
          if (window.NavTelemetry && typeof window.NavTelemetry.probeAll === "function") {
            window.NavTelemetry.probeAll({ mock: mock });
          } else if (window.NavLazy && typeof window.NavLazy.run === "function") {
            // Batch 3：探针改为首屏后载入；万一还没到，先载入再巡检。
            window.NavLazy.run("probe", function () {
              if (window.NavApp && typeof window.NavApp.initBootModules === "function") window.NavApp.initBootModules();
              if (window.NavTelemetry && typeof window.NavTelemetry.probeAll === "function") window.NavTelemetry.probeAll({ mock: mock });
            });
          }
        }
      },
      // Phase 4B · D5 网页琥珀
      {
        id: "amber",
        code: "D5",
        command: "/amber",
        label: "调阅网页琥珀拓片 · 防失联保险箱",
        hint: "Amber Rubbing",
        run: function () {
          withModule("amber", function () {
            if (window.NavAmber && typeof window.NavAmber.open === "function") window.NavAmber.open();
          });
        }
      },
      // Phase 4B · A6 & C5 飞鸽传书
      {
        id: "ingest",
        code: "C5",
        command: "/ingest",
        label: "飞鸽传书 · 盖章入馆小书签",
        hint: "Bookmarklet",
        drawer: { group: "collect", order: 20, icon: "🕊️", title: "盖章入馆小书签", desc: "把小书签拖到书签栏，任意网页一键送回本馆", key: "", id: "btn-courier-entry", selfBound: true },
        run: function () {
          if (window.NavHall && typeof window.NavHall.openIngest === "function") {
            window.NavHall.openIngest();
          } else {
            withModule("courier", function () {
              if (window.NavCourier && typeof window.NavCourier.open === "function") window.NavCourier.open();
            });
          }
        }
      },
      {
        id: "notion",
        code: "A6",
        command: "/notion",
        label: "Notion 典藏同步桥 · CSV / JSON 双向",
        hint: "Notion Bridge",
        run: function () {
          if (window.NavHall && typeof window.NavHall.openSync === "function") {
            window.NavHall.openSync("notion");
          } else if (window.NavCourier && typeof window.NavCourier.open === "function") {
            window.NavCourier.open();
          }
        }
      },
      // Batch 2 · 馆务抽屉专用条目（同一份注册表同时生成 / 命令与抽屉项）
      {
        id: "almanac",
        command: "/almanac",
        label: "展开星轨编年 · 借阅时光回溯",
        hint: "Almanac",
        drawer: { group: "find", order: 30, icon: "🗓️", title: "星轨编年", desc: "按日回看借阅轨迹，筛出近 7 / 30 日与尘封往昔", key: "", id: "btn-almanac-jump", selfBound: true },
        run: function () {
          if (window.NavApp && typeof window.NavApp.openAlmanac === "function") window.NavApp.openAlmanac();
        }
      },
      {
        id: "favorites",
        command: "/favorites",
        label: "只看私人典藏",
        hint: "Favorites",
        drawer: { group: "find", order: 40, icon: "★", title: "私人典藏 / 常驻案头", desc: "只看收藏的书，或近 7 天常翻的书", key: "", options: [{ label: "私人典藏", icon: "★", attrs: { "data-search-cat": "favorites" }, cls: "search-hook-btn" }, { label: "常驻案头", icon: "🔥", attrs: { "data-search-cat": "frequent" }, cls: "search-hook-btn" }] },
        run: function () {
          if (window.NavApp && typeof window.NavApp.switchCategory === "function") window.NavApp.switchCategory("favorites");
        }
      },
      {
        id: "frequent",
        command: "/frequent",
        label: "查看近 7 天常驻案头",
        hint: "Frequent",
        run: function () {
          if (window.NavApp && typeof window.NavApp.switchCategory === "function") window.NavApp.switchCategory("frequent");
        }
      },
      {
        id: "stars",
        command: "/stars",
        label: "星群连珠 · 一组书签并发开卷",
        hint: "Constellations",
        drawer: { group: "find", order: 50, icon: "✧", title: "星群连珠", desc: "悬停高亮一组书签，点击同时打开", key: "", slot: "constellation-rail" },
        run: function () {
          if (window.NavHall && typeof window.NavHall.open === "function") window.NavHall.open({ focus: "#constellation-rail button" });
        }
      },
      {
        id: "arrange",
        command: "/arrange",
        label: "整理书架 · 拖动调整卡片顺序",
        hint: "Arrange",
        drawer: { group: "hall", order: 30, icon: "✥", title: "整理排序", desc: "拖动或用方向键调整卡片顺序", key: "", id: "btn-arrange-toggle", selfBound: true },
        run: function () {
          const btn = document.getElementById("btn-arrange-toggle");
          if (btn) btn.click();
        }
      },
      {
        id: "sync",
        command: "/sync",
        label: "同步与备份 · 云同步 / Notion / 导出",
        hint: "Sync & Backup",
        drawer: { group: "hall", order: 40, icon: "☁", title: "同步与备份", desc: "云同步 · Notion CSV/JSON · 导出 data.js", key: "", id: "btn-hall-sync" },
        run: function () {
          if (window.NavHall && typeof window.NavHall.openSync === "function") window.NavHall.openSync("cloud");
        }
      },
      {
        id: "help",
        command: "/help",
        label: "快捷键指南",
        hint: "Shortcuts",
        drawer: { group: "hall", order: 50, icon: "⌨", title: "快捷键指南", desc: "全站键盘漫游一览", key: "?", id: "btn-shortcuts-toggle", selfBound: true },
        run: function () {
          const btn = document.getElementById("btn-shortcuts-toggle");
          if (btn) btn.click();
        }
      }
    ];
  }

  function render(value) {
    if (!panel) return;
    const raw = String(value || "").trimStart();
    const prefix = raw.charAt(0);
    if (prefix !== "/" && prefix !== ">") {
      close();
      return;
    }
    // These are execution aliases rather than deck entries. Enter must
    // reach app.js's central router, which checks the secret probe first.
    if (window.NavSanctum && typeof window.NavSanctum.matchesCommand === "function" &&
      window.NavSanctum.matchesCommand(raw)) {
      close();
      return;
    }
    // Phase 4A · D1：`?` / `!` 前缀由司天监接管，命令面板保持收卷。
    if (window.NavLibrarian && typeof window.NavLibrarian.isLibrarianQuery === "function" &&
      window.NavLibrarian.isLibrarianQuery(raw)) {
      close();
      return;
    }
    // Filter on the command token only, so trailing arguments
    // (`/ping sandbox`) still resolve to their command.
    const query = raw.slice(1).trim().toLowerCase().split(/\s+/)[0] || "";
    filtered = commands.filter(function (item) {
      return item.command.slice(1).toLowerCase().startsWith(query);
    });
    activeIndex = Math.min(Math.max(activeIndex, 0), Math.max(0, filtered.length - 1));

    if (filtered.length === 0) {
      panel.innerHTML = "<div class=\"folio-command-empty\">未寻得此命令 · 输入 / 查阅全部</div>";
    } else {
      panel.innerHTML = filtered.map(function (item, index) {
        return [
          "<button type=\"button\" class=\"folio-command-item",
          index === activeIndex ? " is-active" : "",
          "\" data-command-index=\"", index, "\" role=\"option\" aria-selected=\"",
          index === activeIndex ? "true" : "false", "\">",
          "<span class=\"command-sigil\">", prefix, "</span>",
          "<span class=\"command-name\">", escapeHtml(item.command.slice(1)), "</span>",
          "<span class=\"command-label\">", escapeHtml(item.label), "</span>",
          "<span class=\"command-hint\">", escapeHtml(item.hint), "</span>",
          "</button>"
        ].join("");
      }).join("");
    }

    panel.hidden = false;
    if (input) input.setAttribute("aria-expanded", "true");
  }

  function close() {
    if (!panel) return;
    panel.hidden = true;
    panel.innerHTML = "";
    if (input) input.setAttribute("aria-expanded", "false");
    activeIndex = 0;
    filtered = [];
  }

  function runIndex(index, options) {
    const item = filtered[index];
    if (!item) {
      notify("未寻得此命令", "输入 / 查看全部馆内命令", "ℹ");
      return;
    }
    resetInput();
    item.run(options);
  }

  // `/ping sandbox` is the only command that accepts a trailing argument.
  // It lets automated runs use the deterministic drill instead of fanning out
  // into dozens of cross-origin probes.
  function parseCommandArgs(value) {
    const raw = String(value || "").trimStart().replace(/^[/>]/, "").trim();
    const parts = raw.split(/\s+/).filter(Boolean);
    const command = (parts[0] || "").toLowerCase();
    if (command === "ping" && parts.slice(1).includes("sandbox")) {
      return { mock: true };
    }
    return {};
  }

  function handleKeydown(event) {
    if (!input || !isCommandInput(input.value)) return;
    if (window.NavSanctum && typeof window.NavSanctum.matchesCommand === "function" &&
      window.NavSanctum.matchesCommand(input.value)) {
      return;
    }
    if (event.isComposing || event.keyCode === 229) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      if (filtered.length) {
        activeIndex = (activeIndex + 1) % filtered.length;
        render(input.value);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      if (filtered.length) {
        activeIndex = (activeIndex - 1 + filtered.length) % filtered.length;
        render(input.value);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
      // Shift+Enter always leaves the command deck and hands the text to
      // the active external search engine.
      if (event.shiftKey) {
        const query = input.value.trim();
        resetInput();
        if (query && window.NavEngine && typeof window.NavEngine.searchExternal === "function") {
          window.NavEngine.searchExternal(query);
        }
        return;
      }
      runIndex(activeIndex, parseCommandArgs(input.value));
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      resetInput();
    }
  }

  function init() {
    if (bound) return;
    input = document.getElementById("archive-search-input");
    panel = document.getElementById("folio-command-panel");
    if (!input || !panel) return;
    commands = getRegistry();
    bound = true;

    input.addEventListener("keydown", handleKeydown);
    panel.addEventListener("pointerdown", function (event) {
      event.preventDefault();
    });
    panel.addEventListener("click", function (event) {
      const button = event.target.closest("[data-command-index]");
      if (!button) return;
      runIndex(Number(button.getAttribute("data-command-index")), parseCommandArgs(input.value));
    });
  }

  function isCommandInput(value) {
    const raw = String(value || "").trimStart();
    return raw.startsWith("/") || raw.startsWith(">");
  }

  // Batch 2：/ 命令与馆务抽屉共用这一份注册表。
  let registryCache = null;
  function getRegistry() {
    if (!registryCache) registryCache = buildCommands();
    return registryCache;
  }

  return {
    init,
    render,
    close,
    isCommandInput,
    getRegistry,
    run: function (id, options) {
      const item = getRegistry().find(function (entry) { return entry.id === id; });
      if (item) item.run(options);
      return Boolean(item);
    }
  };
});
