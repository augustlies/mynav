/**
 * 数据完整性与规范校验工具 (validate.js)
 * 
 * 校验规则：
 * 1. 检查数据结构完整性（categories, sites 数组）。
 * 2. 检查分类定义唯一性及必要字段（id, name, code, desc）。
 * 3. 检查网站条目唯一性及必要字段（id, name, url, description, category, tags, icon）。
 * 4. 检查 URL 格式（必须为标准 http/https 协议）。
 * 5. 检查每个网站引用的 category 是否在 categories 列表中存在。
 * 6. 检查本地图标资源覆盖率 (icons/<id>.png) 并输出健康度度量。
 * 
 * 运行方式：
 *   node validate.js
 */

const fs = require("fs");
const path = require("path");
const NAV_DATA = require("./data.js");

function validateData(data, baseDir = __dirname) {
  const errors = [];
  const warnings = [];
  const metrics = {
    categoryCount: 0,
    siteCount: 0,
    localIconCount: 0,
    invalidIconCount: 0,
    tagCount: 0
  };

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["NAV_DATA 必须是一个有效对象"], warnings: [], metrics };
  }

  // 1. 验证分类 (Categories)
  if (!Array.isArray(data.categories) || data.categories.length === 0) {
    errors.push("categories 必须是非空数组");
  }

  const categoryIds = new Set();
  (data.categories || []).forEach((cat, index) => {
    const prefix = `[分类 №${index + 1}]`;
    if (!cat.id || typeof cat.id !== "string" || !/^[a-z0-9_-]+$/.test(cat.id)) {
      errors.push(`${prefix} id 字段不合法（必须为英文小写、数字、下划线或连字符）: "${cat.id}"`);
    } else {
      if (categoryIds.has(cat.id)) {
        errors.push(`${prefix} 发现重复的分类 id: "${cat.id}"`);
      }
      categoryIds.add(cat.id);
    }

    if (!cat.name || typeof cat.name !== "string" || !cat.name.trim()) {
      errors.push(`${prefix} 缺少有效分类名称 name`);
    }

    if (!cat.code || typeof cat.code !== "string" || !/^[A-Z0-9]{2,5}$/.test(cat.code)) {
      warnings.push(`${prefix} 建议配置 2~5 位大写简码 code（当前: "${cat.code || '无'}"）`);
    }

    if (!cat.desc || typeof cat.desc !== "string") {
      warnings.push(`${prefix} 缺少 desc 分类描述`);
    }
  });

  metrics.categoryCount = categoryIds.size;

  // 2. 验证网站条目 (Sites)
  if (!Array.isArray(data.sites) || data.sites.length === 0) {
    errors.push("sites 必须是非空数组");
  }

  const siteIds = new Set();
  const allTags = new Set();
  const iconsDir = path.join(baseDir, "icons");

  (data.sites || []).forEach((site, index) => {
    const prefix = `[网站 №${index + 1} "${site.name || site.id || '未命名'}"]`;

    // ID 检查
    if (!site.id || typeof site.id !== "string" || !/^[a-z0-9_-]+$/.test(site.id)) {
      errors.push(`${prefix} id 字段不合法（必须为小写字母、数字、下划线或短横线）: "${site.id}"`);
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

    // 网址格式检查
    if (!site.url || typeof site.url !== "string") {
      errors.push(`${prefix} 缺少有效 url 字段`);
    } else {
      if (!/^https?:\/\/.+/i.test(site.url)) {
        errors.push(`${prefix} 网址格式不合法，必须以 http:// 或 https:// 开头: "${site.url}"`);
      }
    }

    // 描述检查
    if (!site.description || typeof site.description !== "string" || !site.description.trim()) {
      warnings.push(`${prefix} 缺少 description 描述，建议补充以提升检索体验`);
    }

    // 分类归属检查
    if (!site.category || typeof site.category !== "string") {
      errors.push(`${prefix} 缺少 category 所属分类字段`);
    } else if (!categoryIds.has(site.category)) {
      errors.push(`${prefix} 引用的分类 "${site.category}" 未在 categories 中定义`);
    }

    // 标签有效性检查
    if (!Array.isArray(site.tags) || site.tags.length === 0) {
      warnings.push(`${prefix} tags 标签数组为空，添加标签有助于搜索命中`);
    } else {
      site.tags.forEach((t) => {
        if (typeof t === "string" && t.trim()) {
          allTags.add(t.toLowerCase().trim());
        }
      });
    }

    // 图标印记文本检查
    if (!site.icon || typeof site.icon !== "string") {
      warnings.push(`${prefix} 缺少 icon 印记徽标文字（建议配置 1~3 个字母或汉字）`);
    }

    // 本地图标资源检查 (icons/<id>.png)
    if (site.id) {
      const localIconPath = path.join(iconsDir, `${site.id}.png`);
      if (fs.existsSync(localIconPath)) {
        const bytes = fs.readFileSync(localIconPath);
        const isPng = bytes.length >= 8 &&
          bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        if (isPng && bytes.length >= 100) {
          metrics.localIconCount++;
        } else {
          metrics.invalidIconCount++;
          warnings.push(`${prefix} 本地图标 icons/${site.id}.png 文件头不是合法 PNG 或体积过小（${bytes.length} bytes）`);
        }
      } else if (!site.favicon) {
        warnings.push(`${prefix} 尚未放置本地高清图标 icons/${site.id}.png（将使用外链与字母徽标兜底）`);
      }
    }
  });

  metrics.siteCount = siteIds.size;
  metrics.tagCount = allTags.size;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics
  };
}

// CLI 执行逻辑
if (require.main === module) {
  console.log("==================================================");
  console.log("🏛 个人数字收藏馆 · 数据源与工程合规校验");
  console.log("==================================================\n");

  const result = validateData(NAV_DATA);

  if (result.warnings.length > 0) {
    console.log(`⚠️ 发现 ${result.warnings.length} 条工程建议与资源提示:`);
    result.warnings.forEach((w) => console.log("   • " + w));
    console.log("");
  }

  if (!result.valid) {
    console.error(`❌ 校验失败！共发现 ${result.errors.length} 处阻断性错误:`);
    result.errors.forEach((e) => console.error("   ✕ " + e));
    console.log("\n请根据提示修正 data.js 中的数据后重新运行。");
    process.exit(1);
  } else {
    console.log("✅ 校验全部通过！数据结构与静态资产完全符合规范。");
    console.log(`   • 统计分类: ${result.metrics.categoryCount} 个专栏`);
    console.log(`   • 统计网站: ${result.metrics.siteCount} 卷藏书`);
    console.log(`   • 本地图标: ${result.metrics.localIconCount} / ${result.metrics.siteCount} 卷已配齐`);
    if (result.metrics.invalidIconCount > 0) {
      console.log(`   • 损坏图标: ${result.metrics.invalidIconCount} 个（已列入上方警告）`);
    }
    console.log(`   • 检索标签: ${result.metrics.tagCount} 个独立关键词索引`);
    console.log("   • ID 唯一性: 100% 通过");
    console.log("   • URL 合规性: 100% 通过");
    console.log("   • 分类关联性: 100% 通过\n");
    process.exit(0);
  }
}

module.exports = { validateData };
