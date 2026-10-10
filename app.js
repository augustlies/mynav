/**
 * 个人数字收藏馆 · 核心控制器与装配逻辑 (app.js)
 * 职责：连接各独立功能模块、生成期刊排版、动态渲染内容与事件分发
 */

(function () {
  "use strict";

  // 全局应用状态
  const state = {
    activeCategory: "all", // 'all' | 'favorites' | 'frequent' | categoryId
    searchQuery: "",
    viewMode: window.NavStorage ? window.NavStorage.get("mynav_arch_view", "grid") : "grid"
  };

  // DOM 节点引用
  const dom = {
    viewBtn: document.getElementById("btn-view-toggle"),
    themeBtn: document.getElementById("btn-theme-toggle"),
    searchInput: document.getElementById("archive-search-input"),
    searchClearBtn: document.getElementById("btn-clear-search"),
    tabsRail: document.getElementById("index-tabs-rail"),
    statusBar: document.getElementById("search-status-bar"),
    statusText: document.getElementById("search-status-text"),
    statusResetBtn: document.getElementById("btn-reset-filter"),
    contentArea: document.getElementById("archive-content-area"),
    mastheadDate: document.getElementById("masthead-date-label"),
    mastheadCount: document.getElementById("masthead-count-label")
  };

  // ==========================================================================
  // 工具函数 (Utilities)
  // ==========================================================================

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function extractDomain(urlStr) {
    try {
      const u = new URL(urlStr);
      return u.hostname.replace(/^www\./, "").toUpperCase();
    } catch (e) {
      return urlStr;
    }
  }

  function getHostname(urlStr) {
    try {
      const u = new URL(urlStr);
      return u.hostname.replace(/^www\./, "").toLowerCase();
    } catch (e) {
      return "";
    }
  }

  // 切换视图模式按钮状态更新
  function updateViewButton() {
    if (!dom.viewBtn) dom.viewBtn = document.getElementById("btn-view-toggle");
    if (!dom.viewBtn) return;
    const isShelf = state.viewMode === "shelf";
    const iconSpan = dom.viewBtn.querySelector(".view-icon");
    const labelSpan = dom.viewBtn.querySelector(".view-label");
    if (iconSpan) iconSpan.textContent = isShelf ? "⊞" : "🏛";
    if (labelSpan) labelSpan.textContent = isShelf ? "网格" : "书架";
    dom.viewBtn.setAttribute("title", isShelf ? "切换为期刊网格视图" : "切换为 3D 藏书馆书架视图");
    dom.viewBtn.setAttribute("aria-label", isShelf ? "切换为期刊网格视图" : "切换为 3D 藏书馆书架视图");
  }

  // 计算当前仍有效存在的收藏数与常用数（自动忽略已在 data.js 中被删除的失效历史记录）
  function getValidFavCount() {
    const allSites = getRawSites();
    return allSites.filter(site => window.NavFavorites && window.NavFavorites.has(site.id)).length;
  }

  function getValidFreqCount() {
    const allSites = getRawSites();
    return allSites.filter(site => {
      const st = window.NavVisits ? window.NavVisits.getStat(site.id) : null;
      return st && st.count > 0;
    }).length;
  }

  // 格式化本地中文编辑日期
  function formatEditorialDate() {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const date = now.getDate();
      const days = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
      const dayStr = days[now.getDay()];
      return `${year}年${month}月${date}日 · ${dayStr}`;
    } catch (e) {
      return "馆藏录 · 每日更新";
    }
  }

  // 数据源安全获取
  function getRawSites() {
    return window.NAV_DATA && Array.isArray(window.NAV_DATA.sites) ? window.NAV_DATA.sites : [];
  }

  function getRawCategories() {
    return window.NAV_DATA && Array.isArray(window.NAV_DATA.categories) ? window.NAV_DATA.categories : [];
  }

  // ==========================================================================
  // 视图组件渲染器 (HTML Builders)
  // ==========================================================================

  // 生成书目卡片条目（语义化 article + Stretched Link，符合 W3C 无交互元素嵌套规范）
  function createEntryCardHtml(site, index) {
    const isBookmarked = window.NavFavorites ? window.NavFavorites.has(site.id) : false;
    const domain = extractDomain(site.url);
    const host = getHostname(site.url);
    const emblemText = escapeHtml(site.icon || site.name.slice(0, 2));
    const firstTag = Array.isArray(site.tags) && site.tags[0] ? escapeHtml(site.tags[0]) : "典藏";
    const indexStr = String(index + 1).padStart(2, "0");

    // 图标三级加载策略：1. site.favicon 或 icons/<id>.png -> 2. DuckDuckGo 外链 -> 3. 移除 img 显示文本兜底
    const primaryIcon = site.favicon ? site.favicon : `icons/${encodeURIComponent(site.id)}.png`;
    const ddgFallback = host ? `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico` : "";

    return `
      <article
        class="entry-card"
        data-site-id="${escapeHtml(site.id)}"
        data-site-url="${escapeHtml(site.url)}"
      >
        <div class="card-masthead">
          <div class="card-identity">
            <span class="card-emblem" aria-hidden="true">
              <img
                class="emblem-img"
                src="${escapeHtml(primaryIcon)}"
                loading="lazy"
                alt=""
                width="20"
                height="20"
                onerror="if(!this.dataset.fallback){this.dataset.fallback='1';if('${escapeHtml(ddgFallback)}'){this.src='${escapeHtml(ddgFallback)}';}else{this.remove();}}else{this.remove();}"
              >
              <span class="emblem-fallback-text">${emblemText}</span>
            </span>
            <div class="card-titles">
              <h3 class="card-title-text">
                <a
                  href="${escapeHtml(site.url)}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="card-title-link"
                  title="${escapeHtml(site.name)}"
                >
                  ${escapeHtml(site.name)}
                </a>
              </h3>
              <div class="card-domain-slug">${escapeHtml(domain)}</div>
            </div>
          </div>
          <button
            type="button"
            class="btn-bookmark ${isBookmarked ? 'bookmarked' : ''}"
            title="${isBookmarked ? '取消典藏' : '收入典藏'}"
            aria-label="${isBookmarked ? '取消典藏 ' + site.name : '收藏 ' + site.name}"
            data-bookmark-id="${escapeHtml(site.id)}"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              ${isBookmarked
                ? '<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>'
                : '<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>'
              }
            </svg>
          </button>
        </div>
        <p class="card-synopsis" title="${escapeHtml(site.description || '')}">${escapeHtml(site.description || '暂无描述')}</p>
        <div class="card-bottom-rail">
          <span class="card-tag-pill">#${firstTag}</span>
          <div class="card-bottom-actions">
            <button
              type="button"
              class="btn-bookplate"
              data-bookplate-id="${escapeHtml(site.id)}"
              title="查看专属数字藏书票 (Ex Libris)"
              aria-label="查看 ${escapeHtml(site.name)} 的藏书票"
            >
              📜 藏书票
            </button>
            <a
              href="${escapeHtml(site.url)}"
              target="_blank"
              rel="noopener noreferrer"
              class="card-jump-mark"
              aria-label="访问 ${escapeHtml(site.name)}"
            >
              № ${indexStr} ↗
            </a>
          </div>
        </div>
      </article>
    `;
  }

  // 生成专栏板块
  function createSectionHtml(title, code, desc, count, cardsHtml, actionHtml = "", categoryKey = "") {
    return `
      <section class="archive-section" data-section-category="${escapeHtml(categoryKey)}">
        <div class="section-masthead-rule">
          <div class="section-heading-group">
            <span class="section-code">[${escapeHtml(code)}]</span>
            <h2 class="section-title-text">${escapeHtml(title)}</h2>
            ${desc ? `<span class="section-desc-text">${escapeHtml(desc)}</span>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            ${actionHtml}
            <span class="section-count-tag">${count} 卷</span>
          </div>
        </div>
        <div class="entries-grid" data-category-key="${escapeHtml(categoryKey)}">
          ${cardsHtml}
        </div>
      </section>
    `;
  }

  // 生成典雅空状态
  function createEmptyStateHtml(title, desc, buttonText = "清空检索", action = "resetSearch") {
    return `
      <div class="quiet-empty-state">
        <div class="empty-state-symbol" aria-hidden="true">❦</div>
        <h3 class="empty-state-headline">${escapeHtml(title)}</h3>
        <p class="empty-state-text">${escapeHtml(desc)}</p>
        ${buttonText ? `
          <button type="button" class="btn-empty-action" data-empty-action="${escapeHtml(action)}">
            ${escapeHtml(buttonText)}
          </button>
        ` : ''}
      </div>
    `;
  }

  // ==========================================================================
  // 主渲染流程 (Main Render Flow)
  // ==========================================================================

  function renderContent() {
    const allSites = getRawSites();
    const categories = getRawCategories();
    const query = state.searchQuery.trim();

    // 1. 处于全局实时搜索模式
    if (query) {
      dom.statusBar.style.display = "flex";
      const matches = window.NavSearch ? window.NavSearch.filter(allSites, query) : allSites;

      dom.statusText.innerHTML = `检索词 “<strong>${escapeHtml(query)}</strong>” · 共寻得 <strong>${matches.length}</strong> 卷藏书`;

      if (matches.length === 0) {
        dom.contentArea.innerHTML = createEmptyStateHtml(
          "未检索到相关典藏",
          `暂无与 “${query}” 匹配的网站。建议缩短检索词或浏览下方分类专栏。`,
          "清空检索",
          "resetSearch"
        );
      } else {
        if (state.viewMode === "shelf" && window.NavBookshelf) {
          dom.contentArea.innerHTML = window.NavBookshelf.renderSearchShelf(matches, query);
        } else {
          const cardsHtml = matches.map((site, idx) => createEntryCardHtml(site, idx)).join("");
          dom.contentArea.innerHTML = `<div class="entries-grid">${cardsHtml}</div>`;
        }
      }
      return;
    }

    // 2. 非搜索状态，隐藏状态条
    dom.statusBar.style.display = "none";

    // 2.1 查看「我的典藏」
    if (state.activeCategory === "favorites") {
      const rawFavSites = allSites.filter(site => window.NavFavorites && window.NavFavorites.has(site.id));
      const favSites = window.NavSortable ? window.NavSortable.sortSites("favorites", rawFavSites) : rawFavSites;

      if (favSites.length === 0) {
        dom.contentArea.innerHTML = createEmptyStateHtml(
          "典藏阁暂无藏书",
          "点击任意书目条目右上角的书签徽章即可归档，刷新页面后依然妥善保存。",
          "查阅全部藏书",
          "viewAll"
        );
      } else {
        if (state.viewMode === "shelf" && window.NavBookshelf) {
          dom.contentArea.innerHTML = window.NavBookshelf.renderSingleShelf(
            "私人典藏集",
            "BOOKMARKS",
            "保存在当前浏览器本地的精选书签",
            favSites,
            "",
            "favorites"
          );
        } else {
          const cardsHtml = favSites.map((site, idx) => createEntryCardHtml(site, idx)).join("");
          dom.contentArea.innerHTML = createSectionHtml(
            "私人典藏集",
            "BOOKMARKS",
            "保存在当前浏览器本地的精选书签",
            favSites.length,
            cardsHtml,
            "",
            "favorites"
          );
        }
      }
      if (window.NavSortable && window.NavSortable.isArrangeMode()) {
        window.NavSortable.refreshCardAttributes();
      }
      return;
    }

    // 2.2 查看「常驻案头」
    if (state.activeCategory === "frequent") {
      const freqSites = window.NavVisits ? window.NavVisits.getTopSites(allSites, 16) : [];
      if (freqSites.length === 0) {
        dom.contentArea.innerHTML = createEmptyStateHtml(
          "案头暂无常驻记录",
          "在当前浏览器中点击访问的网站条目将在此自动汇聚与排序。",
          "查阅全部藏书",
          "viewAll"
        );
      } else {
        const clearActionHtml = `
          <button type="button" class="btn-clear-visits" id="btn-clear-visits-action" title="重置本地访问记录">
            清空案头记录
          </button>
        `;
        if (state.viewMode === "shelf" && window.NavBookshelf) {
          dom.contentArea.innerHTML = window.NavBookshelf.renderSingleShelf(
            "常驻案头 (高频访问)",
            "DESK",
            "根据本地点击频次自动排序",
            freqSites,
            clearActionHtml,
            "frequent"
          );
        } else {
          const cardsHtml = freqSites.map((site, idx) => createEntryCardHtml(site, idx)).join("");
          dom.contentArea.innerHTML = createSectionHtml(
            "常驻案头 (高频访问)",
            "DESK",
            "根据本地点击频次自动排序",
            freqSites.length,
            cardsHtml,
            clearActionHtml,
            "frequent"
          );
        }
      }
      if (window.NavSortable && window.NavSortable.isArrangeMode()) {
        window.NavSortable.refreshCardAttributes();
      }
      return;
    }

    // 2.3 查看「全部」
    if (state.activeCategory === "all") {
      // 书架视图渲染全馆各层
      if (state.viewMode === "shelf" && window.NavBookshelf) {
        const rawFavSites = allSites.filter(site => window.NavFavorites && window.NavFavorites.has(site.id));
        const favSites = window.NavSortable ? window.NavSortable.sortSites("favorites", rawFavSites) : rawFavSites;
        const freqSites = window.NavVisits ? window.NavVisits.getTopSites(allSites, 6) : [];

        dom.contentArea.innerHTML = window.NavBookshelf.renderAllShelves(allSites, categories, favSites, freqSites);
        return;
      }

      // 网格视图渲染全馆板块
      const sectionsHtml = [];

      // 若有收藏，置顶展示私人典藏专栏（支持独立排序）
      const rawFavSites = allSites.filter(site => window.NavFavorites && window.NavFavorites.has(site.id));
      const favSites = window.NavSortable ? window.NavSortable.sortSites("favorites", rawFavSites) : rawFavSites;
      if (favSites.length > 0) {
        const favCards = favSites.map((site, idx) => createEntryCardHtml(site, idx)).join("");
        sectionsHtml.push(createSectionHtml("私人典藏", "FAV", "随时查阅的归档藏书", favSites.length, favCards, "", "favorites"));
      }

      // 若有访问统计，展示常驻案头专栏 (前 6 个)
      const freqSites = window.NavVisits ? window.NavVisits.getTopSites(allSites, 6) : [];
      if (freqSites.length > 0) {
        const freqCards = freqSites.map((site, idx) => createEntryCardHtml(site, idx)).join("");
        sectionsHtml.push(createSectionHtml("常驻案头", "TOP", "近期高频访问入口", freqSites.length, freqCards, "", "frequent"));
      }

      // 依次展示各分类专栏（按本地记住的顺序排列）
      categories.forEach(cat => {
        const rawCatSites = allSites.filter(s => s.category === cat.id);
        const catSites = window.NavSortable ? window.NavSortable.sortSites(cat.id, rawCatSites) : rawCatSites;
        if (catSites.length > 0) {
          const cards = catSites.map((site, idx) => createEntryCardHtml(site, idx)).join("");
          sectionsHtml.push(createSectionHtml(cat.name, cat.code || "SEC", cat.desc, catSites.length, cards, "", cat.id));
        }
      });

      if (sectionsHtml.length === 0) {
        dom.contentArea.innerHTML = createEmptyStateHtml("藏馆暂无条目", "请在 data.js 中添加网站数据。", "", "");
      } else {
        dom.contentArea.innerHTML = sectionsHtml.join("");
      }
      if (window.NavSortable && window.NavSortable.isArrangeMode()) {
        window.NavSortable.refreshCardAttributes();
      }
      return;
    }

    // 2.4 查看指定专栏
    const currentCategory = categories.find(c => c.id === state.activeCategory);
    const rawCatSites = allSites.filter(s => s.category === state.activeCategory);
    const catSites = window.NavSortable && currentCategory
      ? window.NavSortable.sortSites(currentCategory.id, rawCatSites)
      : rawCatSites;

    if (!currentCategory || catSites.length === 0) {
      dom.contentArea.innerHTML = createEmptyStateHtml(
        "该分类专栏暂无内容",
        "可在 data.js 中配置条目或切换至其他专栏。",
        "返回全部",
        "viewAll"
      );
    } else {
      if (state.viewMode === "shelf" && window.NavBookshelf) {
        dom.contentArea.innerHTML = window.NavBookshelf.renderSingleShelf(
          currentCategory.name,
          currentCategory.code || "SEC",
          currentCategory.desc,
          catSites,
          "",
          currentCategory.id
        );
      } else {
        const cards = catSites.map((site, idx) => createEntryCardHtml(site, idx)).join("");
        dom.contentArea.innerHTML = createSectionHtml(
          currentCategory.name,
          currentCategory.code || "SEC",
          currentCategory.desc,
          catSites.length,
          cards,
          "",
          currentCategory.id
        );
      }
    }
    if (window.NavSortable && window.NavSortable.isArrangeMode()) {
      window.NavSortable.refreshCardAttributes();
    }
  }

  // ==========================================================================
  // 分类导览栏生成 (Index Tabs Rail)
  // ==========================================================================

  function renderIndexTabs() {
    const allSites = getRawSites();
    const categories = getRawCategories();
    const favCount = getValidFavCount();
    const freqCount = getValidFreqCount();

    const tabs = [];

    // 全部
    tabs.push(`
      <button
        type="button"
        class="index-tab-item ${state.activeCategory === 'all' ? 'active' : ''}"
        data-cat-target="all"
      >
        <span>全部藏目</span>
        <span class="tab-badge-num">${allSites.length}</span>
      </button>
    `);

    // 典藏
    tabs.push(`
      <button
        type="button"
        class="index-tab-item ${state.activeCategory === 'favorites' ? 'active' : ''}"
        data-cat-target="favorites"
      >
        <span>⭐ 私人典藏</span>
        <span class="tab-badge-num" id="badge-fav-num">${favCount}</span>
      </button>
    `);

    // 案头常用
    tabs.push(`
      <button
        type="button"
        class="index-tab-item ${state.activeCategory === 'frequent' ? 'active' : ''}"
        data-cat-target="frequent"
      >
        <span>🔥 常驻案头</span>
        <span class="tab-badge-num" id="badge-freq-num">${freqCount}</span>
      </button>
    `);

    // 各分类
    categories.forEach(cat => {
      const count = allSites.filter(s => s.category === cat.id).length;
      tabs.push(`
        <button
          type="button"
          class="index-tab-item ${state.activeCategory === cat.id ? 'active' : ''}"
          data-cat-target="${escapeHtml(cat.id)}"
        >
          <span>${escapeHtml(cat.name)}</span>
          <span class="tab-badge-num">${count}</span>
        </button>
      `);
    });

    dom.tabsRail.innerHTML = tabs.join("");
  }

  function updateBadges() {
    const favBadge = document.getElementById("badge-fav-num");
    if (favBadge) {
      favBadge.textContent = getValidFavCount();
    }
    const freqBadge = document.getElementById("badge-freq-num");
    if (freqBadge) {
      freqBadge.textContent = getValidFreqCount();
    }
  }

  // ==========================================================================
  // 事件交互绑定 (Event Handlers & Shortcuts)
  // ==========================================================================

  function bindEvents() {
    // 1. 实时搜索监听
    dom.searchInput.addEventListener("input", function (e) {
      state.searchQuery = e.target.value;
      dom.searchClearBtn.style.display = state.searchQuery.trim().length > 0 ? "block" : "none";
      renderContent();
    });

    // 2. 清空搜索按钮
    dom.searchClearBtn.addEventListener("click", function () {
      dom.searchInput.value = "";
      state.searchQuery = "";
      dom.searchClearBtn.style.display = "none";
      dom.searchInput.focus();
      renderContent();
    });

    // 3. 状态条重置按钮
    dom.statusResetBtn.addEventListener("click", function () {
      dom.searchInput.value = "";
      state.searchQuery = "";
      dom.searchClearBtn.style.display = "none";
      renderContent();
    });

    // 4. 分类标签切换
    dom.tabsRail.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-cat-target]");
      if (!btn) return;
      const targetCat = btn.getAttribute("data-cat-target");
      if (!targetCat) return;

      state.activeCategory = targetCat;

      // 如果有搜索词，切换栏目时重置搜索框以保证当前专栏聚焦
      if (state.searchQuery) {
        state.searchQuery = "";
        dom.searchInput.value = "";
        dom.searchClearBtn.style.display = "none";
      }

      document.querySelectorAll(".index-tab-item").forEach(t => {
        t.classList.toggle("active", t.getAttribute("data-cat-target") === targetCat);
      });

      renderContent();
    });

    // 5. 内容委托（书签点击、清空案头、外链点击统计、空状态操作）
    dom.contentArea.addEventListener("click", function (e) {
      // 5.0 若处于整理模式或刚完成拖拽，禁止一切卡片跳转
      if (window.NavSortable && (window.NavSortable.isArrangeMode() || window.NavSortable.isJustFinishedDrag())) {
        if (!e.target.closest("[data-bookmark-id]")) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      // 5.1 点击书签收藏按钮
      const bookmarkBtn = e.target.closest("[data-bookmark-id]");
      if (bookmarkBtn) {
        e.preventDefault();
        e.stopPropagation();
        const siteId = bookmarkBtn.getAttribute("data-bookmark-id");
        if (window.NavFavorites) {
          window.NavFavorites.toggle(siteId);
          updateBadges();
          renderContent();
        }
        return;
      }

      // 5.15 点击数字藏书票 (Ex Libris)
      const bookplateBtn = e.target.closest("[data-bookplate-id]");
      if (bookplateBtn) {
        e.preventDefault();
        e.stopPropagation();
        const siteId = bookplateBtn.getAttribute("data-bookplate-id");
        const allSites = getRawSites();
        const targetSite = allSites.find(s => s.id === siteId);
        if (targetSite && window.NavExLibris) {
          window.NavExLibris.open(targetSite);
        }
        return;
      }

      // 5.2 点击清空案头记录
      if (e.target.closest("#btn-clear-visits-action")) {
        if (confirm("确定要清空本地记录的案头常驻访问统计吗？")) {
          if (window.NavVisits) {
            window.NavVisits.clear();
            updateBadges();
            renderContent();
          }
        }
        return;
      }

      // 5.3 空状态重置动作
      const emptyBtn = e.target.closest("[data-empty-action]");
      if (emptyBtn) {
        const action = emptyBtn.getAttribute("data-empty-action");
        if (action === "resetSearch") {
          dom.searchInput.value = "";
          state.searchQuery = "";
          dom.searchClearBtn.style.display = "none";
          renderContent();
        } else if (action === "viewAll") {
          state.activeCategory = "all";
          renderIndexTabs();
          renderContent();
        }
        return;
      }

      // 5.4 点击网站卡片，统计访问
      const card = e.target.closest(".entry-card");
      if (card) {
        const siteId = card.getAttribute("data-site-id");
        if (siteId && window.NavVisits) {
          window.NavVisits.record(siteId);
          updateBadges();
          // 若正处于案头专栏，即刻重新渲染排序
          if (state.activeCategory === "frequent") {
            renderContent();
          }
        }
      }
    });

    // 5.9 视图模式切换 (网格 ⟷ 3D 书架)
    const viewBtn = dom.viewBtn || document.getElementById("btn-view-toggle");
    if (viewBtn) {
      dom.viewBtn = viewBtn;
      viewBtn.addEventListener("click", function () {
        if (window.NavSortable && window.NavSortable.isArrangeMode()) {
          window.NavSortable.exitArrangeMode();
        }
        state.viewMode = state.viewMode === "grid" ? "shelf" : "grid";
        if (window.NavStorage) {
          window.NavStorage.set("mynav_arch_view", state.viewMode);
        }
        updateViewButton();
        renderContent();
      });
    }

    // 6. 整理书架与拖拽排序控制
    const arrangeToggleBtn = document.getElementById("btn-arrange-toggle");
    if (arrangeToggleBtn) {
      arrangeToggleBtn.addEventListener("click", function () {
        if (state.viewMode === "shelf") {
          state.viewMode = "grid";
          if (window.NavStorage) window.NavStorage.set("mynav_arch_view", "grid");
          updateViewButton();
          renderContent();
        }
        if (window.NavSortable) window.NavSortable.toggleArrangeMode();
      });
    }

    const resetOrderBtn = document.getElementById("btn-reset-order");
    if (resetOrderBtn) {
      resetOrderBtn.addEventListener("click", function () {
        const catName = state.activeCategory === "all" ? "全馆" : "当前专栏";
        if (confirm(`确定要恢复${catName}的默认排列顺序吗？`)) {
          if (window.NavSortable) {
            const targetCat = state.activeCategory === "all" ? null : state.activeCategory;
            window.NavSortable.resetOrder(targetCat);
            renderContent();
          }
        }
      });
    }

    const finishArrangeBtn = document.getElementById("btn-finish-arrange");
    if (finishArrangeBtn) {
      finishArrangeBtn.addEventListener("click", function () {
        if (window.NavSortable) window.NavSortable.exitArrangeMode();
      });
    }

    // 7. 快捷键监听 (/ 聚焦搜索, Escape 退出搜索)
    window.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== dom.searchInput) {
        const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
        if (tag !== "input" && tag !== "textarea") {
          e.preventDefault();
          dom.searchInput.focus();
          dom.searchInput.select();
        }
      }

      if (e.key === "Escape") {
        if (dom.searchInput.value !== "") {
          dom.searchInput.value = "";
          state.searchQuery = "";
          dom.searchClearBtn.style.display = "none";
          renderContent();
        }
        dom.searchInput.blur();
      }
    });
  }

  // ==========================================================================
  // 系统启动装配 (Bootstrap)
  // ==========================================================================

  function init() {
    // 1. 初始化独立子模块
    if (window.NavTheme) window.NavTheme.init(dom.themeBtn);
    if (window.NavFavorites) window.NavFavorites.init();
    if (window.NavVisits) window.NavVisits.init();

    // 2. 初始化书架整理与拖动排序模块
    if (window.NavSortable) {
      window.NavSortable.init({
        isSearchActive: () => Boolean(state.searchQuery.trim()),
        onOrderChange: () => {
          renderContent();
        }
      });
    }

    // 2.5 初始化专属数字藏书票模块 (Ex Libris)
    if (window.NavExLibris) {
      window.NavExLibris.init();
    }

    // 2.6 初始化 3D 藏书馆书架事件委托 (一次性绑定)
    if (window.NavBookshelf && dom.contentArea) {
      window.NavBookshelf.bindInteractions(dom.contentArea);
    }

    // 3. 装配刊头信息
    if (dom.mastheadDate) dom.mastheadDate.textContent = formatEditorialDate();
    if (dom.mastheadCount) dom.mastheadCount.textContent = `全馆典藏 ${getRawSites().length} 卷`;

    // 4. 初始渲染与事件绑定
    dom.viewBtn = document.getElementById("btn-view-toggle");
    updateViewButton();
    renderIndexTabs();
    renderContent();
    bindEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
