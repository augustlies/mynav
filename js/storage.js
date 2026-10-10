/**
 * 模块：统一本地持久化存储 (js/storage.js)
 * 职责：
 * 1. 封装 localStorage 操作，具备隐私无痕模式防崩机制
 * 2. 统一序列化处理与数据损坏自愈恢复 (Corrupted data auto-repair)
 * 3. 支持数据架构版本迁移管理 (Schema versioning & migration)
 * 4. 提供纯前端备份导出与恢复导入管道 (Backup & Restore)
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
  const SCHEMA_VERSION = 1;

  const KEYS = {
    VERSION: PREFIX + "version",
    THEME: PREFIX + "theme",
    VIEW: PREFIX + "view",
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

  // 数据损坏校验与自动修复迁移逻辑
  function migrate() {
    if (!storageAvailable) return;
    try {
      const currentVer = NavStorageImpl.get(KEYS.VERSION, 0);

      // 1. 校验与自愈恢复：典藏书签 (FAVORITES 必须是字符串数组)
      const rawFavs = NavStorageImpl.get(KEYS.FAVORITES);
      if (rawFavs !== null && !Array.isArray(rawFavs)) {
        console.warn("[NavStorage] 检测到非法的书签结构，执行自愈重置");
        NavStorageImpl.set(KEYS.FAVORITES, []);
      }

      // 2. 校验与自愈恢复：访问统计 (VISITS 必须是对象)
      const rawVisits = NavStorageImpl.get(KEYS.VISITS);
      if (rawVisits !== null && (typeof rawVisits !== "object" || Array.isArray(rawVisits))) {
        console.warn("[NavStorage] 检测到非法的访问记录结构，执行自愈重置");
        NavStorageImpl.set(KEYS.VISITS, {});
      }

      // 3. 校验与自愈恢复：排序字典 (ORDER 必须是对象)
      const rawOrder = NavStorageImpl.get(KEYS.ORDER);
      if (rawOrder !== null && (typeof rawOrder !== "object" || Array.isArray(rawOrder))) {
        console.warn("[NavStorage] 检测到非法的排序结构，执行自愈重置");
        NavStorageImpl.set(KEYS.ORDER, {});
      }

      // 4. 更新至当前最新版本号
      if (currentVer !== SCHEMA_VERSION) {
        NavStorageImpl.set(KEYS.VERSION, SCHEMA_VERSION);
      }
    } catch (err) {
      console.error("[NavStorage] 存储数据自愈迁移异常:", err);
    }
  }

  const NavStorageImpl = {
    KEYS,
    SCHEMA_VERSION,

    get(key, defaultValue = null) {
      if (!storageAvailable) return defaultValue;
      try {
        const item = window.localStorage.getItem(key);
        if (item === null) return defaultValue;
        return JSON.parse(item);
      } catch (e) {
        console.warn(`[NavStorage] 解析键 ${key} 失败，返回预设默认值:`, e);
        return defaultValue;
      }
    },

    set(key, value) {
      if (!storageAvailable) return false;
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn(`[NavStorage] 写入键 ${key} 失败:`, e);
        return false;
      }
    },

    remove(key) {
      if (!storageAvailable) return false;
      try {
        window.localStorage.removeItem(key);
        return true;
      } catch (e) {
        console.warn(`[NavStorage] 清理键 ${key} 失败:`, e);
        return false;
      }
    },

    // 导出全量本地数据备份为标准 JSON 结构
    exportBackup() {
      return {
        version: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        data: {
          theme: this.get(KEYS.THEME, "light"),
          favorites: this.get(KEYS.FAVORITES, []),
          visits: this.get(KEYS.VISITS, {}),
          order: this.get(KEYS.ORDER, {})
        }
      };
    },

    // 导入外部备份，执行格式健全性验证
    importBackup(backup) {
      if (!backup || typeof backup !== "object" || !backup.data) {
        return { success: false, message: "备份数据格式无效" };
      }
      try {
        const d = backup.data;
        if (d.theme) this.set(KEYS.THEME, d.theme);
        if (Array.isArray(d.favorites)) this.set(KEYS.FAVORITES, d.favorites);
        if (d.visits && typeof d.visits === "object") this.set(KEYS.VISITS, d.visits);
        if (d.order && typeof d.order === "object") this.set(KEYS.ORDER, d.order);
        this.set(KEYS.VERSION, SCHEMA_VERSION);
        return { success: true, message: "数据恢复成功" };
      } catch (e) {
        return { success: false, message: "数据恢复异常: " + e.message };
      }
    },

    migrate
  };

  // 模块载入时自动执行数据自愈与版本升级检测
  migrate();

  return NavStorageImpl;
});
