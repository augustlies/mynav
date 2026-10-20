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
        run: function () {
          if (window.NavUncatalogued && typeof window.NavUncatalogued.open === "function") {
            window.NavUncatalogued.open();
          }
        }
      },
      {
        id: "snippets",
        command: "/snippets",
        label: "打开活字秘卷匣",
        hint: "Snippets",
        run: function () {
          if (window.NavSnippets && typeof window.NavSnippets.open === "function") {
            window.NavSnippets.open();
          }
        }
      },
      {
        id: "shadow",
        command: "/shadow",
        label: "切换暗月密室 · 里世界",
        hint: "Shadow Moon",
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
        run: function () {
          if (window.NavSanctum && typeof window.NavSanctum.toggleFocus === "function") {
            window.NavSanctum.toggleFocus();
          }
        }
      },
      {
        id: "sound",
        command: "/sound",
        label: "开启 / 关闭白噪音天文台",
        hint: "Soundscape",
        run: function () {
          if (window.NavSoundscape && typeof window.NavSoundscape.toggle === "function") {
            window.NavSoundscape.toggle();
            notify(
              window.NavSoundscape.isActive() ? "听风 · 鸣" : "白噪音天文台已寂静",
              window.NavSoundscape.isActive() ? "深空底噪与星轨脉冲已展开" : "环境声场已收起",
              "𝄞"
            );
          }
        }
      },
      {
        id: "tools",
        command: "/tools",
        label: "拉开黄铜工具尺 · 炼金实验台",
        hint: "Brass Instruments",
        run: function () {
          if (window.NavBrassTools && typeof window.NavBrassTools.open === "function") {
            window.NavBrassTools.open("compass");
          }
        }
      },
      {
        id: "graph",
        command: "/graph",
        label: "展开穹顶引力星图",
        hint: "Knowledge Graph",
        run: function () {
          if (window.NavApp && typeof window.NavApp.setArchiveView === "function") {
            window.NavApp.setArchiveView("star-map");
            notify("已展开穹顶星图", "拖拽星体 · 双击调阅 · G 返回目录", "🌌");
          }
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
    // These two are execution aliases rather than deck entries. Enter must
    // reach app.js's central router, which checks the secret probe first.
    if (window.NavSanctum && typeof window.NavSanctum.matchesCommand === "function" &&
      window.NavSanctum.matchesCommand(raw)) {
      close();
      return;
    }
    const query = raw.slice(1).trim().toLowerCase();
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

  function runIndex(index) {
    const item = filtered[index];
    if (!item) {
      notify("未寻得此命令", "输入 / 查看全部馆内命令", "ℹ");
      return;
    }
    resetInput();
    item.run();
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
      runIndex(activeIndex);
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
    commands = buildCommands();
    bound = true;

    input.addEventListener("keydown", handleKeydown);
    panel.addEventListener("pointerdown", function (event) {
      event.preventDefault();
    });
    panel.addEventListener("click", function (event) {
      const button = event.target.closest("[data-command-index]");
      if (!button) return;
      runIndex(Number(button.getAttribute("data-command-index")));
    });
  }

  function isCommandInput(value) {
    const raw = String(value || "").trimStart();
    return raw.startsWith("/") || raw.startsWith(">");
  }

  return {
    init,
    render,
    close,
    isCommandInput
  };
});
