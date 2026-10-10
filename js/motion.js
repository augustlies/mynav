/**
 * 模块：微动效与交互增强器 (js/motion.js)
 * 职责：
 * 1. 监听 DOM 渲染变化，自动为卡片注入错峰进场动画延迟 (--stagger-idx)
 * 2. 监听书签收藏点击，触发微弹性回弹反馈动画 (.anim-spring)
 * 3. 跟踪卡片鼠标微光泽坐标 (--mouse-x, --mouse-y)
 * 4. 严格尊崇 prefers-reduced-motion 无障碍偏好
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavMotion = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 检查是否开启了系统级减弱动效偏好
  function prefersReducedMotion() {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return false;
  }

  // 为容器内卡片编制入场错峰阶梯索引
  function applyCardStagger(container) {
    if (!container || prefersReducedMotion()) return;

    const cards = container.querySelectorAll(".entry-card");
    cards.forEach((card, idx) => {
      // 限制最大阶梯延迟上限为 20 级，保证后部卡片不过度延迟
      const clampedIdx = Math.min(idx, 20);
      card.style.setProperty("--stagger-idx", clampedIdx);
    });
  }

  // 绑定卡片微光泽交互
  function handleCardMouseMove(e) {
    if (prefersReducedMotion()) return;
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty("--mouse-x", `${x.toFixed(1)}%`);
    card.style.setProperty("--mouse-y", `${y.toFixed(1)}%`);
  }

  function bindCardSheen(container) {
    if (!container || prefersReducedMotion()) return;
    const cards = container.querySelectorAll(".entry-card");
    cards.forEach((card) => {
      if (!card.__hasMotionSheen) {
        card.__hasMotionSheen = true;
        card.addEventListener("mousemove", handleCardMouseMove, { passive: true });
      }
    });
  }

  // 监听并触发书签按钮弹性缩放
  function bindBookmarkFeedback() {
    document.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-bookmark-id]");
      if (!btn || prefersReducedMotion()) return;

      btn.classList.remove("anim-spring");
      // 强制触发重排重绘，使动画重头播放
      void btn.offsetWidth;
      btn.classList.add("anim-spring");

      const onAnimEnd = () => {
        btn.classList.remove("anim-spring");
        btn.removeEventListener("animationend", onAnimEnd);
      };
      btn.addEventListener("animationend", onAnimEnd);
    });
  }

  // 观察内容区动态重绘（搜索输入、分类切换、书签增删时自动刷新动效）
  function observeContentArea(targetId = "archive-content-area") {
    const target = document.getElementById(targetId);
    if (!target) return;

    // 初始执行一次
    applyCardStagger(target);
    bindCardSheen(target);

    // 观察子树变动
    const observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      for (const m of mutations) {
        if (m.type === "childList" && m.addedNodes.length > 0) {
          shouldUpdate = true;
          break;
        }
      }
      if (shouldUpdate) {
        applyCardStagger(target);
        bindCardSheen(target);
      }
    });

    observer.observe(target, { childList: true, subtree: true });
  }

  const motionInstance = {
    init() {
      observeContentArea("archive-content-area");
      bindBookmarkFeedback();
    },

    refresh() {
      const target = document.getElementById("archive-content-area");
      if (target) {
        applyCardStagger(target);
        bindCardSheen(target);
      }
    }
  };

  // 自动自启动，保证纯静态解耦即插即用
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => motionInstance.init());
    } else {
      motionInstance.init();
    }
  }

  return motionInstance;
});
