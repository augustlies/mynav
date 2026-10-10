/**
 * 模块：典藏文化、馆长手记与金石印章体系 (js/lore.js)
 * 职责：
 * 1. 馆长手记与出版版记模态抽屉 (Curator's Colophon Drawer)
 * 2. 纯矢量朱砂方印 (Cinnabar Seal SVG) 与出版规格详记
 * 3. 典藏里程碑系统 (Reading Milestones & Stone Seals):
 *    - 初访者 (Level 0)
 *    - 藏书研习生 (Level 1: 收藏≥3 或 访问≥10) -> 铜墨印
 *    - 饱学文士 (Level 2: 收藏≥6 或 访问≥25) -> 青玉印
 *    - 掌卷名宿 (Level 3: 收藏≥10 或 访问≥50) -> 金石朱砂印
 * 4. 自动在刊头元数据栏呈现动态金石微印章，点击弹出典藏勋绩铭牌
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavLore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 里程碑段位定义
  const MILESTONES = [
    {
      level: 3,
      minFav: 10,
      minVisits: 50,
      name: "掌卷名宿",
      code: "MASTER",
      sealClass: "seal-cinnabar",
      sealGlyph: "印",
      motto: "“博古通今 · 坐拥百城之富”",
      desc: "典藏卷轶丰赡，涉猎涉足甚广。已臻私人藏书馆最高研习境界。"
    },
    {
      level: 2,
      minFav: 6,
      minVisits: 25,
      name: "饱学文士",
      code: "SCHOLAR",
      sealClass: "seal-jade",
      sealGlyph: "章",
      motto: "“文质彬彬 · 方寸书海泛舟”",
      desc: "案头常置典册，卷轴翻阅不辍。对数字工具与研习领域颇具心得。"
    },
    {
      level: 1,
      minFav: 3,
      minVisits: 10,
      name: "研习学徒",
      code: "ADEPT",
      sealClass: "seal-bronze",
      sealGlyph: "记",
      motto: "“笃行始发 · 探微索隐之路”",
      desc: "初启私人藏阁，编目渐入佳境。已迈出构建个人知识谱系之关键步。"
    }
  ];

  let isColophonOpen = false;
  let lastActiveElement = null;

  // 1. 计算当前里程碑成就
  function getMilestoneProgress() {
    let favCount = 0;
    let visitCount = 0;

    const sites = (typeof window !== "undefined" && window.NAV_DATA && Array.isArray(window.NAV_DATA.sites))
      ? window.NAV_DATA.sites
      : [];

    if (typeof window !== "undefined" && window.NavFavorites) {
      favCount = sites.filter(s => window.NavFavorites.has(s.id)).length;
    }

    if (typeof window !== "undefined" && window.NavVisits) {
      sites.forEach(s => {
        const stat = window.NavVisits.getStat(s.id);
        if (stat && stat.count) {
          visitCount += stat.count;
        }
      });
    }

    // 匹配最高达成档位
    for (const m of MILESTONES) {
      if (favCount >= m.minFav || visitCount >= m.minVisits) {
        return {
          current: m,
          favCount,
          visitCount,
          achieved: true
        };
      }
    }

    return {
      current: null,
      favCount,
      visitCount,
      achieved: false
    };
  }

  // 2. 渲染刊头金石印章徽记
  function renderMastheadSeal(container) {
    if (!container) return;
    const progress = getMilestoneProgress();

    if (!progress.achieved || !progress.current) {
      container.innerHTML = "";
      container.style.display = "none";
      return;
    }

    const m = progress.current;
    container.style.display = "inline-flex";
    container.innerHTML = `
      <button
        type="button"
        class="milestone-seal-badge ${m.sealClass}"
        id="btn-milestone-seal"
        title="点击查阅典藏里程碑：${escapeHtml(m.name)}"
        aria-label="典藏里程碑：${escapeHtml(m.name)}，已收藏 ${progress.favCount} 卷，阅历 ${progress.visitCount} 次"
      >
        <span class="seal-glyph" aria-hidden="true">${m.sealGlyph}</span>
        <span class="seal-name">${escapeHtml(m.name)}</span>
      </button>
    `;

    const btn = container.querySelector("#btn-milestone-seal");
    if (btn) {
      btn.addEventListener("click", () => openMilestoneModal(progress));
    }
  }

  // 3. 打开里程碑荣誉弹窗
  function openMilestoneModal(progress) {
    if (!progress || !progress.current) return;
    const m = progress.current;

    if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
      window.NavShortcuts.showToast(
        `典藏勋绩：${m.name}`,
        `已收录 ${progress.favCount} 卷 · 累计阅卷 ${progress.visitCount} 次`,
        "🏛"
      );
    }

    // 同时展开手记抽屉并将焦点聚焦到荣誉区
    openColophon("milestone");
  }

  // 4. 纯矢量朱砂方印 SVG
  function renderCinnabarSealSvg() {
    return `
      <svg class="cinnabar-seal-svg" viewBox="0 0 160 160" width="100" height="100" xmlns="http://www.w3.org/2000/svg" aria-label="馆长朱砂钤印">
        <!-- 外双线古印边框 -->
        <rect x="6" y="6" width="148" height="148" rx="8" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="120,4,20,3" opacity="0.95"/>
        <rect x="14" y="14" width="132" height="132" rx="4" fill="none" stroke="currentColor" stroke-width="2" opacity="0.85"/>
        <!-- 内部朱文篆体文字与几何线 -->
        <g fill="currentColor" text-anchor="middle" font-family="'Noto Serif SC', serif" font-weight="900">
          <text x="50" y="55" font-size="28" letter-spacing="2">私</text>
          <text x="110" y="55" font-size="28" letter-spacing="2">人</text>
          <text x="50" y="98" font-size="28" letter-spacing="2">藏</text>
          <text x="110" y="98" font-size="28" letter-spacing="2">书</text>
          <text x="80" y="136" font-size="20" letter-spacing="4">丙午</text>
        </g>
        <!-- 古印斑驳肌理点缀 -->
        <circle cx="28" cy="30" r="1.5" fill="currentColor" opacity="0.6"/>
        <circle cx="132" cy="78" r="1.2" fill="currentColor" opacity="0.5"/>
        <circle cx="82" cy="24" r="1.4" fill="currentColor" opacity="0.7"/>
        <circle cx="120" cy="128" r="1.5" fill="currentColor" opacity="0.6"/>
      </svg>
    `;
  }

  // 5. 馆长手记模态窗开闭
  function openColophon(focusSection = "about") {
    const modal = document.getElementById("colophon-modal");
    if (!modal) return;
    lastActiveElement = document.activeElement;

    // 动态渲染里程碑状态区块
    const milestoneBox = document.getElementById("colophon-milestone-box");
    if (milestoneBox) {
      const progress = getMilestoneProgress();
      if (progress.achieved && progress.current) {
        const m = progress.current;
        milestoneBox.innerHTML = `
          <div class="colophon-milestone-card ${m.sealClass}">
            <div class="milestone-badge-display">
              <span class="milestone-big-glyph">${m.sealGlyph}</span>
              <div>
                <span class="milestone-stage-tag">[ 阶段 ${m.level} · 勋阶 ]</span>
                <h4 class="milestone-title-text">${escapeHtml(m.name)}</h4>
              </div>
            </div>
            <p class="milestone-motto">${escapeHtml(m.motto)}</p>
            <p class="milestone-desc-text">${escapeHtml(m.desc)}</p>
            <div class="milestone-stats-rail">
              <span>已收入私人典藏：<strong>${progress.favCount}</strong> 卷</span>
              <span>·</span>
              <span>累计案头翻阅：<strong>${progress.visitCount}</strong> 次</span>
            </div>
          </div>
        `;
        milestoneBox.style.display = "block";
      } else {
        milestoneBox.innerHTML = `
          <div class="colophon-milestone-card seal-init">
            <span class="milestone-stage-tag">[ 典藏初启 ]</span>
            <p class="milestone-desc-text">收藏 3 卷藏书或案头翻阅达 10 次，即可解锁第一枚「研习学徒」金石藏书印。</p>
            <div class="milestone-stats-rail">
              <span>当前收藏：<strong>${progress.favCount}</strong> / 3 卷</span>
              <span>·</span>
              <span>当前翻阅：<strong>${progress.visitCount}</strong> / 10 次</span>
            </div>
          </div>
        `;
        milestoneBox.style.display = "block";
      }
    }

    // 动态载入朱砂印章
    const sealSlot = document.getElementById("colophon-seal-slot");
    if (sealSlot && !sealSlot.hasChildNodes()) {
      sealSlot.innerHTML = renderCinnabarSealSvg();
    }

    modal.style.display = "flex";
    document.body.classList.add("modal-open");
    isColophonOpen = true;

    if (focusSection === "milestone" && milestoneBox) {
      milestoneBox.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    const closeBtn = document.getElementById("btn-close-colophon");
    if (closeBtn) closeBtn.focus();
  }

  function closeColophon() {
    const modal = document.getElementById("colophon-modal");
    if (!modal) return;
    modal.style.display = "none";
    document.body.classList.remove("modal-open");
    isColophonOpen = false;

    if (lastActiveElement && typeof lastActiveElement.focus === "function") {
      lastActiveElement.focus();
    }
  }

  function toggleColophon() {
    if (isColophonOpen) {
      closeColophon();
    } else {
      openColophon();
    }
  }

  // 6. 搜索词智能彩蛋探测
  function checkSearchEasterEgg(query) {
    if (!query) return false;
    const q = query.trim().toLowerCase();
    const eggKeywords = ["关于", "馆长", "手记", "建馆", "ex libris", "colophon", "about", "理念"];
    return eggKeywords.some(kw => q === kw);
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

  function init() {
    // 绑定关闭按钮与遮罩点击
    const closeBtn = document.getElementById("btn-close-colophon");
    if (closeBtn) closeBtn.addEventListener("click", closeColophon);

    const dismissBtn = document.getElementById("btn-dismiss-colophon");
    if (dismissBtn) dismissBtn.addEventListener("click", closeColophon);

    const modal = document.getElementById("colophon-modal");
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeColophon();
      });
    }

    // 绑定刊头 EX LIBRIS 标志点击
    const colophonBadge = document.getElementById("btn-colophon-mark");
    if (colophonBadge) {
      colophonBadge.addEventListener("click", () => openColophon("about"));
    }

    // 快捷键 c / C 监听
    window.addEventListener("keydown", function (e) {
      if (e.key === "c" || e.key === "C") {
        const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
        if (tag !== "input" && tag !== "textarea" && !document.body.classList.contains("modal-open")) {
          e.preventDefault();
          toggleColophon();
        }
      }
      if (e.key === "Escape" && isColophonOpen) {
        e.preventDefault();
        closeColophon();
      }
    });

    // 初始渲染刊头金石印章
    const sealSlot = document.getElementById("masthead-milestone-slot");
    if (sealSlot) {
      renderMastheadSeal(sealSlot);
    }
  }

  return {
    init,
    open: openColophon,
    close: closeColophon,
    toggle: toggleColophon,
    checkSearchEasterEgg,
    renderMastheadSeal,
    getMilestoneProgress
  };
});
