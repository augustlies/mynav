/**
 * 模块：典藏多维检索匹配 (js/search.js)
 * 对网站条目的名称、描述、网址与标签进行全字段多词匹配
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavSearch = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalize(str) {
    return str ? String(str).toLowerCase().trim() : "";
  }

  return {
    match(site, query) {
      if (!site) return false;
      const q = normalize(query);
      if (!q) return true;

      const words = q.split(/\s+/).filter(Boolean);
      if (words.length === 0) return true;

      // 提取被检索目标字段
      const name = normalize(site.name);
      const desc = normalize(site.description);
      const url = normalize(site.url);
      const tags = Array.isArray(site.tags) ? site.tags.map(normalize).join(" ") : "";

      const haystack = `${name} ${desc} ${url} ${tags}`;

      // 必须匹配所有检索词（支持空格分词多维过滤）
      return words.every((word) => haystack.includes(word));
    },

    filter(sites, query) {
      if (!Array.isArray(sites)) return [];
      if (!query || !query.trim()) return sites.slice();
      return sites.filter((site) => this.match(site, query));
    }
  };
});
