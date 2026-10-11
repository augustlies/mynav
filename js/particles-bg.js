/**
 * 模块：尼尔机械纪元风格背景方块粒子鼠标跟随动效 (js/particles-bg.js)
 * 职责：
 * 1. 原生 Canvas 2D 高性能渲染，满屏漂浮 2~3px 实心小方块 (Square Particles)
 * 2. 鼠标追随引力连线算法：以光标为中心约 180px 范围内的点连线，且附近的点之间连出细线
 * 3. 浅色主题下点线采用墨色 #453F38（线不透明度约 0.25），深色主题适配文字色（线不透明度约 0.2）
 * 4. 实时响应主题切换，不刷新页面；支持 document.hidden 后台暂停与 devicePixelRatio 高清适配
 * 5. 桌面端 60~80 粒子，触屏手机端约 25 粒子且仅自由漂浮不跟随
 * 6. 支持 prefers-reduced-motion 无障碍检测与全局持久化开关
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavParticlesBg = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STORAGE_KEY = "mynav_arch_particles";
  const DEFAULT_ENABLED = true;

  // 运行状态
  let isRunning = false;
  let animId = null;
  let canvas = null;
  let ctx = null;
  let container = null;

  // 视口尺寸与缩放
  let width = 0;
  let height = 0;
  let dpr = 1;
  let isMobileDevice = false;

  // 粒子集合
  const particles = [];

  // 光标状态（在 window 上监听 pointermove）
  const mouse = {
    x: null,
    y: null,
    radius: 180,
    active: false
  };

  // 核心动画参数
  const CONFIG = {
    desktopCount: 72,       // 桌面点数约 60~80
    mobileCount: 25,        // 手机约 25 且不做跟随
    pointSize: 2.5,         // 点为 2~3px 方块
    connectRadius: 180,     // 鼠标为中心约 180px 内的点连线
    interPointDist: 120,    // 点与点之间连线最大距离
    lineWidth: 0.75,        // 线宽 0.5~1px
    speed: 0.35             // 缓慢随机漂移
  };

  // 检测减弱动效偏好 (prefers-reduced-motion)
  function prefersReducedMotion() {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return false;
  }

  // 读取与保存持久化开关状态
  function isStoredEnabled() {
    try {
      const val = localStorage.getItem(STORAGE_KEY);
      if (val === null) return DEFAULT_ENABLED;
      return JSON.parse(val) === true;
    } catch (e) {
      return DEFAULT_ENABLED;
    }
  }

  function setStoredEnabled(enabled) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
    } catch (e) {}
  }

  // 获取当前主题配色（浅色：尼尔墨色 #453F38，深色：柔白文字色）
  function getPalette() {
    const isDark = typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-theme") === "dark";

    if (isDark) {
      return {
        point: "rgba(237, 234, 225, 0.72)",
        lineRgb: "237, 234, 225",
        maxAlpha: 0.20
      };
    }

    // 浅色主题：尼尔机械纪元墨色 #453F38 (69, 63, 56)，线不透明度约 0.25
    return {
      point: "rgba(69, 63, 56, 0.75)",
      lineRgb: "69, 63, 56",
      maxAlpha: 0.25
    };
  }

  // 检测是否为触屏设备
  function checkIsMobile() {
    if (typeof window === "undefined") return false;
    return (
      window.innerWidth <= 768 ||
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
      ("ontouchstart" in window) ||
      (navigator.maxTouchPoints > 0)
    );
  }

  // 确保 #particles-bg 容器与 Canvas 挂载
  function ensureContainer() {
    if (typeof document === "undefined") return null;
    let c = document.getElementById("particles-bg");
    if (!c) {
      c = document.createElement("div");
      c.id = "particles-bg";
      c.className = "particles-bg";
      c.setAttribute("aria-hidden", "true");
      document.body.insertBefore(c, document.body.firstChild);
    }
    container = c;

    if (!canvas) {
      canvas = container.querySelector("canvas");
      if (!canvas) {
        canvas = document.createElement("canvas");
        container.appendChild(canvas);
      }
      ctx = canvas.getContext("2d");
    }
    return container;
  }

  // 视口缩放计算与 devicePixelRatio 高清适配
  function resize() {
    if (!canvas || !ctx) return;
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    isMobileDevice = checkIsMobile();

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    updateParticlesPopulation();
  }

  // 根据桌面/移动端动态维持粒子数量
  function updateParticlesPopulation() {
    const targetCount = isMobileDevice ? CONFIG.mobileCount : CONFIG.desktopCount;
    while (particles.length < targetCount) {
      const angle = Math.random() * Math.PI * 2;
      const spd = (0.2 + Math.random() * 0.3) * CONFIG.speed;
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd
      });
    }
    if (particles.length > targetCount) {
      particles.length = targetCount;
    }
  }

  // 监听全局指针与系统事件
  function initPointerListeners() {
    window.addEventListener(
      "pointermove",
      (e) => {
        // 触屏设备只漂浮，不做鼠标跟随
        if (isMobileDevice || e.pointerType === "touch") {
          mouse.active = false;
          mouse.x = null;
          mouse.y = null;
          return;
        }
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.active = true;
      },
      { passive: true }
    );

    window.addEventListener(
      "pointerleave",
      () => {
        mouse.active = false;
        mouse.x = null;
        mouse.y = null;
      },
      { passive: true }
    );

    window.addEventListener("resize", resize, { passive: true });

    // 页面切到后台 (document.hidden) 时暂停动画，节省性能
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        pauseAnimation();
      } else {
        resumeAnimation();
      }
    });
  }

  // 主动画帧循环
  function render() {
    if (!isRunning) return;

    const palette = getPalette();
    ctx.clearRect(0, 0, width, height);

    const hasMouse = !isMobileDevice && mouse.active && mouse.x !== null && mouse.y !== null;

    // 1. 更新粒子坐标与微弱鼠标向心牵引
    const len = particles.length;
    for (let i = 0; i < len; i++) {
      const p = particles[i];

      if (hasMouse) {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < CONFIG.connectRadius && dist > 1) {
          const pull = (1 - dist / CONFIG.connectRadius) * 0.16;
          p.x += (dx / dist) * pull;
          p.y += (dy / dist) * pull;
        }
      }

      // 自然缓慢漂移
      p.x += p.vx;
      p.y += p.vy;

      // 视口边缘自然环绕
      if (p.x < -6) p.x = width + 6;
      else if (p.x > width + 6) p.x = -6;
      if (p.y < -6) p.y = height + 6;
      else if (p.y > height + 6) p.y = -6;
    }

    // 2. 绘制附近的点之间连线 (鼠标靠近时附近的点之间连出细线)
    ctx.lineWidth = CONFIG.lineWidth;
    for (let i = 0; i < len; i++) {
      const p1 = particles[i];
      for (let j = i + 1; j < len; j++) {
        const p2 = particles[j];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);

        if (dist < CONFIG.interPointDist) {
          let alpha = 0;
          if (hasMouse) {
            const d1 = Math.hypot(mouse.x - p1.x, mouse.y - p1.y);
            const d2 = Math.hypot(mouse.x - p2.x, mouse.y - p2.y);
            const minMouseDist = Math.min(d1, d2);
            if (minMouseDist < CONFIG.connectRadius) {
              const mouseFade = 1 - minMouseDist / CONFIG.connectRadius;
              const distFade = 1 - dist / CONFIG.interPointDist;
              alpha = distFade * mouseFade * palette.maxAlpha * 1.35;
            }
          } else {
            // 无光标激活时极轻微的环境底纹连线
            if (dist < 70) {
              alpha = (1 - dist / 70) * 0.04;
            }
          }

          if (alpha > 0.005) {
            ctx.strokeStyle = `rgba(${palette.lineRgb}, ${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }
    }

    // 3. 绘制点与鼠标之间的连线 (以鼠标为中心约 180px 范围，距离越远越淡)
    if (hasMouse) {
      for (let i = 0; i < len; i++) {
        const p = particles[i];
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.hypot(dx, dy);

        if (dist < CONFIG.connectRadius) {
          const alpha = (1 - dist / CONFIG.connectRadius) * palette.maxAlpha;
          ctx.strokeStyle = `rgba(${palette.lineRgb}, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }
    }

    // 4. 绘制粒子节点：2~3px 纯代码实心小方块 (Square Nodes)
    ctx.fillStyle = palette.point;
    const half = CONFIG.pointSize / 2;
    for (let i = 0; i < len; i++) {
      const p = particles[i];
      ctx.fillRect(p.x - half, p.y - half, CONFIG.pointSize, CONFIG.pointSize);
    }

    animId = requestAnimationFrame(render);
  }

  function startAnimation() {
    if (isRunning) return;
    if (prefersReducedMotion()) return;
    if (!isStoredEnabled()) return;

    ensureContainer();
    if (container) container.style.display = "block";
    resize();
    isRunning = true;
    animId = requestAnimationFrame(render);
  }

  function pauseAnimation() {
    if (!isRunning) return;
    isRunning = false;
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
  }

  function resumeAnimation() {
    if (!isRunning && isStoredEnabled() && !prefersReducedMotion()) {
      isRunning = true;
      animId = requestAnimationFrame(render);
    }
  }

  function stopAnimation() {
    pauseAnimation();
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (container) {
      container.style.display = "none";
    }
  }

  // 外部控制 API
  function setEnabled(enabled) {
    setStoredEnabled(enabled);
    if (enabled) {
      startAnimation();
    } else {
      stopAnimation();
    }
    return isStoredEnabled();
  }

  function toggle() {
    const next = !isStoredEnabled();
    return setEnabled(next);
  }

  function isEnabled() {
    return isStoredEnabled() && !prefersReducedMotion();
  }

  function init() {
    ensureContainer();
    initPointerListeners();

    if (isStoredEnabled() && !prefersReducedMotion()) {
      startAnimation();
    } else {
      if (container) container.style.display = "none";
    }
  }

  // 自动装配
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  return {
    init,
    start: startAnimation,
    pause: pauseAnimation,
    stop: stopAnimation,
    toggle,
    setEnabled,
    isEnabled,
    resize,
    updateTheme: () => {}
  };
});
