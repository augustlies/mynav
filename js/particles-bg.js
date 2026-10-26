/**
 * 模块：双生天象背景动效 (js/particles-bg.js)
 * 方案：随深浅主题无缝切换的【白昼：古典星图手稿 × 暗夜：深邃星空】
 * 
 * 视觉特征：
 * 1. 亮色主题（Light Mode - 羊皮纸古典星图手稿）：
 *    - 粒子色彩：古籍描金 rgba(180, 145, 90, 0.38) 与暖沙褐色 rgba(145, 130, 110, 0.24)，彻底告别黑灰尘感；
 *    - 几何星芒形态：约 20%~25% 呈现为微细经纬十字星芒（+ 号，线宽 1px）与空心微圆环，其余为微小墨点；
 *    - 古典星盘交互：鼠标移动时，以光标为中心呈现极细极淡的双环同心圆刻度盘（内实外虚）与十字准星，吸附淡金手稿测绘连线。
 * 
 * 2. 暗色主题（Dark Mode - 深邃星空与星座连线）：
 *    - 星辰色彩：冷星白 (#ffffff, 50%)、淡香槟金 (#ffe9c4, 25%) 与极淡星云蓝 (#d4fbff, 25%) 随机分布；
 *    - 呼吸闪烁：为每颗星辰赋予独立的正弦 Twinkle 闪烁周期与相位，星芒呼吸明灭；
 *    - 星座引力交互：光标周围绽放极淡的星云引力光晕，微弱牵引星辰，粒子与光标之间结成银白清冷的星座折线。
 * 
 * 3. 动态特性：
 *    - 实时感知 data-theme 属性切换与 MutationObserver 监听，平滑过渡（Cross-fade），免刷新页面；
 *    - 支持 prefers-reduced-motion 无障碍检测与 localStorage 开关持久化；
 *    - 支持 document.hidden 页面切出暂停节电与 devicePixelRatio 高清视网膜抗锯齿。
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
  let themeObserver = null;

  // 视口尺寸与缩放
  let width = 0;
  let height = 0;
  let dpr = 1;
  let isMobileDevice = false;

  // 主题平滑过渡参数 (0.0: 完全浅色手稿星图, 1.0: 完全暗夜深邃星空)
  let themeRatio = 0.0;
  let lastFrameTimestamp = 0;

  // 粒子集合
  const particles = [];
  const meteors = [];
  let meteorSeed = 0;
  let meteorTimer = null;

  // 光标状态（在 window 上监听 pointermove）
  const mouse = {
    x: null,
    y: null,
    active: false,
    fade: 0.0,
    targetFade: 0.0
  };

  // 核心动画与数量配置
  const CONFIG = {
    // 亮色主题（古典星图手稿）：粒子更少、极简干净
    lightDesktopCount: 46,
    lightMobileCount: 18,
    // 暗色主题（深邃星空与星座）：粒子稍丰满、浩瀚星河
    darkDesktopCount: 76,
    darkMobileCount: 30,
    connectRadius: 180,     // 鼠标引力与连线半径
    interPointDist: 115,    // 粒子间连线距离
    speed: 0.28,            // 沉静缓慢漂移
    meteorIntervalMin: 18000,
    meteorIntervalMax: 42000,
    meteorLifetime: 1450
  };

  // 检测减弱动效偏好 (prefers-reduced-motion)
  function prefersReducedMotion() {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return false;
  }

  // 检测当前是否处于暗色主题
  function isDarkTheme() {
    if (typeof document === "undefined") return false;
    return document.documentElement.getAttribute("data-theme") === "dark";
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

  // 检测是否为触屏移动设备
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

  // 创建单颗粒子对象（兼顾白昼手稿与暗夜星空两套属性）
  function createParticle(w, h, index) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.16 + Math.random() * 0.26) * CONFIG.speed;

    // --- 亮色（古典星图手稿）属性 ---
    // 形态比例：约 15% 十字星芒 (+ 号), 10% 空心微圆环 (○), 75% 微小圆点 (•)
    const shapeRand = Math.random();
    let lightType = 0; // 0: dot, 1: cross, 2: ring
    if (shapeRand < 0.15) {
      lightType = 1; // 十字星芒
    } else if (shapeRand < 0.25) {
      lightType = 2; // 空心微圆环
    }

    // 颜色混用：古籍描金 (55%) 与 暖沙褐色 (45%)
    const isGold = Math.random() < 0.55;
    const lightColorRgb = isGold ? { r: 180, g: 145, b: 90 } : { r: 145, g: 130, b: 110 };
    const lightAlpha = isGold ? (0.34 + Math.random() * 0.08) : (0.20 + Math.random() * 0.06);

    // 亮色尺寸（微小细腻）
    const lightRadius = 1.0 + Math.random() * 0.5;      // 圆点半径 1.0 ~ 1.5px
    const lightCrossArm = 3.0 + Math.random() * 0.6;    // 十字星芒单臂长 3.0 ~ 3.6px
    const lightRingRadius = 1.7 + Math.random() * 0.5;  // 空心环外半径 1.7 ~ 2.2px

    // --- 暗色（深邃星空）属性 ---
    // 色彩分配：冷星白 (50%), 淡香槟金 (25%), 极淡星云蓝 (25%)
    const colorRand = Math.random();
    let darkRgb;
    if (colorRand < 0.5) {
      darkRgb = { r: 255, g: 255, b: 255 }; // 冷星白 #ffffff
    } else if (colorRand < 0.75) {
      darkRgb = { r: 255, g: 233, b: 196 }; // 淡香槟金 #ffe9c4
    } else {
      darkRgb = { r: 212, g: 251, b: 255 }; // 极淡星云蓝 #d4fbff
    }

    // 暗色星辰大小：0.8px ~ 2.2px 半径
    const darkRadius = 0.8 + Math.random() * 1.4;

    // 正弦呼吸闪烁 (Twinkle 效果)
    const twinkleSpeed = 0.9 + Math.random() * 1.6; // 周期角速度
    const twinklePhase = Math.random() * Math.PI * 2;
    const twinkleAmp = 0.18 + Math.random() * 0.22;
    const darkBaseAlpha = 0.45 + Math.random() * 0.35;

    return {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      index,
      // 亮色手稿属性
      lightType,
      lightColorRgb,
      lightAlpha,
      lightRadius,
      lightCrossArm,
      lightRingRadius,
      // 暗色星空属性
      darkRgb,
      darkRadius,
      twinkleSpeed,
      twinklePhase,
      twinkleAmp,
      darkBaseAlpha
    };
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

  // 维持粒子池数量（桌面端 76，手机端 30）
  function updateParticlesPopulation() {
    const maxPool = isMobileDevice ? CONFIG.darkMobileCount : CONFIG.darkDesktopCount;
    while (particles.length < maxPool) {
      particles.push(createParticle(width, height, particles.length));
    }
    if (particles.length > maxPool) {
      particles.length = maxPool;
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
          mouse.targetFade = 0.0;
          return;
        }
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.active = true;
        mouse.targetFade = 1.0;
      },
      { passive: true }
    );

    window.addEventListener(
      "pointerleave",
      () => {
        mouse.active = false;
        mouse.targetFade = 0.0;
      },
      { passive: true }
    );

    window.addEventListener("resize", resize, { passive: true });

    // 页面切到后台 (document.hidden) 时暂停动画，节省性能与能耗
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        pauseAnimation();
      } else {
        resumeAnimation();
      }
    });

    // 监听根节点 data-theme 变化以立即感知主题切换
    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
      themeObserver = new MutationObserver(() => {
        // 主题属性变更时在下一帧由渲染循环平滑过渡
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "class"]
      });
    }
  }

  // 绘制亮色主题：鼠标中心古典星盘同心圆刻度盘与十字准星
  function drawAstrolabe(mx, my, astrolabeAlpha) {
    if (astrolabeAlpha <= 0.005) return;

    ctx.save();
    ctx.lineWidth = 0.6;

    // 1. 内圈实线（半径 24px，颜色 rgba(180, 145, 90, 0.15)）
    ctx.strokeStyle = `rgba(180, 145, 90, ${(0.16 * astrolabeAlpha).toFixed(3)})`;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(mx, my, 24, 0, Math.PI * 2);
    ctx.stroke();

    // 2. 外圈虚线（半径 48px，颜色 rgba(180, 145, 90, 0.15)）
    ctx.strokeStyle = `rgba(180, 145, 90, ${(0.14 * astrolabeAlpha).toFixed(3)})`;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.arc(mx, my, 48, 0, Math.PI * 2);
    ctx.stroke();

    // 3. 古典星盘微刻度与中心微准星十字（中世纪手稿浑天仪细节）
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(180, 145, 90, ${(0.18 * astrolabeAlpha).toFixed(3)})`;
    ctx.beginPath();
    // 中心微十字 (臂长 4px)
    ctx.moveTo(mx - 4, my);
    ctx.lineTo(mx + 4, my);
    ctx.moveTo(mx, my - 4);
    ctx.lineTo(mx, my + 4);
    // 四象限内圈微刻度线 (r=21 ~ 27px)
    ctx.moveTo(mx - 27, my);
    ctx.lineTo(mx - 21, my);
    ctx.moveTo(mx + 21, my);
    ctx.lineTo(mx + 27, my);
    ctx.moveTo(mx, my - 27);
    ctx.lineTo(mx, my - 21);
    ctx.moveTo(mx, my + 21);
    ctx.lineTo(mx, my + 27);
    ctx.stroke();

    ctx.restore();
  }

  // 绘制暗色主题：鼠标中心微弱星光引力光晕与轨道光圈
  function drawDarkNebulaHalo(mx, my, haloAlpha) {
    if (haloAlpha <= 0.005) return;

    ctx.save();

    // 1. 径向星云光晕
    const grad = ctx.createRadialGradient(mx, my, 0, mx, my, 76);
    grad.addColorStop(0, `rgba(212, 251, 255, ${(0.08 * haloAlpha).toFixed(3)})`);
    grad.addColorStop(0.45, `rgba(180, 220, 255, ${(0.03 * haloAlpha).toFixed(3)})`);
    grad.addColorStop(1, "rgba(180, 220, 255, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(mx, my, 76, 0, Math.PI * 2);
    ctx.fill();

    // 2. 微弱星光引力轨道细虚环
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = `rgba(220, 235, 255, ${(0.11 * haloAlpha).toFixed(3)})`;
    ctx.setLineDash([1, 5]);
    ctx.beginPath();
    ctx.arc(mx, my, 40, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  // 流星是独立于星尘池的短生命周期图元。它只在暗色观星台出现，
  // 因而不会干扰浅色日晷手稿的测绘线。
  function spawnMeteor(force) {
    if (!isDarkTheme() && !force) return false;
    if (prefersReducedMotion()) return false;
    if (!isRunning) startAnimation();
    if (!isRunning) return false;
    if (!width || !height) resize();
    const startX = width * (0.12 + Math.random() * 0.78);
    const startY = height * (0.04 + Math.random() * 0.44);
    const travel = Math.max(180, Math.min(width, height) * (0.34 + Math.random() * 0.25));
    const angle = Math.PI * (0.23 + Math.random() * 0.12);
    const speed = travel / (CONFIG.meteorLifetime * 0.84);
    meteors.push({
      id: ++meteorSeed,
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      age: 0,
      life: CONFIG.meteorLifetime * (0.82 + Math.random() * 0.32),
      length: 80 + Math.random() * 110,
      width: 0.7 + Math.random() * 0.75,
      hue: Math.random() < 0.25 ? "244, 224, 184" : "218, 235, 255"
    });
    return true;
  }

  function scheduleMeteor() {
    if (meteorTimer) clearTimeout(meteorTimer);
    const delay = CONFIG.meteorIntervalMin +
      Math.random() * (CONFIG.meteorIntervalMax - CONFIG.meteorIntervalMin);
    meteorTimer = setTimeout(function () {
      if (isRunning && isDarkTheme()) spawnMeteor(false);
      scheduleMeteor();
    }, delay);
  }

  function drawMeteors(deltaMs) {
    if (!meteors.length) return;
    const delta = Math.min(48, Math.max(0, Number(deltaMs) || 16.67));
    for (let i = meteors.length - 1; i >= 0; i--) {
      const meteor = meteors[i];
      meteor.age += delta;
      const progress = meteor.age / meteor.life;
      if (progress >= 1) {
        meteors.splice(i, 1);
        continue;
      }

      meteor.x += meteor.vx * delta;
      meteor.y += meteor.vy * delta;
      const fade = Math.sin(Math.min(1, progress) * Math.PI);
      const tailX = meteor.x - meteor.vx / Math.max(0.001, Math.hypot(meteor.vx, meteor.vy)) * meteor.length;
      const tailY = meteor.y - meteor.vy / Math.max(0.001, Math.hypot(meteor.vx, meteor.vy)) * meteor.length;
      const gradient = ctx.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
      gradient.addColorStop(0, `rgba(${meteor.hue}, ${(0.7 * fade * themeRatio).toFixed(3)})`);
      gradient.addColorStop(0.32, `rgba(${meteor.hue}, ${(0.32 * fade * themeRatio).toFixed(3)})`);
      gradient.addColorStop(1, `rgba(${meteor.hue}, 0)`);
      ctx.save();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = meteor.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(meteor.x, meteor.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 250, 236, ${(0.88 * fade * themeRatio).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(meteor.x, meteor.y, meteor.width * 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // 主动画帧循环
  function render(timestamp) {
    if (!isRunning) return;

    // 1. 实时读取当前深浅主题状态并执行平滑过渡
    const isDark = isDarkTheme();
    const targetThemeRatio = isDark ? 1.0 : 0.0;
    themeRatio += (targetThemeRatio - themeRatio) * 0.14;
    if (Math.abs(targetThemeRatio - themeRatio) < 0.002) {
      themeRatio = targetThemeRatio;
    }

    // 2. 光标透明度平滑渐变
    mouse.fade += (mouse.targetFade - mouse.fade) * 0.12;
    if (mouse.fade < 0.003) mouse.fade = 0;

    const hasMouse = !isMobileDevice && mouse.fade > 0.003 && mouse.x !== null && mouse.y !== null;
    const nowSec = (timestamp || performance.now()) * 0.001;

    ctx.clearRect(0, 0, width, height);

    // 计算当前设备与模式下的有效粒子数量
    const lightLimit = isMobileDevice ? CONFIG.lightMobileCount : CONFIG.lightDesktopCount;
    const darkLimit = isMobileDevice ? CONFIG.darkMobileCount : CONFIG.darkDesktopCount;
    const totalCount = particles.length;

    // 3. 更新粒子坐标与引力牵引
    for (let i = 0; i < totalCount; i++) {
      const p = particles[i];

      // 鼠标引力吸附：暗夜星空牵引略强，白昼手稿沉静
      if (hasMouse) {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < CONFIG.connectRadius && dist > 1.5) {
          const pullIntensity = isDark ? 0.17 : 0.13;
          const pull = (1 - dist / CONFIG.connectRadius) * pullIntensity * mouse.fade;
          p.x += (dx / dist) * pull;
          p.y += (dy / dist) * pull;
        }
      }

      // 自然缓慢漂移
      p.x += p.vx;
      p.y += p.vy;

      // 视口边缘自然环绕
      if (p.x < -10) p.x = width + 10;
      else if (p.x > width + 10) p.x = -10;
      if (p.y < -10) p.y = height + 10;
      else if (p.y > height + 10) p.y = -10;
    }

    // 4. 绘制光标中心特异性图元
    if (hasMouse) {
      // 亮色古典星盘刻度环
      if (themeRatio < 0.999) {
        drawAstrolabe(mouse.x, mouse.y, (1 - themeRatio) * mouse.fade);
      }
      // 暗色星云引力光晕
      if (themeRatio > 0.001) {
        drawDarkNebulaHalo(mouse.x, mouse.y, themeRatio * mouse.fade);
      }
    }

    // 5. 绘制粒子间连线 (连线几何逻辑：白天为测绘折线，黑夜为星座线)
    // 亮色连线：0.5px，淡金色 rgba(180, 145, 90, ...)
    // 暗色连线：0.6px，清冷银白 rgba(220, 235, 255, 0.14)
    const lightLineAlphaFactor = 1 - themeRatio;
    const darkLineAlphaFactor = themeRatio;

    for (let i = 0; i < totalCount; i++) {
      const p1 = particles[i];
      // 确定 p1 在当前过渡中的存在度
      const p1Active = i < lightLimit ? 1 : themeRatio;
      if (p1Active <= 0.01) continue;

      for (let j = i + 1; j < totalCount; j++) {
        const p2 = particles[j];
        const p2Active = j < lightLimit ? 1 : themeRatio;
        if (p2Active <= 0.01) continue;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);

        if (dist < CONFIG.interPointDist) {
          const distFade = 1 - dist / CONFIG.interPointDist;
          let mouseInfluence = 0.0;

          if (hasMouse) {
            const d1 = Math.hypot(mouse.x - p1.x, mouse.y - p1.y);
            const d2 = Math.hypot(mouse.x - p2.x, mouse.y - p2.y);
            const minMouseDist = Math.min(d1, d2);
            if (minMouseDist < CONFIG.connectRadius) {
              mouseInfluence = (1 - minMouseDist / CONFIG.connectRadius) * mouse.fade;
            }
          }

          // 亮色测绘连线
          if (lightLineAlphaFactor > 0.01) {
            let lineAlpha = 0;
            if (mouseInfluence > 0) {
              lineAlpha = distFade * mouseInfluence * 0.18;
            } else if (dist < 60) {
              // 微弱底图几何网格
              lineAlpha = (1 - dist / 60) * 0.035;
            }
            lineAlpha *= lightLineAlphaFactor * Math.min(p1Active, p2Active);
            if (lineAlpha > 0.005) {
              ctx.lineWidth = 0.5;
              ctx.strokeStyle = `rgba(180, 145, 90, ${lineAlpha.toFixed(3)})`;
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            }
          }

          // 暗色星座折线
          if (darkLineAlphaFactor > 0.01) {
            let lineAlpha = 0;
            if (mouseInfluence > 0) {
              lineAlpha = distFade * mouseInfluence * 0.15;
            } else if (dist < 75) {
              // 夜空天然星座连线
              lineAlpha = (1 - dist / 75) * 0.055;
            }
            lineAlpha *= darkLineAlphaFactor * Math.min(p1Active, p2Active);
            if (lineAlpha > 0.005) {
              ctx.lineWidth = 0.6;
              ctx.strokeStyle = `rgba(220, 235, 255, ${lineAlpha.toFixed(3)})`;
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            }
          }
        }
      }
    }

    // 6. 绘制粒子与鼠标之间的吸附连线
    if (hasMouse) {
      for (let i = 0; i < totalCount; i++) {
        const p = particles[i];
        const pActive = i < lightLimit ? 1 : themeRatio;
        if (pActive <= 0.01) continue;

        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.hypot(dx, dy);

        if (dist < CONFIG.connectRadius) {
          const distDecay = 1 - dist / CONFIG.connectRadius;

          // 亮色鼠标吸附线（0.5px 淡金色，衰减透明度最高不超过 0.25）
          if (lightLineAlphaFactor > 0.01) {
            const alpha = distDecay * 0.22 * mouse.fade * lightLineAlphaFactor * pActive;
            if (alpha > 0.005) {
              ctx.lineWidth = 0.5;
              ctx.strokeStyle = `rgba(180, 145, 90, ${alpha.toFixed(3)})`;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(mouse.x, mouse.y);
              ctx.stroke();
            }
          }

          // 暗色星座吸附线（0.6px 清冷星光银白）
          if (darkLineAlphaFactor > 0.01) {
            const alpha = distDecay * 0.18 * mouse.fade * darkLineAlphaFactor * pActive;
            if (alpha > 0.005) {
              ctx.lineWidth = 0.6;
              ctx.strokeStyle = `rgba(220, 235, 255, ${alpha.toFixed(3)})`;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(mouse.x, mouse.y);
              ctx.stroke();
            }
          }
        }
      }
    }

    // 7. 绘制粒子图元本体
    for (let i = 0; i < totalCount; i++) {
      const p = particles[i];

      // --- 亮色（古典星图手稿）绘制 ---
      if (themeRatio < 0.999 && i < lightLimit) {
        const effAlpha = (1 - themeRatio);

        if (p.lightType === 1) {
          // 极小十字星芒（+ 号，线宽 1px）
          ctx.lineWidth = 1.0;
          ctx.strokeStyle = `rgba(${p.lightColorRgb.r}, ${p.lightColorRgb.g}, ${p.lightColorRgb.b}, ${(p.lightAlpha * effAlpha * 1.25).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(p.x - p.lightCrossArm, p.y);
          ctx.lineTo(p.x + p.lightCrossArm, p.y);
          ctx.moveTo(p.x, p.y - p.lightCrossArm);
          ctx.lineTo(p.x, p.y + p.lightCrossArm);
          ctx.stroke();
        } else if (p.lightType === 2) {
          // 空心微圆环（外径约 2~3px，线宽 0.8px）
          ctx.lineWidth = 0.8;
          ctx.strokeStyle = `rgba(${p.lightColorRgb.r}, ${p.lightColorRgb.g}, ${p.lightColorRgb.b}, ${(p.lightAlpha * effAlpha * 1.15).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.lightRingRadius, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // 微小实心圆点（中世纪典雅墨记）
          ctx.fillStyle = `rgba(${p.lightColorRgb.r}, ${p.lightColorRgb.g}, ${p.lightColorRgb.b}, ${(p.lightAlpha * effAlpha).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.lightRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // --- 暗色（深邃星空与呼吸闪烁）绘制 ---
      if (themeRatio > 0.001) {
        const pActive = i < lightLimit ? 1 : themeRatio;
        if (pActive > 0.01) {
          // 正弦呼吸闪烁算法 (Twinkle 效果)
          const twinkle = p.darkBaseAlpha + Math.sin(nowSec * p.twinkleSpeed + p.twinklePhase) * p.twinkleAmp;
          const currentAlpha = Math.max(0.12, Math.min(1.0, twinkle)) * themeRatio * pActive;

          // 核心星辰本体
          ctx.fillStyle = `rgba(${p.darkRgb.r}, ${p.darkRgb.g}, ${p.darkRgb.b}, ${currentAlpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.darkRadius, 0, Math.PI * 2);
          ctx.fill();

          // 稍大明亮星辰的柔和微光晕 (Glow Halo)
          if (p.darkRadius > 1.6 && currentAlpha > 0.35) {
            ctx.fillStyle = `rgba(${p.darkRgb.r}, ${p.darkRgb.g}, ${p.darkRgb.b}, ${(currentAlpha * 0.18).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.darkRadius * 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    const frameDelta = lastFrameTimestamp ? timestamp - lastFrameTimestamp : 16.67;
    lastFrameTimestamp = timestamp || 0;
    drawMeteors(frameDelta);
    animId = requestAnimationFrame(render);
  }

  function startAnimation() {
    if (isRunning) return;
    if (prefersReducedMotion()) return;
    if (!isStoredEnabled()) return;

    ensureContainer();
    if (container) container.style.display = "block";
    resize();
    themeRatio = isDarkTheme() ? 1.0 : 0.0;
    isRunning = true;
    scheduleMeteor();
    animId = requestAnimationFrame(render);
  }

  function pauseAnimation() {
    if (!isRunning) return;
    isRunning = false;
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    if (meteorTimer) {
      clearTimeout(meteorTimer);
      meteorTimer = null;
    }
  }

  function resumeAnimation() {
    if (!isRunning && isStoredEnabled() && !prefersReducedMotion()) {
      isRunning = true;
      scheduleMeteor();
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
    meteors.length = 0;
    if (meteorTimer) {
      clearTimeout(meteorTimer);
      meteorTimer = null;
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

  // Batch 2：省流量模式（navigator.connection.saveData）下不启动粒子。
  function prefersSaveData() {
    const conn = typeof navigator !== "undefined"
      ? (navigator.connection || navigator.mozConnection || navigator.webkitConnection)
      : null;
    return Boolean(conn && conn.saveData);
  }

  // Batch 2：本模块由 js/lazy.js 在首屏渲染完成后的空闲时段载入，载入即装配。
  function init() {
    ensureContainer();
    initPointerListeners();

    if (isStoredEnabled() && !prefersReducedMotion() && !prefersSaveData()) {
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
    triggerMeteor: function () {
      return spawnMeteor(true);
    },
    getMeteorCount: function () {
      return meteors.length;
    },
    updateTheme: () => {
      // 外部可主动触发主题检查
      if (isRunning) {
        // themeRatio will smoothly adapt in render()
      }
    }
  };
});
