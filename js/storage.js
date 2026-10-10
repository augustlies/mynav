/**
 * 模块：统一本地持久化存储 (js/storage.js)
 * 封装 localStorage 操作，具备隐私模式防崩与统一序列化处理
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavStorage = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PREFIX = "mynav_arch_";

  const KEYS = {
    THEME: PREFIX + "theme",
    FAVORITES: PREFIX + "favorites",
    VISITS: PREFIX + "visits",
    ORDER: PREFIX + "order"
  };

  function isAvailable() {
    try {
      const testKey = "__storage_test__";
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  const storageAvailable = typeof window !== "undefined" && isAvailable();

  return {
    KEYS,

    get(key, defaultValue = null) {
      if (!storageAvailable) return defaultValue;
      try {
        const item = window.localStorage.getItem(key);
        if (item === null) return defaultValue;
        return JSON.parse(item);
      } catch (e) {
        console.warn(`[NavStorage] 读取 ${key} 失败:`, e);
        return defaultValue;
      }
    },

    set(key, value) {
      if (!storageAvailable) return false;
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn(`[NavStorage] 写入 ${key} 失败:`, e);
        return false;
      }
    },

    remove(key) {
      if (!storageAvailable) return false;
      try {
        window.localStorage.removeItem(key);
        return true;
      } catch (e) {
        console.warn(`[NavStorage] 清理 ${key} 失败:`, e);
        return false;
      }
    }
  };
});
