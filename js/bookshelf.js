/**
 * 模块：3D 藏书馆书架视图引擎 (js/bookshelf.js)
 * 职责：
 * 1. 构建独立杂志排印风格的立体私人书架（Editorial 3D Bookshelf）
 * 2. 依据访问频次与稳定 ID 算法计算书脊厚度（26px ~ 44px）与真实高低起伏（214px ~ 232px）
 * 3. 悬停/聚焦抽书动效 (3D Pull-out)，露出书封与侧向典藏便签 (Flyout Card)
 * 4. 纯 CSS 3D + 原生 DOM 计算，零外部三维库依赖（无 Three.js），轻量高效
 * 5. 移动端触屏自适应为平滑横向滚动滑轨，严格尊重 prefers-reduced-motion
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavBookshelf = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 1. 确定性哈希运算 (FNV-1a 32-bit Hash)
  function hashString(str) {
    let hash = 2166136261;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // 2. 分类书脊装订色彩美学体系 (皮革、布面与装帧纸质色调)
  const SHELF_PALETTES = {
    ai: {
      bg: "linear-gradient(180deg, #2D3E2C 0%, #1F2D1F 100%)",
      border: "#3F563E",
      foil: "#E5A962",         // 烫金
      text: "#F4EBD9",
      accent: "#B8621B",
      edge: "#E8E2D5"
    },
    dev: {
      bg: "linear-gradient(180deg, #243545 0%, #172430 100%)",
      border: "#364F65",
      foil: "#D97746",         // 铜红
      text: "#EDF2F7",
      accent: "#B85C28",
      edge: "#E5E7EB"
    },
    knowledge: {
      bg: "linear-gradient(180deg, #442E25 0%, #2E1D16 100%)",
      border: "#5C3E32",
      foil: "#D4B07B",         // 古金
      text: "#F9F3EA",
      accent: "#3F523E",
      edge: "#F1EBE1"
    },
    tools: {
      bg: "linear-gradient(180deg, #332F2A 0%, #221F1B 100%)",
      border: "#4B443D",
      foil: "#CCA05A",         // 琥珀金
      text: "#F5F0E8",
      accent: "#A66324",
      edge: "#EBE5DB"
    },
    favorites: {
      bg: "linear-gradient(180deg, #4E1E26 0%, #341218 100%)",
      border: "#6E2B36",
      foil: "#F5C26B",         // 绯红烫金
      text: "#FDF8F0",
      accent: "#B83A4B",
      edge: "#F5EFE6"
    },
    frequent: {
      bg: "linear-gradient(180deg, #462E1A 0%, #2E1D0E 100%)",
      border: "#634226",
      foil: "#E2AA54",         // 鞍褐古金
      text: "#FAF4EC",
      accent: "#C27A23",
      edge: "#EDE5D8"
    }
  };

  const DEFAULT_PALETTE = {
    bg: "linear-gradient(180deg, #2F302A 0%, #1F201C 100%)",
    border: "#44463C",
    foil: "#D4B07B",
    text: "#F6F4EE",
    accent: "#B8621B",
    edge: "#EAE5D9"
  };

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function extractDomain(url) {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, "");
    } catch (e) {
      return url || "";
    }
  }

  // 3. 计算书脊厚度与真实起伏
  function calculateDimensions(site) {
    const visits = window.NavVisits ? (window.NavVisits.getStat(site.id) ? window.NavVisits.getStat(site.id).count : 0) : 0;
    // 厚度限制在 26px ~ 44px
    const width = Math.min(44, Math.max(26, 26 + visits * 2));

    // 高度微起伏 214px ~ 232px
    const hash = hashString(site.id);
    const heightOffset = (hash % 7) * 3;
    const height = 214 + heightOffset;

    return { width, height };
  }

  // 4. 生成单本书籍 3D DOM (Book Item)
  function createBookItemHtml(site, index, categoryContext, query = "") {
    const { width, height } = calculateDimensions(site);
    const domain = extractDomain(site.url);
    const emblemText = escapeHtml(site.icon || site.name.slice(0, 2));
    const isBookmarked = window.NavFavorites ? window.NavFavorites.has(site.id) : false;
    const indexStr = String(index + 1).padStart(2, "0");

    const catKey = categoryContext || site.category;
    const palette = SHELF_PALETTES[catKey] || DEFAULT_PALETTE;

    const displayName = (query && window.NavSearch)
      ? window.NavSearch.highlight(site.name, query)
      : escapeHtml(site.name);
    const displayDesc = (query && window.NavSearch)
      ? window.NavSearch.highlight(site.description || '暂无描述', query)
      : escapeHtml(site.description || '暂无描述');

    return `
      <div
        class="book-item"
        role="listitem"
        data-site-id="${escapeHtml(site.id)}"
        data-site-url="${escapeHtml(site.url)}"
        style="--spine-width: ${width}px; --book-height: ${height}px; --spine-bg: ${palette.bg}; --spine-border: ${palette.border}; --spine-foil: ${palette.foil}; --spine-text: ${palette.text}; --spine-edge: ${palette.edge};"
      >
        <div class="book-3d-wrap">
          <!-- 书顶面 (纸页顶缘) -->
          <div class="book-top-edge" aria-hidden="true"></div>

          <!-- 书脊正面 (Spine Face) -->
          <div
            class="book-spine-face"
            tabindex="0"
            role="button"
            aria-haspopup="dialog"
            aria-label="${escapeHtml(site.name)} · 藏书卷 №${indexStr}"
          >
            <!-- 书脊顶端：双金线与字母徽章 -->
            <div class="spine-head-band">
              <span class="spine-rule-gold" aria-hidden="true"></span>
              <span class="spine-monogram" title="${escapeHtml(site.name)}">${emblemText}</span>
              <span class="spine-rule-gold" aria-hidden="true"></span>
            </div>

            <!-- 书脊中部：竖排排印题名 -->
            <div class="spine-title-rail">
              <span class="spine-title-text">${escapeHtml(site.name)}</span>
            </div>

            <!-- 书脊底端：典藏星标与卷标 -->
            <div class="spine-tail-band">
              <span class="spine-bookmark-glyph ${isBookmarked ? 'active' : ''}" title="${isBookmarked ? '已典藏' : ''}">★</span>
              <span class="spine-volume-tag">№ ${indexStr}</span>
              <span class="spine-rule-gold" aria-hidden="true"></span>
            </div>
          </div>

          <!-- 书侧面露出部分 (纸页侧缘) -->
          <div class="book-side-edge" aria-hidden="true"></div>
        </div>

        <!-- 悬停与聚焦抽书便签 (Flyout Card) -->
        <div class="book-flyout-card" role="dialog" aria-label="${escapeHtml(site.name)} 书目卷卡">
          <div class="flyout-card-masthead">
            <div class="flyout-card-identity">
              <span class="flyout-card-emblem">${emblemText}</span>
              <div class="flyout-card-titles">
                <h4 class="flyout-card-name">${displayName}</h4>
                <span class="flyout-card-domain">${escapeHtml(domain)}</span>
              </div>
            </div>
            <button
              type="button"
              class="btn-flyout-bookmark ${isBookmarked ? 'bookmarked' : ''}"
              data-bookmark-id="${escapeHtml(site.id)}"
              title="${isBookmarked ? '取消典藏' : '收入典藏'}"
              aria-label="${isBookmarked ? '取消典藏 ' + site.name : '收藏 ' + site.name}"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14">
                ${isBookmarked
                  ? '<path fill="currentColor" d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>'
                  : '<path fill="currentColor" d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>'
                }
              </svg>
            </button>
          </div>

          <p class="flyout-card-desc" title="${escapeHtml(site.description || '')}">${displayDesc}</p>

          <div class="flyout-card-actions">
            <button
              type="button"
              class="btn-flyout-bookplate"
              data-bookplate-id="${escapeHtml(site.id)}"
              title="查看专属数字藏书票 (Ex Libris)"
            >
              📜 藏书票
            </button>
            <a
              href="${escapeHtml(site.url)}"
              target="_blank"
              rel="noopener noreferrer"
              class="btn-flyout-visit"
              data-shelf-visit-id="${escapeHtml(site.id)}"
              title="访问 ${escapeHtml(site.name)}"
            >
              开启阅览 ↗
            </a>
          </div>
        </div>
      </div>
    `;
  }

  // 5. 生成单层书架 (Bookshelf Tier)
  function createBookshelfTierHtml(title, code, desc, count, sites, actionHtml = "", categoryKey = "", query = "") {
    const booksHtml = sites.map((site, idx) => createBookItemHtml(site, idx, categoryKey, query)).join("");

    return `
      <section class="bookshelf-tier" data-tier-category="${escapeHtml(categoryKey)}">
        <!-- 书架黄铜铭牌栏 (Brass Plaque Header) -->
        <div class="bookshelf-plaque-bar">
          <div class="bookshelf-plaque">
            <span class="plaque-rivet rivet-left" aria-hidden="true"></span>
            <span class="plaque-code">[${escapeHtml(code)}]</span>
            <h2 class="plaque-title-text">${escapeHtml(title)}</h2>
            ${desc ? `<span class="plaque-desc-text">${escapeHtml(desc)}</span>` : ''}
            <span class="plaque-rivet rivet-right" aria-hidden="true"></span>
          </div>
          <div class="bookshelf-plaque-meta">
            ${actionHtml}
            <span class="bookshelf-count-tag">${count} 卷</span>
          </div>
        </div>

        <!-- 书架陈列箱体 (3D Chamber) -->
        <div class="bookshelf-chamber">
          <!-- 书架背壁 (Back Wall) -->
          <div class="bookshelf-backwall" aria-hidden="true"></div>

          <!-- 书籍 3D 舞台 (3D Stage with horizontal scroll) -->
          <div class="bookshelf-stage" role="region" aria-label="${escapeHtml(title)} 书架层">
            <div class="bookshelf-books-row" role="list">
              ${booksHtml}
              <!-- 古典雕花书立 (Brass Bookend) -->
              <div class="shelf-bookend" aria-hidden="true">
                <div class="bookend-body">
                  <span class="bookend-ornament">❦</span>
                </div>
                <div class="bookend-base"></div>
              </div>
            </div>
          </div>

          <!-- 底部厚重木纹层板梁 (Shelf Beam) -->
          <div class="bookshelf-wood-beam" aria-hidden="true">
            <div class="beam-top-ledge"></div>
            <div class="beam-face"></div>
            <div class="beam-under-shadow"></div>
          </div>
        </div>
      </section>
    `;
  }

  // 6. 视图渲染器
  function renderAllShelves(allSites, categories, favSites, freqSites) {
    const tiersHtml = [];

    // 私人典藏层
    if (favSites && favSites.length > 0) {
      tiersHtml.push(createBookshelfTierHtml("私人典藏阁", "FAV", "随时查阅的归档藏书", favSites.length, favSites, "", "favorites"));
    }

    // 常驻案头层
    if (freqSites && freqSites.length > 0) {
      tiersHtml.push(createBookshelfTierHtml("常驻案头", "TOP", "近期高频访问书卷", freqSites.length, freqSites, "", "frequent"));
    }

    // 分类书架层
    categories.forEach(cat => {
      const rawCatSites = allSites.filter(s => s.category === cat.id);
      const catSites = window.NavSortable ? window.NavSortable.sortSites(cat.id, rawCatSites) : rawCatSites;
      if (catSites.length > 0) {
        tiersHtml.push(createBookshelfTierHtml(cat.name, cat.code, cat.desc, catSites.length, catSites, "", cat.id));
      }
    });

    return `<div class="bookshelf-container">${tiersHtml.join("")}</div>`;
  }

  function renderSingleShelf(title, code, desc, sites, actionHtml, categoryKey) {
    const tierHtml = createBookshelfTierHtml(title, code, desc, sites.length, sites, actionHtml, categoryKey);
    return `<div class="bookshelf-container">${tierHtml}</div>`;
  }

  function renderSearchShelf(matches, query) {
    const tierHtml = createBookshelfTierHtml(
      `检索索引 “${query}”`,
      "SEARCH",
      `检索命中 ${matches.length} 卷藏书`,
      matches.length,
      matches,
      "",
      "search",
      query
    );
    return `<div class="bookshelf-container">${tierHtml}</div>`;
  }

  let lastNavTimestamp = 0;

  // 7. 绑定书架交互事件 (具备严格的单次幂等绑定保护与防抖机制)
  function bindInteractions(container) {
    if (!container) return;
    // 防御性幂等保护：同一个根容器绝不重复绑定事件监听器
    if (container._bookshelfBound || container.dataset.bookshelfBound === "true") {
      return;
    }
    container._bookshelfBound = true;
    container.dataset.bookshelfBound = "true";

    // 点击书脊正面直接开启阅读 (非整理模式下)
    container.addEventListener("click", function (e) {
      // 检查是否是书架内的书脊
      const spine = e.target.closest(".book-spine-face");
      if (spine) {
        // 如果点击的是便签卡内部，不处理书脊点击
        if (e.target.closest(".book-flyout-card")) return;

        const book = spine.closest(".book-item");
        if (!book) return;

        // 若处于整理模式，禁止一切跳转
        if (window.NavSortable && (window.NavSortable.isArrangeMode() || window.NavSortable.isJustFinishedDrag())) {
          return;
        }

        // 触屏设备上：第一次点击抽书并展开便签卡，第二次点击或点击外链才跳转
        const isTouch = window.matchMedia("(pointer: coarse)").matches;
        if (isTouch) {
          if (!book.classList.contains("is-open")) {
            // 关掉其它展开的书
            container.querySelectorAll(".book-item.is-open").forEach(b => {
              if (b !== book) b.classList.remove("is-open");
            });
            book.classList.add("is-open");
            e.preventDefault();
            return;
          }
        }

        // 桌面端或已展开触屏：直接访问网站 (带防抖保护，400ms 内禁止并发触发)
        const now = Date.now();
        if (now - lastNavTimestamp < 400) return;
        lastNavTimestamp = now;

        const url = book.getAttribute("data-site-url");
        const siteId = book.getAttribute("data-site-id");
        if (siteId && window.NavApp && typeof window.NavApp.openSite === "function") {
          window.NavApp.openSite(siteId);
        } else if (url) {
          if (siteId && window.NavVisits) {
            window.NavVisits.record(siteId);
          }
          window.open(url, "_blank", "noopener,noreferrer");
        }
        return;
      }

      // 点击便签卡中的外链「开启阅览 ↗」
      const visitBtn = e.target.closest("[data-shelf-visit-id]");
      if (visitBtn) {
        const siteId = visitBtn.getAttribute("data-shelf-visit-id");
        if (siteId && window.NavApp && typeof window.NavApp.openSite === "function") {
          window.NavApp.openSite(siteId);
        } else if (siteId && window.NavVisits) {
          window.NavVisits.record(siteId);
        }
        return;
      }

      // 点击外部关闭展开的书本 (触屏适配)
      if (!e.target.closest(".book-item")) {
        container.querySelectorAll(".book-item.is-open").forEach(b => b.classList.remove("is-open"));
      }
    });

    // 智能防遮挡边缘检测：当书靠近右边缘时，便签向左翻转
    container.addEventListener("pointerover", function (e) {
      const book = e.target.closest(".book-item");
      if (!book) return;

      const rect = book.getBoundingClientRect();
      const flyout = book.querySelector(".book-flyout-card");
      if (!flyout) return;

      // 如果右侧空间不足 240px，让便签在左侧展示
      const spaceRight = window.innerWidth - rect.right;
      if (spaceRight < 240) {
        book.classList.add("flyout-flip-left");
      } else {
        book.classList.remove("flyout-flip-left");
      }
    });

    // 键盘键盘操作支持
    container.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        const spine = document.activeElement ? document.activeElement.closest(".book-spine-face") : null;
        if (spine) {
          const book = spine.closest(".book-item");
          if (book) {
            const now = Date.now();
            if (now - lastNavTimestamp < 400) return;
            lastNavTimestamp = now;

            const url = book.getAttribute("data-site-url");
            const siteId = book.getAttribute("data-site-id");
            if (siteId && window.NavApp && typeof window.NavApp.openSite === "function") {
              window.NavApp.openSite(siteId);
            } else if (url) {
              if (siteId && window.NavVisits) {
                window.NavVisits.record(siteId);
              }
              window.open(url, "_blank", "noopener,noreferrer");
            }
            e.preventDefault();
          }
        }
      }
    });
  }

  return {
    renderAllShelves,
    renderSingleShelf,
    renderSearchShelf,
    bindInteractions,
    calculateDimensions
  };
});
