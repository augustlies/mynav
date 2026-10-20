/**
 * Module: MYNAV_LEDGER_V2 local state center (js/ledger.js)
 * Owns access telemetry and the reserved 2.0 client state without splitting
 * dynamic data across small localStorage keys.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavLedger = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STORAGE_KEY = "MYNAV_LEDGER_V2";
  const LEGACY_VISITS_KEY = "mynav_arch_visits";
  const MAX_HISTORY_DAYS = 180;

  let ledger = null;

  function createDefaultLedger() {
    return {
      accessLog: {},
      marginalia: {},
      snippets: [],
      constellations: [],
      almanac: {},
      modeState: {
        shadowMoon: false,
        focusLock: false,
        ambientSound: false
      },
      dustResetAt: 0,
      migratedLegacyVisitsAt: 0,
      firstSeenAt: {}
    };
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function localDateKey(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function readRaw(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function writeRaw(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function normalizeHistory(history) {
    if (!Array.isArray(history)) return [];
    const counts = {};
    history.forEach(function (item) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const day = String(item.date || item.day || "");
        const count = Number.isFinite(item.count) ? Math.max(0, Math.floor(item.count)) : 0;
        if (/^\d{4}-\d{2}-\d{2}$/.test(day) && count > 0) {
          counts[day] = (counts[day] || 0) + count;
        }
        return;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(item))) {
        counts[item] = (counts[item] || 0) + 1;
      }
    });
    return Object.keys(counts)
      .sort()
      .slice(-MAX_HISTORY_DAYS)
      .map(function (day) { return { date: day, count: counts[day] }; });
  }

  function normalizeAlmanacDay(entry) {
    if (!isObject(entry)) return { count: 0, clicks: 0, aiCalls: 0, sites: [] };
    const clicks = Number.isFinite(entry.clicks) ? Math.max(0, Math.floor(entry.clicks)) : 0;
    const count = Number.isFinite(entry.count)
      ? Math.max(0, Math.floor(entry.count))
      : clicks;
    const sites = Array.isArray(entry.sites)
      ? entry.sites.map(function (siteId) { return String(siteId || "").trim(); }).filter(Boolean)
      : [];
    return {
      count: count,
      clicks: count,
      aiCalls: Number.isFinite(entry.aiCalls) ? Math.max(0, Math.floor(entry.aiCalls)) : 0,
      sites: Array.from(new Set(sites))
    };
  }

  function normalizeAlmanac(almanac) {
    const result = {};
    if (!isObject(almanac)) return result;
    Object.keys(almanac).forEach(function (day) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
      result[day] = normalizeAlmanacDay(almanac[day]);
    });
    return result;
  }

  function normalizeAccessEntry(entry) {
    if (!isObject(entry)) return null;
    const count = Number.isFinite(entry.count) ? Math.max(0, Math.floor(entry.count)) : 0;
    const lastVisited = Number.isFinite(entry.lastVisited)
      ? entry.lastVisited
      : (Number.isFinite(entry.lastVisit) ? entry.lastVisit : 0);
    let history = normalizeHistory(entry.history);
    if (history.length === 0 && lastVisited > 0) {
      history = [{ date: localDateKey(lastVisited), count: Math.max(1, count) }];
    }
    return {
      count: count,
      lastVisited: lastVisited,
      firstSeenAt: Number.isFinite(entry.firstSeenAt) ? entry.firstSeenAt : 0,
      history: history
    };
  }

  function normalizeLedger(raw) {
    const base = createDefaultLedger();
    if (!isObject(raw)) return base;

    base.snippets = Array.isArray(raw.snippets) ? raw.snippets.slice() : [];
    base.constellations = Array.isArray(raw.constellations) ? raw.constellations.slice() : [];
    base.marginalia = isObject(raw.marginalia) ? Object.assign({}, raw.marginalia) : {};
    base.firstSeenAt = isObject(raw.firstSeenAt) ? Object.assign({}, raw.firstSeenAt) : {};
    base.almanac = normalizeAlmanac(raw.almanac);
    base.dustResetAt = Number.isFinite(raw.dustResetAt) ? raw.dustResetAt : 0;
    base.migratedLegacyVisitsAt = Number.isFinite(raw.migratedLegacyVisitsAt)
      ? raw.migratedLegacyVisitsAt
      : 0;
    base.modeState = Object.assign({}, base.modeState, isObject(raw.modeState) ? raw.modeState : {});

    if (isObject(raw.accessLog)) {
      Object.keys(raw.accessLog).forEach(function (siteId) {
        const entry = normalizeAccessEntry(raw.accessLog[siteId]);
        if (entry) base.accessLog[siteId] = entry;
      });
    }

    return base;
  }

  function migrateLegacyVisits(target) {
    if (target.migratedLegacyVisitsAt) return false;
    const legacy = readRaw(LEGACY_VISITS_KEY);
    if (isObject(legacy)) {
      Object.keys(legacy).forEach(function (siteId) {
        if (target.accessLog[siteId]) return;
        const converted = normalizeAccessEntry(legacy[siteId]);
        if (!converted) return;
        target.accessLog[siteId] = converted;
      });
    }

    // Mark the one-time import even when the legacy key is absent so a clear
    // operation cannot resurrect stale visits on a later reload.
    target.migratedLegacyVisitsAt = Date.now();
    try {
      window.localStorage.removeItem(LEGACY_VISITS_KEY);
    } catch (error) {}
    return true;
  }

  function persist(notify) {
    if (typeof window === "undefined") return false;
    const saved = writeRaw(STORAGE_KEY, ledger);
    if (saved && notify !== false && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("mynav-ledger-changed", {
        detail: { ledger: ledger }
      }));
    }
    return saved;
  }

  function ensureLoaded() {
    if (ledger) return ledger;
    if (typeof window === "undefined") {
      ledger = createDefaultLedger();
      return ledger;
    }
    ledger = normalizeLedger(readRaw(STORAGE_KEY));
    if (migrateLegacyVisits(ledger)) persist(false);
    return ledger;
  }

  // Re-read from storage after a legacy backup restore or an external
  // storage mutation. The ledger is deliberately the only state owner.
  function reload() {
    ledger = normalizeLedger(readRaw(STORAGE_KEY));
    if (migrateLegacyVisits(ledger)) persist(false);
    persist(true);
    return getAll();
  }

  function getAccessEntry(siteId) {
    ensureLoaded();
    return ledger.accessLog[siteId] || null;
  }

  function getSortableStat(siteId) {
    const entry = getAccessEntry(siteId);
    if (!entry) return { count: 0, lastVisit: 0, lastVisited: 0, firstSeenAt: 0, history: [] };
    return {
      count: entry.count,
      lastVisit: entry.lastVisited,
      lastVisited: entry.lastVisited,
      firstSeenAt: entry.firstSeenAt || 0,
      history: entry.history.slice()
    };
  }

  function getWindowCount(entry, withinDays) {
    if (!entry || !Array.isArray(entry.history)) return 0;
    const days = Math.max(0, Number(withinDays) || 0);
    if (!days) return Math.max(0, Number(entry.count) || 0);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - (days - 1));
    return entry.history.reduce(function (sum, item) {
      return sum + (item.date >= localDateKey(start) ? Math.max(0, Number(item.count) || 0) : 0);
    }, 0);
  }

  // Dust is measured in local calendar days, not elapsed 24-hour blocks.
  // This keeps "60 natural days" stable across DST and clock-time edges.
  function naturalDayAge(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return Infinity;
    const anchor = new Date(timestamp);
    const now = new Date();
    const anchorDay = Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    const nowDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((nowDay - anchorDay) / (24 * 60 * 60 * 1000));
  }

  function getRankedSites(allSites, options) {
    if (!Array.isArray(allSites)) return [];
    const config = Object.assign({ limit: 6, withinDays: 0 }, options || {});
    const withinDays = Math.max(0, Number(config.withinDays) || 0);
    return allSites
      .map(function (site) {
        const stat = getSortableStat(site.id);
        const entry = getAccessEntry(site.id);
        return {
          site: site,
          stat: stat,
          recentCount: getWindowCount(entry, withinDays)
        };
      })
      .filter(function (item) {
        return item.recentCount > 0;
      })
      .sort(function (a, b) {
        if (b.recentCount !== a.recentCount) return b.recentCount - a.recentCount;
        return b.stat.lastVisited - a.stat.lastVisited;
      })
      .slice(0, config.limit)
      .map(function (item) { return item.site; });
  }

  function recordAccess(siteId) {
    if (!siteId) return false;
    ensureLoaded();
    const now = Date.now();
    const day = localDateKey(now);
    const current = ledger.accessLog[siteId] || {
      count: 0,
      lastVisited: 0,
      firstSeenAt: now,
      history: []
    };
    if (!current.firstSeenAt) current.firstSeenAt = now;
    current.count += 1;
    current.lastVisited = now;
    if (!Array.isArray(current.history)) current.history = [];
    current.history = normalizeHistory(current.history);
    const dayEntry = current.history.find(function (item) { return item.date === day; });
    if (dayEntry) dayEntry.count += 1;
    else current.history.push({ date: day, count: 1 });
    current.history = current.history.slice(-MAX_HISTORY_DAYS);
    ledger.accessLog[siteId] = current;

    const almanacDay = normalizeAlmanacDay(ledger.almanac[day]);
    const nextCount = Math.max(almanacDay.count, almanacDay.clicks) + 1;
    almanacDay.count = nextCount;
    almanacDay.clicks = nextCount;
    if (!almanacDay.sites.includes(siteId)) almanacDay.sites.push(siteId);
    ledger.almanac[day] = almanacDay;

    return persist(true);
  }

  function isDusty(siteId, days) {
    ensureLoaded();
    const entry = getAccessEntry(siteId);
    const firstSeenAt = Number(getFirstSeenAt(siteId)) || 0;
    const lastVisited = entry ? (Number(entry.lastVisited) || 0) : 0;
    const anchor = lastVisited || firstSeenAt;
    if (!anchor) return false;
    const cutoffDays = Math.max(0, Number(days) || 60);
    if (ledger.dustResetAt && anchor < ledger.dustResetAt) return false;
    return naturalDayAge(anchor) > cutoffDays;
  }

  function getFirstSeenAt(siteId) {
    ensureLoaded();
    if (!siteId) return 0;
    const entry = ledger.accessLog[siteId];
    if (entry && entry.firstSeenAt) return entry.firstSeenAt;
    return Number(ledger.firstSeenAt[siteId]) || 0;
  }

  function initializeFirstSeenForSites(siteIds) {
    ensureLoaded();
    if (!Array.isArray(siteIds)) return {};
    let changed = false;
    const now = Date.now();
    siteIds.forEach(function (siteId) {
      if (!siteId) return;
      const entry = ledger.accessLog[siteId];
      if ((entry && entry.firstSeenAt) || ledger.firstSeenAt[siteId]) return;
      ledger.firstSeenAt[siteId] = now;
      if (entry) entry.firstSeenAt = now;
      changed = true;
    });
    if (changed) persist(false);
    return Object.assign({}, ledger.firstSeenAt);
  }

  /**
   * Initialize a stable first-seen timestamp exactly once per site.
   * This is intentionally separate from recordAccess: merely rendering the
   * archive must not create a visit count, but dust detection still needs an
   * age anchor for never-visited cards.
   */
  function ensureFirstSeen(siteId, timestamp) {
    ensureLoaded();
    if (!siteId) return 0;
    const current = ledger.accessLog[siteId];
    if (current && current.firstSeenAt) return current.firstSeenAt;
    if (ledger.firstSeenAt[siteId]) return ledger.firstSeenAt[siteId];
    const seenAt = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
    // Timestamps supplied by migrations/tests may intentionally be older than
    // 60 days; an implicit "now" is used only when no timestamp is provided.
    ledger.firstSeenAt[siteId] = seenAt;
    if (current) current.firstSeenAt = seenAt;
    persist(false);
    return seenAt;
  }

  function getMarginalia(siteId) {
    ensureLoaded();
    return typeof ledger.marginalia[siteId] === "string" ? ledger.marginalia[siteId] : "";
  }

  function setMarginalia(siteId, notes) {
    ensureLoaded();
    if (!siteId) return false;
    const clean = typeof notes === "string" ? notes.trim() : "";
    if (clean) ledger.marginalia[siteId] = clean;
    else delete ledger.marginalia[siteId];
    return persist(true);
  }

  function getSnippets() {
    ensureLoaded();
    return Array.isArray(ledger.snippets) ? ledger.snippets.slice() : [];
  }

  function setSnippets(snippets) {
    ensureLoaded();
    ledger.snippets = Array.isArray(snippets) ? snippets.slice() : [];
    return persist(true);
  }

  function getConstellations() {
    ensureLoaded();
    return Array.isArray(ledger.constellations) ? ledger.constellations.slice() : [];
  }

  function setConstellations(constellations) {
    ensureLoaded();
    ledger.constellations = Array.isArray(constellations) ? constellations.slice() : [];
    return persist(true);
  }

  function clearDust() {
    ensureLoaded();
    ledger.dustResetAt = Date.now();
    persist(true);
  }

  function simulateDust(siteId, daysAgo) {
    if (!siteId) return false;
    ensureLoaded();
    const ageDays = Math.max(1, Number(daysAgo) || 61);
    const anchor = new Date();
    anchor.setHours(12, 0, 0, 0);
    anchor.setDate(anchor.getDate() - ageDays);
    const timestamp = anchor.getTime();
    const current = ledger.accessLog[siteId] || { count: 1, lastVisited: timestamp, history: [] };
    current.count = Math.max(1, current.count || 1);
    current.lastVisited = timestamp;
    current.firstSeenAt = current.firstSeenAt || timestamp;
    current.history = [{ date: localDateKey(timestamp), count: current.count }];
    ledger.accessLog[siteId] = current;
    ledger.dustResetAt = 0;
    persist(true);
    return true;
  }

  function clearAccessLog() {
    ensureLoaded();
    ledger.accessLog = {};
    ledger.almanac = {};
    ledger.dustResetAt = Date.now();
    persist(true);
  }

  /**
   * Replace the almanac with a deterministic test history. The access log is
   * rebuilt at the same time so the D4 window filter and the C6 heat radius
   * both see the injected visits. This helper is intentionally test-only.
   */
  function seedAlmanacHistory(entries) {
    ensureLoaded();
    const nextAlmanac = {};
    const nextAccessLog = {};
    const days = (Array.isArray(entries) ? entries : [])
      .filter(function (entry) {
        return entry && /^\d{4}-\d{2}-\d{2}$/.test(String(entry.date || ""));
      })
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });

    days.forEach(function (entry) {
      const day = String(entry.date);
      const count = Math.max(0, Math.floor(Number(entry.count) || 0));
      const sites = Array.from(new Set(
        (Array.isArray(entry.sites) ? entry.sites : [])
          .map(function (siteId) { return String(siteId || "").trim(); })
          .filter(Boolean)
      ));
      nextAlmanac[day] = {
        count: count,
        clicks: count,
        aiCalls: 0,
        sites: sites
      };
      if (count <= 0) return;
      const timestamp = new Date(day + "T12:00:00").getTime();
      sites.forEach(function (siteId, siteIndex) {
        const current = nextAccessLog[siteId] || {
          count: 0,
          lastVisited: 0,
          firstSeenAt: timestamp,
          history: []
        };
        const siteCount = Math.max(1, Math.floor(count / Math.max(1, sites.length)) +
          (siteIndex === 0 ? count % Math.max(1, sites.length) : 0));
        current.count += siteCount;
        current.lastVisited = Math.max(current.lastVisited, timestamp);
        current.firstSeenAt = Math.min(current.firstSeenAt || timestamp, timestamp);
        current.history.push({ date: day, count: siteCount });
        nextAccessLog[siteId] = current;
      });
    });

    Object.keys(nextAccessLog).forEach(function (siteId) {
      nextAccessLog[siteId].history = normalizeHistory(nextAccessLog[siteId].history);
    });
    ledger.almanac = nextAlmanac;
    ledger.accessLog = nextAccessLog;
    ledger.dustResetAt = 0;
    persist(true);
    return getAll();
  }

  function getModeState() {
    ensureLoaded();
    return Object.assign({}, ledger.modeState);
  }

  function setModeState(patch) {
    ensureLoaded();
    ledger.modeState = Object.assign({}, ledger.modeState, isObject(patch) ? patch : {});
    persist(true);
    return getModeState();
  }

  function getAll() {
    ensureLoaded();
    return JSON.parse(JSON.stringify(ledger));
  }

  function importData(raw) {
    // An imported v2 ledger already owns the migrated access log. Preserve
    // the one-time marker so an old legacy key cannot overwrite it later.
    ledger = normalizeLedger(raw);
    ledger.migratedLegacyVisitsAt = ledger.migratedLegacyVisitsAt || Date.now();
    migrateLegacyVisits(ledger);
    persist(true);
    return getAll();
  }

  // Migrate on load so all existing modules see the v2 ledger immediately.
  ensureLoaded();

  return {
    STORAGE_KEY,
    ensureLoaded,
    reload,
    getAccessLog() {
      ensureLoaded();
      return ledger.accessLog;
    },
    getStat: getSortableStat,
    getFirstSeenAt,
    ensureFirstSeen,
    initializeFirstSeenForSites,
    recordAccess,
    getTopSites(allSites, limit) {
      return getRankedSites(allSites, { limit: Number(limit) || 6, withinDays: 0 });
    },
    getRecentTopSites(allSites, limit, withinDays) {
      return getRankedSites(allSites, {
        limit: Number(limit) || 6,
        // An explicit 0 means all-time instead of silently falling back to 7.
        withinDays: withinDays === undefined ? 7 : Math.max(0, Number(withinDays) || 0)
      });
    },
    isDusty,
    getMarginalia,
    setMarginalia,
    getSnippets,
    setSnippets,
    getConstellations,
    setConstellations,
    clearDust,
    simulateDust,
    clearAccessLog,
    getAlmanac() {
      ensureLoaded();
      return JSON.parse(JSON.stringify(ledger.almanac));
    },
    seedAlmanacHistory,
    count() {
      ensureLoaded();
      return Object.keys(ledger.accessLog).filter(function (id) {
        return (ledger.accessLog[id].count || 0) > 0;
      }).length;
    },
    getModeState,
    setModeState,
    getAll,
    importData,
    localDateKey,
    LEGACY_VISITS_KEY
  };
});
