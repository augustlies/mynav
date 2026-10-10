/**
 * 模块：用户书签与典藏管理 (js/favorites.js)
 * 管理收藏状态，基于全局稳定 ID 绑定与持久化
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./storage.js"));
  } else {
    root.NavFavorites = factory(root.NavStorage);
  }
})(typeof self !== "undefined" ? self : this, function (NavStorage) {
  "use strict";

  let favoriteIds = new Set();
  const listeners = [];

  function load() {
    if (!NavStorage) return;
    const raw = NavStorage.get(NavStorage.KEYS.FAVORITES, []);
    if (Array.isArray(raw)) {
      favoriteIds = new Set(raw);
    }
  }

  function save() {
    if (!NavStorage) return;
    NavStorage.set(NavStorage.KEYS.FAVORITES, Array.from(favoriteIds));
  }

  function notify(siteId, isFav) {
    listeners.forEach((fn) => {
      try {
        fn(siteId, isFav, favoriteIds.size);
      } catch (e) {
        console.error("[NavFavorites] 监听回调异常:", e);
      }
    });
  }

  return {
    init() {
      load();
    },

    has(siteId) {
      if (!siteId) return false;
      return favoriteIds.has(siteId);
    },

    toggle(siteId) {
      if (!siteId) return false;
      let isFav = false;
      if (favoriteIds.has(siteId)) {
        favoriteIds.delete(siteId);
        isFav = false;
      } else {
        favoriteIds.add(siteId);
        isFav = true;
      }
      save();
      notify(siteId, isFav);
      return isFav;
    },

    getAll() {
      return Array.from(favoriteIds);
    },

    count() {
      return favoriteIds.size;
    },

    onChange(listener) {
      if (typeof listener === "function") {
        listeners.push(listener);
      }
    }
  };
});
