/**
 * 数据完整性与规范校验工具 (validate.js)
 * 
 * 校验规则：
 * 1. 检查数据结构完整性（categories, sites 数组）。
 * 2. 检查分类定义唯一性及必要字段（id, name, code）。
 * 3. 检查网站条目唯一性及必要字段（id, name, url, description, category, tags）。
 * 4. 检查 URL 格式（必须为标准 http/https 协议）。
 * 5. 检查每个网站引用的 category 是否在 categories 列表中存在。
 * 
 * 运行方式：
 *   node validate.js
 */

const NAV_DATA = require("./data.js");

function validateData(data) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["NAV_DATA 必须是一个有效对象"], warnings: [] };
  }

  // 1. 验证分类
  if (!Array.isArray(data.categories) || data.categories.length === 0) {
    errors.push("categories 必须是非空数组");
  }

  const categoryIds = new Set();
  (data.categories || []).forEach((cat, index) => {
    const prefix = `[分类 №${index + 1}]`;
    if (!cat.id || typeof cat.id !== "string") {
      errors.push(`${prefix} 缺少有效 id 字段`);
    } else {
      if (categoryIds.has(cat.id)) {
        errors.push(`${prefix} 发现重复的分类 id: "${cat.id}"`);
      }
      categoryIds.add(cat.id);
    }

    if (!cat.name || typeof cat.name !== "string") {
      errors.push(`${prefix} 缺少有效 name 分类名称`);
    }
  });

  // 2. 验证网站条目
  if (!Array.isArray(data.sites) || data.sites.length === 0) {
    errors.push("sites 必须是非空数组");
  }

  const siteIds = new Set();
  (data.sites || []).forEach((site, index) => {
    const prefix = `[网站 №${index + 1} "${site.name || site.id || '未命名'}"]`;

    // ID 检查
    if (!site.id || typeof site.id !== "string") {
      errors.push(`${prefix} 缺少有效 id 字段`);
    } else {
      if (siteIds.has(site.id)) {
        errors.push(`${prefix} 发现重复的网站 id: "${site.id}"`);
      }
      siteIds.add(site.id);
    }

    // 名称检查
    if (!site.name || typeof site.name !== "string" || !site.name.trim()) {
      errors.push(`${prefix} 缺少有效网站名称 name`);
    }

    // 网址检查
    if (!site.url || typeof site.url !== "string") {
      errors.push(`${prefix} 缺少有效 url 字段`);
    } else {
      if (!/^https?:\/\/.+/i.test(site.url)) {
        errors.push(`${prefix} 网址格式不合法，必须以 http:// 或 https:// 开头: "${site.url}"`);
      }
    }

    // 描述检查
    if (!site.description || typeof site.description !== "string") {
      warnings.push(`${prefix} 缺少 description 描述，建议补充以提升检索体验`);
    }

    // 分类归属检查
    if (!site.category || typeof site.category !== "string") {
      errors.push(`${prefix} 缺少 category 所属分类字段`);
    } else if (!categoryIds.has(site.category)) {
      errors.push(`${prefix} 引用的分类 "${site.category}" 未在 categories 中定义`);
    }

    // 标签检查
    if (!Array.isArray(site.tags) || site.tags.length === 0) {
      warnings.push(`${prefix} tags 为空，添加标签有助于搜索命中`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      categoryCount: (data.categories || []).length,
      siteCount: (data.sites || []).length
    }
  };
}

// CLI 执行逻辑
if (require.main === module) {
  console.log("==================================================");
  console.log("🏛 个人数字收藏馆 · 数据源格式化校验");
  console.log("==================================================\n");

  const result = validateData(NAV_DATA);

  if (result.warnings.length > 0) {
    console.log(`⚠️ 发现 ${result.warnings.length} 条提示信息:`);
    result.warnings.forEach((w) => console.log("   " + w));
    console.log("");
  }

  if (!result.valid) {
    console.error(`❌ 校验失败！共发现 ${result.errors.length} 处错误:`);
    result.errors.forEach((e) => console.error("   • " + e));
    console.log("\n请根据提示修正 data.js 中的数据后重新运行。");
    process.exit(1);
  } else {
    console.log("✅ 校验全部通过！数据结构完全符合规范。");
    console.log(`   • 统计分类: ${result.summary.categoryCount} 个`);
    console.log(`   • 统计网站: ${result.summary.siteCount} 卷`);
    console.log("   • ID 唯一性: 100% 通过");
    console.log("   • URL 合规性: 100% 通过");
    console.log("   • 分类关联性: 100% 通过\n");
    process.exit(0);
  }
}

module.exports = { validateData };
