/**
 * 模块：用户修改层与持久化数据合并引擎 (js/overrides.js)
 * 职责：
 * 1. 在 localStorage (nav_site_overrides) 中记录用户对站点的修改：
 *    - modified: 按 id 记录字段修改 (name / url / description / tags / icon / category)
 *    - added: 新增卡片列表
 *    - hidden: 隐藏的 id 列表
 *    - deleted: 删除的 id 列表
 *    - unhidden: 取消隐藏的 id 列表
 * 2. 运行时合并 NAV_DATA 默认数据与修改层，保持 data.js 不在运行时被直接修改
 * 3. 导出格式合规的 data.js 文件（含 hidden: true 识别，符合原生两空格缩进与分类编排）
 * 4. 导出与导入完整 JSON 备份（含修改层、收藏偏好、主题与搜索引擎配置）
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavOverrides = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STORAGE_KEY = "nav_site_overrides";

  function getStorage() {
    if (typeof window !== "undefined" && window.NavStorage) {
      return window.NavStorage;
    }
    // 降级兜底
    return {
      get: (k, def) => {
        try {
          const v = localStorage.getItem(k);
          return v ? JSON.parse(v) : def;
        } catch (e) {
          return def;
        }
      },
      set: (k, v) => {
        try {
          localStorage.setItem(k, JSON.stringify(v));
          return true;
        } catch (e) {
          return false;
        }
      },
      remove: (k) => {
        try {
          localStorage.removeItem(k);
          return true;
        } catch (e) {
          return false;
        }
      }
    };
  }

  // 初始空覆写结构
  function createEmptyOverrides() {
    return {
      modified: {},
      added: [],
      hidden: [],
      deleted: [],
      unhidden: []
    };
  }

  // 读取已保存的覆写数据
  function loadOverrides() {
    const st = getStorage();
    const raw = st.get(STORAGE_KEY, null);
    if (!raw || typeof raw !== "object") {
      return createEmptyOverrides();
    }
    return {
      modified: raw.modified && typeof raw.modified === "object" ? raw.modified : {},
      added: Array.isArray(raw.added) ? raw.added : [],
      hidden: Array.isArray(raw.hidden) ? raw.hidden : [],
      deleted: Array.isArray(raw.deleted) ? raw.deleted : [],
      unhidden: Array.isArray(raw.unhidden) ? raw.unhidden : []
    };
  }

  // 保存覆写数据并派发更新事件
  function saveOverrides(data) {
    const st = getStorage();
    st.set(STORAGE_KEY, data);
    notifyChange();
  }

  function notifyChange() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("nav-overrides-changed", { detail: { count: getModificationCount() } }));
      if (window.NavApp && typeof window.NavApp.refresh === "function") {
        window.NavApp.refresh();
      }
    }
  }

  // 获取默认站点数据
  function getDefaultSites() {
    if (typeof window !== "undefined" && window.NAV_DATA && Array.isArray(window.NAV_DATA.sites)) {
      return window.NAV_DATA.sites;
    }
    return [];
  }

  // 获取默认分类数据
  function getCategories() {
    if (typeof window !== "undefined" && window.NAV_DATA && Array.isArray(window.NAV_DATA.categories)) {
      return window.NAV_DATA.categories;
    }
    return [
      { id: "ai", name: "AI 思考与生成", desc: "前沿大语言模型、深度推理与多模态创作工坊", code: "AI" },
      { id: "dev", name: "开发与代码工坊", desc: "开源托管、Web 标准规范与现代工程基础设施", code: "DEV" },
      { id: "knowledge", name: "知识与研习", desc: "深度技术专栏、独立思考媒体与系统化学习资源", code: "LIB" },
      { id: "tools", name: "案头效率工具", desc: "知识沉淀库、架构图解与高频轻量实用工具", code: "EFF" }
    ];
  }

  // 计算本地修改总项数（用于页脚温馨提示）
  function getModificationCount() {
    const o = loadOverrides();
    const modCount = Object.keys(o.modified).length;
    const addCount = o.added.length;
    const delCount = o.deleted.length;
    const hideCount = o.hidden.length;
    const unhideCount = (o.unhidden || []).length;
    return modCount + addCount + delCount + hideCount + unhideCount;
  }

  // 检查某张卡片是否有修改（用于上下文菜单判断是否展示“恢复默认”）
  function hasModifications(id) {
    if (!id) return false;
    const o = loadOverrides();
    if (o.modified && o.modified[id]) return true;
    if (o.hidden && o.hidden.includes(id)) return true;
    if (o.unhidden && o.unhidden.includes(id)) return true;
    if (o.added && o.added.some(s => s.id === id)) return true;
    return false;
  }

  // 合并默认站点与本地修改
  // includeHidden 为 true 时返回全部站点（并带有 .hidden: true 标识），为 false 时仅返回当前活跃可见站点
  function getAllMergedSites(includeHidden = false) {
    const defaults = getDefaultSites();
    const o = loadOverrides();
    const deletedSet = new Set(o.deleted);
    const hiddenSet = new Set(o.hidden);
    const unhiddenSet = new Set(o.unhidden || []);

    const merged = [];

    // 1. 处理默认站点
    defaults.forEach(def => {
      if (deletedSet.has(def.id)) {
        return; // 已被用户删除
      }

      // 深拷贝基础数据，避免意外污染原始 NAV_DATA
      const site = {
        ...def,
        tags: Array.isArray(def.tags) ? [...def.tags] : []
      };

      // 合并字段级修改
      if (o.modified && o.modified[def.id]) {
        Object.assign(site, o.modified[def.id]);
        if (o.modified[def.id].tags) {
          site.tags = Array.isArray(o.modified[def.id].tags) ? [...o.modified[def.id].tags] : [];
        }
      }

      // 计算隐藏状态：data.js 自身配置 hidden: true 或用户本地指定隐藏
      let isHidden = Boolean(def.hidden);
      if (unhiddenSet.has(def.id)) {
        isHidden = false;
      } else if (hiddenSet.has(def.id)) {
        isHidden = true;
      }

      site.hidden = isHidden;

      if (includeHidden || !isHidden) {
        merged.push(site);
      }
    });

    // 2. 处理用户新增卡片（按分类归纳）
    (o.added || []).forEach(add => {
      if (deletedSet.has(add.id)) {
        return;
      }

      const site = {
        ...add,
        tags: Array.isArray(add.tags) ? [...add.tags] : []
      };

      if (o.modified && o.modified[add.id]) {
        Object.assign(site, o.modified[add.id]);
        if (o.modified[add.id].tags) {
          site.tags = Array.isArray(o.modified[add.id].tags) ? [...o.modified[add.id].tags] : [];
        }
      }

      let isHidden = Boolean(add.hidden);
      if (unhiddenSet.has(add.id)) {
        isHidden = false;
      } else if (hiddenSet.has(add.id)) {
        isHidden = true;
      }

      site.hidden = isHidden;

      if (includeHidden || !isHidden) {
        merged.push(site);
      }
    });

    // 3. 保证按分类顺序规整排列（与 data.js 类别结构对齐）
    const categories = getCategories();
    const catOrderMap = new Map();
    categories.forEach((c, idx) => catOrderMap.set(c.id, idx));

    merged.sort((a, b) => {
      const orderA = catOrderMap.has(a.category) ? catOrderMap.get(a.category) : 999;
      const orderB = catOrderMap.has(b.category) ? catOrderMap.get(b.category) : 999;
      return orderA - orderB;
    });

    return merged;
  }

  // 供 app.js 统一使用的有效渲染站点列表（非隐藏、非删除）
  function getSites() {
    return getAllMergedSites(false);
  }

  // 获取所有已被隐藏的站点列表
  function getHiddenSites() {
    return getAllMergedSites(true).filter(s => s.hidden === true);
  }

  // 根据 ID 获取单个站点数据
  function getSiteById(id) {
    const all = getAllMergedSites(true);
    return all.find(s => s.id === id) || null;
  }

  // 更新卡片字段
  function updateSite(id, patch) {
    if (!id || typeof patch !== "object") return false;
    const o = loadOverrides();

    // 检查是否是新增卡片
    const addedIndex = o.added.findIndex(s => s.id === id);
    if (addedIndex !== -1) {
      o.added[addedIndex] = { ...o.added[addedIndex], ...patch };
      if (patch.tags) {
        o.added[addedIndex].tags = Array.isArray(patch.tags) ? patch.tags : [];
      }
    } else {
      if (!o.modified[id]) {
        o.modified[id] = {};
      }
      Object.assign(o.modified[id], patch);
      if (patch.tags) {
        o.modified[id].tags = Array.isArray(patch.tags) ? patch.tags : [];
      }
    }

    saveOverrides(o);
    return true;
  }

  // 移动卡片至新分类
  function moveCategory(id, newCategory) {
    return updateSite(id, { category: newCategory });
  }

  // 新增一张卡片
  function addSite(siteData) {
    if (!siteData || !siteData.name || !siteData.url) {
      throw new Error("卡片名称与网址不能为空");
    }

    const o = loadOverrides();
    // 自动生成不重复的唯一 ID
    const baseSlug = siteData.id
      ? siteData.id.toLowerCase().replace(/[^a-z0-9_-]/g, "")
      : (siteData.category || "custom") + "-" + Date.now().toString(36);
    
    let uniqueId = baseSlug;
    let counter = 1;
    const existingSites = getAllMergedSites(true);
    while (existingSites.some(s => s.id === uniqueId) || o.added.some(s => s.id === uniqueId)) {
      uniqueId = `${baseSlug}-${counter++}`;
    }

    const newSite = {
      id: uniqueId,
      name: siteData.name.trim(),
      url: siteData.url.trim(),
      description: (siteData.description || "").trim(),
      category: siteData.category || "ai",
      tags: Array.isArray(siteData.tags)
        ? siteData.tags.map(t => String(t).trim()).filter(Boolean)
        : [],
      icon: (siteData.icon || siteData.name.slice(0, 2)).trim().toUpperCase()
    };

    o.added.push(newSite);
    saveOverrides(o);
    return newSite;
  }

  // 隐藏卡片
  function hideSite(id) {
    if (!id) return false;
    const o = loadOverrides();
    if (!o.hidden.includes(id)) {
      o.hidden.push(id);
    }
    // 如果之前在 unhidden 里，移除
    o.unhidden = (o.unhidden || []).filter(item => item !== id);
    saveOverrides(o);
    return true;
  }

  // 取消隐藏卡片
  function unhideSite(id) {
    if (!id) return false;
    const o = loadOverrides();
    o.hidden = o.hidden.filter(item => item !== id);
    if (!o.unhidden) o.unhidden = [];
    if (!o.unhidden.includes(id)) {
      o.unhidden.push(id);
    }
    saveOverrides(o);
    return true;
  }

  // 批量取消全部隐藏
  function unhideAll() {
    const o = loadOverrides();
    o.hidden = [];
    const defaults = getDefaultSites();
    defaults.forEach(d => {
      if (d.hidden && (!o.unhidden || !o.unhidden.includes(d.id))) {
        if (!o.unhidden) o.unhidden = [];
        o.unhidden.push(d.id);
      }
    });
    saveOverrides(o);
    return true;
  }

  // 删除卡片
  function deleteSite(id) {
    if (!id) return false;
    const o = loadOverrides();

    // 如果是新增卡片，直接从 added 移除
    o.added = o.added.filter(s => s.id !== id);

    // 如果是默认卡片，加入 deleted 列表
    const isDefault = getDefaultSites().some(s => s.id === id);
    if (isDefault && !o.deleted.includes(id)) {
      o.deleted.push(id);
    }

    // 清理可能遗留的该 ID 属性
    delete o.modified[id];
    o.hidden = o.hidden.filter(item => item !== id);
    o.unhidden = (o.unhidden || []).filter(item => item !== id);

    // 如果处于收藏夹，一并清理
    if (typeof window !== "undefined" && window.NavFavorites && typeof window.NavFavorites.remove === "function") {
      window.NavFavorites.remove(id);
    }

    saveOverrides(o);
    return true;
  }

  // 恢复单张卡片默认状态
  function resetSite(id) {
    if (!id) return false;
    const o = loadOverrides();

    // 如果是新增卡片，恢复默认即删除该新增卡片
    o.added = o.added.filter(s => s.id !== id);

    // 清理修改记录与隐藏状态
    delete o.modified[id];
    o.hidden = o.hidden.filter(item => item !== id);
    o.unhidden = (o.unhidden || []).filter(item => item !== id);
    o.deleted = o.deleted.filter(item => item !== id);

    saveOverrides(o);
    return true;
  }

  // 重置全部本地修改
  function resetAll() {
    const st = getStorage();
    st.remove(STORAGE_KEY);
    notifyChange();
    return true;
  }

  // ==========================================================================
  // 导出与导入引擎 (Export & Import)
  // ==========================================================================

  // 生成格式完全符合现有工程规约的 data.js 文件文本
  function exportDataJsString() {
    const categories = getCategories();
    const allSites = getAllMergedSites(true); // 包含 hidden 站点，但排除了已被删除的站点

    let js = `/**\n`;
    js += ` * 个人数字收藏馆 · 网站与分类数据源 (data.js)\n`;
    js += ` * \n`;
    js += ` * 🏛 架构原则：\n`;
    js += ` * 1. 内容与展示彻底分离：页面结构不硬编码任何具体网站或分类。\n`;
    js += ` * 2. 稳定标识：每个分类与网站使用全局唯一且稳定的 id，收藏与点击统计基于此 ID 绑定。\n`;
    js += ` * 3. 极简维护：新增网站直接在 sites 数组追加；新增分类直接在 categories 追加。\n`;
    js += ` */\n\n`;

    js += `const NAV_DATA = {\n`;
    js += `  // 藏馆分类定义列表\n`;
    js += `  categories: [\n`;

    categories.forEach((cat, idx) => {
      const isLast = idx === categories.length - 1;
      js += `    {\n`;
      js += `      id: ${JSON.stringify(cat.id)},\n`;
      js += `      name: ${JSON.stringify(cat.name)},\n`;
      js += `      desc: ${JSON.stringify(cat.desc || "")},\n`;
      js += `      code: ${JSON.stringify(cat.code || cat.name.slice(0, 3).toUpperCase())}\n`;
      js += `    }${isLast ? "" : ","}\n`;
    });

    js += `  ],\n\n`;
    js += `  // 馆藏网站条目列表 (共 ${allSites.length} 卷)\n`;
    js += `  sites: [\n`;

    categories.forEach((cat, catIdx) => {
      const catSites = allSites.filter(s => s.category === cat.id);
      js += `    // --- ${catIdx + 1}. ${cat.name} (${catSites.length} 卷) ---\n`;

      catSites.forEach((site, siteIdx) => {
        const isGlobalLast = (catIdx === categories.length - 1) && (siteIdx === catSites.length - 1);
        js += `    {\n`;
        js += `      id: ${JSON.stringify(site.id)},\n`;
        js += `      name: ${JSON.stringify(site.name)},\n`;
        js += `      url: ${JSON.stringify(site.url)},\n`;
        js += `      description: ${JSON.stringify(site.description || "")},\n`;
        js += `      category: ${JSON.stringify(site.category)},\n`;
        js += `      tags: ${JSON.stringify(Array.isArray(site.tags) ? site.tags : [])},\n`;
        js += `      icon: ${JSON.stringify(site.icon || site.name.slice(0, 2))}`;

        if (site.hidden) {
          js += `,\n      hidden: true`;
        }

        js += `\n    }${isGlobalLast ? "" : ","}\n`;
      });

      if (catIdx < categories.length - 1) {
        js += `\n`;
      }
    });

    js += `  ]\n`;
    js += `};\n\n`;

    js += `// 挂载到全局，供静态网页无构建直接运行\n`;
    js += `if (typeof window !== "undefined") {\n`;
    js += `  window.NAV_DATA = NAV_DATA;\n`;
    js += `}\n\n`;

    js += `// 供 Node.js 验证脚本与测试用例直接引用\n`;
    js += `if (typeof module !== "undefined" && module.exports) {\n`;
    js += `  module.exports = NAV_DATA;\n`;
    js += `}\n`;

    return js;
  }

  // 触发浏览器下载文本为文件
  function downloadBlob(content, filename, mimeType = "application/javascript") {
    if (typeof document === "undefined") return;
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // 导出 data.js
  function downloadDataJs() {
    const content = exportDataJsString();
    downloadBlob(content, "data.js", "application/javascript");
  }

  // 导出全量备份 JSON 对象
  function exportBackupObject() {
    const st = getStorage();
    const now = new Date();
    const dateStr = now.toISOString();

    const backup = {
      app: "mynav",
      version: 1,
      exportedAt: dateStr,
      overrides: loadOverrides(),
      favorites: st.get("mynav_arch_favorites", []),
      visits: st.get("mynav_arch_visits", {}),
      preferences: {
        theme: st.get("mynav_arch_theme", "light"),
        themeMode: st.get("mynav_theme_mode", "auto"),
        searchEngine: st.get("mynav_search_engine_v2", st.get("mynav_search_engine", "google")),
        viewMode: st.get("mynav_arch_view", "grid")
      }
    };

    return backup;
  }

  // 导出备份文件下载 (nav-backup-YYYY-MM-DD.json)
  function downloadBackupJson() {
    const backupObj = exportBackupObject();
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const filename = `nav-backup-${yyyy}-${mm}-${dd}.json`;
    const jsonStr = JSON.stringify(backupObj, null, 2);
    downloadBlob(jsonStr, filename, "application/json");
  }

  // 导入备份 JSON
  function importBackupJson(jsonString) {
    if (!jsonString || typeof jsonString !== "string") {
      return { success: false, message: "传入的备份文本为空" };
    }

    let backup;
    try {
      backup = JSON.parse(jsonString);
    } catch (e) {
      return { success: false, message: "JSON 格式解析失败：" + e.message };
    }

    if (!backup || typeof backup !== "object") {
      return { success: false, message: "备份数据结构无效" };
    }

    // 校验必要字段：必须包含 overrides、favorites 或 preferences 之一
    if (!backup.overrides && !backup.favorites && !backup.preferences && !backup.data) {
      return { success: false, message: "备份文件缺少必要的书目修改或用户配置字段" };
    }

    const st = getStorage();

    try {
      // 1. 恢复覆写层
      if (backup.overrides && typeof backup.overrides === "object") {
        st.set(STORAGE_KEY, {
          modified: backup.overrides.modified || {},
          added: Array.isArray(backup.overrides.added) ? backup.overrides.added : [],
          hidden: Array.isArray(backup.overrides.hidden) ? backup.overrides.hidden : [],
          deleted: Array.isArray(backup.overrides.deleted) ? backup.overrides.deleted : [],
          unhidden: Array.isArray(backup.overrides.unhidden) ? backup.overrides.unhidden : []
        });
      }

      // 2. 恢复私人典藏书签
      if (Array.isArray(backup.favorites)) {
        st.set("mynav_arch_favorites", backup.favorites);
      }

      // 3. 恢复访问统计
      if (backup.visits && typeof backup.visits === "object") {
        st.set("mynav_arch_visits", backup.visits);
      }

      // 4. 恢复偏好（主题、搜索引擎、视图模式）
      if (backup.preferences && typeof backup.preferences === "object") {
        const p = backup.preferences;
        if (p.theme) st.set("mynav_arch_theme", p.theme);
        if (p.themeMode) st.set("mynav_theme_mode", p.themeMode);
        if (p.searchEngine) {
          st.set("mynav_search_engine_v2", p.searchEngine);
          st.set("mynav_search_engine", p.searchEngine);
        }
        if (p.viewMode) st.set("mynav_arch_view", p.viewMode);
      }

      // 触发全站重绘更新
      notifyChange();

      // 如果有主题模块，同步刷新主题
      if (typeof window !== "undefined" && window.NavTheme && typeof window.NavTheme.apply === "function") {
        window.NavTheme.apply(st.get("mynav_arch_theme", "light"));
      }

      return { success: true, message: "备份数据已成功导入并恢复！" };
    } catch (err) {
      return { success: false, message: "写入本地配置失败: " + err.message };
    }
  }

  return {
    STORAGE_KEY,
    loadOverrides,
    saveOverrides,
    getSites,
    getAllMergedSites,
    getHiddenSites,
    getSiteById,
    hasModifications,
    getModificationCount,
    updateSite,
    moveCategory,
    addSite,
    hideSite,
    unhideSite,
    unhideAll,
    deleteSite,
    resetSite,
    resetAll,
    exportDataJsString,
    downloadDataJs,
    exportBackupObject,
    downloadBackupJson,
    importBackupJson
  };
});
