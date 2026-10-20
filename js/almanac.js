/**
 * Module: D4 almanac chronicle.
 *
 * The almanac owns the lunar 28-day matrix and the time-window filter. It
 * never writes the ledger directly; recordAccess remains the only writer of
 * MYNAV_LEDGER_V2.almanac. The module only renders and applies CSS state to
 * the cards owned by app.js.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavAlmanac = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAYS = 28;
  const WINDOWS = {
    all: { id: "all", days: 0, label: "全部纪元" },
    "7d": { id: "7d", days: 7, label: "近 7 日活跃" },
    "30d": { id: "30d", days: 30, label: "近 30 日轨迹" },
    old: { id: "old", days: 60, label: "尘封往昔" }
  };
  const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const MOON_PHASES = {
    zero: { key: "暗星", symbol: "·", level: 0 },
    crescent: { key: "蛾眉月", symbol: "🌒", level: 1 },
    quarter: { key: "上弦月", symbol: "🌓", level: 2 },
    full: { key: "望月", symbol: "🌕", level: 3 }
  };

  let activeWindow = "all";
  let hoveredDate = "";
  let selectedDate = "";
  let bound = false;
  let host = null;
  let lastRenderKey = "";

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function localDateKey(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function parseLocalDay(day) {
    const date = new Date(day + "T12:00:00");
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function shiftDay(date, amount) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + amount);
    return next;
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getLedger() {
    return window.NavLedger && typeof window.NavLedger.getAll === "function"
      ? window.NavLedger.getAll()
      : {};
  }

  function getSites() {
    return window.NavApp && typeof window.NavApp.getAllSites === "function"
      ? window.NavApp.getAllSites()
      : (window.NavOverrides && typeof window.NavOverrides.getSites === "function"
        ? window.NavOverrides.getSites()
        : (window.NAV_DATA && Array.isArray(window.NAV_DATA.sites) ? window.NAV_DATA.sites : []));
  }

  function getSiteName(siteId) {
    const sites = getSites();
    const site = sites.find(function (item) { return item.id === siteId; });
    return site ? (site.name || site.title || siteId) : siteId;
  }

  function getCategoryName(siteId) {
    const sites = getSites();
    const site = sites.find(function (item) { return item.id === siteId; });
    if (!site) return "ARCHIVE";
    const categories = window.NavApp && typeof window.NavApp.getCategories === "function"
      ? window.NavApp.getCategories()
      : [];
    const category = categories.find(function (item) { return item.id === site.category; });
    return category ? category.name : (site.category || "ARCHIVE");
  }

  function getPhase(count) {
    if (!count) return MOON_PHASES.zero;
    if (count <= 2) return MOON_PHASES.crescent;
    if (count <= 5) return MOON_PHASES.quarter;
    return MOON_PHASES.full;
  }

  function getAlmanacEntry(day) {
    const almanac = getLedger().almanac || {};
    const entry = almanac[day];
    if (!entry || typeof entry !== "object") return { count: 0, sites: [] };
    const count = Number.isFinite(entry.count)
      ? Math.max(0, Math.floor(entry.count))
      : Math.max(0, Number(entry.clicks) || 0);
    return {
      count: count,
      sites: Array.isArray(entry.sites) ? entry.sites.slice() : []
    };
  }

  function buildDays() {
    const today = new Date();
    const days = [];
    for (let offset = DAYS - 1; offset >= 0; offset -= 1) {
      const date = shiftDay(today, -offset);
      const day = localDateKey(date);
      const entry = getAlmanacEntry(day);
      days.push({
        day: day,
        date: date,
        count: entry.count,
        sites: entry.sites,
        phase: getPhase(entry.count),
        weekday: WEEKDAYS[date.getDay()],
        month: MONTHS[date.getMonth()],
        dayOfMonth: pad(date.getDate())
      });
    }
    return days;
  }

  function getActivityStats() {
    const days = buildDays();
    const total = days.reduce(function (sum, item) { return sum + item.count; }, 0);
    const active = days.filter(function (item) { return item.count > 0; }).length;
    const uniqueSites = new Set();
    days.forEach(function (item) {
      item.sites.forEach(function (siteId) { uniqueSites.add(siteId); });
    });
    return { total: total, active: active, days: days, uniqueSites: uniqueSites.size };
  }

  function moonSvg(phase, count) {
    if (phase.level === 3) {
      return [
        '<svg class="almanac-moon-svg almanac-moon-svg--full" viewBox="0 0 40 40" aria-hidden="true">',
        '<circle class="moon-halo" cx="20" cy="20" r="15.5"></circle>',
        '<circle class="moon-disc" cx="20" cy="20" r="10.5"></circle>',
        '<path class="moon-ray" d="M20 2.5v4M20 33.5v4M2.5 20h4M33.5 20h4M7.6 7.6l2.8 2.8M29.6 29.6l2.8 2.8M32.4 7.6l-2.8 2.8M10.4 29.6l-2.8 2.8"></path>',
        '<circle class="moon-tick" cx="20" cy="5" r="0.9"></circle>',
        '<circle class="moon-tick" cx="35" cy="20" r="0.9"></circle>',
        '<circle class="moon-tick" cx="20" cy="35" r="0.9"></circle>',
        '<circle class="moon-tick" cx="5" cy="20" r="0.9"></circle>',
        '</svg>'
      ].join("");
    }
    if (phase.level === 2) {
      return [
        '<svg class="almanac-moon-svg almanac-moon-svg--quarter" viewBox="0 0 40 40" aria-hidden="true">',
        '<circle class="moon-orbit" cx="20" cy="20" r="13"></circle>',
        '<path class="moon-half" d="M20 7a13 13 0 0 1 0 26z"></path>',
        '<path class="moon-rim" d="M20 7a13 13 0 0 0 0 26a6.5 13 0 0 1 0-26z"></path>',
        '<circle class="moon-tick" cx="20" cy="4.8" r="0.8"></circle>',
        '</svg>'
      ].join("");
    }
    if (phase.level === 1) {
      const width = count <= 1 ? 4.5 : 6;
      return [
        '<svg class="almanac-moon-svg almanac-moon-svg--crescent" viewBox="0 0 40 40" aria-hidden="true">',
        '<circle class="moon-orbit" cx="20" cy="20" r="13"></circle>',
        '<path class="moon-crescent" d="M14.5 8.1a13 13 0 1 0 0 23.8a10 10 0 1 1 0-23.8z" style="--crescent-width:' + width + 'px"></path>',
        '<circle class="moon-tick" cx="20" cy="4.8" r="0.8"></circle>',
        '</svg>'
      ].join("");
    }
    return [
      '<svg class="almanac-moon-svg almanac-moon-svg--dark" viewBox="0 0 40 40" aria-hidden="true">',
      '<circle class="moon-dark-dot" cx="20" cy="20" r="1.3"></circle>',
      '<path class="moon-dark-cross" d="M20 14v3M20 23v3M14 20h3M23 20h3"></path>',
      '</svg>'
    ].join("");
  }

  function renderDayButton(day) {
    const current = day.day === localDateKey(new Date());
    const selected = day.day === selectedDate;
    return [
      '<button type="button" class="almanac-day almanac-day--level-', day.phase.level, current ? ' is-today' : '', selected ? ' is-selected' : '',
      '" data-almanac-day="', day.day, '" data-almanac-count="', day.count, '" aria-label="',
      day.day, ' · 调阅 ', day.count, ' 卷" title="', day.day, ' · ', day.phase.key, ' · ', day.count, ' 卷">',
      '<span class="almanac-day-label">', day.month, " ", day.dayOfMonth, '</span>',
      moonSvg(day.phase, day.count),
      '<span class="almanac-day-week">周', day.weekday, '</span>',
      '<span class="almanac-day-count">', day.count || "·", '</span>',
      '</button>'
    ].join("");
  }

  function getFocusDay(days) {
    if (selectedDate && days.some(function (item) { return item.day === selectedDate; })) {
      return days.find(function (item) { return item.day === selectedDate; });
    }
    if (hoveredDate && days.some(function (item) { return item.day === hoveredDate; })) {
      return days.find(function (item) { return item.day === hoveredDate; });
    }
    return days[days.length - 1];
  }

  function renderNote(day) {
    const sites = day.sites.map(getSiteName).slice(0, 5);
    const siteNames = sites.length ? sites.join(", ") : "尚无调阅轨迹";
    return [
      '<span class="almanac-note-kicker">DAILY MARGINALIA</span>',
      '<p class="almanac-note-text">',
      '<strong>', day.day.replace(/-/g, "."), '</strong>',
      ' · 调阅 <strong>', day.count, ' 卷</strong>',
      ' · 核心轨迹：<em>', escapeHtml(siteNames), '</em>',
      '</p>',
      '<span class="almanac-note-meta">', day.phase.symbol, " ", day.phase.key, ' · 周', day.weekday, '</span>'
    ].join("");
  }

  function renderPanel() {
    const stats = getActivityStats();
    const days = stats.days;
    const focusDay = getFocusDay(days);
    const grid = days.map(renderDayButton).join("");
    const windowOptions = Object.keys(WINDOWS).map(function (key) {
      const item = WINDOWS[key];
      return [
        '<button type="button" class="almanac-window-btn', activeWindow === key ? ' is-active' : '',
        '" data-almanac-window="', key, '" aria-pressed="', activeWindow === key ? 'true' : 'false', '">',
        key === "all" ? "✦ 全部纪元" : (key === "7d" ? "🌒 近 7 日" : (key === "30d" ? "🌓 近 30 日" : "⌛ 尘封往昔")),
        '</button>'
      ].join("");
    }).join("");

    return [
      '<div class="almanac-chronicle-frame">',
      '<header class="almanac-chronicle-header">',
      '<div class="almanac-heading">',
      '<span class="almanac-kicker">D4 · LUNAR ANNALS · 28 DAYS</span>',
      '<h2 id="almanac-title" class="almanac-title">星轨编年史</h2>',
      '<p class="almanac-subtitle">以月相盈亏铭刻每日调阅轨迹。悬停或选定一日，回看当天的知识星群。</p>',
      '</div>',
      '<div class="almanac-stats" aria-label="编年统计">',
      '<div><strong>', stats.total, '</strong><span>28 日调阅</span></div>',
      '<div><strong>', stats.active, '</strong><span>活跃日</span></div>',
      '<div><strong>', stats.uniqueSites, '</strong><span>涉猎卷宗</span></div>',
      '</div>',
      '</header>',
      '<div class="almanac-chronicle-body">',
      '<div class="almanac-grid-wrap">',
      '<div class="almanac-grid-head"><span>月相星历 · LUNAR EPHEMERIS</span><span>调阅次数 / DAY</span></div>',
      '<div class="almanac-lunar-grid" role="grid" aria-label="最近 28 天月相调阅热力图">', grid, '</div>',
      '</div>',
      '<aside class="almanac-side-panel">',
      '<div class="almanac-window-block"><span class="almanac-block-label">时光回溯 · TIME LAPSE</span><div class="almanac-window-list">', windowOptions, '</div></div>',
      '<div class="almanac-note" data-almanac-note>', renderNote(focusDay), '</div>',
      '<div class="almanac-legend"><span class="almanac-legend-item"><i class="legend-dot legend-dot--0"></i>未访</span><span class="almanac-legend-item">🌒 1–2</span><span class="almanac-legend-item">🌓 3–5</span><span class="almanac-legend-item">🌕 6+</span></div>',
      '</aside>',
      '</div>',
      '</div>'
    ].join("");
  }

  function updateNote(day) {
    const note = host && host.querySelector("[data-almanac-note]");
    if (!note) return;
    note.innerHTML = renderNote(day);
  }

  function render(force) {
    host = document.getElementById("almanac-chronicle");
    if (!host) return;
    const key = JSON.stringify({
      window: activeWindow,
      selected: selectedDate,
      almanac: getLedger().almanac || {},
      today: localDateKey(new Date())
    });
    if (!force && key === lastRenderKey) {
      applyWindow(activeWindow, { renderCards: false });
      return;
    }
    lastRenderKey = key;
    host.classList.add("is-built");
    host.querySelector(".almanac-chronicle-slot").innerHTML = renderPanel();
    host.hidden = false;
    applyWindow(activeWindow, { renderCards: false });
  }

  function daysAgo(day) {
    const date = parseLocalDay(day);
    if (!date) return Infinity;
    const today = new Date();
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.floor((now.getTime() - date.getTime()) / 86400000);
  }

  function isWithinWindow(day, windowId) {
    const config = WINDOWS[windowId] || WINDOWS.all;
    if (config.days === 0) return true;
    const age = daysAgo(day);
    return age >= 0 && age < config.days;
  }

  function getSiteActivity(siteId, windowId) {
    const config = WINDOWS[windowId] || WINDOWS.all;
    const almanac = getLedger().almanac || {};
    let count = 0;
    let latest = "";
    Object.keys(almanac).forEach(function (day) {
      const entry = almanac[day];
      const sites = Array.isArray(entry && entry.sites) ? entry.sites : [];
      if (sites.indexOf(siteId) === -1) return;
      if (config.days > 0 && !isWithinWindow(day, windowId)) return;
      count += Math.max(1, Number(entry.count) || 1);
      if (!latest || day > latest) latest = day;
    });
    const stat = getLedger().accessLog && getLedger().accessLog[siteId];
    const lastVisited = stat && Number.isFinite(stat.lastVisited) ? stat.lastVisited : 0;
    const age = lastVisited ? Math.floor((Date.now() - lastVisited) / 86400000) : Infinity;
    return { count: count, latest: latest, age: age };
  }

  function isDimmedByWindow(site, windowId) {
    const config = WINDOWS[windowId] || WINDOWS.all;
    if (config.id === "all") return false;
    const activity = getSiteActivity(site.id, windowId);
    if (windowId === "old") {
      return Boolean(activity.age !== Infinity && activity.age <= 60 && activity.count > 0);
    }
    return activity.count === 0;
  }

  function applyWindow(windowId, options) {
    activeWindow = WINDOWS[windowId] ? windowId : "all";
    document.documentElement.setAttribute("data-almanac-window", activeWindow);
    const sites = getSites();
    document.querySelectorAll("#archive-content-area [data-site-id]").forEach(function (node) {
      const siteId = node.getAttribute("data-site-id");
      const site = sites.find(function (item) { return item.id === siteId; }) || { id: siteId };
      node.classList.toggle("is-time-dimmed", isDimmedByWindow(site, activeWindow));
    });
    document.querySelectorAll("[data-almanac-window]").forEach(function (button) {
      const active = button.getAttribute("data-almanac-window") === activeWindow;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    if (window.NavStarMap && typeof window.NavStarMap.applyTimeWindow === "function") {
      window.NavStarMap.applyTimeWindow(activeWindow);
    }
    if (!options || options.renderCards !== false) {
      // Cards are owned by app.js. This method only applies the visual state
      // so callers never need to re-render the ledger to change a filter.
    }
  }

  function setWindow(windowId) {
    activeWindow = WINDOWS[windowId] ? windowId : "all";
    syncWindowButtons();
    render(true);
    if (window.NavStarMap && typeof window.NavStarMap.refresh === "function") {
      window.NavStarMap.refresh();
    }
    return activeWindow;
  }

  function syncWindowButtons() {
    document.querySelectorAll("[data-almanac-window]").forEach(function (button) {
      const active = button.getAttribute("data-almanac-window") === activeWindow;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function selectDay(day) {
    selectedDate = day;
    hoveredDate = "";
    render(true);
    const cards = document.querySelectorAll("#archive-content-area [data-site-id]");
    cards.forEach(function (card) {
      card.classList.remove("almanac-day-highlight");
    });
    const entry = getAlmanacEntry(day);
    entry.sites.forEach(function (siteId) {
      cards.forEach(function (card) {
        if (card.getAttribute("data-site-id") === siteId) {
          card.classList.add("almanac-day-highlight");
        }
      });
    });
    return entry;
  }

  function seedMockHistory(options) {
    const config = options && typeof options === "object" ? options : {};
    const siteIds = (Array.isArray(config.siteIds) && config.siteIds.length
      ? config.siteIds
      : getSites().map(function (site) { return site.id; })
    ).filter(Boolean);
    if (!siteIds.length) return false;
    const entries = [];
    const today = new Date();
    for (let age = 27; age >= 0; age -= 1) {
      const date = shiftDay(today, -age);
      const day = localDateKey(date);
      // Keep the default fixture deterministic across the 28-day matrix.
      const schedule = {
        0: 7,
        2: 2,
        5: 5,
        9: 1,
        16: 3,
        24: 4
      };
      const count = schedule[age] || 0;
      const sites = count > 0
        ? siteIds.slice(0, Math.min(siteIds.length, Math.max(1, count > 5 ? 4 : count)))
        : [];
      entries.push({ date: day, count: count, sites: sites });
    }
    if (window.NavLedger && typeof window.NavLedger.seedAlmanacHistory === "function") {
      window.NavLedger.seedAlmanacHistory(entries);
      if (config.render !== false) render(true);
      return entries;
    }
    return false;
  }

  function scrollIntoView() {
    const panel = document.getElementById("almanac-chronicle");
    if (!panel) return false;
    panel.hidden = false;
    panel.scrollIntoView({
      behavior: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start"
    });
    return true;
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener("click", function (event) {
      const dayButton = event.target.closest("[data-almanac-day]");
      if (dayButton) {
        selectDay(dayButton.getAttribute("data-almanac-day"));
        return;
      }
      const windowButton = event.target.closest("[data-almanac-window]");
      if (windowButton) {
        setWindow(windowButton.getAttribute("data-almanac-window"));
      }
    });
    document.addEventListener("pointerover", function (event) {
      const dayButton = event.target.closest("[data-almanac-day]");
      if (!dayButton) return;
      hoveredDate = dayButton.getAttribute("data-almanac-day");
      const day = buildDays().find(function (item) { return item.day === hoveredDate; });
      if (day) updateNote(day);
    });
    document.addEventListener("pointerout", function (event) {
      const dayButton = event.target.closest("[data-almanac-day]");
      if (!dayButton) return;
      hoveredDate = "";
      const day = buildDays().find(function (item) {
        return item.day === (selectedDate || localDateKey(new Date()));
      });
      if (day) updateNote(day);
    });
  }

  function init() {
    host = document.getElementById("almanac-chronicle");
    if (!host) return;
    bind();
    render(true);
  }

  return {
    init,
    render,
    refresh: function () { render(true); },
    setWindow,
    getWindow: function () { return activeWindow; },
    selectDay,
    getDays: buildDays,
    getStats: getActivityStats,
    getPhase,
    seedMockHistory,
    isDimmedByWindow,
    applyWindow,
    scrollIntoView,
    WINDOWS,
    DAYS
  };
});
