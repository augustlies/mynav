/**
 * Module: Notion 卡片覆盖层 (js/notion-cards.js)
 *
 * 数据流：Notion 数据库 → functions/api/cards.js → KV/HTTP → 本机 localStorage
 * 浏览器绝不直接请求 Notion。
 *
 * 渲染规则：
 * 1. 首屏同步读取 localStorage 上一版，叠加到 data.js 后再交给 overrides/app。
 * 2. 页面 load 后空闲才请求 /api/cards，不阻塞首屏。
 * 3. Notion 是卡片底稿；站内 overrides 按字段覆盖；个人拖拽排序最后应用。
 * 4. 接口失败、空数据、坏行都保留上一版，不影响网站使用。
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavNotionCards = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CACHE_KEY = "mynav_cards_cache_v1";
  const API_URL = "/api/cards";
  const DEFAULT_TIMEOUT_MS = 8000;

  const state = {
    version: "",
    updatedAt: 0,
    count: 0,
    appliedCount: 0,
    skipped: 0,
    status: "idle",
    lastError: "",
    lastCheck: 0,
    inFlight: false,
    source: "data.js"
  };

  function getData() {
    if (typeof window !== "undefined") return window.NAV_DATA || null;
    return null;
  }

  function categoryIds() {
    const data = getData();
    if (!data || !Array.isArray(data.categories)) return [];
    return data.categories.map(function (cat) { return cat.id; });
  }

  function cloneSite(site) {
    const copy = Object.assign({}, site);
    copy.tags = Array.isArray(site.tags) ? site.tags.slice() : [];
    if (Array.isArray(site.subLinks)) {
      copy.subLinks = site.subLinks.map(function (link) {
        return Object.assign({}, link);
      });
    }
    return copy;
  }

  function getBaseSites() {
    if (typeof window === "undefined") return [];
    if (!Array.isArray(window.__NAV_BASE_SITES__)) {
      const data = getData();
      window.__NAV_BASE_SITES__ = data && Array.isArray(data.sites) ? data.sites.map(cloneSite) : [];
    }
    return window.__NAV_BASE_SITES__;
  }

  function cleanText(value, maxLength) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, maxLength);
  }

  function normalizeSite(raw, allowedCategories) {
    if (!raw || typeof raw !== "object") return null;
    const id = cleanText(raw.id, 80);
    if (!/^[a-z0-9][a-z0-9._:-]{0,79}$/i.test(id)) return null;

    const name = cleanText(raw.name, 120);
    if (!name) return null;

    const url = cleanText(raw.url, 2048);
    if (!/^https?:\/\/[^\s]+$/i.test(url)) return null;

    const category = cleanText(raw.category, 40).toLowerCase();
    if (allowedCategories.length && allowedCategories.indexOf(category) === -1) return null;

    const tags = Array.isArray(raw.tags)
      ? raw.tags.map(function (tag) { return cleanText(tag, 30); }).filter(Boolean).slice(0, 20)
      : [];

    const sort = Number(raw.sort);
    const normalized = {
      id: id,
      name: name,
      url: url,
      description: cleanText(raw.description, 1200),
      category: category,
      icon: cleanText(raw.icon, 8),
      tags: tags,
      sort: Number.isFinite(sort) ? sort : 0,
      hidden: raw.hidden === true
    };
    const whySaved = cleanText(raw.whySaved, 1200);
    if (whySaved) normalized.whySaved = whySaved;
    const notes = cleanText(raw.notes, 2000);
    if (notes) normalized.notes = notes;
    const favicon = cleanText(raw.favicon, 2048);
    if (/^https?:\/\/[^\s"'<>]+$/i.test(favicon)) normalized.favicon = favicon;
    if (Array.isArray(raw.subLinks)) {
      const subLinks = raw.subLinks
        .filter(function (item) {
          return item && typeof item === "object" &&
            typeof item.url === "string" && /^https?:\/\/[^\s"'<>]+$/i.test(item.url.trim());
        })
        .slice(0, 4)
        .map(function (item) {
          return {
            label: cleanText(item.label || "子路由", 60) || "子路由",
            url: item.url.trim().slice(0, 2048)
          };
        });
      if (subLinks.length > 0) normalized.subLinks = subLinks;
    }
    return normalized;
  }

  function normalizePayload(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.sites)) return null;
    if (raw.sites.length > 1000) return null;

    const categories = Array.isArray(raw.categories)
      ? raw.categories
          .filter(function (item) {
            return item && typeof item.id === "string" &&
              /^[a-z0-9_-]{1,40}$/i.test(item.id) && typeof item.name === "string" && item.name.trim();
          })
          .map(function (item) {
            return {
              id: cleanText(item.id, 40).toLowerCase(),
              name: cleanText(item.name, 120),
              desc: cleanText(item.desc, 1200),
              code: cleanText(item.code, 20)
            };
          })
      : [];
    const allowed = categories.length ? categories.map(function (item) { return item.id; }) : categoryIds();
    const sites = [];
    const seen = new Set();
    let skipped = 0;

    raw.sites.forEach(function (item) {
      const site = normalizeSite(item, allowed);
      if (!site) {
        skipped += 1;
        return;
      }
      if (seen.has(site.id)) {
        skipped += 1;
        return;
      }
      seen.add(site.id);
      sites.push(site);
    });

    if (!sites.length && raw.sites.length) return null;

    const version = cleanText(raw.version, 80) || "v1-local";
    const updatedAt = Number(raw.updatedAt);
    return {
      version: version,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
      count: sites.length,
      skipped: skipped,
      categories: categories,
      sites: sites
    };
  }

  function readCache() {
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return normalizePayload(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  function writeCache(payload) {
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      return false;
    }
  }

  // 把 Notion 行叠加到 data.js 底稿；overrides 之后仍按字段覆盖，个人排序最后应用。
  function applyPayload(payload) {
    const normalized = normalizePayload(payload);
    const data = getData();
    if (!normalized || !data || !Array.isArray(data.sites)) return false;

    data.categories = normalized.categories.length
      ? normalized.categories.map(function (category) { return Object.assign({}, category); })
      : data.categories;
    const merged = normalized.sites.map(function (site) {
      const copy = cloneSite(site);
      copy._notionSort = site.sort;
      copy.source = "notion";
      return copy;
    });
    const categoryOrder = new Map(data.categories.map(function (category, index) { return [category.id, index]; }));
    merged.sort(function (a, b) {
      const ca = categoryOrder.has(a.category) ? categoryOrder.get(a.category) : 999;
      const cb = categoryOrder.has(b.category) ? categoryOrder.get(b.category) : 999;
      if (ca !== cb) return ca - cb;
      return a._notionSort - b._notionSort;
    });
    data.sites = merged;
    state.version = normalized.version;
    state.updatedAt = normalized.updatedAt;
    state.count = normalized.count;
    state.appliedCount = merged.length;
    state.skipped = normalized.skipped;
    state.status = "applied";
    state.lastError = "";
    state.source = "notion-cache";
    if (typeof window !== "undefined") {
      window.NAV_CARD_OVERLAY = {
        version: state.version,
        updatedAt: state.updatedAt,
        count: state.count
      };
    }
    return true;
  }

  function notifyRefresh() {
    if (typeof window === "undefined") return;
    try {
      window.dispatchEvent(new CustomEvent("notion-cards-updated", {
        detail: { version: state.version, count: state.count }
      }));
    } catch (e) {}
    if (window.NavApp && typeof window.NavApp.refresh === "function") {
      window.NavApp.refresh();
    }
  }

  async function fetchPayload() {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, DEFAULT_TIMEOUT_MS) : 0;
    try {
      const url = API_URL + (state.version ? "?v=" + encodeURIComponent(state.version) : "");
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const payload = await response.json();
      if (payload && payload.unchanged === true) return { unchanged: true };
      return { payload: payload };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function refresh() {
    if (typeof window === "undefined" || typeof fetch !== "function") return false;
    if (window.navigator && window.navigator.onLine === false) {
      state.status = "offline";
      return false;
    }
    if (state.inFlight) return false;
    state.inFlight = true;
    state.status = "fetching";
    mark("fetching");
    state.lastCheck = Date.now();
    try {
      const result = await fetchPayload();
      if (result.unchanged) {
        state.status = "current";
        mark("current");
        return false;
      }
      const payload = normalizePayload(result.payload);
      if (!payload) {
        state.status = "invalid";
        state.lastError = "payload invalid";
        mark("invalid");
        return false;
      }
      if (payload.version === state.version) {
        state.status = "current";
        mark("current");
        return false;
      }
      if (!applyPayload(payload)) {
        state.status = "invalid";
        mark("invalid");
        return false;
      }
      writeCache(payload);
      notifyRefresh();
      state.status = "updated";
      mark("updated");
      return true;
    } catch (e) {
      state.status = "error";
      state.lastError = e && e.name === "AbortError" ? "timeout" : String((e && e.message) || e);
      mark("error");
      return false;
    } finally {
      state.inFlight = false;
    }
  }

  function mark(value) {
    try {
      if (document && document.documentElement) {
        document.documentElement.setAttribute("data-notion-cards", value);
      }
    } catch (e) {}
  }

  function scheduleRefresh() {
    if (typeof window === "undefined") return;
    mark("scheduled");
    const run = function () { refresh(); };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 2500 });
    } else {
      setTimeout(run, 1500);
    }
  }

  function refreshIfStale(minAgeMs) {
    if (Date.now() - state.lastCheck < minAgeMs) return;
    scheduleRefresh();
  }

  function boot() {
    mark("booted");
    const cached = readCache();
    if (cached) {
      applyPayload(cached);
      state.source = "local-cache";
    } else {
      state.status = "base";
    }
    if (typeof window !== "undefined" && window.addEventListener) {
      if (document.readyState === "complete") scheduleRefresh();
      else window.addEventListener("load", scheduleRefresh, { once: true });
      window.addEventListener("online", scheduleRefresh);
      window.addEventListener("focus", function () { refreshIfStale(60000); });
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") refreshIfStale(60000);
      });
      // 已打开的页面每两分钟检查版本；unchanged 时只传几十字节，不拉全量。
      setInterval(function () {
        if (document.visibilityState !== "hidden") refreshIfStale(120000);
      }, 120000);
    }
  }

  if (typeof window !== "undefined" && window.document) boot();

  return {
    state: state,
    refresh: refresh,
    applyPayload: applyPayload,
    normalizePayload: normalizePayload,
    readCache: readCache,
    writeCache: writeCache,
    CACHE_KEY: CACHE_KEY,
    API_URL: API_URL
  };
});
