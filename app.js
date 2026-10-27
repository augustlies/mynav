/**
 * 个人数字收藏馆 · 核心控制器与装配逻辑 (app.js)
 * 职责：连接各独立功能模块、生成期刊排版、动态渲染内容与事件分发
 */

(function () {
  "use strict";

  // 全局应用状态
  // Phase 5：3D 书架视图已移除，画布只剩两种形态 —— 书本目录（grid）与穹顶星图（star-map）。
  // `archiveView` 是唯一真源；`mynav_arch_view` 仍是持久化键，以保持既有本地数据兼容。
  const STORED_ARCHIVE_VIEW = window.NavStorage
    ? window.NavStorage.get("mynav_arch_view", "grid")
    : "grid";
  const state = {
    activeCategory: "all", // 'all' | 'favorites' | 'frequent' | categoryId
    searchQuery: "",
    archiveView: STORED_ARCHIVE_VIEW === "star-map" ? "star-map" : "grid"
  };

  // DOM 节点引用
  const dom = {
    themeBtn: document.getElementById("btn-theme-toggle"),
    searchInput: document.getElementById("archive-search-input"),
    searchClearBtn: document.getElementById("btn-clear-search"),
    tabsRail: document.getElementById("index-tabs-rail"),
    statusBar: document.getElementById("search-status-bar"),
    statusText: document.getElementById("search-status-text"),
    statusResetBtn: document.getElementById("btn-reset-filter"),
    contentArea: document.getElementById("archive-content-area"),
    almanacPanel: document.getElementById("almanac-chronicle"),
    mastheadDate: document.getElementById("masthead-date-label"),
    mastheadCount: document.getElementById("masthead-count-label"),
    randomBtn: document.getElementById("btn-random-open")
  };

  // 隐藏探针入口：暗号与地址不再写死在源码中，改为从本机 localStorage 读取。
  // 在站点页面控制台执行一次即可启用：
  //   localStorage.setItem("MYNAV_AGENT_CODE", "你的暗号")
  //   localStorage.setItem("MYNAV_PROBE_URL", "你的探针地址")
  const AGENT_SECRET_CODE = localStorage.getItem("MYNAV_AGENT_CODE") || "";
  const AGENT_PROBE_URL = localStorage.getItem("MYNAV_PROBE_URL") || "";
  const RECENT_DESK_DAYS = 7;
  const RECENT_DESK_LIMIT = 6;
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

  // 附加模块初始化隔离开关：捕获并记录单个模块的异常，绝不让它中断主流程。
  function safeInit(moduleName, fn) {
    try {
      return fn();
    } catch (error) {
      if (window.console && typeof window.console.warn === "function") {
        window.console.warn("[mynav] " + moduleName + " 初始化失败，已隔离：", error);
      }
      return null;
    }
  }

  function extractDomain(urlStr) {
    try {
      const u = new URL(urlStr);
      return u.hostname.replace(/^www\./, "").toUpperCase();
    } catch (e) {
      return urlStr;
    }
  }

  function updateArchiveViewSwitcher() {
    const inStarMap = state.archiveView === "star-map";
    document.querySelectorAll("[data-archive-view]").forEach(function (button) {
      const active = (button.getAttribute("data-archive-view") === "star-map") === inStarMap;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    document.documentElement.setAttribute("data-archive-view", state.archiveView);
    const almanac = document.getElementById("almanac-chronicle");
    if (almanac) almanac.classList.toggle("is-star-map", inStarMap);
  }

  function setArchiveView(view) {
    const next = view === "star-map" ? "star-map" : "grid";
    if (next === "star-map" && !window.NavStarMap && window.NavLazy) {
      // 星图模块按需加载：按钮先进入加载态，就绪后再切换（同一次点击 / 按键不落空）。
      const btn = document.getElementById("btn-star-map-view");
      if (btn) btn.setAttribute("aria-busy", "true");
      withLazy("starmap", function () {
        if (btn) btn.removeAttribute("aria-busy");
        if (window.NavStarMap) setArchiveView("star-map");
      });
      return "star-map";
    }
    if (next === state.archiveView) {
      if (next === "star-map" && window.NavStarMap && !window.NavStarMap.isRunning()) {
        renderStarMapView();
      }
      return state.archiveView;
    }
    if (state.archiveView === "star-map") {
      window.NavStarMap && window.NavStarMap.close && window.NavStarMap.close();
    }
    state.archiveView = next;
    if (window.NavStorage) window.NavStorage.set("mynav_arch_view", next);
    updateArchiveViewSwitcher();
    if (next === "grid") {
      renderContent();
      return state.archiveView;
    }
    renderStarMapView();
    return state.archiveView;
  }

  // Phase 5：`v` 键与「视图切换」快捷动作的唯一入口 —— 书本目录 ⟷ 穹顶星图。
  // Batch 2：按需加载的模块统一经 NavLazy；未就绪时先加载再执行，绝不吞掉这次操作。
  function withLazy(name, fn) {
    if (window.NavLazy && typeof window.NavLazy.run === "function") return window.NavLazy.run(name, fn);
    return Promise.resolve(fn());
  }

  function openAlmanac() {
    if (!window.NavAlmanac && window.NavLazy) {
      withLazy("almanac", openAlmanac);
      return;
    }
    if (state.archiveView === "star-map") setArchiveView("grid");
    if (window.NavAlmanac) window.NavAlmanac.scrollIntoView();
  }

  function toggleArchiveView() {
    if (window.NavSortable && window.NavSortable.isArrangeMode()) {
      window.NavSortable.exitArrangeMode();
    }
    setArchiveView(state.archiveView === "star-map" ? "grid" : "star-map");
    return state.archiveView;
  }

  // 计算当前仍有效存在的收藏数与常用数（自动忽略已在 data.js 中被删除的失效历史记录）
  function getValidFavCount() {
    const allSites = getRawSites();
    return allSites.filter(site => window.NavFavorites && window.NavFavorites.has(site.id)).length;
  }

  function getValidFreqCount() {
    const allSites = getRawSites();
    return getDeskSites(allSites).length;
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

  // 数据源安全获取（优先采用用户本地修改合并层）
  function getRawSites() {
    const raw = window.NavOverrides && typeof window.NavOverrides.getSites === "function"
      ? window.NavOverrides.getSites()
      : (window.NAV_DATA && Array.isArray(window.NAV_DATA.sites) ? window.NAV_DATA.sites : []);
    const sites = raw.filter(function (site) {
      if (!site) return false;
      const status = site.status === undefined ? "catalogued" : site.status;
      return status === "catalogued" && site.visibility !== "shadow";
    });
    if (window.NavLedger && typeof window.NavLedger.initializeFirstSeenForSites === "function") {
      window.NavLedger.initializeFirstSeenForSites(sites.map(function (site) { return site.id; }));
    }
    return window.NavSchema && typeof window.NavSchema.normalizeItems === "function"
      ? window.NavSchema.normalizeItems(sites)
      : sites;
  }

  function getUncataloguedSites() {
    const sites = window.NavOverrides && typeof window.NavOverrides.getAllIncludingUncatalogued === "function"
      ? window.NavOverrides.getAllIncludingUncatalogued(true)
      : [];
    return window.NavSchema && typeof window.NavSchema.normalizeItems === "function"
      ? window.NavSchema.normalizeItems(sites).filter(function (site) {
        return site.status === "uncatalogued";
      })
      : [];
  }

  function getShadowSites() {
    const defaults = window.NavSanctum && typeof window.NavSanctum.getDefaultSites === "function"
      ? window.NavSanctum.getDefaultSites()
      : [];
    const stored = window.NavOverrides && typeof window.NavOverrides.getAllIncludingUncatalogued === "function"
      ? window.NavOverrides.getAllIncludingUncatalogued(true)
      : [];
    const normalized = window.NavSchema && typeof window.NavSchema.normalizeItems === "function"
      ? window.NavSchema.normalizeItems(defaults.concat(stored))
      : defaults.concat(stored);
    const seen = new Set();
    return normalized.filter(function (site) {
      if (!site || seen.has(site.id)) return false;
      if (site.status !== "catalogued" || site.visibility !== "shadow") return false;
      seen.add(site.id);
      return true;
    });
  }

  function getRawCategories() {
    return window.NAV_DATA && Array.isArray(window.NAV_DATA.categories) ? window.NAV_DATA.categories : [];
  }

  function siteName(site) {
    return site && (site.name || site.title || site.id) || "未命名馆藏";
  }

  function siteDescription(site) {
    return site && (site.description || site.desc || "") || "暂无描述";
  }

  function getCallNumber(site, index) {
    // The explicit index is the authoritative position in the current view.
    // Persisted call numbers are only a fallback for synthetic entries.
    if (Number.isInteger(index) && index >= 0) {
      return window.NavSchema && typeof window.NavSchema.formatCallNumber === "function"
        ? window.NavSchema.formatCallNumber(index)
        : String(index + 1).padStart(2, "0");
    }
    if (site && site.callNumber) return String(site.callNumber);
    if (window.NavSchema && typeof window.NavSchema.formatCallNumber === "function") {
      return window.NavSchema.formatCallNumber(index);
    }
    return String((Number(index) || 0) + 1).padStart(2, "0");
  }

  // "All" renders sectioned cards, so a section-local index would restart at
  // 01 in every shelf. Resolve the stable archive position instead.
  function getArchiveCallNumber(site) {
    const rawSites = getRawSites();
    const rawIndex = rawSites.findIndex(function (item) {
      return item.id === site.id;
    });
    if (rawIndex >= 0) return getCallNumber(site, rawIndex);

    const shadowSites = getShadowSites();
    const shadowIndex = shadowSites.findIndex(function (item) {
      return item.id === site.id;
    });
    if (shadowIndex >= 0) return getCallNumber(site, rawSites.length + shadowIndex);

    return String(site.callNumber || "").trim() || getCallNumber(site, 0);
  }

  function formatLedgerMonthDay(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return String(date.getMonth() + 1).padStart(2, "0") + "." +
      String(date.getDate()).padStart(2, "0");
  }

  function getActiveCategoryLabel() {
    if (state.activeCategory === "favorites") return "私人典藏";
    if (state.activeCategory === "frequent") return "常驻案头";
    if (state.activeCategory === "all") return "全部藏目";
    const category = getRawCategories().find(function (item) {
      return item.id === state.activeCategory;
    });
    return category ? category.name : "馆藏";
  }

  // 当前视图的稳定索书号。All 视图按分类分组编号，使编号与视觉顺序一致。
  function getCurrentViewSites() {
    const allSites = getRawSites();
    if (state.activeCategory === "all") {
      return allSites;
    }
    if (state.searchQuery.trim()) {
      return window.NavSearch ? window.NavSearch.filter(allSites, state.searchQuery) : allSites;
    }
    if (state.activeCategory === "favorites") {
      const favs = allSites.filter(function (site) {
        return window.NavFavorites && window.NavFavorites.has(site.id);
      });
      return window.NavSortable ? window.NavSortable.sortSites("favorites", favs) : favs;
    }
    if (state.activeCategory === "frequent") {
      return getDeskSites(allSites);
    }
    const inCategory = allSites.filter(function (site) {
      return site.category === state.activeCategory;
    });
    return window.NavSortable
      ? window.NavSortable.sortSites(state.activeCategory, inCategory)
      : inCategory;
  }

  function buildCallNumberMap(sites) {
    const map = new Map();
    (Array.isArray(sites) ? sites : []).forEach(function (site, index) {
      map.set(site.id, getCallNumber(site, index));
    });
    return map;
  }

  // 常驻案头 = 手动典藏 + 近 7 天借阅频次 Top 6，去重后保持案头优先。
  function getDeskSites(allSites) {
    const sites = Array.isArray(allSites) ? allSites : getRawSites();
    const seen = new Set();
    const result = [];

    sites.forEach(function (site) {
      if (window.NavFavorites && window.NavFavorites.has(site.id) && !seen.has(site.id)) {
        seen.add(site.id);
        result.push(site);
      }
    });

    const recent = window.NavLedger
      ? window.NavLedger.getRecentTopSites(sites, RECENT_DESK_LIMIT, RECENT_DESK_DAYS)
      : (window.NavVisits ? window.NavVisits.getTopSites(sites, RECENT_DESK_LIMIT) : []);
    recent.forEach(function (site) {
      if (!seen.has(site.id)) {
        seen.add(site.id);
        result.push(site);
      }
    });

    if (window.NavSortable && result.length > 1) {
      return window.NavSortable.sortSites("frequent", result);
    }
    return result;
  }

  function getSiteById(siteId) {
    const all = window.NavOverrides && typeof window.NavOverrides.getAllIncludingUncatalogued === "function"
      ? window.NavOverrides.getAllIncludingUncatalogued(true)
      : getRawSites();
    const normalized = window.NavSchema && typeof window.NavSchema.normalizeItems === "function"
      ? window.NavSchema.normalizeItems(all)
      : all;
    const found = normalized.find(function (site) { return site.id === siteId; });
    if (found) return found;
    const shadowDefaults = window.NavSanctum && typeof window.NavSanctum.getDefaultSites === "function"
      ? window.NavSanctum.getDefaultSites()
      : [];
    return shadowDefaults.find(function (site) { return site.id === siteId; }) || null;
  }

  function openSubLink(siteId, subLinkUrl) {
    const site = getSiteById(siteId);
    if (!site || !subLinkUrl || !/^https?:\/\//i.test(subLinkUrl)) return false;
    return openSite(site.id, subLinkUrl, "sublink");
  }

  function recordSiteAccess(siteId, source) {
    if (!siteId) return;
    if (source === "card-click") {
      const target = document.querySelector('[data-site-id="' + siteId.replace(/"/g, '\\"') + '"]');
      if (target) target.dataset.accessRecorded = "1";
    }
    if (window.NavLedger) {
      window.NavLedger.recordAccess(siteId);
    } else if (window.NavVisits) {
      window.NavVisits.record(siteId);
    }
    updateBadges();
  }

  function openSite(siteId, targetUrl, source) {
    const site = getSiteById(siteId);
    if (!site || !site.url) return false;
    const url = targetUrl && /^https?:\/\//i.test(targetUrl) ? targetUrl : site.url;
    recordSiteAccess(site.id, source);
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }

  function openSearchResult(siteId) {
    return openSite(siteId);
  }

  function openRandom(options) {
    const skipSealed = Boolean(options && options.skipSealed);
    if (!skipSealed && window.NavUncatalogued &&
      typeof window.NavUncatalogued.pickSealedCandidate === "function") {
      const sealed = window.NavUncatalogued.pickSealedCandidate();
      if (sealed) {
        window.NavUncatalogued.openSealedPrompt(sealed);
        return {
          site: sealed,
          callNumber: window.NavUncatalogued.getTmpNumber(sealed)
        };
      }
    }
    const allSites = getRawSites();
    const deskSites = getDeskSites(allSites);
    const topSites = (window.NavLedger
      ? window.NavLedger.getRecentTopSites(allSites, RECENT_DESK_LIMIT, RECENT_DESK_DAYS)
      : [])
      .concat(deskSites.filter(function (site) {
        return window.NavFavorites && window.NavFavorites.has(site.id);
      }));
    const pinnedIds = new Set(topSites.map(function (site) { return site.id; }));
    const deepSites = allSites.filter(function (site) {
      return site && site.url && !pinnedIds.has(site.id);
    });
    const pool = deepSites.length > 0 ? deepSites : allSites;
    if (pool.length === 0) return null;

    const selected = pool[Math.floor(Math.random() * pool.length)];
    const orderedSites = getCurrentViewSites();
    const index = orderedSites.findIndex(function (site) { return site.id === selected.id; });
    const callNumber = getCallNumber(selected, index >= 0 ? index : 0);

    const show = function () {
      if (!window.NavSerendipity) return;
      if (typeof window.NavSerendipity.spinAndOpen === "function") {
        window.NavSerendipity.spinAndOpen(selected, callNumber);
      } else {
        window.NavSerendipity.open(selected, callNumber);
      }
    };
    // Batch 2：今日开卷的转盘弹窗（serendipity.js）按需加载。
    if (window.NavSerendipity || !window.NavLazy) show();
    else withLazy("serendipity", show);
    return { site: selected, callNumber: callNumber };
  }

  function getSearchMatches(query) {
    const raw = String(query === undefined ? state.searchQuery : query || "").trim();
    if (!raw || isCommandQuery(raw)) return [];
    const sites = getRawSites();
    const shadowSites = window.NavSanctum && typeof window.NavSanctum.isShadow === "function" &&
      window.NavSanctum.isShadow()
      ? getShadowSites()
      : [];
    const searchable = shadowSites.length ? sites.concat(shadowSites) : sites;
    return window.NavSearch ? window.NavSearch.filter(searchable, raw) : searchable;
  }

  function getUncataloguedMatches(query) {
    const raw = String(query || "").trim();
    if (!raw || isCommandQuery(raw)) return [];
    return window.NavSearch
      ? window.NavSearch.filter(getUncataloguedSites(), raw)
      : getUncataloguedSites();
  }

  function isLibrarianPrefix(value) {
    const first = String(value || "").trimStart().charAt(0);
    return first === "?" || first === "!";
  }

  function isCommandQuery(query) {
    const raw = String(query || "").trimStart();
    // Phase 4A: `?`（D1 荐书顾问）与 `!`（D1 就地处决）同样是前缀路由，
    // 它们不属于馆内模糊检索，因此必须一并挡在画布过滤之外。
    return raw.startsWith("/") || raw.startsWith(">") ||
      raw.startsWith("?") || raw.startsWith("!");
  }

  function isSecretCode(query) {
    return AGENT_SECRET_CODE !== "" && String(query || "").trim() === AGENT_SECRET_CODE;
  }

  function setSearchValue(value) {
    if (!dom.searchInput) return;
    dom.searchInput.value = value;
    if (dom.searchClearBtn) {
      dom.searchClearBtn.style.display = value.trim() ? "block" : "none";
    }
  }

  function resetSearch(options = {}) {
    setSearchValue("");
    state.searchQuery = "";
    if (window.NavCommands) window.NavCommands.close();
    if (options.focus && dom.searchInput) dom.searchInput.focus();
    if (options.render !== false) renderContent();
  }

  function switchCategory(targetCat, options = {}) {
    if (!targetCat) return;
    state.activeCategory = targetCat;
    if (state.searchQuery || (dom.searchInput && dom.searchInput.value)) {
      setSearchValue("");
      state.searchQuery = "";
      if (window.NavCommands) window.NavCommands.close();
    }
    renderIndexTabs();
    renderContent();
    if (options.focusTab !== false) {
      const activeTab = dom.tabsRail.querySelector(".index-tab-item.active");
      if (activeTab && typeof activeTab.scrollIntoView === "function") {
        activeTab.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  }

  function openAgentProbe(event) {
    if (event) {
      event.preventDefault();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      if (event.stopPropagation) event.stopPropagation();
    }
    resetSearch({ render: true, focus: false });
    if (AGENT_PROBE_URL) window.open(AGENT_PROBE_URL, "_blank");
  }

  // Central Enter route. The hidden probe code is checked before any
  // command/search routing; input-method composition is never intercepted.
  function routeSearchEnter(event) {
    if (!dom.searchInput || event.isComposing || event.keyCode === 229) return false;
    const value = dom.searchInput.value;
    if (isSecretCode(value)) {
      openAgentProbe(event);
      return true;
    }
    // Phase 4A · D1：`?` / `!` 只在焦点位于索书框且以该前缀开头时触发司天监，
    // 非输入态按 `?` 依旧由 shortcuts.js 打开「快捷键漫游指南」。
    if (window.NavLibrarian && typeof window.NavLibrarian.handleEnter === "function" &&
      window.NavLibrarian.isLibrarianQuery(value)) {
      return window.NavLibrarian.handleEnter(event) ? true : false;
    }
    if (!window.NavLibrarian && isLibrarianPrefix(value)) {
      // 司天监尚未载入（极快的回车）：先拦下回车，载入后补一次输入 + 回车。
      if (event) event.preventDefault();
      withLazy("librarian", function () {
        if (!window.NavLibrarian) return;
        window.NavLibrarian.handleInput(dom.searchInput.value);
        window.NavLibrarian.handleEnter(null);
      });
      return true;
    }
    if (window.NavSanctum && typeof window.NavSanctum.handleCommand === "function" &&
      window.NavSanctum.handleCommand(value)) {
      resetSearch({ render: true, focus: false });
      return true;
    }
    if (isCommandQuery(value)) return false;

    event.preventDefault();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();

    const query = value.trim();
    if (!query) return true;

    // Cmd/Ctrl+Shift+Enter is a dedicated multi-cast gesture. It must not
    // pass through the ordinary single-engine Shift+Enter branch below.
    if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
      if (window.NavEngine && typeof window.NavEngine.multicast === "function") {
        window.NavEngine.multicast(query);
      } else if (window.NavConstellations &&
        typeof window.NavConstellations.multicast === "function") {
        window.NavConstellations.multicast(query);
      }
      return true;
    }

    if (event.shiftKey) {
      if (window.NavEngine && typeof window.NavEngine.searchExternal === "function") {
        window.NavEngine.searchExternal(query);
      }
      return true;
    }

    const matches = getSearchMatches(query);
    if (matches.length === 1) {
      openSearchResult(matches[0].id);
      return true;
    }

    if (window.NavEngine && typeof window.NavEngine.searchExternal === "function") {
      window.NavEngine.searchExternal(query);
    }
    return true;
  }

  // ==========================================================================
  // 视图组件渲染器 (HTML Builders)
  // ==========================================================================

  // 按索引选择三种密度：主卷、标准典藏、窄幅索书签。
  function getCardTier(index, total, isSearch = false) {
    if (isSearch && total <= 4) return "archive";
    if (total <= 2) return "full";
    if (index === 0) return "monograph";
    if (index <= 3) return "archive";
    return "slip";
  }

  // 生成书目卡片条目（语义化 article + Stretched Link，符合 W3C 无交互元素嵌套规范，支持出版物划线批注高亮）
  function createEntryCardHtml(site, index, query = "", total = 1, isSearch = false) {
    const isBookmarked = window.NavFavorites ? window.NavFavorites.has(site.id) : false;
    const domain = extractDomain(site.url);
    const name = siteName(site);
    const description = siteDescription(site);
    const emblemText = escapeHtml(site.icon || name.slice(0, 2));
    const rawTag = Array.isArray(site.tags) && site.tags[0] ? site.tags[0] : "典藏";
    const firstTag = (query && window.NavSearch)
      ? window.NavSearch.highlight(rawTag, query)
      : escapeHtml(rawTag);
    // Section-local indexes still drive card density; call numbers stay stable
    // across the global archive so every card has exactly one physical stamp.
    const indexStr = state.activeCategory === "all" && !query
      ? getArchiveCallNumber(site)
      : getCallNumber(site, index);

    const displayName = (query && window.NavSearch)
      ? window.NavSearch.highlight(name, query)
      : escapeHtml(name);
    const displayDesc = (query && window.NavSearch)
      ? window.NavSearch.highlight(description, query)
      : escapeHtml(description);
    const tier = getCardTier(index, total, isSearch);
    const tierClass = `card--${tier}`;
    const stat = window.NavLedger ? window.NavLedger.getStat(site.id) : null;
    const isDusty = window.NavLedger ? window.NavLedger.isDusty(site.id, 60) : false;
    const isShadow = site.visibility === "shadow";
    const isFocusSealed = window.NavSanctum && typeof window.NavSanctum.shouldSeal === "function"
      ? window.NavSanctum.shouldSeal(site)
      : site.category === "social" &&
        document.documentElement.getAttribute("data-focus-lock") === "true";
    const stampText = stat && stat.count > 0
      ? `调阅 ${stat.count} 次 · 末次 ${formatLedgerMonthDay(stat.lastVisited)}`
      : "";
    // One resolver for every surface. It prefers the checked-in catalogue,
    // leaves private hosts entirely local, and gives future remote entries a
    // no-CORS image-provider chain.
    const iconAttributes = window.NavSchema && typeof window.NavSchema.iconAttributes === "function"
      ? window.NavSchema.iconAttributes(site)
      : "";
    const iconImg = iconAttributes
      ? `<img
                class="emblem-img"
                ${iconAttributes}
                loading="lazy"
                alt=""
              >`
      : "";
    const marginaliaTriggerHtml = (buttonClass, label) => `
      <button
        type="button"
        class="${buttonClass}"
        data-marginalia-toggle="${escapeHtml(site.id)}"
        title="翻开批注面 (Alt+点击整卡)"
        aria-label="${escapeHtml(label)}"
      >№ ${indexStr}</button>`;

    return `
      <article
        class="entry-card ${tierClass}${isDusty ? " card--dusty" : ""}${isShadow ? " card--shadow" : ""}${isFocusSealed ? " card--sealed" : ""}"
        data-site-id="${escapeHtml(site.id)}"
        data-site-url="${escapeHtml(site.url)}"
        data-call-number="${escapeHtml(indexStr)}"
        data-visibility="${escapeHtml(site.visibility || "public")}"
      >
        ${isDusty ? '<span class="card-dust-mark" aria-label="尘封藏书">[ 尘封 ]</span>' : ""}
        ${isShadow ? '<span class="card-shadow-mark" aria-label="暗月卷宗">[ 暗月 ]</span>' : ""}
        ${isFocusSealed ? '<button type="button" class="card-seal-mark" data-focus-seal aria-label="沉浸研习封条，点击解除">[ 司天监封条 · 沉浸研习中 ]</button>' : ""}
        <div class="card-masthead">
          <div class="card-identity">
            <span class="card-emblem" aria-hidden="true">${iconImg}<span class="emblem-fallback-text">${emblemText}</span></span>
            <div class="card-titles">
              <h3 class="card-title-text">
                <a
                  href="${escapeHtml(site.url)}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="card-title-link"
                  title="${escapeHtml(name)}"
                  data-card-open="1"
                >
                  ${displayName}
                </a>
              </h3>
              <div class="card-domain-slug">${escapeHtml(domain)}</div>
            </div>
          </div>
          <button
            type="button"
            class="btn-bookmark ${isBookmarked ? 'bookmarked' : ''}"
            title="${isBookmarked ? '取消典藏' : '收入典藏'}"
            aria-label="${isBookmarked ? '取消典藏 ' + escapeHtml(name) : '收藏 ' + escapeHtml(name)}"
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
        <p class="card-synopsis" title="${escapeHtml(description)}">${displayDesc}</p>
        <div class="card-bottom-rail">
          <div class="card-ledger-rail">
            <span class="card-tag-pill">#${firstTag}</span>
            ${stampText ? `<span class="card-ledger-stamp">${escapeHtml(stampText)}</span>` : ""}
          </div>
          <div class="card-bottom-actions">
            <button
              type="button"
              class="btn-bookplate"
              data-bookplate-id="${escapeHtml(site.id)}"
              title="查看专属数字藏书票 (Ex Libris)"
              aria-label="查看 ${escapeHtml(name)} 的藏书票"
            >
              📜 藏书票
            </button>
            ${marginaliaTriggerHtml("card-slip-marginalia-trigger", "翻开 " + name + " 的批注面")}
            <a
              href="${escapeHtml(site.url)}"
              target="_blank"
              rel="noopener noreferrer"
              class="card-jump-mark"
              aria-label="访问 ${escapeHtml(name)}"
            >
              <span class="card-call-number">№ ${indexStr}</span> ↗
            </a>
          </div>
        </div>
        <aside class="card-monograph-plate" aria-label="第 ${indexStr} 卷藏书票印鉴">
          <span class="card-monograph-orbit" aria-hidden="true"></span>
          <button
            type="button"
            class="card-monograph-number"
            data-marginalia-toggle="${escapeHtml(site.id)}"
            title="翻开批注面 (Alt+点击整卡)"
            aria-label="翻开 ${escapeHtml(name)} 的批注面"
          >№ ${indexStr}</button>
          <button
            type="button"
            class="btn-bookplate btn-monograph-plate"
            data-bookplate-id="${escapeHtml(site.id)}"
            title="查看专属数字藏书票 (Ex Libris)"
            aria-label="查看 ${escapeHtml(name)} 的藏书票"
          >
            ★ 藏书票
          </button>
        </aside>
        <div class="card-slip-compact">
          ${marginaliaTriggerHtml("card-slip-index", "翻开 " + name + " 的批注面")}
          <span class="card-emblem card-slip-emblem" aria-hidden="true">${iconImg}<span class="emblem-fallback-text">${emblemText}</span></span>
          <a
            href="${escapeHtml(site.url)}"
            target="_blank"
            rel="noopener noreferrer"
            class="card-slip-link"
            aria-label="访问 ${escapeHtml(name)}"
          >
            <span class="card-slip-title">${displayName}</span>
            <span class="card-slip-summary">${displayDesc}</span>
          </a>
          <span class="card-slip-domain">${escapeHtml(domain)}</span>
          <span class="card-slip-arrow" aria-hidden="true">↗</span>
          <button
            type="button"
            class="btn-bookmark card-slip-bookmark ${isBookmarked ? 'bookmarked' : ''}"
            title="${isBookmarked ? '取消典藏' : '收入典藏'}"
            aria-label="${isBookmarked ? '取消典藏 ' + escapeHtml(name) : '收藏 ' + escapeHtml(name)}"
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
        <section class="card-marginalia" data-marginalia-id="${escapeHtml(site.id)}" aria-label="${escapeHtml(name)} 的藏书票批注" aria-hidden="true">
          <header class="marginalia-head">
            <span class="marginalia-kicker">EX LIBRIS · MARGINALIA</span>
            <button type="button" class="marginalia-close" data-marginalia-close aria-label="收起批注">✕</button>
          </header>
          <div class="marginalia-title-row">
            <h3>${escapeHtml(name)}</h3>
            <span>№ ${indexStr}</span>
          </div>
        </section>
      </article>
    `;
  }

  // Phase 5：卡片背面批注正文（编辑器 + 子路由 + 印章）不再随首屏 36 张卡预渲染。
  // 首屏只留 .card-marginalia 外壳，用户首次翻开背面时才按需填充。
  function createMarginaliaBodyHtml(site, indexStr) {
    const name = siteName(site);
    const notes = window.NavLedger && typeof window.NavLedger.getMarginalia === "function"
      ? window.NavLedger.getMarginalia(site.id)
      : (site.notes || "");
    const subLinks = Array.isArray(site.subLinks) ? site.subLinks.slice(0, 4) : [];
    const stat = window.NavLedger ? window.NavLedger.getStat(site.id) : null;
    const subLinksHtml = subLinks.map(function (link) {
      return [
        "<button type=\"button\" class=\"marginalia-sublink\" data-marginalia-sublink=\"",
        escapeHtml(link.url), "\" title=\"", escapeHtml(link.url), "\">",
        escapeHtml(link.label || "子路由"), " <span aria-hidden=\"true\">↗</span></button>"
      ].join("");
    }).join("");
    return `
          <div class="marginalia-note-block">
            <div class="marginalia-section-label">馆主批注 <button type="button" class="marginalia-edit" data-marginalia-edit aria-label="编辑批注">✎</button></div>
            <p class="marginalia-note-text" data-marginalia-note-text>${notes ? escapeHtml(notes) : "<span class=\"marginalia-placeholder\">双击此处或点铅笔，写下私人评注与使用备忘。</span>"}</p>
            <div class="marginalia-note-editor" data-marginalia-editor hidden>
              <textarea rows="3" data-marginalia-input aria-label="馆主批注">${escapeHtml(notes)}</textarea>
              <div class="marginalia-editor-actions">
                <button type="button" data-marginalia-cancel>取消</button>
                <button type="button" data-marginalia-save>存入账本</button>
              </div>
            </div>
          </div>
          <div class="marginalia-sublinks-block">
            <div class="marginalia-section-label">快捷子路由</div>
            <div class="marginalia-sublinks" data-marginalia-sublinks>
              ${subLinksHtml || '<span class="marginalia-placeholder">暂无子路由</span>'}
            </div>
            <button type="button" class="marginalia-add-sublink" data-marginalia-add-sublink>+ 子路由</button>
          </div>
          <footer class="marginalia-stamp">
            <span>累计调阅 ${stat ? stat.count : 0} 次</span>
            <span>${stat && stat.lastVisited ? "末次 " + formatLedgerMonthDay(stat.lastVisited) : "尚未开卷"}</span>
          </footer>`;
  }

  /**
   * Phase 5：按需填充某张卡片背面的批注 DOM（幂等）。
   * 首次翻开背面时调用一次，之后直接复用已建节点。
   */
  function hydrateMarginaliaPanel(card) {
    if (!card) return null;
    const panel = card.querySelector(".card-marginalia");
    if (!panel) return null;
    if (panel.dataset.marginaliaHydrated === "true") return panel;
    const siteId = card.getAttribute("data-site-id");
    const site = getSiteById(siteId);
    if (!site) return panel;
    const indexStr = card.getAttribute("data-call-number") || getCallNumber(site, 0);
    panel.insertAdjacentHTML("beforeend", createMarginaliaBodyHtml(site, indexStr));
    panel.dataset.marginaliaHydrated = "true";
    return panel;
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
        <div class="entries-grid cards-asymmetric-grid" data-category-key="${escapeHtml(categoryKey)}">
          ${cardsHtml}
        </div>
      </section>
    `;
  }

  // 在搜索状态下只渲染命中结果，并保留当前视图的稳定索书号。
  function createMatchedGridHtml(matches, query) {
    const allViewSites = getCurrentViewSites();
    const callNumberMap = buildCallNumberMap(allViewSites.length ? allViewSites : getRawSites());
    const cardsHtml = matches.map(function (site, index) {
      const stableIndex = callNumberMap.has(site.id)
        ? Number(callNumberMap.get(site.id)) - 1
        : index;
      return createEntryCardHtml(site, stableIndex, query, matches.length, true);
    }).join("");
    return `<div class="entries-grid cards-asymmetric-grid" data-category-key="search">${cardsHtml}</div>`;
  }

  // 生成专用于检索未命中的典雅图书馆式空状态与推荐藏书
  // Batch 2 回归修复：空态模板在早期重构中被误删，空「私人典藏 / 常驻案头」会抛
  // ReferenceError（此前因快捷书签扣绑定落空而没人触发）。按初版原样恢复。
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
        ` : ""}
      </div>
    `;
  }

  function createSearchEmptyStateHtml(query, allSites) {
    // 挑选 3 本馆藏代表性典籍（优先选取已收藏或常驻案头条目，不足则取前列条目）
    const favs = allSites.filter(s => window.NavFavorites && window.NavFavorites.has(s.id));
    const freqs = getDeskSites(allSites).slice(0, 3);
    const pool = [...favs, ...freqs, ...allSites];
    const recSites = [];
    const seenIds = new Set();
    for (const site of pool) {
      if (!seenIds.has(site.id)) {
        seenIds.add(site.id);
        recSites.push(site);
        if (recSites.length >= 3) break;
      }
    }

    const recCardsHtml = recSites.map(s => `
      <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="empty-rec-card" title="${escapeHtml(s.name)}">
        <span class="empty-rec-icon">${escapeHtml(s.icon || s.name.slice(0, 2))}</span>
        <div class="empty-rec-meta">
          <span class="empty-rec-name">${escapeHtml(s.name)}</span>
          <span class="empty-rec-desc">${escapeHtml(s.description || '')}</span>
        </div>
      </a>
    `).join("");

    const exploreTags = ["#ai", "#代码", "#前端", "#效率", "#知识库", "#开源"];
    const tagPillsHtml = exploreTags.map(tag => `
      <button type="button" class="empty-tag-pill" data-suggest-tag="${escapeHtml(tag)}">
        ${escapeHtml(tag)}
      </button>
    `).join("");

    return `
      <div class="quiet-empty-state">
        <div class="empty-state-symbol" aria-hidden="true">❦</div>
        <h3 class="empty-state-headline">馆藏目录未检索到 “${escapeHtml(query)}”</h3>
        <p class="empty-state-text">暂无完全匹配之书卷。您可以尝试缩短检索词、使用拼音简拼（如 kl、ds、xtjj、yq）或点击下方标签展开探索。</p>
        <button type="button" class="btn-empty-action" data-empty-action="resetSearch">
          清空检索
        </button>

        <div class="empty-recommendation-box">
          <div class="empty-recommendation-title">—— 馆席精选藏目推荐 ——</div>
          <div class="empty-recommendation-grid">
            ${recCardsHtml}
          </div>
          <div class="empty-suggest-tags">
            <span class="empty-suggest-label">热门探索分类：</span>
            ${tagPillsHtml}
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // 主渲染流程 (Main Render Flow)
  // ==========================================================================

  function renderStarMapView() {
    const hostElement = document.querySelector(".star-map-container");
    if (!hostElement || !window.NavStarMap) return false;
    dom.contentArea.hidden = true;
    hostElement.hidden = false;
    window.NavStarMap.open(hostElement);
    if (window.NavAlmanac && typeof window.NavAlmanac.applyWindow === "function") {
      window.NavAlmanac.applyWindow(window.NavAlmanac.getWindow());
    }
    return true;
  }

  function renderContent() {
    if (state.archiveView === "star-map" && window.NavStarMap) {
      renderStarMapView();
      return;
    }
    dom.contentArea.hidden = false;
    const starMapContainer = document.querySelector(".star-map-container");
    if (starMapContainer && window.NavStarMap) {
      starMapContainer.hidden = true;
      window.NavStarMap.close();
    }
    const allSites = getRawSites();
    const categories = getRawCategories();
    const query = state.searchQuery.trim();

    // 1. 处于全局实时搜索模式
    if (query) {
      dom.statusBar.style.display = "flex";
      const matches = getSearchMatches(query);
      const dist = window.NavSearch ? window.NavSearch.getCategoryDistribution(matches, categories) : [];
      const uncataloguedMatches = getUncataloguedMatches(query);
      const totalMatches = matches.length + uncataloguedMatches.length;

      const distHtml = dist.map(d => `
        <button type="button" class="search-cat-pill" data-focus-cat="${escapeHtml(d.id)}" title="一键聚焦至「${escapeHtml(d.name)}」">
          <span>${escapeHtml(d.name)}</span>
          <span class="pill-count">${d.count}</span>
        </button>
      `).join("");

      dom.statusText.innerHTML = `
        <div class="search-status-content">
          <span>检索 “<strong>${escapeHtml(query)}</strong>” · 共寻得 <strong>${totalMatches}</strong> 卷藏书${uncataloguedMatches.length ? `（含待编目 ${uncataloguedMatches.length}）` : ""}</span>
          ${distHtml ? `<div class="search-dist-pills">${distHtml}</div>` : ''}
        </div>
      `;

      const potentialHtml = window.NavUncatalogued
        ? window.NavUncatalogued.renderPotentialMatches(query)
        : "";

      if (matches.length === 0) {
        dom.contentArea.innerHTML = uncataloguedMatches.length > 0
          ? potentialHtml
          : createSearchEmptyStateHtml(query, allSites);
      } else {
        dom.contentArea.innerHTML = createMatchedGridHtml(matches, query);
        dom.contentArea.insertAdjacentHTML("beforeend", potentialHtml);
      }
      bindRenderedIconFallbacks();
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
        const cardsHtml = favSites.map((site, idx) =>
          createEntryCardHtml(site, idx, "", favSites.length)
        ).join("");
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
      if (window.NavSortable && window.NavSortable.isArrangeMode()) {
        window.NavSortable.refreshCardAttributes();
      }
      bindRenderedIconFallbacks();
      return;
    }

    // 2.2 查看「常驻案头」
    if (state.activeCategory === "frequent") {
      const freqSites = getDeskSites(allSites);
      if (freqSites.length === 0) {
        dom.contentArea.innerHTML = createEmptyStateHtml(
          "案头暂无常驻记录",
          "手动典藏或近 7 天调阅过的藏书会自动汇聚到案头。",
          "查阅全部藏书",
          "viewAll"
        );
      } else {
        const clearActionHtml = `
          <button type="button" class="btn-clear-visits" id="btn-clear-visits-action" title="重置本地访问记录">
            清空案头记录
          </button>
        `;
        const cardsHtml = freqSites.map((site, idx) =>
          createEntryCardHtml(site, idx, "", freqSites.length)
        ).join("");
        dom.contentArea.innerHTML = createSectionHtml(
          "常驻案头 (高频访问)",
          "DESK",
          "手动典藏 + 近 7 天借阅频次 Top 6",
          freqSites.length,
          cardsHtml,
          clearActionHtml,
          "frequent"
        );
      }
      if (window.NavSortable && window.NavSortable.isArrangeMode()) {
        window.NavSortable.refreshCardAttributes();
      }
      bindRenderedIconFallbacks();
      return;
    }

    // 2.3 查看「全部」
    if (state.activeCategory === "all") {
      // Shadow entries are a separate visibility bucket. They are appended
      // only in the "all" view and never merged into public call numbers.
      const shadowSites = window.NavSanctum && window.NavSanctum.isShadow && window.NavSanctum.isShadow()
        ? getShadowSites()
        : [];
      // 网格视图渲染全馆板块
      const sectionsHtml = [];
      const cataloguedIds = new Set();

      // 若有收藏，置顶展示私人典藏专栏（支持独立排序）
      const rawFavSites = allSites.filter(site => window.NavFavorites && window.NavFavorites.has(site.id));
      const favSites = window.NavSortable ? window.NavSortable.sortSites("favorites", rawFavSites) : rawFavSites;
      if (favSites.length > 0) {
        favSites.forEach(site => cataloguedIds.add(site.id));
        const favCards = favSites.map((site, idx) =>
          createEntryCardHtml(site, idx, "", favSites.length)
        ).join("");
        sectionsHtml.push(createSectionHtml("私人典藏", "FAV", "随时查阅的归档藏书", favSites.length, favCards, "", "favorites"));
      }

      // 常驻案头只补充尚未在私人典藏出现的卡片，避免全馆视图重复编号。
      const freqSites = getDeskSites(allSites).filter(site => !cataloguedIds.has(site.id));
      if (freqSites.length > 0) {
        freqSites.forEach(site => cataloguedIds.add(site.id));
        const freqCards = freqSites.map((site, idx) =>
          createEntryCardHtml(site, idx, "", freqSites.length)
        ).join("");
        sectionsHtml.push(createSectionHtml("常驻案头", "TOP", "近期高频访问入口", freqSites.length, freqCards, "", "frequent"));
      }

      // 依次展示各分类专栏；快捷专栏已经承载的卡片不再重复渲染。
      categories.forEach(cat => {
        const rawCatSites = allSites.filter(s => s.category === cat.id && !cataloguedIds.has(s.id));
        const catSites = window.NavSortable ? window.NavSortable.sortSites(cat.id, rawCatSites) : rawCatSites;
        if (catSites.length > 0) {
          const cards = catSites.map((site, idx) =>
            createEntryCardHtml(site, idx, "", catSites.length)
          ).join("");
          sectionsHtml.push(createSectionHtml(cat.name, cat.code || "SEC", cat.desc, catSites.length, cards, "", cat.id));
        }
      });

      if (shadowSites.length > 0) {
        const shadowCards = shadowSites.map(function (site, idx) {
          return createEntryCardHtml(site, idx, "", shadowSites.length);
        }).join("");
        sectionsHtml.push(createSectionHtml(
          "暗月卷宗",
          "SHADOW",
          "仅在暗月密室中显现的私密馆藏",
          shadowSites.length,
          shadowCards,
          "",
          "shadow"
        ));
      }

      if (sectionsHtml.length === 0) {
        dom.contentArea.innerHTML = createEmptyStateHtml("藏馆暂无条目", "请在 data.js 中添加网站数据。", "", "");
      } else {
        dom.contentArea.innerHTML = sectionsHtml.join("");
      }
      if (window.NavSortable && window.NavSortable.isArrangeMode()) {
        window.NavSortable.refreshCardAttributes();
      }
      bindRenderedIconFallbacks();
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
      const cards = catSites.map((site, idx) =>
        createEntryCardHtml(site, idx, "", catSites.length)
      ).join("");
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
    if (window.NavSortable && window.NavSortable.isArrangeMode()) {
      window.NavSortable.refreshCardAttributes();
    }
    bindRenderedIconFallbacks();
  }

  function bindRenderedIconFallbacks() {
    if (window.NavSchema && typeof window.NavSchema.bindIconFallbacks === "function") {
      window.NavSchema.bindIconFallbacks(dom.contentArea);
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
    const createSpineTab = (target, index, label, count, id = "", auxiliary = false) => `
      <button
        type="button"
        class="index-tab-item ${auxiliary ? 'spine-aux-item' : ''} ${state.activeCategory === target ? 'active' : ''}"
        data-cat-target="${escapeHtml(target)}"
        aria-current="${state.activeCategory === target ? 'page' : 'false'}"
        style="--cat-index: ${index};"
      >
        <span class="tab-coordinate" aria-hidden="true">${String(index).padStart(2, "0")}°</span>
        <span class="tab-label">${label}</span>
        <span class="tab-spine-line" aria-hidden="true"></span>
        <span class="tab-badge-num"${id ? ` id="${id}"` : ""}>${count}</span>
      </button>
    `;

    // 以 00°~ 的坐标刻度将分类组织成纵向书脊
    tabs.push(createSpineTab("all", 0, "全部藏目", allSites.length));
    tabs.push(createSpineTab("favorites", 1, "私人典藏", favCount, "badge-fav-num", true));
    tabs.push(createSpineTab("frequent", 2, "常驻案头", freqCount, "badge-freq-num", true));

    categories.forEach((cat, categoryIndex) => {
      const count = allSites.filter(s => s.category === cat.id).length;
      tabs.push(createSpineTab(
        cat.id,
        categoryIndex + 3,
        escapeHtml(cat.name),
        count
      ));
    });

    dom.tabsRail.innerHTML = tabs.join("");

    // 驱动右栏观测星盘随当前栏目旋转
    const activeIndex = Math.max(
      0,
      Array.from(dom.tabsRail.querySelectorAll(".index-tab-item"))
        .findIndex(item => item.classList.contains("active"))
    );
    document.documentElement.style.setProperty("--active-cat-index", String(activeIndex));
  }

  function updateBadges() {
    const favBadge = document.getElementById("badge-fav-num");
    if (favBadge) {
      favBadge.textContent = getValidFavCount();
    }
    const freqBadge = document.getElementById("badge-freq-num");
    if (freqBadge) {
      freqBadge.textContent = getDeskSites(getRawSites()).length;
    }
    const uncataloguedCount = document.getElementById("uncatalogued-entry-count");
    if (uncataloguedCount) {
      const count = getUncataloguedSites().length;
      uncataloguedCount.textContent = count > 0 ? String(count).padStart(2, "0") : "00";
    }
    // 同步刷新刊头金石里程碑印章
    if (window.NavLore) {
      window.NavLore.renderMastheadSeal(document.getElementById("masthead-milestone-slot"));
    }
  }

  // ==========================================================================
  // 事件交互绑定 (Event Handlers & Shortcuts)
  // ==========================================================================

  function bindEvents() {
    // 星图标题栏的「返回目录」由星图模块渲染（晚于这里），用委托。
    document.addEventListener("click", function (event) {
      if (event.target.closest && event.target.closest("#btn-star-map-back")) setArchiveView("grid");
    });
    // 注意排除 <html>：它也带 data-archive-view（供 CSS 用），绑上会让任何点击都触发视图切换。
    document.querySelectorAll("button[data-archive-view]").forEach(function (button) {
      button.addEventListener("click", function () {
        setArchiveView(button.getAttribute("data-archive-view"));
      });
    });
    const almanacJump = document.getElementById("btn-almanac-jump");
    if (almanacJump) {
      almanacJump.addEventListener("click", openAlmanac);
    }
    document.addEventListener("keydown", function (event) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" ||
        (target && target.isContentEditable)) return;
      if (event.key !== "g" && event.key !== "G") return;
      event.preventDefault();
      setArchiveView(state.archiveView === "star-map" ? "grid" : "star-map");
    }, true);

    // 1. 实时搜索监听：普通词始终执行馆内过滤；命令前缀交给命令面板。
    dom.searchInput.addEventListener("input", function (e) {
      const raw = e.target.value;
      state.searchQuery = isCommandQuery(raw) ? "" : raw;
      dom.searchClearBtn.style.display = raw.trim().length > 0 ? "block" : "none";
      if (window.NavLore && window.NavLore.checkSearchEasterEgg(state.searchQuery)) {
        window.NavLore.open("about");
      } else if (!window.NavLore && state.searchQuery.trim()) {
        // 彩蛋口诀在 lore.js 里：首次输入检索词时按需加载，载入后补查当前输入。
        withLazy("lore", function () {
          const q = isCommandQuery(dom.searchInput.value) ? "" : dom.searchInput.value;
          if (window.NavLore && q && window.NavLore.checkSearchEasterEgg(q)) window.NavLore.open("about");
        });
      }
      if (window.NavCommands) window.NavCommands.render(raw);
      // Phase 4A · D1：`?` / `!` 前缀实时展开司天监羊皮纸浮层（其余输入自动收卷）。
      if (window.NavLibrarian && typeof window.NavLibrarian.handleInput === "function") {
        window.NavLibrarian.handleInput(raw);
      } else if (isLibrarianPrefix(raw)) {
        withLazy("librarian", function () {
          if (window.NavLibrarian && typeof window.NavLibrarian.handleInput === "function") {
            window.NavLibrarian.handleInput(dom.searchInput.value);
          }
        });
      }
      renderContent();
    });

    // 1.1 特工暗号彩蛋 (暗号 直达哪吒探针面板)
    function handleAgentEasterEgg(e) {
      const input = dom.searchInput || document.getElementById("archive-search-input");
      if (!input) return false;
      const rawVal = (input.value || "").trim();
      if (rawVal !== "" && rawVal === AGENT_SECRET_CODE) {
        openAgentProbe(e);
        return true;
      }
      return false;
    }

    // 搜索框元素事件监听：捕获阶段先于 engine.js 和 shortcuts.js。
    if (dom.searchInput) {
      dom.searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          // Phase 4A · D1：司天监浮层开启时，Esc 优先收卷并清空索书框。
          if (window.NavLibrarian && window.NavLibrarian.isOpen()) {
            window.NavLibrarian.close();
            resetSearch({ render: true, focus: false });
            return;
          }
          if (window.NavSanctum && window.NavSanctum.isShadow && window.NavSanctum.isShadow()) {
            // Allow Esc to leave the shadow reading mode without touching
            // the hidden 暗号 probe route.
            window.NavSanctum.setShadow(false);
          }
          return;
        }
        if (e.key === "Enter") {
          routeSearchEnter(e);
        }
      }, true);
    }

    // 表单提交事件兜底拦截 (若存在外部插件或辅助提交)
    window.addEventListener(
      "submit",
      function (e) {
        const input = dom.searchInput || document.getElementById("archive-search-input");
        if (input && (input.value || "").trim() !== "" && (input.value || "").trim() === AGENT_SECRET_CODE) {
          if (handleAgentEasterEgg(e)) {
            return;
          }
        }
      },
      true
    );

    // 2. 清空搜索按钮
    dom.searchClearBtn.addEventListener("click", function () {
      resetSearch({ render: false });
      dom.searchInput.focus();
      renderContent();
    });

    // 3. 状态条重置与编目分类小胶囊聚焦
    dom.statusBar.addEventListener("click", function (e) {
      const focusPill = e.target.closest("[data-focus-cat]");
      if (focusPill) {
        const catId = focusPill.getAttribute("data-focus-cat");
        switchCategory(catId);
        return;
      }
    });

    dom.statusResetBtn.addEventListener("click", function () {
      resetSearch({ render: true });
    });

    // 4. 分类标签切换
    dom.tabsRail.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-cat-target]");
      if (!btn) return;
      const targetCat = btn.getAttribute("data-cat-target");
      if (!targetCat) return;

      // 停在星图时点左侧分类：回到书本目录并打开该专栏（不再「点啥都还是星图」）。
      if (state.archiveView === "star-map") setArchiveView("grid");
      switchCategory(targetCat);
    });

    // 8. 快捷书签扣（私人典藏 / 常驻案头）：Batch 2 起住在馆务抽屉里，
    //    改为 document 委托（原 .folio-search-meta 容器已不存在，旧绑定落空）。
    document.addEventListener("click", function (event) {
      const hook = event.target.closest("[data-search-cat]");
      if (!hook) return;
      switchCategory(hook.getAttribute("data-search-cat"));
    });

    // 5. 内容委托（书签点击、清空案头、外链点击统计、空状态操作）
    dom.contentArea.addEventListener("click", function (e) {
      // 5.0 若处于整理模式或刚完成拖拽，禁止一切卡片跳转
      if (window.NavSortable && (window.NavSortable.isArrangeMode() || window.NavSortable.isJustFinishedDrag())) {
        if (!e.target.closest("[data-bookmark-id], [data-bookplate-id]")) {
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

      // 5.12 藏书票批注层：关闭 / 编辑 / 保存 / 子路由
      // Phase 5：背面 DOM 懒构建 —— 任何背面操作前先按需填充（幂等）。
      const marginaliaHost = e.target.closest(".entry-card");
      if (marginaliaHost && e.target.closest(".card-marginalia")) {
        hydrateMarginaliaPanel(marginaliaHost);
      }
      const marginaliaClose = e.target.closest("[data-marginalia-close]");
      if (marginaliaClose) {
        e.preventDefault();
        e.stopPropagation();
        const card = marginaliaClose.closest(".entry-card");
        if (card) {
          card.classList.remove("is-flipped");
          const panel = card.querySelector(".card-marginalia");
          if (panel) panel.setAttribute("aria-hidden", "true");
        }
        return;
      }
      if (e.target.closest("[data-focus-seal]")) {
        e.preventDefault();
        e.stopPropagation();
        if (window.NavSanctum && typeof window.NavSanctum.setFocus === "function") {
          window.NavSanctum.setFocus(false);
        }
        return;
      }
      // A sealed card must be inert outside its explicit unlock seal. This
      // closes edge clicks, keyboard links and stale stretched-link targets.
      const sealedCard = e.target.closest(".entry-card.card--sealed");
      if (sealedCard) {
        e.preventDefault();
        e.stopPropagation();
        if (window.NavShortcuts) {
          window.NavShortcuts.showToast("封条未启 · 沉浸研习中", "点击中央封条即可解除考场结界", "⌛");
        }
        return;
      }
      const cardForFlip = e.target.closest(".entry-card");
      if (cardForFlip && e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        if (window.NavMarginalia && typeof window.NavMarginalia.flip === "function") {
          window.NavMarginalia.flip(cardForFlip.getAttribute("data-site-id"));
        } else {
          hydrateMarginaliaPanel(cardForFlip);
          cardForFlip.classList.toggle("is-flipped");
        }
        return;
      }
      if (e.target.closest("[data-card-open]") && cardForFlip) {
        e.preventDefault();
        e.stopPropagation();
        if (!cardForFlip.classList.contains("is-flipped")) {
          openSite(
            cardForFlip.getAttribute("data-site-id"),
            cardForFlip.getAttribute("data-site-url"),
            "card-click"
          );
        }
        return;
      }
      const marginaliaEdit = e.target.closest("[data-marginalia-edit]");
      if (marginaliaEdit) {
        e.preventDefault();
        e.stopPropagation();
        const panel = marginaliaEdit.closest(".card-marginalia");
        if (panel) {
          const editor = panel.querySelector("[data-marginalia-editor]");
          const text = panel.querySelector("[data-marginalia-note-text]");
          if (editor) editor.hidden = false;
          if (text) text.hidden = true;
          const input = panel.querySelector("[data-marginalia-input]");
          if (input) {
            input.focus();
            input.select();
          }
        }
        return;
      }
      const marginaliaCancel = e.target.closest("[data-marginalia-cancel]");
      if (marginaliaCancel) {
        e.preventDefault();
        e.stopPropagation();
        const panel = marginaliaCancel.closest(".card-marginalia");
        if (panel) {
          panel.querySelector("[data-marginalia-editor]").hidden = true;
          panel.querySelector("[data-marginalia-note-text]").hidden = false;
        }
        return;
      }
      const marginaliaSave = e.target.closest("[data-marginalia-save]");
      if (marginaliaSave) {
        e.preventDefault();
        e.stopPropagation();
        const panel = marginaliaSave.closest(".card-marginalia");
        const card = marginaliaSave.closest(".entry-card");
        const input = panel && panel.querySelector("[data-marginalia-input]");
        if (card && input && window.NavLedger) {
          window.NavLedger.setMarginalia(card.getAttribute("data-site-id"), input.value);
          if (window.NavShortcuts) window.NavShortcuts.showToast("批注已存入借阅账本", "", "✎");
          renderContent();
        }
        return;
      }
      const subLink = e.target.closest("[data-marginalia-sublink]");
      if (subLink) {
        e.preventDefault();
        e.stopPropagation();
        const card = subLink.closest(".entry-card");
        if (card) {
          openSubLink(card.getAttribute("data-site-id"), subLink.getAttribute("data-marginalia-sublink"));
        }
        return;
      }
      const addSubLink = e.target.closest("[data-marginalia-add-sublink]");
      if (addSubLink) {
        e.preventDefault();
        e.stopPropagation();
        const card = addSubLink.closest(".entry-card");
        const site = card ? getSiteById(card.getAttribute("data-site-id")) : null;
        if (site) {
          const label = prompt("子路由名称（如 API Keys / Docs）");
          if (!label) return;
          const url = prompt("子路由网址（http:// 或 https://）");
          if (!url || !/^https?:\/\//i.test(url)) {
            if (window.NavShortcuts) window.NavShortcuts.showToast("子路由网址格式不合法", "需以 http(s):// 开头", "⚠");
            return;
          }
          const next = (Array.isArray(site.subLinks) ? site.subLinks : []).slice();
          if (next.length >= 4) {
            if (window.NavShortcuts) window.NavShortcuts.showToast("最多 4 个子路由", "请先删除旧锚点", "ℹ");
            return;
          }
          next.push({ label: String(label).trim().slice(0, 24), url: String(url).trim() });
          if (window.NavOverrides && typeof window.NavOverrides.updateSite === "function") {
            window.NavOverrides.updateSite(site.id, { subLinks: next });
          }
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
        if (targetSite) {
          withLazy("exlibris", function () {
            if (window.NavExLibris) window.NavExLibris.open(targetSite);
          });
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

      // 5.3 空状态重置与推荐动作
      const suggestBtn = e.target.closest("[data-suggest-tag]");
      if (suggestBtn) {
        const tag = suggestBtn.getAttribute("data-suggest-tag");
        dom.searchInput.value = tag;
        state.searchQuery = tag;
        dom.searchClearBtn.style.display = "block";
        renderContent();
        dom.searchInput.focus();
        return;
      }

      const emptyBtn = e.target.closest("[data-empty-action]");
      if (emptyBtn) {
        const action = emptyBtn.getAttribute("data-empty-action");
        if (action === "resetSearch") {
          resetSearch({ render: true });
        } else if (action === "viewAll") {
          switchCategory("all");
        }
        return;
      }

      // 5.4 点击网站卡片，统计访问
      const card = e.target.closest(".entry-card");
      if (card) {
        const siteId = card.getAttribute("data-site-id");
        const marginaliaToggle = e.target.closest("[data-marginalia-toggle]");
        if (marginaliaToggle) {
          e.preventDefault();
          e.stopPropagation();
          if (window.NavMarginalia && typeof window.NavMarginalia.flip === "function") {
            window.NavMarginalia.flip(siteId);
          } else {
            hydrateMarginaliaPanel(card);
            card.classList.toggle("is-flipped");
          }
          return;
        }
        if (e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          if (window.NavMarginalia && typeof window.NavMarginalia.flip === "function") {
            window.NavMarginalia.flip(siteId);
          } else {
            hydrateMarginaliaPanel(card);
            card.classList.toggle("is-flipped");
          }
          return;
        }
        if (siteId && e.target.closest(".card-slip-link, .card-jump-mark")) {
          if (card.classList.contains("is-flipped")) return;
          e.preventDefault();
          e.stopPropagation();
          openSite(siteId, card.getAttribute("data-site-url"), "card-click");
          // 若正处于案头专栏，即刻重新渲染排序
          if (state.activeCategory === "frequent") {
            renderContent();
          }
        }
      }
    });

    dom.contentArea.addEventListener("dblclick", function (e) {
      const note = e.target.closest("[data-marginalia-note-text]");
      if (!note) return;
      e.preventDefault();
      const edit = note.closest(".card-marginalia").querySelector("[data-marginalia-edit]");
      if (edit) edit.click();
    });

    // 5.9 Phase 5：3D 书架按钮已移除，视图切换改由画布顶部的
    // 「书本目录 / 穹顶星图」双段开关与 `v` 快捷键统一驱动（见 setArchiveView）。

    // 6. 整理书架与拖拽排序控制
    const arrangeToggleBtn = document.getElementById("btn-arrange-toggle");
    if (arrangeToggleBtn) {
      arrangeToggleBtn.addEventListener("click", function () {
        // 整理模式只对卡片网格有意义；若正停在星图，先回到书本目录。
        if (state.archiveView === "star-map") {
          setArchiveView("grid");
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

    // 9. A8 顶栏随机开卷
    if (dom.randomBtn) {
      dom.randomBtn.addEventListener("click", openRandom);
    }

    // 10. 全站快捷键漫游由独立模块 js/shortcuts.js 统管
  }

  // ==========================================================================
  // 系统启动装配 (Bootstrap) —— Phase 5 两段式空闲启动 (Two-Stage Idle Boot)
  // ==========================================================================
  //
  // Stage 1（Critical Sync）：主题、典藏、访问、结界、星轨、排序 + 首屏渲染，
  //   必须同步执行，36 张卡片在第一帧就完成绘制，杜绝「载入中… · 0 卷」。
  // Stage 2（Deferred Idle）：所有隐藏弹窗 / 抽屉 / 次要模块推迟到空闲帧，
  //   把首屏主线程还给排版与绘制。
  //
  // 竞态防线：`flushIdleBoot()` 可在空闲回调触发前立即同步冲刷 Stage 2；
  // 任何在 Stage 2 完成前发生的用户按键 / 打开动作都会先调用它。

  let stage2Done = false;
  let stage2Promise = null;
  let stage2Resolve = null;
  let idleHandle = null;
  let idleFallbackTimer = null;

  function scheduleIdleBoot(fn) {
    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(fn, { timeout: 250 });
    } else {
      idleFallbackTimer = window.setTimeout(fn, 16);
    }
  }

  function cancelIdleBoot() {
    if (idleHandle !== null && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(idleHandle);
    }
    idleHandle = null;
    if (idleFallbackTimer !== null) {
      window.clearTimeout(idleFallbackTimer);
    }
    idleFallbackTimer = null;
  }

  // Stage 2 的模块清单：全部是隐藏浮层或纯键盘钩子，首屏不可见。
  // 顺序保持与历史一致，便于回归对照。
  // Batch 2：藏书票 / 手记 / 秘卷 / 工具尺 / 编年 / 司天监 / 琥珀 / 飞鸽 / 星图 / 右键菜单 /
  // 云同步 / 粒子 改为按需加载，由 js/lazy.js 在首次使用时载入并 init，这里不再初始化。
  function runStage2() {
    // 2.9 A1/A2/A8 纯前端效率模块
    if (window.NavCommands) {
      safeInit("NavCommands", function () { window.NavCommands.init(); });
    }
    // 卡片背面批注委托（薄壳，Stage 1 已渲染外壳）
    if (window.NavMarginalia) {
      safeInit("NavMarginalia", function () { window.NavMarginalia.init(); });
    }
    if (window.NavUncatalogued) {
      safeInit("NavUncatalogued", function () { window.NavUncatalogued.init(); });
    }
    if (window.NavFolioKeys) {
      safeInit("NavFolioKeys", function () {
        window.NavFolioKeys.init({
          onOpenNumber: function (code) {
            const site = getRawSites().find(function (site, index) {
              return getCallNumber(site, index) === code;
            });
            if (!site) return null;
            return { site: site, callNumber: code };
          },
          onRandom: openRandom,
          onCategorySwitch: function (tabIndex) {
            const tab = dom.tabsRail.querySelectorAll(".index-tab-item")[tabIndex];
            if (tab) switchCategory(tab.getAttribute("data-cat-target"), { focusTab: false });
          }
        });
      });
    }
    if (window.NavAstronomy) {
      safeInit("NavAstronomy", function () { window.NavAstronomy.init(); });
    }
    // Phase 4A：D1 守馆人 AI（司天监终端）与 A5/C4 星轨探针与遥测机关台。
    // Phase 4B：C2 观星晨报、D5 网页琥珀、A6/C5 飞鸽传书、D7 联邦寻星镜。
    // 附加模块的初始化必须与主画布渲染隔离：任何单个模块抛异常都不得中断
    // 卡片渲染与事件绑定，否则整座藏书馆会退化为「载入中… · 0 卷」。
    // Batch 2：A5 探针从 telemetry.js 拆为 js/probe.js（NavTelemetry 为别名）；
    // C2 晨报 / C4 机关台 / D6 白噪音 / D7 寻星镜 已下线（archive/retired-batch2/）。
    if (window.NavProbe) {
      safeInit("NavProbe", function () { window.NavProbe.init(); });
    }
    // 部分模块在 init 中自我注册到 NavApp；这里统一回填，保证引用永远可用。
    syncModuleRefs();
  }

  function syncModuleRefs() {
    if (!window.NavApp) return;
    const refs = {
      ExLibris: window.NavExLibris,
      Lore: window.NavLore,
      Commands: window.NavCommands,
      Uncatalogued: window.NavUncatalogued,
      Snippets: window.NavSnippets,
      Serendipity: window.NavSerendipity,
      Astronomy: window.NavAstronomy,
      BrassTools: window.NavBrassTools,
      Almanac: window.NavAlmanac,
      StarMap: window.NavStarMap,
      Librarian: window.NavLibrarian,
      Telemetry: window.NavProbe,
      Probe: window.NavProbe,
      Amber: window.NavAmber,
      Courier: window.NavCourier
    };
    Object.keys(refs).forEach(function (key) {
      if (refs[key]) window.NavApp[key] = refs[key];
    });
  }

  function finishStage2() {
    if (stage2Done) return;
    stage2Done = true;
    cancelIdleBoot();
    runStage2();
    if (typeof window.__BOOT_TIMING__ === "object" && window.__BOOT_TIMING__) {
      window.__BOOT_TIMING__.stage2At = Math.round(performance.now() * 100) / 100;
    }
    if (stage2Resolve) {
      stage2Resolve({ stage: 2, done: true });
      stage2Resolve = null;
    }
    window.dispatchEvent(new CustomEvent("mynav-stage2-ready"));
  }

  // 竞态防线：任何首屏外的按键 / 打开动作都可以先同步冲刷 Stage 2。
  function flushIdleBoot() {
    if (!stage2Done) finishStage2();
    return stage2Done;
  }

  // Stage 2 的 Promise 一经创建就是稳定引用：无论何时调用 whenReady()，
  // 拿到的永远是同一个 Promise，便于缓存与比对。
  function whenReady() {
    if (stage2Promise) return stage2Promise;
    if (stage2Done) {
      stage2Promise = Promise.resolve({ stage: 2, done: true });
      return stage2Promise;
    }
    stage2Promise = new Promise(function (resolve) {
      stage2Resolve = resolve;
    });
    return stage2Promise;
  }

  function init() {
    window.__BOOT_TIMING__ = {
      stage1Start: Math.round(performance.now() * 100) / 100,
      stage1End: null,
      stage2At: null
    };

    // ---------------------------------------------------------------- Stage 1
    // 首屏立即同步执行：这些模块决定 36 张卡片能否在第一帧画出来。
    if (window.NavTheme) window.NavTheme.init(dom.themeBtn);
    if (window.NavFavorites) window.NavFavorites.init();
    if (window.NavVisits) window.NavVisits.init();
    if (window.NavLedger && typeof window.NavLedger.initializeFirstSeenForSites === "function") {
      window.NavLedger.initializeFirstSeenForSites(getRawSites().map(function (site) {
        return site.id;
      }));
    }
    if (window.NavSanctum) {
      safeInit("NavSanctum", function () { window.NavSanctum.init(); });
    }
    if (window.NavConstellations) {
      safeInit("NavConstellations", function () { window.NavConstellations.init(); });
    }
    if (window.NavSortable) {
      window.NavSortable.init({
        isSearchActive: () => Boolean(state.searchQuery.trim()),
        onOrderChange: () => {
          renderContent();
        }
      });
    }

    // 刊头信息（首屏可见）
    if (dom.mastheadDate) dom.mastheadDate.textContent = formatEditorialDate();
    if (dom.mastheadCount) dom.mastheadCount.textContent = `全馆典藏 ${getRawSites().length} 卷`;

    // 视图状态与快捷键（快捷键是首屏交互，必须同步就位；
    // 其内部通过 flushIdleBoot 保证 Stage 2 未完成时零竞态）。
    updateArchiveViewSwitcher();
    if (window.NavShortcuts) {
      window.NavShortcuts.init({
        isArrangeMode: () => Boolean(window.NavSortable && window.NavSortable.isArrangeMode()),
        getAllSites: () => getRawSites(),
        beforeAction: flushIdleBoot,
        onSearchFocus: () => {
          if (dom.searchInput) {
            dom.searchInput.focus();
            dom.searchInput.select();
          }
        },
        onSearchBlur: () => {
          if (dom.searchInput) {
            if (dom.searchInput.value !== "") {
              dom.searchInput.value = "";
              state.searchQuery = "";
              dom.searchClearBtn.style.display = "none";
              renderContent();
            }
            dom.searchInput.blur();
          }
        },
        onViewToggle: () => {
          const next = toggleArchiveView();
          window.NavShortcuts.showToast(
            next === "star-map" ? "已切换至穹顶星图" : "已切换至书本目录",
            "按 v 在书本目录 ⟷ 穹顶星图之间往复",
            next === "star-map" ? "🌌" : "📖"
          );
        },
        onThemeToggle: () => {
          if (window.NavTheme) {
            const res = window.NavTheme.toggle();
            const mode = res ? res.mode : window.NavTheme.getMode();
            const modeNames = { light: "浅色象牙白纸张", dark: "深色桑皮炭黑纸张", auto: "自然时序自适应" };
            const modeIcons = { light: "☼", dark: "☾", auto: "◐" };
            window.NavShortcuts.showToast(
              `已切换为 ${modeNames[mode] || mode}`,
              "按 t 循环切换阅读氛围",
              modeIcons[mode] || "◐"
            );
          }
        },
        onCategorySwitch: (delta, directNumber) => {
          const tabButtons = Array.from(dom.tabsRail.querySelectorAll(".index-tab-item"));
          if (tabButtons.length === 0) return;

          let targetBtn = null;
          if (typeof directNumber === "number" && directNumber >= 1 && directNumber <= tabButtons.length) {
            targetBtn = tabButtons[directNumber - 1];
          } else if (typeof delta === "number") {
            const currentIdx = tabButtons.findIndex(b => b.classList.contains("active"));
            let newIdx = currentIdx + delta;
            if (newIdx < 0) newIdx = tabButtons.length - 1;
            if (newIdx >= tabButtons.length) newIdx = 0;
            targetBtn = tabButtons[newIdx];
          }

          if (targetBtn) {
            const targetCat = targetBtn.getAttribute("data-cat-target");
            if (targetCat) {
              switchCategory(targetCat, { focusTab: false });
              const catLabel = targetBtn.querySelector(".tab-label")?.textContent?.trim() || targetCat;
              window.NavShortcuts.showToast(`专栏：${catLabel}`, "按 Alt+1~7 或 h/l 导航", "📑");
            }
          }
        },
        onBookmarkToggle: (siteId) => {
          if (window.NavFavorites) {
            const isBookmarked = window.NavFavorites.toggle(siteId);
            updateBadges();
            renderContent();
            const allSites = getRawSites();
            const site = allSites.find(s => s.id === siteId);
            const siteName = site ? site.name : siteId;
            window.NavShortcuts.showToast(
              isBookmarked ? "⭐ 已收入私人典藏阁" : "已移出私人典藏阁",
              siteName,
              isBookmarked ? "⭐" : "✦"
            );
          }
        },
        onBookplateOpen: (siteId) => {
          const allSites = getRawSites();
          const targetSite = allSites.find(s => s.id === siteId);
          if (targetSite) {
            flushIdleBoot();
            withLazy("exlibris", function () {
              if (window.NavExLibris) window.NavExLibris.open(targetSite);
            });
          }
        }
      });
    }

    // 首屏渲染：36 张卡片在第一帧完成绘制。
    renderIndexTabs();
    renderContent();
    if (state.archiveView === "star-map" && !window.NavStarMap) {
      // 上次停在星图：先画书本目录，星图模块就绪后再切过去。
      withLazy("starmap", function () { if (state.archiveView === "star-map") renderContent(); });
    }
    bindEvents();
    updateOverridesNote();

    // 首屏一落定就装好竞态闸门：空闲回调之前到来的按键 / 点击会同步冲刷 Stage 2。
    installBootGate();

    if (window.__BOOT_TIMING__) {
      window.__BOOT_TIMING__.stage1End = Math.round(performance.now() * 100) / 100;
    }

    // 挂载全局刷新方法并监听修改层变化事件
    window.NavApp = {
      refresh() {
        if (dom.mastheadCount) dom.mastheadCount.textContent = `全馆典藏 ${getRawSites().length} 卷`;
        renderIndexTabs();
        renderContent();
        updateBadges();
        updateOverridesNote();
      },
      getAllSites: getRawSites,
      getState() {
        return {
          activeCategory: state.activeCategory,
          searchQuery: state.searchQuery,
          archiveView: state.archiveView
        };
      },
      updateBadges,
      getCategories: getRawCategories,
      renderContent,
      renderIndexTabs,
      openSite: openSite,
      openSearchResult: openSearchResult,
      openRandom: openRandom,
      getSearchMatches: getSearchMatches,
      getUncataloguedSites: getUncataloguedSites,
      getUncataloguedMatches: getUncataloguedMatches,
      getShadowSites: getShadowSites,
      getSiteById: getSiteById,
      setArchiveView: setArchiveView,
      toggleArchiveView: toggleArchiveView,
      openAlmanac: openAlmanac,
      hydrateMarginalia: hydrateMarginaliaPanel,
      openSubLink: openSubLink,
      switchCategory: switchCategory,
      resetSearch: resetSearch,
      recordSiteAccess: recordSiteAccess,
      // Phase 5：两段式启动的公开契约。
      whenReady: whenReady,
      flushIdleBoot: flushIdleBoot,
      isStage2Ready: function () { return stage2Done; }
    };
    syncModuleRefs();

    window.addEventListener("nav-overrides-changed", function () {
      if (window.NavApp && typeof window.NavApp.refresh === "function") {
        window.NavApp.refresh();
      }
    });
    window.addEventListener("mynav-ledger-changed", function () {
      if (state.activeCategory === "frequent") renderContent();
      if (!stage2Done) return; // 账本事件早于 Stage 2 时不必惊动尚未挂载的模块
      if (window.NavAlmanac && typeof window.NavAlmanac.refresh === "function") {
        window.NavAlmanac.refresh();
      }
      if (state.archiveView === "grid" && document.querySelector(".is-time-dimmed")) {
        window.NavAlmanac.applyWindow(window.NavAlmanac.getWindow());
      }
      if (window.NavStarMap && typeof window.NavStarMap.refresh === "function" && state.archiveView === "star-map") {
        window.NavStarMap.refresh();
      }
      updateBadges();
    });

    // ---------------------------------------------------------------- Stage 2
    scheduleIdleBoot(finishStage2);
  }

  // ==========================================================================
  // Stage 2 竞态闸门 (Boot race gate)
  // ==========================================================================
  //
  // 为什么必须用 window + 捕获阶段：
  //   brass-tools / snippets / uncatalogued / lore 等 Stage 2 模块
  //   各自在 init() 里向 document 冒泡阶段注册自己的 keydown 监听。若用户在
  //   空闲回调之前按 T / S / U / M / c，事件会先被 Stage 1 的监听处理，等到达
  //   document 时才轮到 —— 而那时模块还没绑定，按键就丢了。
  //   在 window 捕获阶段抢在所有人之前同步冲刷 Stage 2，按键便永不落空。
  const BOOT_GATE_KEYS = new Set([
    "?", "c", "C", "s", "S", "t", "T", "u", "U", "e", "E", "v", "V", "f", "F"
  ]);

  function isEditableTarget(target) {
    if (!target) return false;
    const tag = target.tagName ? target.tagName.toLowerCase() : "";
    return tag === "input" || tag === "textarea" || tag === "select" ||
      target.isContentEditable === true ||
      (typeof target.getAttribute === "function" && target.getAttribute("contenteditable") === "true");
  }

  function installBootGate() {
    window.addEventListener("keydown", function (event) {
      if (stage2Done) return;                 // 已就绪，零开销
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (!BOOT_GATE_KEYS.has(event.key)) return;
      flushIdleBoot();
    }, true);

    // 指针同样会打向 Stage 2 才绑定的入口（工具尺 / 秘卷 / 待编目匣 ...）。
    window.addEventListener("pointerdown", function () {
      if (!stage2Done) flushIdleBoot();
    }, true);
  }

  // 更新页脚未导出修改小提示
  function updateOverridesNote() {
    const noteEl = document.getElementById("footer-overrides-note");
    const countEl = document.getElementById("overrides-count-num");
    if (!noteEl) return;

    const count = window.NavOverrides && typeof window.NavOverrides.getModificationCount === "function"
      ? window.NavOverrides.getModificationCount()
      : 0;

    if (count > 0) {
      noteEl.style.display = "block";
      if (countEl) countEl.textContent = String(count);
    } else {
      noteEl.style.display = "none";
    }

    const noteBtn = document.getElementById("btn-note-export-data");
    if (noteBtn && !noteBtn.dataset.bound) {
      noteBtn.dataset.bound = "1";
      noteBtn.addEventListener("click", function () {
        if (window.NavOverrides && typeof window.NavOverrides.downloadDataJs === "function") {
          window.NavOverrides.downloadDataJs();
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
