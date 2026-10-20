/**
 * 模块：全站键盘无障碍漫游与微交互控制 (js/shortcuts.js)
 * 职责：
 * 1. 监听全局键盘事件，智能识别输入框/弹窗上下文，防止按键冲突
 * 2. 支持 Vim/期刊式快捷键：
 *    - / 或 Ctrl+K: 聚焦检索框
 *    - j / k (或 方向键上下): 顺序漫游聚焦藏书 (卡片 / 3D 书脊)
 *    - h / l (或 方向键左右): 切换分类专栏标签
 *    - Alt+1 ~ 7: 数字键直达各专栏（裸数字保留给 A2 索书号）
 *    - Enter: 翻开并访问所选藏书 (新标签页)
 *    - f: 一键收藏 / 移出私人典藏阁
 *    - e: 打开专属数字藏书票 (Ex Libris)
 *    - v: 切换网格 / 3D 藏书馆书架视图
 *    - t: 循环切换昼夜时序主题
 *    - ?: 唤出 / 关闭快捷键漫游指南
 *    - Esc: 关闭模态、退出搜索、清除高亮、退出整理模式
 * 3. 精致无障碍焦点管理与平滑视口滚动
 * 4. 典雅微印记 Toast 提示浮层系统
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavShortcuts = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 状态变量
  let focusedIndex = -1;
  let isHelpOpen = false;
  let lastActiveElement = null;
  let hooks = {
    onSearchFocus: null,
    onSearchBlur: null,
    onViewToggle: null,
    onThemeToggle: null,
    onCategorySwitch: null,
    onBookmarkToggle: null,
    onBookplateOpen: null,
    onItemOpen: null,
    getViewMode: () => "grid",
    isArrangeMode: () => false,
    getAllSites: () => []
  };

  // 检测减弱动效偏好
  function prefersReducedMotion() {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return false;
  }

  // ==========================================================================
  // 1. 微印记 Toast 提示系统 (Editorial Micro-Toasts)
  // ==========================================================================

  let toastTimer = null;

  function showToast(title, subtitle = "", icon = "✦") {
    if (typeof document === "undefined") return;
    let container = document.getElementById("editorial-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "editorial-toast-container";
      container.className = "editorial-toast-container";
      container.setAttribute("aria-live", "polite");
      container.setAttribute("aria-atomic", "true");
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = "editorial-toast";
    toast.innerHTML = `
      <span class="toast-emblem" aria-hidden="true">${escapeHtml(icon)}</span>
      <div class="toast-body">
        <strong class="toast-title">${escapeHtml(title)}</strong>
        ${subtitle ? `<span class="toast-sub">${escapeHtml(subtitle)}</span>` : ""}
      </div>
    `;

    container.appendChild(toast);

    // 自动在 2.4 秒后优雅淡出消除
    setTimeout(() => {
      toast.classList.add("toast-leaving");
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 260);
    }, 2400);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ==========================================================================
  // 2. 焦点漫游逻辑 (Item Focus Navigation)
  // ==========================================================================

  function getFocusableElements() {
    if (typeof document === "undefined") return [];
    const viewMode = hooks.getViewMode ? hooks.getViewMode() : "grid";
    const area = document.getElementById("archive-content-area");
    if (!area) return [];

    if (viewMode === "shelf") {
      return Array.from(area.querySelectorAll(".book-item"));
    }
    return Array.from(area.querySelectorAll(".entry-card"));
  }

  function clearFocus() {
    const items = getFocusableElements();
    items.forEach(el => el.classList.remove("keyboard-focused"));
    if (typeof document !== "undefined") {
      document.querySelectorAll(".book-item.is-open").forEach(b => b.classList.remove("is-open"));
    }
    focusedIndex = -1;
  }

  function getFocusedElement() {
    const items = getFocusableElements();
    if (focusedIndex >= 0 && focusedIndex < items.length) {
      return items[focusedIndex];
    }
    return null;
  }

  function getFocusedSiteId() {
    const el = getFocusedElement();
    if (!el) return null;
    return el.getAttribute("data-site-id");
  }

  function focusIndex(newIndex) {
    const items = getFocusableElements();
    if (items.length === 0) {
      focusedIndex = -1;
      return;
    }

    // 循环包裹导航 (Wrap around)
    if (newIndex < 0) {
      newIndex = items.length - 1;
    } else if (newIndex >= items.length) {
      newIndex = 0;
    }

    // 清除既往焦点
    items.forEach(el => el.classList.remove("keyboard-focused"));

    focusedIndex = newIndex;
    const target = items[focusedIndex];
    if (target) {
      target.classList.add("keyboard-focused");
      if (typeof target.scrollIntoView === "function") {
        target.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "nearest",
          inline: "nearest"
        });
      }

      // 如果是 3D 书架，同步触发便签卷卡展开
      const viewMode = hooks.getViewMode ? hooks.getViewMode() : "grid";
      if (viewMode === "shelf") {
        document.querySelectorAll(".book-item.is-open").forEach(b => b.classList.remove("is-open"));
        target.classList.add("is-open");
      }
    }
  }

  function focusNext() {
    focusIndex(focusedIndex + 1);
  }

  function focusPrev() {
    focusIndex(focusedIndex <= 0 ? getFocusableElements().length - 1 : focusedIndex - 1);
  }

  // ==========================================================================
  // 3. 快捷键指南模态 (Cheatsheet Modal Controller)
  // ==========================================================================

  function openHelp() {
    const modal = document.getElementById("shortcuts-modal");
    if (!modal) return;
    lastActiveElement = document.activeElement;
    modal.style.display = "flex";
    document.body.classList.add("modal-open");
    isHelpOpen = true;

    const closeBtn = document.getElementById("btn-close-shortcuts");
    if (closeBtn) closeBtn.focus();
  }

  function closeHelp() {
    const modal = document.getElementById("shortcuts-modal");
    if (!modal) return;
    modal.style.display = "none";
    document.body.classList.remove("modal-open");
    isHelpOpen = false;

    if (lastActiveElement && typeof lastActiveElement.focus === "function") {
      lastActiveElement.focus();
    }
  }

  function toggleHelp() {
    if (isHelpOpen) {
      closeHelp();
    } else {
      openHelp();
    }
  }

  // ==========================================================================
  // 4. 输入上下文检测与按键分发
  // ==========================================================================

  function isEditableElement(el) {
    if (!el) return false;
    const tagName = el.tagName ? el.tagName.toLowerCase() : "";
    return (
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select" ||
      el.isContentEditable ||
      el.getAttribute("contenteditable") === "true"
    );
  }

  function isAnyModalOpen() {
    const shortcutsModal = document.getElementById("shortcuts-modal");
    const bookplateModal = document.getElementById("bookplate-modal");
    const colophonModal = document.getElementById("colophon-modal");
    const cardEditModal = document.getElementById("card-edit-modal");
    const hiddenCardsModal = document.getElementById("hidden-cards-modal");
    const snippetsModal = document.getElementById("snippets-modal");
    const uncataloguedDrawer = document.getElementById("uncatalogued-drawer");
    const brassWorkbench = document.getElementById("brass-workbench");
    return (
      (shortcutsModal && shortcutsModal.style.display !== "none") ||
      (bookplateModal && bookplateModal.style.display !== "none") ||
      (colophonModal && colophonModal.style.display !== "none") ||
      (cardEditModal && cardEditModal.style.display !== "none") ||
      (hiddenCardsModal && hiddenCardsModal.style.display !== "none") ||
      (snippetsModal && snippetsModal.style.display !== "none") ||
      (uncataloguedDrawer && !uncataloguedDrawer.hidden) ||
      (brassWorkbench && !brassWorkbench.hidden)
    );
  }

  function handleKeyDown(e) {
    const target = e.target;
    const inEditable = isEditableElement(target);
    const key = e.key;

    // 1. 输入框内的特殊键处理
    if (inEditable) {
      if (key === "Escape") {
        e.preventDefault();
        if (typeof hooks.onSearchBlur === "function") {
          hooks.onSearchBlur();
        }
        target.blur();
      } else if (key === "Enter" && target.id === "archive-search-input") {
        // Enter routing belongs to app.js: it owns the hidden probe, the
        // command deck, unique-hit opening and external search.
        return;
      }
      return; // 坚决不拦截输入框内打字
    }

    // 2. 模态窗处于打开状态时的按键处理
    if (isAnyModalOpen()) {
      if (key === "Escape") {
        e.preventDefault();
        if (isHelpOpen) {
          closeHelp();
        }
        if (window.NavExLibris && typeof window.NavExLibris.close === "function") {
          window.NavExLibris.close();
        }
        if (window.NavLore && typeof window.NavLore.close === "function") {
          window.NavLore.close();
        }
        if (window.NavSnippets && typeof window.NavSnippets.close === "function") {
          window.NavSnippets.close();
        }
        if (window.NavUncatalogued && typeof window.NavUncatalogued.close === "function") {
          window.NavUncatalogued.close();
        }
        if (window.NavMarginalia && typeof window.NavMarginalia.closeAll === "function") {
          window.NavMarginalia.closeAll();
        }
        if (window.NavBrassTools && typeof window.NavBrassTools.close === "function") {
          window.NavBrassTools.close();
        }
      }
      return; // 模态窗打开时，禁用背景卡片漫游
    }

    // 3. 全局搜索聚焦 (/ 或 Ctrl+K / Cmd+K)
    if (key === "/" || ((e.ctrlKey || e.metaKey) && (key === "k" || key === "K"))) {
      e.preventDefault();
      if (typeof hooks.onSearchFocus === "function") {
        hooks.onSearchFocus();
      }
      return;
    }

    // 4. 快捷键指南调出 (? 或 Shift+/)
    if (key === "?" || (e.shiftKey && key === "/")) {
      e.preventDefault();
      toggleHelp();
      return;
    }

    // 5. Escape 键处理 (退出整理、取消焦点)
    if (key === "Escape") {
      if (hooks.isArrangeMode && hooks.isArrangeMode()) {
        if (window.NavSortable && typeof window.NavSortable.exitArrangeMode === "function") {
          window.NavSortable.exitArrangeMode();
          showToast("已退出整理模式", "", "✥");
        }
        return;
      }
      if (focusedIndex >= 0) {
        clearFocus();
      }
      return;
    }

    // 6. 书籍顺序漫游 (j / k 或 方向键上下)
    if (key === "j" || key === "ArrowDown") {
      e.preventDefault();
      focusNext();
      return;
    }
    if (key === "k" || key === "ArrowUp") {
      e.preventDefault();
      focusPrev();
      return;
    }

    // 7. 分类标签水平导览 (h / l 或 方向键左右)
    if (key === "h" || key === "ArrowLeft") {
      e.preventDefault();
      if (typeof hooks.onCategorySwitch === "function") {
        hooks.onCategorySwitch(-1);
      }
      return;
    }
    if (key === "l" || key === "ArrowRight") {
      e.preventDefault();
      if (typeof hooks.onCategorySwitch === "function") {
        hooks.onCategorySwitch(1);
      }
      return;
    }

    // 8. 数字键直达专栏 (Alt+1 ~ 7)。裸数字属于两位索书号手柄。
    if (e.altKey && /^[1-7]$/.test(key)) {
      e.preventDefault();
      const tabNum = parseInt(key, 10);
      if (typeof hooks.onCategorySwitch === "function") {
        hooks.onCategorySwitch(null, tabNum);
      }
      return;
    }

    // Alt+ digit chords are also owned by js/folio-keys.js, which listens in
    // the capture phase and stops this handler. This guard is only a fallback.
    if (/^\d$/.test(key) && !e.altKey) {
      return;
    }

    // 9. 视图切换 (v)
    if (key === "v" || key === "V") {
      e.preventDefault();
      if (typeof hooks.onViewToggle === "function") {
        hooks.onViewToggle();
      }
      return;
    }

    // 10. 昼夜时序主题切换 (t)
    if (key === "t") {
      e.preventDefault();
      if (typeof hooks.onThemeToggle === "function") {
        hooks.onThemeToggle();
      }
      return;
    }

    // 11. 典藏切换 (f)
    if (key === "f" || key === "F") {
      e.preventDefault();
      const siteId = getFocusedSiteId();
      if (siteId) {
        if (typeof hooks.onBookmarkToggle === "function") {
          hooks.onBookmarkToggle(siteId);
        }
      } else {
        showToast("请先用 j / k 键选中藏书", "按 j 向下浏览，按 k 向上浏览", "ℹ");
      }
      return;
    }

    // 12. 藏书票印画 (e)
    if (key === "e" || key === "E") {
      e.preventDefault();
      const siteId = getFocusedSiteId();
      if (siteId) {
        if (typeof hooks.onBookplateOpen === "function") {
          hooks.onBookplateOpen(siteId);
        }
      } else {
        showToast("请先用 j / k 键选中藏书", "按 e 打开该书专属 Ex Libris 印画", "ℹ");
      }
      return;
    }

    // 12.5 馆长手记与出版版记 (c)
    if (key === "c" || key === "C") {
      e.preventDefault();
      if (window.NavLore && typeof window.NavLore.toggle === "function") {
        window.NavLore.toggle();
      }
      return;
    }

    // 13. 打开所选书籍 (Enter)
    if (key === "Enter") {
      const el = getFocusedElement();
      if (!el) return;
      e.preventDefault();

      const siteId = el.getAttribute("data-site-id");
      const url = el.getAttribute("data-site-url");

      if (hooks.getViewMode && hooks.getViewMode() === "shelf") {
        // 3D 书架：若便签卡已展开则跳转，否则展开
        if (el.classList.contains("is-open") && url) {
          if (siteId && window.NavApp && typeof window.NavApp.openSite === "function") {
            window.NavApp.openSite(siteId);
          } else {
            window.open(url, "_blank");
            if (window.NavVisits) window.NavVisits.record(siteId);
          }
          showToast("已开卷翻阅", el.querySelector(".flyout-card-name")?.textContent?.trim() || url, "📖");
        } else {
          document.querySelectorAll(".book-item.is-open").forEach(b => b.classList.remove("is-open"));
          el.classList.add("is-open");
        }
      } else {
        // 卡片矩阵：如果处于整理模式，翻转卡片；否则跳转并统计
        if (hooks.isArrangeMode && hooks.isArrangeMode()) {
          el.classList.toggle("flipped");
        } else if (url) {
          if (siteId && window.NavApp && typeof window.NavApp.openSite === "function") {
            window.NavApp.openSite(siteId);
          } else {
            window.open(url, "_blank");
            if (window.NavVisits) window.NavVisits.record(siteId);
          }
          showToast("已开卷翻阅", el.querySelector(".card-title-text")?.textContent?.trim() || url, "📖");
        }
      }
    }
  }

  // ==========================================================================
  // 5. 初始化与事件装配
  // ==========================================================================

  function init(customHooks = {}) {
    hooks = Object.assign(hooks, customHooks);

    // 监听全局按键
    window.addEventListener("keydown", handleKeyDown);

    // 绑定模态窗关闭与遮罩点击
    const closeBtn = document.getElementById("btn-close-shortcuts");
    if (closeBtn) closeBtn.addEventListener("click", closeHelp);

    const dismissBtn = document.getElementById("btn-dismiss-shortcuts");
    if (dismissBtn) dismissBtn.addEventListener("click", closeHelp);

    const toggleBtn = document.getElementById("btn-shortcuts-toggle");
    if (toggleBtn) toggleBtn.addEventListener("click", toggleHelp);

    const modal = document.getElementById("shortcuts-modal");
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeHelp();
      });
    }

    // 鼠标点击卡片时，将焦点索引同步到该卡片，避免鼠标与键盘脱节
    const area = document.getElementById("archive-content-area");
    if (area) {
      area.addEventListener("pointerdown", function (e) {
        const item = e.target.closest(".entry-card, .book-spine");
        if (item) {
          const items = getFocusableElements();
          const idx = items.indexOf(item);
          if (idx !== -1) {
            items.forEach(el => el.classList.remove("keyboard-focused"));
            focusedIndex = idx;
            item.classList.add("keyboard-focused");
          }
        }
      });
    }
  }

  return {
    init,
    showToast,
    openHelp,
    closeHelp,
    toggleHelp,
    focusNext,
    focusPrev,
    focusIndex,
    clearFocus,
    getFocusedElement,
    getFocusedSiteId
  };
});
