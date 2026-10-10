/**
 * 模块：典藏多维智能检索与编目匹配引擎 (js/search.js)
 * 职责：
 * 1. 深度多词分词与多维全字段加权检索（权重：名称 > 标签 > 拼音简拼 > 域名 > 简介）
 * 2. 中文拼音首字母/简拼助记检索（如 kl ➔ Claude 克劳德, ds ➔ DeepSeek, xtjj ➔ 稀土掘金）
 * 3. 标签交叉筛选规范语法（如 #ai #代码 组合交集筛选）
 * 4. 出版物划线批注高亮排印 (Editorial Mark Highlighting)
 * 5. 命中分类分布度量统计 (Category Distribution)
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavSearch = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 1. 中文字符与常见词组拼音首字母表映射 (轻量确定性字典，零外部依赖)
  const PINYIN_INITIALS_MAP = {
    // 馆藏名称与核心机构
    "克": "k", "劳": "l", "德": "d",
    "谷": "g", "歌": "g",
    "助": "z", "理": "l", "手": "s",
    "智": "z", "能": "n",
    "深": "s", "度": "d", "求": "q", "索": "s",
    "开": "k", "源": "y",
    "代": "d", "码": "m",
    "推": "t", "稀": "x", "土": "t", "掘": "j", "金": "j",
    "少": "s", "数": "s", "派": "p",
    "菜": "c", "鸟": "n", "教": "j", "程": "c",
    "哔": "b", "哩": "l",
    "语": "y", "雀": "q",
    "笔": "b", "记": "j",
    "文": "w", "档": "d", "章": "z",
    "知": "z", "识": "s", "库": "k",
    "案": "a", "头": "t",
    "效": "x", "率": "l",
    "工": "g", "具": "j",
    "流": "l", "思": "s", "维": "w", "导": "d", "图": "t", "画": "h", "架": "j", "构": "g", "设": "s", "计": "j",
    "图": "t", "像": "x", "片": "p", "压": "y", "缩": "s", "轻": "q", "量": "l", "化": "h", "格": "g", "式": "s",
    "前": "q", "端": "d", "后": "h", "标": "b", "准": "z", "规": "g", "范": "f",
    "部": "b", "署": "s", "托": "t", "管": "g", "云": "y", "服": "f", "务": "w", "静": "j", "态": "t", "网": "w", "站": "z",
    "视": "s", "频": "p", "课": "k", "学": "x", "习": "x", "公": "g", "开": "k", "实": "s", "战": "z", "经": "j", "验": "y",
    "写": "x", "作": "z", "生": "s", "产": "c", "力": "l", "作": "z", "流": "l", "博": "b", "客": "k",
    "兼": "j", "容": "r", "性": "x", "浏": "l", "览": "l", "器": "q",
    "报": "b", "错": "c", "社": "s", "区": "q", "调": "t", "试": "s", "问": "w", "答": "d",
    "初": "c", "者": "z", "手": "s", "册": "c", "速": "s", "查": "c", "语": "y", "法": "f", "入": "r", "门": "m"
  };

  // 专有名称/缩写快速助记词映射 (扩展助记)
  const MNEMONIC_MAP = {
    "ai-claude": ["kl", "kld", "cld", "anthropic"],
    "ai-chatgpt": ["gpt", "cg", "openai", "chat"],
    "ai-gemini": ["gg", "gm", "google", "ge"],
    "ai-hark": ["hk", "hark"],
    "ai-muse": ["mu", "muse"],
    "ai-deepseek": ["ds", "sdqs", "sd", "deep", "seek"],
    "dev-github": ["gh", "git", "hub"],
    "dev-mdn": ["mdn", "w3c", "mozilla"],
    "dev-caniuse": ["ciu", "use", "cani"],
    "dev-stackoverflow": ["so", "stack", "overflow"],
    "dev-vercel": ["vc", "vercel", "next"],
    "learn-juejin": ["jj", "xtjj", "juejin"],
    "learn-sspai": ["ssp", "sspai", "pai"],
    "learn-runoob": ["cn", "cnjc", "runoob", "niao"],
    "learn-bilibili": ["blbl", "bz", "b站", "bili"],
    "tool-notion": ["no", "notion"],
    "tool-yuque": ["yq", "yuque", "que"],
    "tool-processon": ["po", "process", "on"],
    "tool-tinypng": ["png", "tp", "tiny"]
  };

  function normalize(str) {
    return str ? String(str).toLowerCase().trim() : "";
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // 提取一段中文的拼音首字母简拼串 (例如 "深度求索" ➔ "sdqs")
  function toPinyinInitials(str) {
    if (!str) return "";
    let res = "";
    for (const char of str) {
      if (PINYIN_INITIALS_MAP[char]) {
        res += PINYIN_INITIALS_MAP[char];
      } else if (/[a-zA-Z0-9]/.test(char)) {
        res += char.toLowerCase();
      }
    }
    return res;
  }

  // 提取单个网站所有用于检索的元数据和简拼助记
  function getSearchIndex(site) {
    if (site._searchIndexCache) return site._searchIndexCache;

    const name = normalize(site.name);
    const desc = normalize(site.description);
    const url = normalize(site.url);
    const tags = Array.isArray(site.tags) ? site.tags.map(normalize) : [];
    const tagsStr = tags.join(" ");

    // 提取中文拼音首字母
    const namePinyin = toPinyinInitials(site.name);
    const tagsPinyin = tags.map(toPinyinInitials).join(" ");
    const mnemonics = (MNEMONIC_MAP[site.id] || []).map(normalize);

    const index = {
      name,
      desc,
      url,
      tags,
      tagsStr,
      namePinyin,
      tagsPinyin,
      mnemonics
    };

    site._searchIndexCache = index;
    return index;
  }

  // 计算单个词在指定条目中的匹配分值 (加权打分)
  function scoreTerm(idx, term) {
    const isTagSearch = term.startsWith("#");
    const cleanTerm = isTagSearch ? term.slice(1).trim() : term;
    if (!cleanTerm) return 0;

    // 1. 若为 #tag 显式标签筛选语法：严格要求标签匹配
    if (isTagSearch) {
      const exactTag = idx.tags.some(t => t === cleanTerm);
      if (exactTag) return 120;
      const partTag = idx.tags.some(t => t.includes(cleanTerm));
      if (partTag) return 70;
      return 0; // 不满足显式标签要求直接记 0 分（不匹配）
    }

    let score = 0;

    // 2. 名称全等与前缀/包含匹配 (最高优先级)
    if (idx.name === cleanTerm) {
      score += 240;
    } else if (idx.name.startsWith(cleanTerm)) {
      score += 150;
    } else if (idx.name.includes(cleanTerm)) {
      score += 100;
    }

    // 3. 标签匹配 (第二优先级)
    if (idx.tags.some(t => t === cleanTerm)) {
      score += 80;
    } else if (idx.tags.some(t => t.includes(cleanTerm))) {
      score += 50;
    }

    // 4. 拼音首字母/助记词匹配 (第三优先级，如 kl ➔ claude, ds ➔ deepseek)
    if (idx.namePinyin.startsWith(cleanTerm) || idx.namePinyin === cleanTerm) {
      score += 75;
    } else if (idx.namePinyin.includes(cleanTerm)) {
      score += 45;
    }

    if (idx.mnemonics.some(m => m === cleanTerm)) {
      score += 85;
    } else if (idx.mnemonics.some(m => m.startsWith(cleanTerm))) {
      score += 55;
    }

    if (idx.tagsPinyin.includes(cleanTerm)) {
      score += 35;
    }

    // 5. 网址/域名匹配
    if (idx.url.includes(cleanTerm)) {
      score += 40;
    }

    // 6. 简介正文匹配
    if (idx.desc.includes(cleanTerm)) {
      score += 25;
    }

    return score;
  }

  return {
    /**
     * 判断单条网站是否匹配检索式
     */
    match(site, query) {
      return this.score(site, query) > 0;
    },

    /**
     * 计算检索相关性综合得分（支持多词 AND 与标签交叉）
     */
    score(site, query) {
      if (!site) return 0;
      const q = normalize(query);
      if (!q) return 100;

      const words = q.split(/\s+/).filter(Boolean);
      if (words.length === 0) return 100;

      const idx = getSearchIndex(site);
      let totalScore = 0;

      // 多词分词检索：必须每个词项均有命中得分 (AND 逻辑)
      for (const word of words) {
        const termScore = scoreTerm(idx, word);
        if (termScore <= 0) {
          return 0; // 任一词项未命中，则不匹配
        }
        totalScore += termScore;
      }

      return totalScore;
    },

    /**
     * 全局过滤与加权相关性排序
     */
    filter(sites, query) {
      if (!Array.isArray(sites)) return [];
      const q = normalize(query);
      if (!q) return sites.slice();

      const scoredList = [];
      for (const site of sites) {
        const scoreVal = this.score(site, q);
        if (scoreVal > 0) {
          scoredList.push({ site, score: scoreVal });
        }
      }

      // 按相关度得分从高到低排序，得分相同时保持原稳定顺序
      scoredList.sort((a, b) => b.score - a.score);
      return scoredList.map(item => item.site);
    },

    /**
     * 出版物批注划线高亮生成器 (安全转义 + 保持原大小写)
     */
    highlight(text, query) {
      if (!text) return "";
      const rawText = String(text);
      if (!query || !query.trim()) return escapeHtml(rawText);

      // 提取检索词中纯文本项（排除 # 前缀，长度至少 1）
      const terms = query
        .trim()
        .split(/\s+/)
        .map(t => (t.startsWith("#") ? t.slice(1) : t).trim())
        .filter(t => t.length > 0)
        .map(escapeRegex);

      if (terms.length === 0) return escapeHtml(rawText);

      // 构筑合并正则匹配 (按词长从长到短排序避免子串遮盖)
      terms.sort((a, b) => b.length - a.length);
      const regex = new RegExp(`(${terms.join("|")})`, "gi");

      const parts = rawText.split(regex);
      return parts.map(part => {
        if (!part) return "";
        if (regex.test(part)) {
          return `<mark class="editorial-highlight">${escapeHtml(part)}</mark>`;
        }
        return escapeHtml(part);
      }).join("");
    },

    /**
     * 统计当前命中结果在各个分类下的分布情况 (用于状态栏编目胶囊)
     */
    getCategoryDistribution(matches, categories) {
      if (!Array.isArray(matches) || !Array.isArray(categories)) return [];

      const countMap = {};
      matches.forEach(site => {
        countMap[site.category] = (countMap[site.category] || 0) + 1;
      });

      return categories
        .filter(cat => countMap[cat.id] > 0)
        .map(cat => ({
          id: cat.id,
          name: cat.name,
          code: cat.code || "SEC",
          count: countMap[cat.id]
        }));
    },

    // 辅助工具方法暴露
    toPinyinInitials
  };
});
