/**
 * Module: Batch 2 · 「馆务」抽屉 (js/hall.js)
 *
 * 顶栏 [ ⌘ 馆务 ] → 右侧抽屉 #hall-drawer（≤640px 为底部抽屉），三组：找书 / 收书 / 馆务。
 * - 抽屉项由 js/commands.js 的同一份命令注册表生成（带 `drawer` 字段的命令），
 *   不另外维护清单；保留功能的按钮沿用原 DOM ID，由原模块自行绑定（selfBound）。
 * - 无原模块绑定的条目（同步与备份）点击时直接执行注册表里的 run()。
 * - 键盘：`.` 开合；↑↓ / Home / End 在项之间移动；Tab 焦点陷阱；Esc / 点遮罩关闭；
 *   关闭后焦点回到 #btn-hall-menu（若动作已把焦点交给新面板则不抢）。
 * - 「同步与备份」面板复用飞鸽弹窗 #courier-modal 的 sync 模式：云同步 / Notion / 导出 三个页签。
 *
 * 必须在 app.js 之前执行：抽屉里的按钮要在各模块 init() 绑定 ID 之前就位。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavHall = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const GROUPS = [
    { id: "find", title: "找书", kicker: "FIND" },
    { id: "collect", title: "收书", kicker: "COLLECT" },
    { id: "hall", title: "馆务", kicker: "HALL" }
  ];
  const OPEN_KEY = ".";

  let drawer = null;
  let backdrop = null;
  let body = null;
  let menuBtn = null;
  let isOpen = false;
  let rendered = false;
  let returnTimer = null;

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function attrsHtml(attrs) {
    if (!attrs) return "";
    return Object.keys(attrs).map(function (key) {
      return " " + key + "=\"" + escapeHtml(attrs[key]) + "\"";
    }).join("");
  }

  function ensure(name) {
    if (window.NavLazy && typeof window.NavLazy.ensure === "function") return window.NavLazy.ensure(name);
    return Promise.resolve();
  }

  function registry() {
    const list = window.NavCommands && typeof window.NavCommands.getRegistry === "function"
      ? window.NavCommands.getRegistry()
      : [];
    return list.filter(function (item) { return item && item.drawer; });
  }

  function textHtml(d) {
    return [
      "<span class=\"hall-item-icon\" aria-hidden=\"true\">", escapeHtml(d.icon), "</span>",
      "<span class=\"hall-item-text\">",
      "<span class=\"hall-item-title\">", escapeHtml(d.title),
      d.badge ? " <span class=\"hall-item-badge\">" + d.badge + "</span>" : "",
      "</span>",
      "<span class=\"hall-item-desc\">", escapeHtml(d.desc), "</span>",
      "</span>"
    ].join("");
  }

  function keyHtml(d) {
    return d.key ? "<kbd class=\"hall-item-key\" aria-hidden=\"true\">" + escapeHtml(d.key) + "</kbd>" : "<span class=\"hall-item-key is-empty\" aria-hidden=\"true\"></span>";
  }

  function itemHtml(item) {
    const d = item.drawer;
    const lazy = d.lazy ? " data-lazy=\"" + escapeHtml(d.lazy) + "\"" : "";
    if (Array.isArray(d.options) && d.options.length) {
      const opts = d.options.map(function (opt) {
        return [
          "<button type=\"button\" class=\"hall-opt ", escapeHtml(opt.cls || ""), "\"",
          opt.id ? " id=\"" + escapeHtml(opt.id) + "\"" : "",
          opt.lazy ? " data-lazy=\"" + escapeHtml(opt.lazy) + "\"" : "",
          attrsHtml(opt.attrs), " data-hall-close>",
          opt.icon ? "<span aria-hidden=\"true\">" + escapeHtml(opt.icon) + "</span>" : "",
          "<span>", escapeHtml(opt.label), "</span></button>"
        ].join("");
      }).join("");
      return [
        "<li class=\"hall-item hall-item--options\" data-hall-command=\"", escapeHtml(item.id), "\">",
        "<div class=\"hall-item-row\">", textHtml(d), keyHtml(d), "</div>",
        "<div class=\"hall-options\" role=\"group\" aria-label=\"", escapeHtml(d.title), "\">", opts, "</div>",
        "</li>"
      ].join("");
    }
    if (d.slot) {
      return [
        "<li class=\"hall-item hall-item--slot\" data-hall-command=\"", escapeHtml(item.id), "\">",
        "<div class=\"hall-item-row\">", textHtml(d), keyHtml(d), "</div>",
        "<div id=\"", escapeHtml(d.slot), "\" class=\"constellation-rail hall-slot\" aria-label=\"", escapeHtml(d.title), "\"></div>",
        "</li>"
      ].join("");
    }
    return [
      "<li class=\"hall-item\" data-hall-command=\"", escapeHtml(item.id), "\">",
      "<button type=\"button\" class=\"hall-item-btn\"",
      d.id ? " id=\"" + escapeHtml(d.id) + "\"" : "",
      lazy, attrsHtml(d.attrs),
      d.selfBound ? "" : " data-hall-run=\"" + escapeHtml(item.id) + "\"",
      " data-hall-close title=\"", escapeHtml(item.label || d.title), "\">",
      textHtml(d), keyHtml(d),
      "</button></li>"
    ].join("");
  }

  function render() {
    body = document.getElementById("hall-drawer-body");
    if (!body) return false;
    const items = registry();
    body.innerHTML = GROUPS.map(function (group) {
      const rows = items
        .filter(function (item) { return item.drawer.group === group.id; })
        .sort(function (a, b) { return (a.drawer.order || 0) - (b.drawer.order || 0); });
      if (!rows.length) return "";
      return [
        "<section class=\"hall-group\" aria-labelledby=\"hall-group-", group.id, "\">",
        "<h3 class=\"hall-group-title\" id=\"hall-group-", group.id, "\">",
        "<span class=\"hall-group-kicker\">", group.kicker, "</span>", escapeHtml(group.title),
        "</h3>",
        "<ul class=\"hall-list\" role=\"list\">", rows.map(itemHtml).join(""), "</ul>",
        "</section>"
      ].join("");
    }).join("");
    rendered = true;
    return true;
  }

  function navigable() {
    if (!drawer) return [];
    return Array.from(drawer.querySelectorAll(
      ".hall-drawer-close, .hall-item-btn, .hall-opt, .hall-slot button"
    )).filter(function (el) {
      return !el.disabled && el.offsetParent !== null;
    });
  }

  function focusFirst(selector) {
    const target = selector ? drawer.querySelector(selector) : null;
    const items = navigable().filter(function (el) { return !el.classList.contains("hall-drawer-close"); });
    const el = target || items[0];
    if (el) el.focus({ preventScroll: false });
  }

  function anyOtherModalOpen() {
    return Boolean(document.querySelector(
      ".uncatalogued-drawer:not([hidden]), .brass-workbench:not([hidden]), .courier-modal:not([hidden]), .amber-modal:not([hidden])"
    )) || document.body.classList.contains("modal-open");
  }

  function open(options) {
    if (!drawer) return false;
    if (window.NavApp && typeof window.NavApp.flushIdleBoot === "function") window.NavApp.flushIdleBoot();
    if (returnTimer) { clearTimeout(returnTimer); returnTimer = null; }
    isOpen = true;
    drawer.hidden = false;
    if (backdrop) backdrop.hidden = false;
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("hall-open");
    if (menuBtn) menuBtn.setAttribute("aria-expanded", "true");
    const focusSel = options && options.focus;
    requestAnimationFrame(function () { focusFirst(focusSel); });
    return true;
  }

  function close(options) {
    if (!drawer || !isOpen) return false;
    isOpen = false;
    drawer.hidden = true;
    if (backdrop) backdrop.hidden = true;
    drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("hall-open");
    if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
    const mode = options && options.returnFocus;
    if (mode === false) return true;
    if (mode === "auto") {
      // 动作可能已经把焦点交给新开的面板：只有焦点无处可落时才回到馆务按钮。
      returnTimer = setTimeout(function () {
        returnTimer = null;
        const active = document.activeElement;
        if (!active || active === document.body || drawer.contains(active)) {
          if (menuBtn) menuBtn.focus();
        }
      }, 80);
      return true;
    }
    if (menuBtn) menuBtn.focus();
    return true;
  }

  function toggle() {
    return isOpen ? close() : open();
  }

  function moveFocus(delta, absolute) {
    // 方向键只在抽屉项之间移动（关闭按钮留给 Tab）。
    const items = navigable().filter(function (el) { return !el.classList.contains("hall-drawer-close"); });
    if (!items.length) return;
    let index = items.indexOf(document.activeElement);
    if (absolute === "first") index = 0;
    else if (absolute === "last") index = items.length - 1;
    else index = index < 0 ? 0 : (index + delta + items.length) % items.length;
    items[index].focus();
  }

  function isEditable(target) {
    if (!target) return false;
    const tag = target.tagName ? target.tagName.toLowerCase() : "";
    return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable === true;
  }

  function onKeydown(event) {
    if (event.defaultPrevented && !isOpen) return;
    const key = event.key;
    if (!isOpen) {
      if (key !== OPEN_KEY || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditable(event.target) || anyOtherModalOpen()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      open();
      return;
    }
    if (key === "Escape" || key === OPEN_KEY) {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
      return;
    }
    if (key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (key === "Home") moveFocus(0, "first");
      else if (key === "End") moveFocus(0, "last");
      else moveFocus(key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (key === "Tab") {
      const items = navigable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!drawer.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
      event.stopImmediatePropagation();
      return;
    }
    // 抽屉里标注的单键快捷键（R / U / S / T / V / ? …）：先收起抽屉，再让按键照常生效。
    if (key.length === 1 && key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey &&
      !isEditable(event.target)) {
      close({ returnFocus: false });
    }
  }

  // ------------------------------------------------------------------------
  // 同步与备份（飞鸽弹窗 sync 模式）
  // ------------------------------------------------------------------------
  function selectSyncTab(tab) {
    const modal = document.getElementById("courier-modal");
    if (!modal) return;
    const next = tab || "cloud";
    modal.querySelectorAll("[data-courier-tab]").forEach(function (btn) {
      const active = btn.getAttribute("data-courier-tab") === next;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
      btn.tabIndex = active ? 0 : -1;
    });
    modal.querySelectorAll("[data-courier-pane]").forEach(function (pane) {
      pane.classList.toggle("is-active-pane", pane.getAttribute("data-courier-pane") === next);
    });
  }

  function openSync(tab) {
    return ensure("courier").then(function () {
      if (!window.NavCourier || typeof window.NavCourier.open !== "function") return false;
      window.NavCourier.open({ mode: "sync" });
      selectSyncTab(tab || "cloud");
      const active = document.querySelector("#courier-modal [data-courier-tab].is-active");
      if (active) active.focus();
      if ((tab || "cloud") === "cloud") ensure("cloudsync");
      return true;
    });
  }

  function openIngest() {
    return ensure("courier").then(function () {
      if (window.NavCourier && typeof window.NavCourier.open === "function") window.NavCourier.open({ mode: "ingest" });
    });
  }

  function importBackupFile(file) {
    if (!file || !window.NavOverrides || typeof window.NavOverrides.importBackupJson !== "function") return;
    const reader = new FileReader();
    reader.onload = function (evt) {
      if (!window.confirm("准备导入备份文件 “" + file.name + "”，确定要覆盖当前设备上的书目修改与偏好设置吗？")) return;
      const res = window.NavOverrides.importBackupJson(String(evt.target.result || ""));
      if (window.NavShortcuts && window.NavShortcuts.showToast) {
        window.NavShortcuts.showToast(res && res.success ? "备份恢复成功" : "备份导入失败",
          res && res.success ? "已还原全部修改与偏好" : ((res && res.error) || "文件格式不符"), res && res.success ? "✔" : "⚠");
      }
    };
    reader.readAsText(file);
  }

  function bindSyncPanel() {
    document.addEventListener("click", function (event) {
      const tabBtn = event.target.closest("[data-courier-tab]");
      if (tabBtn) {
        const tab = tabBtn.getAttribute("data-courier-tab");
        selectSyncTab(tab);
        if (tab === "cloud") ensure("cloudsync");
        return;
      }
      const action = event.target.closest("[data-sync-action]");
      if (!action) return;
      const ov = window.NavOverrides;
      switch (action.getAttribute("data-sync-action")) {
        case "export-datajs":
          if (ov && ov.downloadDataJs) ov.downloadDataJs();
          break;
        case "export-backup":
          if (ov && ov.downloadBackupJson) ov.downloadBackupJson();
          break;
        case "export-ledger":
          if (window.NavCommands && window.NavCommands.run) window.NavCommands.run("export");
          break;
        case "import-backup": {
          const input = document.getElementById("sync-import-file");
          if (input) { input.value = ""; input.click(); }
          break;
        }
        default:
          break;
      }
    });
    const fileInput = document.getElementById("sync-import-file");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        importBackupFile(fileInput.files && fileInput.files[0]);
      });
    }
    const modal = document.getElementById("courier-modal");
    if (modal) {
      modal.addEventListener("keydown", function (event) {
        const tabBtn = event.target.closest && event.target.closest("[data-courier-tab]");
        if (!tabBtn || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
        const tabs = Array.from(modal.querySelectorAll("[data-courier-tab]"));
        const index = tabs.indexOf(tabBtn);
        const next = tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
        event.preventDefault();
        event.stopPropagation();
        next.click();
        next.focus();
      });
    }
    // 待编目匣里的「飞鸽传书」小入口此前无人绑定，这里补上。
    const uncatCourier = document.getElementById("btn-courier-entry-drawer");
    if (uncatCourier) {
      uncatCourier.addEventListener("click", function () {
        if (window.NavUncatalogued && typeof window.NavUncatalogued.close === "function") window.NavUncatalogued.close();
        openIngest();
      });
    }
  }

  function init() {
    drawer = document.getElementById("hall-drawer");
    backdrop = document.getElementById("hall-drawer-backdrop");
    menuBtn = document.getElementById("btn-hall-menu");
    if (!drawer) return false;
    if (!rendered) render();

    if (menuBtn) {
      menuBtn.addEventListener("click", function () { toggle(); });
    }
    const closeBtn = document.getElementById("btn-close-hall-drawer");
    if (closeBtn) closeBtn.addEventListener("click", function () { close(); });
    if (backdrop) backdrop.addEventListener("click", function () { close(); });

    // 抽屉项：自绑定的按钮由原模块响应（目标阶段先于这里），本处只负责收起抽屉；
    // 无原模块绑定的条目执行注册表 run()。
    drawer.addEventListener("click", function (event) {
      const runBtn = event.target.closest("[data-hall-run]");
      const closer = event.target.closest("[data-hall-close], .hall-slot button");
      if (!runBtn && !closer) return;
      close({ returnFocus: "auto" });
      if (runBtn && window.NavCommands && window.NavCommands.run) {
        window.NavCommands.run(runBtn.getAttribute("data-hall-run"));
      }
    });

    window.addEventListener("keydown", onKeydown, true);
    bindSyncPanel();
    return true;
  }

  // 尽早装配：DOM 已解析完（defer 脚本），且必须早于 app.js 中各模块的按钮绑定。
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  return {
    init,
    render,
    open,
    close,
    toggle,
    isOpen: function () { return isOpen; },
    openSync,
    openIngest,
    selectSyncTab,
    OPEN_KEY
  };
});
