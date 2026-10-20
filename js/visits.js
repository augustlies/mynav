/**
 * Compatibility facade for the existing visit API.
 * All telemetry now lives in MYNAV_LEDGER_V2 (js/ledger.js), while callers
 * such as bookshelf.js, contextmenu.js and shortcuts.js keep their old
 * interface and therefore do not double-write separate storage keys.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./ledger.js"));
  } else {
    root.NavVisits = factory(root.NavLedger);
  }
})(typeof self !== "undefined" ? self : this, function (NavLedger) {
  "use strict";

  function fallbackGetStat() {
    return { count: 0, lastVisit: 0, lastVisited: 0, history: [] };
  }

  return {
    init() {
      if (NavLedger) NavLedger.ensureLoaded();
    },

    record(siteId) {
      return NavLedger ? NavLedger.recordAccess(siteId) : false;
    },

    getTopSites(allSites, limit = 6) {
      return NavLedger ? NavLedger.getTopSites(allSites, limit) : [];
    },

    getRecentTopSites(allSites, limit = 6, withinDays = 7) {
      return NavLedger ? NavLedger.getRecentTopSites(allSites, limit, withinDays) : [];
    },

    isDusty(siteId, days = 60) {
      return NavLedger ? NavLedger.isDusty(siteId, days) : false;
    },

    clear() {
      if (NavLedger) NavLedger.clearAccessLog();
    },

    count() {
      return NavLedger ? NavLedger.count() : 0;
    },

    getStat(siteId) {
      return NavLedger ? NavLedger.getStat(siteId) : fallbackGetStat();
    }
  };
});
