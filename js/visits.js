/**
 * 模块：常用案头访问统计 (js/visits.js)
 * 仅记录当前浏览器点击行为，按访问频次与最近时间排序，无侵入、可重置
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./storage.js"));
  } else {
    root.NavVisits = factory(root.NavStorage);
  }
})(typeof self !== "undefined" ? self : this, function (NavStorage) {
  "use strict";

  let stats = {}; // { [siteId]: { count: number, lastVisit: number } }

  function load() {
    if (!NavStorage) return;
    const raw = NavStorage.get(NavStorage.KEYS.VISITS, {});
    if (raw && typeof raw === "object") {
      stats = raw;
    }
  }

  function save() {
    if (!NavStorage) return;
    NavStorage.set(NavStorage.KEYS.VISITS, stats);
  }

  return {
    init() {
      load();
    },

    record(siteId) {
      if (!siteId) return;
      const now = Date.now();
      if (!stats[siteId]) {
        stats[siteId] = { count: 1, lastVisit: now };
      } else {
        stats[siteId].count = (stats[siteId].count || 0) + 1;
        stats[siteId].lastVisit = now;
      }
      save();
    },

    getTopSites(allSites, limit = 6) {
      if (!Array.isArray(allSites)) return [];

      const visited = allSites.filter((site) => {
        const item = stats[site.id];
        return item && item.count > 0;
      });

      visited.sort((a, b) => {
        const statA = stats[a.id] || { count: 0, lastVisit: 0 };
        const statB = stats[b.id] || { count: 0, lastVisit: 0 };
        if (statB.count !== statA.count) {
          return statB.count - statA.count;
        }
        return statB.lastVisit - statA.lastVisit;
      });

      return visited.slice(0, limit);
    },

    clear() {
      stats = {};
      save();
    },

    count() {
      return Object.keys(stats).filter((id) => (stats[id]?.count || 0) > 0).length;
    },

    getStat(siteId) {
      return stats[siteId] || { count: 0, lastVisit: 0 };
    }
  };
});
