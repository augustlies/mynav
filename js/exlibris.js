/**
 * 模块：Ex Libris 专属数字藏书票引擎 (js/exlibris.js)
 * 职责：
 * 1. 依据网站稳定 ID 计算确定性哈希，生成独一无二的古典版印/几何纹样 SVG 藏书票
 * 2. 融合分类色调、几何星芒、双细线饰框、EX LIBRIS 刊头、典藏印记徽标与域名铭文
 * 3. 纯原生纯前端绘制，零外部网络与图片生成依赖，规避跨域画布污染
 * 4. 提供 Retina 高分辨率 (800x1200) HTML5 Canvas 导出 PNG 功能
 * 5. 模态展示层无障碍键盘焦点管理与响应式缩放
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavExLibris = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 1. 确定性哈希发生器 (FNV-1a 32-bit Hash)
  function hashString(str) {
    let hash = 2166136261;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // 2. 分类色彩美学体系
  const CATEGORY_THEMES = {
    ai: {
      ink: "#2E3E2D",       // 沉静橄榄墨
      accent: "#B8621B",    // 赭石金
      bg: "#F7F5EE",        // 暖象牙纸
      subtle: "rgba(46, 62, 45, 0.12)",
      line: "rgba(46, 62, 45, 0.28)",
      motto: "“思辨于方寸 · 智能之航标”",
      latin: "RATIO ET INTELLIGENTIA ARTIFICIALIS",
      motifCategory: "astral"
    },
    dev: {
      ink: "#233544",       // 铁灰钢蓝墨
      accent: "#B85C28",    // 铜红
      bg: "#F5F6F8",        // 羊皮浅灰
      subtle: "rgba(35, 53, 68, 0.12)",
      line: "rgba(35, 53, 68, 0.28)",
      motto: "“工匠琢器 · 构筑数字苍穹”",
      latin: "ARCHITECTURA ET CODEX UNIVERSALIS",
      motifCategory: "geometric"
    },
    knowledge: {
      ink: "#4A3228",       // 古典书皮栗褐
      accent: "#3F523E",    // 沉绿
      bg: "#F9F6F0",        // 典藏暖白
      subtle: "rgba(74, 50, 40, 0.12)",
      line: "rgba(74, 50, 40, 0.28)",
      motto: "“博学审问 · 慎思明辨笃行”",
      latin: "LITTERAE MANENT · LUX ET SAPIENTIA",
      motifCategory: "classical"
    },
    tools: {
      ink: "#3A3631",       // 炭灰胡桃木墨
      accent: "#A66324",    // 琥珀金
      bg: "#F6F4EE",        // 案头雅白
      subtle: "rgba(58, 54, 49, 0.12)",
      line: "rgba(58, 54, 49, 0.28)",
      motto: "“善假于物 · 案头运斤成风”",
      latin: "INSTRUMENTA PRAESTANTIA ET DISCIPLINA",
      motifCategory: "precision"
    }
  };

  const DEFAULT_THEME = {
    ink: "#2D2E28",
    accent: "#B8621B",
    bg: "#F6F4EE",
    subtle: "rgba(45, 46, 40, 0.12)",
    line: "rgba(45, 46, 40, 0.28)",
    motto: "“私人典藏 · 静水流深”",
    latin: "EX LIBRIS ET ARCHIVIS PRIVATIS",
    motifCategory: "astral"
  };

  function escapeXml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  // 3. 几何星芒与徽标图案生成器
  function generateCentralCrest(cx, cy, radius, hash, theme) {
    const seedA = hash & 0xff;
    const seedB = (hash >> 8) & 0xff;
    const seedC = (hash >> 16) & 0xff;

    const shapes = [];

    // 外层同心微饰环
    shapes.push(`
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${theme.ink}" stroke-width="1.8"/>
      <circle cx="${cx}" cy="${cy}" r="${radius - 5}" fill="none" stroke="${theme.line}" stroke-width="0.9" stroke-dasharray="3 2"/>
      <circle cx="${cx}" cy="${cy}" r="${radius - 12}" fill="none" stroke="${theme.ink}" stroke-width="0.8"/>
    `);

    // 放射状刻度/齿轮光芒
    const rayCount = 12 + (seedA % 5) * 4; // 12, 16, 20, 24, 28
    const innerRayR = radius - 11;
    const outerRayR = radius - 6;
    let raysPath = "";
    for (let i = 0; i < rayCount; i++) {
      const angle = (i * 2 * Math.PI) / rayCount;
      const x1 = cx + innerRayR * Math.cos(angle);
      const y1 = cy + innerRayR * Math.sin(angle);
      const x2 = cx + outerRayR * Math.cos(angle);
      const y2 = cy + outerRayR * Math.sin(angle);
      raysPath += `M${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)} `;
    }
    shapes.push(`<path d="${raysPath}" stroke="${theme.accent}" stroke-width="1" stroke-opacity="0.85"/>`);

    // 核心几何骨骼 (依哈希派生：多芒星、星盘、菱形花瓣或透视罗盘)
    const motifVariant = seedB % 4;
    const coreR = radius - 24;

    if (motifVariant === 0) {
      // 8角双重罗盘星
      let starPath = "";
      const points = 8;
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? coreR : coreR * 0.45;
        const a = (i * Math.PI) / points - Math.PI / 2;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        starPath += (i === 0 ? "M" : "L") + `${x.toFixed(1)},${y.toFixed(1)} `;
      }
      starPath += "Z";
      shapes.push(`
        <path d="${starPath}" fill="${theme.subtle}" stroke="${theme.ink}" stroke-width="1.2"/>
        <circle cx="${cx}" cy="${cy}" r="${coreR * 0.45}" fill="none" stroke="${theme.accent}" stroke-width="1"/>
      `);
    } else if (motifVariant === 1) {
      // 嵌套四叶玫瑰/哥特花窗环
      shapes.push(`
        <rect x="${cx - coreR * 0.7}" y="${cy - coreR * 0.7}" width="${coreR * 1.4}" height="${coreR * 1.4}" 
              fill="none" stroke="${theme.ink}" stroke-width="1" transform="rotate(45 ${cx} ${cy})"/>
        <rect x="${cx - coreR * 0.7}" y="${cy - coreR * 0.7}" width="${coreR * 1.4}" height="${coreR * 1.4}" 
              fill="none" stroke="${theme.line}" stroke-width="1"/>
        <circle cx="${cx}" cy="${cy}" r="${coreR * 0.7}" fill="${theme.subtle}" stroke="${theme.accent}" stroke-width="1.2"/>
      `);
    } else if (motifVariant === 2) {
      // 12 芒日晷星盘
      let poly12 = "";
      for (let i = 0; i < 12; i++) {
        const a = (i * 2 * Math.PI) / 12;
        const x1 = cx + coreR * Math.cos(a);
        const y1 = cy + coreR * Math.sin(a);
        poly12 += `M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} `;
      }
      shapes.push(`
        <circle cx="${cx}" cy="${cy}" r="${coreR}" fill="${theme.subtle}" stroke="${theme.ink}" stroke-width="1.2"/>
        <path d="${poly12}" stroke="${theme.line}" stroke-width="0.8"/>
        <circle cx="${cx}" cy="${cy}" r="${coreR * 0.5}" fill="${theme.bg}" stroke="${theme.accent}" stroke-width="1.2"/>
      `);
    } else {
      // 菱形同心盾印
      shapes.push(`
        <polygon points="${cx},${cy - coreR} ${cx + coreR},${cy} ${cx},${cy + coreR} ${cx - coreR},${cy}" 
                 fill="${theme.subtle}" stroke="${theme.ink}" stroke-width="1.4"/>
        <polygon points="${cx},${cy - coreR * 0.65} ${cx + coreR * 0.65},${cy} ${cx},${cy + coreR * 0.65} ${cx - coreR * 0.65},${cy}" 
                 fill="none" stroke="${theme.accent}" stroke-width="1" stroke-dasharray="2 2"/>
      `);
    }

    // 中心印信圆台 (Medallion Monogram Bed)
    const medalR = 26;
    shapes.push(`
      <circle cx="${cx}" cy="${cy}" r="${medalR}" fill="${theme.bg}" stroke="${theme.ink}" stroke-width="1.5"/>
      <circle cx="${cx}" cy="${cy}" r="${medalR - 3}" fill="none" stroke="${theme.line}" stroke-width="0.8"/>
    `);

    return shapes.join("\n");
  }

  // 4. 生成边角雕刻卷草花纹 (Corner Vignettes)
  function generateCornerFlourishes(theme) {
    return `
      <!-- 四角古典花角 -->
      <g stroke="${theme.ink}" stroke-width="1" fill="none">
        <!-- 左上角 -->
        <path d="M22,34 L22,22 L34,22 M22,22 L30,30 M26,22 A4,4 0 0,0 22,26"/>
        <!-- 右上角 -->
        <path d="M378,34 L378,22 L366,22 M378,22 L370,30 M374,22 A4,4 0 0,1 378,26"/>
        <!-- 左下角 -->
        <path d="M22,566 L22,578 L34,578 M22,578 L30,570 M26,578 A4,4 0 0,1 22,574"/>
        <!-- 右下角 -->
        <path d="M378,566 L378,578 L366,578 M378,578 L370,570 M374,578 A4,4 0 0,0 378,574"/>
      </g>
    `;
  }

  // 5. 核心 SVG 藏书票渲染器 (400x600 viewBox)
  function renderBookplateSvg(site) {
    if (!site) return "";
    const hash = hashString(site.id);
    const cat = site.category || "ai";
    const theme = CATEGORY_THEMES[cat] || DEFAULT_THEME;

    const emblemChar = escapeXml(site.icon || site.name.slice(0, 2)).toUpperCase();
    const siteName = escapeXml(site.name);
    const categoryName = escapeXml(site.category ? `CAT · ${site.category.toUpperCase()}` : "ARCHIVUM");

    let domain = "";
    try {
      const u = new URL(site.url);
      domain = u.hostname.toUpperCase();
    } catch (e) {
      domain = site.url || "";
    }
    domain = escapeXml(domain);

    const cornerFlourishes = generateCornerFlourishes(theme);
    const crestSvg = generateCentralCrest(200, 245, 82, hash, theme);

    return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" width="100%" height="100%" class="exlibris-svg">
  <defs>
    <style>
      .ex-serif { font-family: "Songti SC", "Source Han Serif SC", "Noto Serif SC", "STSong", "SimSun", Georgia, "Baskerville", serif; }
      .ex-mono  { font-family: ui-monospace, SFMono-Regular, "Roboto Mono", Menlo, Consolas, monospace; }
      .ex-sans  { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif; }
    </style>
    <linearGradient id="paperGrad_${hash}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.bg}"/>
      <stop offset="100%" stop-color="#EFECE3"/>
    </linearGradient>
  </defs>

  <!-- 1. 暖象牙底纸质感基底 -->
  <rect width="400" height="600" fill="url(#paperGrad_${hash})"/>

  <!-- 2. 多重古典雕版细框外缘 -->
  <rect x="14" y="14" width="372" height="572" fill="none" stroke="${theme.ink}" stroke-width="2"/>
  <rect x="18" y="18" width="364" height="564" fill="none" stroke="${theme.line}" stroke-width="0.8"/>
  <rect x="22" y="22" width="356" height="556" fill="none" stroke="${theme.ink}" stroke-width="0.8" stroke-dasharray="4 2"/>

  ${cornerFlourishes}

  <!-- 3. 顶部刊头章印 (Editorial Masthead) -->
  <g text-anchor="middle">
    <!-- 装饰小皇冠/小三叶纹 -->
    <path d="M194,52 L200,44 L206,52 L202,52 L200,49 L198,52 Z" fill="${theme.accent}"/>
    <circle cx="186" cy="51" r="1.5" fill="${theme.accent}"/>
    <circle cx="214" cy="51" r="1.5" fill="${theme.accent}"/>

    <!-- 罗马大字 EX LIBRIS -->
    <text x="200" y="80" 
          class="ex-serif" 
          font-size="24" 
          font-weight="700" 
          letter-spacing="0.22em" 
          fill="${theme.ink}">· EX LIBRIS ·</text>

    <!-- 拉丁古典小卷题铭 -->
    <text x="200" y="98" 
          class="ex-mono" 
          font-size="8.5" 
          font-weight="600" 
          letter-spacing="0.16em" 
          fill="${theme.accent}">BIBLIOTHECA DIGITALIS · VOL. 2026</text>
    
    <path d="M70,112 L330,112" stroke="${theme.ink}" stroke-width="0.8"/>
    <path d="M110,115 L290,115" stroke="${theme.line}" stroke-width="0.6"/>
  </g>

  <!-- 4. 典藏专栏编号徽记 -->
  <g transform="translate(200, 134)" text-anchor="middle">
    <rect x="-48" y="-9" width="96" height="18" fill="${theme.bg}" stroke="${theme.ink}" stroke-width="0.8" rx="2"/>
    <text x="0" y="3.5" class="ex-mono" font-size="8.5" font-weight="700" letter-spacing="0.12em" fill="${theme.ink}">${categoryName}</text>
  </g>

  <!-- 5. 核心确定性几何星芒图章 (Central Heraldic Crest) -->
  <g>
    ${crestSvg}

    <!-- 图标中心字母印信 (Monogram) -->
    <text x="200" y="254" 
          class="ex-serif" 
          text-anchor="middle" 
          font-size="${emblemChar.length > 2 ? 16 : 20}" 
          font-weight="700" 
          fill="${theme.ink}" 
          letter-spacing="0.05em">${emblemChar}</text>
  </g>

  <!-- 6. 网站卷名横幅 (Title Cartouche) -->
  <g text-anchor="middle">
    <path d="M90,366 L310,366" stroke="${theme.line}" stroke-width="0.8"/>
    
    <!-- 藏书主标题 -->
    <text x="200" y="400" 
          class="ex-serif" 
          font-size="22" 
          font-weight="700" 
          letter-spacing="0.06em" 
          fill="${theme.ink}">${siteName}</text>

    <!-- 域名卷标 -->
    <text x="200" y="424" 
          class="ex-mono" 
          font-size="10.5" 
          letter-spacing="0.1em" 
          fill="${theme.accent}">${domain}</text>

    <path d="M130,442 L270,442" stroke="${theme.ink}" stroke-width="0.8"/>
    <circle cx="200" cy="442" r="2.5" fill="${theme.accent}"/>
  </g>

  <!-- 7. 藏书铭言与馆藏背书铭文 -->
  <g text-anchor="middle">
    <!-- 中文格言 -->
    <text x="200" y="476" 
          class="ex-serif" 
          font-size="11" 
          font-style="italic" 
          letter-spacing="0.08em" 
          fill="${theme.ink}">${theme.motto}</text>

    <!-- 拉丁文底护箴言 -->
    <text x="200" y="502" 
          class="ex-mono" 
          font-size="8" 
          letter-spacing="0.14em" 
          fill="${theme.ink}" 
          opacity="0.85">${theme.latin}</text>
  </g>

  <!-- 8. 刊末私人印押与版号 -->
  <g text-anchor="middle">
    <path d="M60,530 L340,530" stroke="${theme.line}" stroke-width="0.6"/>
    <text x="200" y="548" 
          class="ex-mono" 
          font-size="8" 
          letter-spacing="0.18em" 
          fill="${theme.ink}" 
          opacity="0.75">IN ARCHIVIS PRIVATIS FIDELITER CONSERVATUM</text>
    <text x="200" y="562" 
          class="ex-mono" 
          font-size="7.5" 
          letter-spacing="0.2em" 
          fill="${theme.accent}">№ ${hash.toString(16).toUpperCase().padStart(8, "0")}</text>
  </g>
</svg>
`.trim();
  }

  // 6. SVG 转换为高清 PNG (800x1200, 2x Retina)
  function exportBookplatePng(site, callback) {
    if (!site) return;
    const svgCode = renderBookplateSvg(site);
    const svgBlob = new Blob([svgCode], { type: "image/svg+xml;charset=utf-8" });
    const blobUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = function () {
      const exportWidth = 800;
      const exportHeight = 1200;
      const canvas = document.createElement("canvas");
      canvas.width = exportWidth;
      canvas.height = exportHeight;
      const ctx = canvas.getContext("2d");

      // 填充底色保障无透明穿透
      ctx.fillStyle = "#F7F5EE";
      ctx.fillRect(0, 0, exportWidth, exportHeight);

      // 高质量平滑缩放
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, exportWidth, exportHeight);

      URL.revokeObjectURL(blobUrl);

      try {
        const pngDataUrl = canvas.toDataURL("image/png");
        if (typeof callback === "function") {
          callback(null, pngDataUrl);
        } else {
          // 默认直接触发文件下载
          const a = document.createElement("a");
          const safeName = (site.name || site.id).replace(/[^\w\u4e00-\u9fa5-_]/g, "_");
          a.download = `ExLibris_${safeName}_2026.png`;
          a.href = pngDataUrl;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      } catch (err) {
        console.error("[NavExLibris] Canvas 导出 PNG 异常:", err);
        if (typeof callback === "function") callback(err);
      }
    };

    img.onerror = function (e) {
      URL.revokeObjectURL(blobUrl);
      console.error("[NavExLibris] SVG 渲染至 Image 失败:", e);
      if (typeof callback === "function") callback(new Error("SVG 渲染失败"));
    };

    img.src = blobUrl;
  }

  // 7. 模态画框控制器 (Modal Viewer)
  let currentSite = null;
  let lastActiveElement = null;

  function openModal(site) {
    if (!site) return;
    currentSite = site;
    lastActiveElement = document.activeElement;

    const modal = document.getElementById("bookplate-modal");
    const previewArea = document.getElementById("bookplate-preview-area");
    const modalTitle = document.getElementById("bookplate-modal-title");

    if (!modal || !previewArea) return;

    if (modalTitle) {
      modalTitle.textContent = `${site.name} · 藏书票印画`;
    }

    // 注入生成的矢量 SVG
    previewArea.innerHTML = renderBookplateSvg(site);
    modal.style.display = "flex";
    document.body.classList.add("modal-open");

    // 聚焦于关闭按钮
    const closeBtn = document.getElementById("btn-close-bookplate");
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    const modal = document.getElementById("bookplate-modal");
    if (modal) {
      modal.style.display = "none";
      document.body.classList.remove("modal-open");
    }
    currentSite = null;
    if (lastActiveElement && typeof lastActiveElement.focus === "function") {
      lastActiveElement.focus();
    }
  }

  function initListeners() {
    // 监听关闭按钮
    const closeBtn = document.getElementById("btn-close-bookplate");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    const dismissBtn = document.getElementById("btn-dismiss-bookplate");
    if (dismissBtn) dismissBtn.addEventListener("click", closeModal);

    // 监听导出 PNG
    const exportBtn = document.getElementById("btn-export-bookplate-png");
    if (exportBtn) {
      exportBtn.addEventListener("click", function () {
        if (!currentSite) return;
        const origText = exportBtn.innerHTML;
        exportBtn.innerHTML = "<span>⏳ 正在生成印画...</span>";
        exportBtn.disabled = true;

        exportBookplatePng(currentSite, (err) => {
          exportBtn.disabled = false;
          exportBtn.innerHTML = origText;
          if (err) alert("导出 PNG 失败，请检查浏览器权限。");
        });
      });
    }

    // 点击背景遮罩关闭
    const modal = document.getElementById("bookplate-modal");
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeModal();
      });
    }

    // 快捷键 Esc 关闭
    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        const m = document.getElementById("bookplate-modal");
        if (m && m.style.display !== "none") {
          closeModal();
        }
      }
    });
  }

  return {
    init() {
      initListeners();
    },
    renderSvg: renderBookplateSvg,
    exportPng: exportBookplatePng,
    open: openModal,
    close: closeModal
  };
});
