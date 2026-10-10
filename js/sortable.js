/**
 * 模块：书架整理与拖动排序 (js/sortable.js)
 * 职责：
 * 1. 提供基于 Pointer Events 的自由拖拽排序（支持鼠标与触屏，无外部依赖）
 * 2. 触屏 250ms 长按判定防滚动冲突，屏幕边缘自动滚动
 * 3. 拖动时纸张占位与 FLIP 平滑让位动画（限制同分类内排序）
 * 4. 键盘无障碍支持（空格拿起、方向键移动、空格放下、Esc取消）
 * 5. 排序结果持久化至 localStorage (结构: { [分类id]: [网站id...] })
 * 6. 新增网站自动后置，已删除网站静默忽略，支持一键恢复默认顺序
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./storage.js"));
  } else {
    root.NavSortable = factory(root.NavStorage);
  }
})(typeof self !== "undefined" ? self : this, function (NavStorage) {
  "use strict";

  // 状态变量
  let arrangeMode = false;
  let isDragging = false;
  let justFinishedDrag = false;
  let dragElement = null;
  let placeholder = null;
  let currentGrid = null;
  let currentCategoryKey = null;
  let activePointerId = null;

  // 坐标与偏移
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;
  let pendingCard = null;
  let initialPointerEvent = null;
  let touchHoldTimer = null;
  let autoScrollRaf = null;

  // 键盘操作状态
  let keyboardPickedCard = null;

  // 外部协作钩子
  let callbacks = {
    onOrderChange: null,
    isSearchActive: () => false
  };

  // 检测减弱动效偏好
  function prefersReducedMotion() {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return false;
  }

  // ==========================================================================
  // 1. 本地排序数据读取与计算
  // ==========================================================================

  function getAllOrders() {
    if (!NavStorage) return {};
    return NavStorage.get(NavStorage.KEYS.ORDER, {}) || {};
  }

  function getCategoryOrder(categoryKey) {
    if (!categoryKey) return null;
    const orders = getAllOrders();
    const list = orders[categoryKey];
    return Array.isArray(list) ? list : null;
  }

  function saveCategoryOrder(categoryKey, siteIds) {
    if (!categoryKey || !NavStorage) return;
    const orders = getAllOrders();
    orders[categoryKey] = siteIds;
    NavStorage.set(NavStorage.KEYS.ORDER, orders);
    if (typeof callbacks.onOrderChange === "function") {
      callbacks.onOrderChange(categoryKey, siteIds);
    }
  }

  function resetOrder(targetCategoryKey) {
    if (!NavStorage) return;
    if (targetCategoryKey) {
      const orders = getAllOrders();
      delete orders[targetCategoryKey];
      NavStorage.set(NavStorage.KEYS.ORDER, orders);
    } else {
      NavStorage.remove(NavStorage.KEYS.ORDER);
    }
    if (typeof callbacks.onOrderChange === "function") {
      callbacks.onOrderChange(null, null);
    }
  }

  // 依据已保存顺序对站点数组进行排序（新增条目排末尾，已删除条目忽略）
  function sortSites(categoryKey, sites) {
    if (!Array.isArray(sites) || sites.length <= 1) return (sites || []).slice();
    const savedOrder = getCategoryOrder(categoryKey);
    if (!savedOrder || savedOrder.length === 0) return sites.slice();

    const siteMap = new Map(sites.map((s) => [s.id, s]));
    const result = [];

    // 1. 先按保存顺序排列已知存在的网站
    savedOrder.forEach((id) => {
      if (siteMap.has(id)) {
        result.push(siteMap.get(id));
        siteMap.delete(id);
      }
    });

    // 2. data.js 新增但尚未记录在排序中的条目，保持原有相对顺序自动追加入末尾
    siteMap.forEach((site) => {
      result.push(site);
    });

    return result;
  }

  // ==========================================================================
  // 2. FLIP 平滑动画让位执行器
  // ==========================================================================

  function executeFLIP(grid, mutateDOMFn) {
    if (!grid) {
      mutateDOMFn();
      return;
    }

    // Reduced motion 开启时直接跳过过渡动画
    if (prefersReducedMotion()) {
      mutateDOMFn();
      return;
    }

    // 1. First: 记录兄弟元素变动前位置
    const siblings = Array.from(
      grid.querySelectorAll(".entry-card:not(.is-dragging), .entry-placeholder")
    );
    const firstRects = new Map(siblings.map((el) => [el, el.getBoundingClientRect()]));

    // 2. Mutate DOM: 执行节点挪移
    mutateDOMFn();

    // 3. Last & Invert & Play
    siblings.forEach((el) => {
      const first = firstRects.get(el);
      if (!first) return;
      const last = el.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;

      if (dx !== 0 || dy !== 0) {
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
          el.style.transition = "transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)";
          el.style.transform = "";
        });
      }
    });
  }

  // ==========================================================================
  // 3. 屏幕边缘自动滚动
  // ==========================================================================

  function startAutoScroll(clientY) {
    stopAutoScroll();
    const edgeMargin = 60;
    const maxSpeed = 12;

    if (clientY < edgeMargin) {
      const ratio = 1 - Math.max(0, clientY) / edgeMargin;
      const speed = -Math.round(ratio * maxSpeed);
      autoScrollLoop(speed);
    } else if (clientY > window.innerHeight - edgeMargin) {
      const ratio = (clientY - (window.innerHeight - edgeMargin)) / edgeMargin;
      const speed = Math.round(Math.min(1, ratio) * maxSpeed);
      autoScrollLoop(speed);
    }
  }

  function autoScrollLoop(speed) {
    if (!isDragging) return;
    window.scrollBy(0, speed);
    autoScrollRaf = requestAnimationFrame(() => autoScrollLoop(speed));
  }

  function stopAutoScroll() {
    if (autoScrollRaf) {
      cancelAnimationFrame(autoScrollRaf);
      autoScrollRaf = null;
    }
  }

  // ==========================================================================
  // 4. 拖动核心流程 (Pointer Events)
  // ==========================================================================

  function startDrag(card, e) {
    if (!card || isDragging) return;

    currentGrid = card.closest(".entries-grid");
    if (!currentGrid) return;

    currentCategoryKey = currentGrid.getAttribute("data-category-key") || "default";

    isDragging = true;
    dragElement = card;
    activePointerId = e.pointerId;

    const rect = card.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    // 创建纸张色占位符
    placeholder = document.createElement("div");
    placeholder.className = "entry-placeholder";
    placeholder.style.width = "100%";
    placeholder.style.height = rect.height + "px";
    placeholder.style.boxSizing = "border-box";
    currentGrid.insertBefore(placeholder, card);

    // 设置被拖拽卡片的绝对跟随样式
    card.classList.add("is-dragging");
    card.style.position = "fixed";
    card.style.left = (e.clientX - offsetX) + "px";
    card.style.top = (e.clientY - offsetY) + "px";
    card.style.width = rect.width + "px";
    card.style.height = rect.height + "px";
    card.style.zIndex = "9999";
    card.style.margin = "0";

    if (typeof card.setPointerCapture === "function") {
      try {
        card.setPointerCapture(e.pointerId);
      } catch (err) {}
    }
  }

  function handlePointerMove(e) {
    if (!arrangeMode) return;

    // 1. 若处于长按判定等待期（触屏长按判定）
    if (pendingCard && touchHoldTimer) {
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (dist > 8) {
        // 移动超阈值，判定为用户页面正常滚动，取消长按拖拽
        clearTimeout(touchHoldTimer);
        touchHoldTimer = null;
        pendingCard = null;
        initialPointerEvent = null;
      }
      return;
    }

    // 2. 鼠标微移动阈值触发（> 3px 时开始拖动）
    if (pendingCard && !isDragging) {
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (dist > 3) {
        const cardToDrag = pendingCard;
        pendingCard = null;
        initialPointerEvent = null;
        startDrag(cardToDrag, e);
      }
      return;
    }

    if (!isDragging || !dragElement || !currentGrid || !placeholder) return;
    e.preventDefault();

    // 更新跟随坐标
    const curX = e.clientX - offsetX;
    const curY = e.clientY - offsetY;
    dragElement.style.left = curX + "px";
    dragElement.style.top = curY + "px";

    // 边缘滚动
    startAutoScroll(e.clientY);

    // 仅在同一个分类网格 (currentGrid) 内寻找位置让位
    const siblings = Array.from(
      currentGrid.querySelectorAll(".entry-card:not(.is-dragging)")
    );

    let targetCard = null;
    let insertBefore = true;

    for (const sib of siblings) {
      const sRect = sib.getBoundingClientRect();
      if (
        e.clientX >= sRect.left - 12 &&
        e.clientX <= sRect.right + 12 &&
        e.clientY >= sRect.top - 12 &&
        e.clientY <= sRect.bottom + 12
      ) {
        targetCard = sib;
        const centerX = sRect.left + sRect.width / 2;
        const centerY = sRect.top + sRect.height / 2;
        const ratioX = Math.abs(e.clientX - centerX) / Math.max(1, sRect.width / 2);
        const ratioY = Math.abs(e.clientY - centerY) / Math.max(1, sRect.height / 2);
        if (ratioY > ratioX) {
          insertBefore = e.clientY < centerY;
        } else {
          insertBefore = e.clientX < centerX;
        }
        break;
      }
    }

    if (targetCard && targetCard !== placeholder) {
      const nextSibling = insertBefore ? targetCard : targetCard.nextSibling;
      if (nextSibling !== placeholder && targetCard !== placeholder) {
        executeFLIP(currentGrid, () => {
          currentGrid.insertBefore(placeholder, nextSibling);
        });
      }
    }
  }

  function handlePointerUp(e) {
    if (touchHoldTimer) {
      clearTimeout(touchHoldTimer);
      touchHoldTimer = null;
    }
    pendingCard = null;
    initialPointerEvent = null;
    stopAutoScroll();

    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerUp);

    if (!isDragging || !dragElement || !placeholder || !currentGrid) {
      return;
    }

    justFinishedDrag = true;
    setTimeout(() => {
      justFinishedDrag = false;
    }, 150);

    const card = dragElement;
    const targetRect = placeholder.getBoundingClientRect();

    // 落地平滑对齐动画
    card.style.transition = prefersReducedMotion()
      ? "none"
      : "left 0.16s cubic-bezier(0.2, 0.8, 0.2, 1), top 0.16s cubic-bezier(0.2, 0.8, 0.2, 1)";
    card.style.left = targetRect.left + "px";
    card.style.top = targetRect.top + "px";

    const finishDrop = () => {
      if (card.parentNode && placeholder.parentNode) {
        currentGrid.insertBefore(card, placeholder);
        placeholder.remove();
      }

      // 清除行内定位样式
      card.classList.remove("is-dragging");
      card.style.position = "";
      card.style.left = "";
      card.style.top = "";
      card.style.width = "";
      card.style.height = "";
      card.style.zIndex = "";
      card.style.margin = "";
      card.style.transition = "";

      if (typeof card.releasePointerCapture === "function" && activePointerId !== null) {
        try {
          card.releasePointerCapture(activePointerId);
        } catch (err) {}
      }

      // 提取本分类最新顺序并持久化
      const newOrder = Array.from(currentGrid.querySelectorAll(".entry-card"))
        .map((c) => c.getAttribute("data-site-id"))
        .filter(Boolean);

      saveCategoryOrder(currentCategoryKey, newOrder);

      isDragging = false;
      dragElement = null;
      placeholder = null;
      currentGrid = null;
      currentCategoryKey = null;
      activePointerId = null;
    };

    if (prefersReducedMotion()) {
      finishDrop();
    } else {
      setTimeout(finishDrop, 160);
    }
  }

  // ==========================================================================
  // 5. 键盘无障碍排序支持
  // ==========================================================================

  function handleKeyboardSort(e) {
    if (!arrangeMode) return;

    const focusedCard = document.activeElement ? document.activeElement.closest(".entry-card") : null;
    if (!focusedCard) return;

    const grid = focusedCard.closest(".entries-grid");
    if (!grid) return;
    const categoryKey = grid.getAttribute("data-category-key") || "default";

    // 1. 空格键拿起/放下
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      if (!keyboardPickedCard) {
        keyboardPickedCard = focusedCard;
        focusedCard.classList.add("is-keyboard-picked");
        focusedCard.setAttribute("aria-grabbed", "true");
      } else if (keyboardPickedCard === focusedCard) {
        keyboardPickedCard.classList.remove("is-keyboard-picked");
        keyboardPickedCard.setAttribute("aria-grabbed", "false");
        keyboardPickedCard = null;

        const newOrder = Array.from(grid.querySelectorAll(".entry-card"))
          .map((c) => c.getAttribute("data-site-id"))
          .filter(Boolean);
        saveCategoryOrder(categoryKey, newOrder);
      }
      return;
    }

    // 2. 方向键移动
    if (keyboardPickedCard && keyboardPickedCard === focusedCard) {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = focusedCard.previousElementSibling;
        if (prev && prev.classList.contains("entry-card")) {
          executeFLIP(grid, () => {
            grid.insertBefore(focusedCard, prev);
          });
          focusedCard.focus();
        }
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = focusedCard.nextElementSibling;
        if (next && next.classList.contains("entry-card")) {
          executeFLIP(grid, () => {
            grid.insertBefore(focusedCard, next.nextElementSibling);
          });
          focusedCard.focus();
        }
      }
    }
  }

  // ==========================================================================
  // 6. 整理模式切换与 UI 装配
  // ==========================================================================

  function refreshCardAttributes() {
    if (!arrangeMode) return;
    document.querySelectorAll(".entry-card").forEach((card) => {
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute("aria-grabbed", "false");
      card.setAttribute("aria-label", "按空格键拿起卡片，方向键调整顺序");
      card.setAttribute("draggable", "false");
    });
  }

  function updateArrangeUI() {
    const arrangeBtn = document.getElementById("btn-arrange-toggle");
    const arrangeToolbar = document.getElementById("arrange-toolbar");

    if (arrangeMode) {
      document.body.classList.add("arrange-mode");
      if (arrangeBtn) {
        arrangeBtn.classList.add("active");
        const label = arrangeBtn.querySelector(".arrange-label");
        if (label) label.textContent = "完成";
        arrangeBtn.setAttribute("title", "退出整理书架模式 (Esc)");
        arrangeBtn.setAttribute("aria-pressed", "true");
      }
      if (arrangeToolbar) {
        arrangeToolbar.style.display = "block";
      }
      refreshCardAttributes();
    } else {
      document.body.classList.remove("arrange-mode");
      if (arrangeBtn) {
        arrangeBtn.classList.remove("active");
        const label = arrangeBtn.querySelector(".arrange-label");
        if (label) label.textContent = "整理";
        arrangeBtn.setAttribute("title", "整理书架 (拖动排序)");
        arrangeBtn.setAttribute("aria-pressed", "false");
      }
      if (arrangeToolbar) {
        arrangeToolbar.style.display = "none";
      }

      if (keyboardPickedCard) {
        keyboardPickedCard.classList.remove("is-keyboard-picked");
        keyboardPickedCard = null;
      }

      document.querySelectorAll(".entry-card").forEach((card) => {
        card.removeAttribute("aria-grabbed");
        card.removeAttribute("role");
        card.removeAttribute("draggable");
      });
    }
  }

  function setArrangeMode(val) {
    if (val && callbacks.isSearchActive()) {
      alert("当前正处于检索状态，清空检索词后即可自由整理书架。");
      return;
    }
    arrangeMode = Boolean(val);
    updateArrangeUI();
  }

  function toggleArrangeMode() {
    setArrangeMode(!arrangeMode);
  }

  // ==========================================================================
  // 7. 事件委托与启动初始化
  // ==========================================================================

  function initListeners() {
    // 1. 内容区 PointerDown 事件委托
    const contentArea = document.getElementById("archive-content-area") || document;

    contentArea.addEventListener("pointerdown", function (e) {
      if (!arrangeMode) return;
      if (callbacks.isSearchActive()) return;

      // 收藏按钮或功能链接不触发拖拽
      if (e.target.closest("[data-bookmark-id]") || e.target.closest("button")) {
        return;
      }

      const card = e.target.closest(".entry-card");
      if (!card) return;

      startX = e.clientX;
      startY = e.clientY;
      pendingCard = card;
      initialPointerEvent = e;

      // 统一在 window 上监听 pointermove 和 pointerup
      window.addEventListener("pointermove", handlePointerMove, { passive: false });
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);

      if (e.pointerType === "mouse") {
        // 阻止浏览器原生的 <a> 标签链接拖拽行为
        e.preventDefault();
      } else if (e.pointerType === "touch") {
        // 触屏长按 250ms 判定才进入拖拽，保障垂直滚动不冲突
        touchHoldTimer = setTimeout(() => {
          touchHoldTimer = null;
          if (pendingCard) {
            startDrag(pendingCard, initialPointerEvent);
            pendingCard = null;
            initialPointerEvent = null;
          }
        }, 250);
      }
    });

    // 2. 彻底拦截 HTML5 原生拖放对 <a> 和 <img> 的干扰
    document.addEventListener(
      "dragstart",
      function (e) {
        if (arrangeMode) {
          e.preventDefault();
        }
      },
      true
    );

    // 3. 整理模式下阻止点击 <a> 标签外链跳转
    document.addEventListener(
      "click",
      function (e) {
        if (arrangeMode || justFinishedDrag) {
          const card = e.target.closest(".entry-card");
          if (card && !e.target.closest("[data-bookmark-id]")) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
      },
      true
    );

    // 4. 全局键盘支持
    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && arrangeMode) {
        if (keyboardPickedCard) {
          keyboardPickedCard.classList.remove("is-keyboard-picked");
          keyboardPickedCard = null;
        } else {
          setArrangeMode(false);
        }
        return;
      }

      handleKeyboardSort(e);
    });
  }

  return {
    init(options = {}) {
      if (options.onOrderChange) callbacks.onOrderChange = options.onOrderChange;
      if (options.isSearchActive) callbacks.isSearchActive = options.isSearchActive;
      initListeners();
    },

    isArrangeMode() {
      return arrangeMode;
    },

    isJustFinishedDrag() {
      return justFinishedDrag;
    },

    toggleArrangeMode,
    setArrangeMode,
    exitArrangeMode() {
      setArrangeMode(false);
    },
    refreshCardAttributes,

    sortSites,
    getCategoryOrder,
    saveCategoryOrder,
    resetOrder
  };
});
