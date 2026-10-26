/**
 * Module: A6 & C5 — 飞鸽传书 · 跨端入馆通道与 Notion 典藏同步桥
 *
 * C5 浏览器「加盖藏书票」
 *   · URL 接收器：?ingest=1&url=...&title=...&why=... 自动拦截并唤醒
 *     「盖章入馆确认匣」，一键存入待编目匣或正式馆藏，随后
 *     history.replaceState 清理地址栏。
 *   · Bookmarklet 拖拽台：生成含 ingest=1 的 javascript: 小书签，
 *     自动提取 location.href / document.title / window.getSelection()。
 *
 * A6 Notion 无头同步桥
 *   · 字段严格对齐 Title, URL, Category, Description, CallNumber,
 *     Status, WhySaved, Tags, Notes 的 CSV / JSON 双向导入导出。
 *   · 可选 Cloudflare Worker 端点（2000ms AbortController）；离线时
 *     走本地文件 / 剪贴板零损耗同步。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavCourier = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SYNC_TIMEOUT_MS = 2000;
  var NOTION_FIELDS = [
    "Title", "URL", "Category", "Description",
    "CallNumber", "Status", "WhySaved", "Tags", "Notes", "Icon"
  ];
  var WORKER_STORAGE_KEY = "MYNAV_NOTION_ENDPOINT";

  var state = {
    open: false,
    pending: null,
    lastSync: { at: 0, ok: false, mode: "local", message: "尚未同步" },
    lastExport: null
  };

  var bound = false;
  var lastActiveElement = null;

  // ---------------------------------------------------------------------------
  // 工具
  // ---------------------------------------------------------------------------
  function escapeHtml(value) {
    if (value === undefined || value === null) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function notify(title, subtitle, icon) {
    if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
      window.NavShortcuts.showToast(title, subtitle || "", icon || "🕊️");
    }
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function formatStamp(timestamp) {
    var d = new Date(Number(timestamp) || Date.now());
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function isHttpUrl(value) {
    return /^https?:\/\/[^\s]+$/i.test(String(value || "").trim());
  }

  function safeIngestIcon(value) {
    var text = String(value || "").trim();
    if (!text) return "";
    if (/^https?:\/\/[^\s"'<>]+$/i.test(text)) return text;
    return "";
  }

  function normalizeUrl(value) {
    return String(value || "").trim();
  }

  function decodeParam(value) {
    if (value === null || value === undefined) return "";
    try {
      return decodeURIComponent(String(value).replace(/\+/g, " "));
    } catch (error) {
      return String(value);
    }
  }

  function categories() {
    return window.NavApp && typeof window.NavApp.getCategories === "function"
      ? window.NavApp.getCategories()
      : (window.NAV_DATA && Array.isArray(window.NAV_DATA.categories) ? window.NAV_DATA.categories : []);
  }

  function categoryLabel(id) {
    var found = categories().filter(function (cat) { return cat.id === id; })[0];
    return found ? found.name : (id || "未分类");
  }

  function categoryIdFromLabel(label) {
    var value = String(label || "").trim();
    if (!value) return "";
    var list = categories();
    var byId = list.filter(function (cat) { return cat.id === value; })[0];
    if (byId) return byId.id;
    var byName = list.filter(function (cat) {
      return cat.name === value || cat.code === value;
    })[0];
    return byName ? byName.id : "";
  }

  /** 正式馆藏按画布位置分配索书号；待编目卡使用 TMP-XX。 */
  function callNumberFor(site) {
    if (!site) return "";
    if (site.status === "uncatalogued") {
      return window.NavUncatalogued && typeof window.NavUncatalogued.getTmpNumber === "function"
        ? window.NavUncatalogued.getTmpNumber(site)
        : "TMP";
    }
    var all = window.NavApp && typeof window.NavApp.getAllSites === "function"
      ? window.NavApp.getAllSites()
      : [];
    var index = all.findIndex(function (item) { return item && item.id === site.id; });
    if (index >= 0) return String(index + 1).padStart(2, "0");
    return site.callNumber ? String(site.callNumber) : "";
  }

  function allSitesIncludingUncatalogued() {
    if (window.NavApp && typeof window.NavApp.getUncataloguedSites === "function") {
      var catalogued = window.NavApp.getAllSites ? window.NavApp.getAllSites() : [];
      return catalogued.concat(window.NavApp.getUncataloguedSites() || []);
    }
    return window.NavOverrides && typeof window.NavOverrides.getAllIncludingUncatalogued === "function"
      ? window.NavOverrides.getAllIncludingUncatalogued(true)
      : [];
  }

  // ---------------------------------------------------------------------------
  // C5 · URL 接收器
  // ---------------------------------------------------------------------------
  function parseIngestParams(search) {
    var source = String(search === undefined ? window.location.search : search || "");
    if (!source) return null;
    var params = new URLSearchParams(source);
    var ingest = params.get("ingest");
    if (ingest === null) return null;
    if (!/^(1|true|yes|bookmarklet)$/i.test(String(ingest))) return null;

    var url = normalizeUrl(params.get("url") || params.get("u") || "");
    var title = decodeParam(params.get("title") || params.get("t") || "");
    var why = decodeParam(params.get("why") || params.get("w") || "");
    var selection = decodeParam(params.get("selection") || params.get("sel") || "");
    var icon = safeIngestIcon(params.get("icon") || params.get("i") || "");
    var category = decodeParam(params.get("category") || params.get("cat") || "");
    var mode = decodeParam(params.get("mode") || "");

    return {
      ingest: true,
      url: url,
      title: title || (function () {
        try { return new URL(url).hostname.replace(/^www\./, ""); } catch (error) { return ""; }
      })(),
      why: why,
      selection: selection,
      icon: icon,
      category: categoryIdFromLabel(category) || category || "",
      mode: mode === "catalogued" ? "catalogued" : "uncatalogued",
      at: Date.now()
    };
  }

  function cleanIngestParams() {
    if (!/^https?:$/.test(window.location.protocol)) return false;
    try {
      var next = new URL(window.location.href);
      ["ingest", "url", "u", "title", "t", "why", "w", "selection", "sel",
        "icon", "i", "category", "cat", "mode"]
        .forEach(function (key) { next.searchParams.delete(key); });
      var target = next.pathname + (next.searchParams.toString() ? "?" + next.searchParams.toString() : "") + next.hash;
      window.history.replaceState({}, document.title, target);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 唤醒「盖章入馆确认匣」。payload 缺省时从 URL 参数解析。
   * 返回 true 表示已成功拦截（无论用户最终是否确认）。
   */
  function ingestFromParams(options) {
    var config = options || {};
    var payload = config.payload || parseIngestParams(config.search);
    if (!payload) return false;
    if (!isHttpUrl(payload.url)) {
      notify("飞鸽迷航", "回传的网址不合法：" + (payload.url || "(空)"), "⚠");
      if (config.clean !== false) cleanIngestParams();
      return false;
    }
    state.pending = payload;
    open();
    renderConfirm();
    if (config.clean !== false) cleanIngestParams();
    notify("飞鸽已抵达", payload.title || payload.url, "🕊️");
    return true;
  }

  function commitIngest(target) {
    var payload = state.pending;
    if (!payload) return null;
    var mode = target === "catalogued" ? "catalogued" : "uncatalogued";
    if (!isHttpUrl(payload.url)) return null;

    var existing = allSitesIncludingUncatalogued().filter(function (site) {
      return site && normalizeUrl(site.url) === normalizeUrl(payload.url);
    })[0];

    if (existing) {
      if (mode === "catalogued" && existing.status === "uncatalogued" && window.NavOverrides) {
        var targetCategory = payload.category || existing.category || "tools";
        window.NavOverrides.updateSite(existing.id, {
          status: "catalogued",
          category: targetCategory,
          description: existing.description || existing.whySaved || ""
        });
        if (window.NavLedger && typeof window.NavLedger.ensureFirstSeen === "function") {
          window.NavLedger.ensureFirstSeen(existing.id, Date.now());
        }
      }
      notify("此卷已在馆中", (existing.name || existing.id) + " · 未重复入库", "✓");
      state.pending = null;
      renderConfirm();
      refreshArchive();
      return { site: existing, duplicate: true, mode: mode };
    }

    var whySaved = payload.why || payload.selection || "飞鸽传书 · 来自浏览器盖章小书签";
    var site = window.NavOverrides && typeof window.NavOverrides.addSite === "function"
      ? window.NavOverrides.addSite({
        name: payload.title || payload.url,
        url: payload.url,
        description: payload.selection || payload.why || "",
        whySaved: whySaved,
        notes: payload.selection ? "选中文本：" + payload.selection : "",
        category: payload.category || "tools",
        tags: ["飞鸽传书", mode === "catalogued" ? "盖章入馆" : "待编目"],
        favicon: payload.icon || "",
        status: mode,
        visibility: "public",
        createdAt: Date.now()
      })
      : null;

    if (!site) {
      notify("盖章失败", "馆藏账本尚未就绪", "⚠");
      return null;
    }

    if (window.NavLedger && typeof window.NavLedger.ensureFirstSeen === "function") {
      window.NavLedger.ensureFirstSeen(site.id, Date.now());
    }
    state.pending = null;
    renderConfirm();
    refreshArchive();
    notify(
      mode === "catalogued" ? "已盖章编入正式馆藏" : "已封存至待编目匣",
      (site.name || site.id) + " · " + callNumberFor(site),
      mode === "catalogued" ? "✦" : "⌘"
    );
    return { site: site, duplicate: false, mode: mode };
  }

  function refreshArchive() {
    if (window.NavUncatalogued && typeof window.NavUncatalogued.renderDrawer === "function") {
      window.NavUncatalogued.renderDrawer();
    }
    if (window.NavApp && typeof window.NavApp.updateBadges === "function") {
      window.NavApp.updateBadges();
    }
    if (window.NavApp && typeof window.NavApp.refresh === "function") {
      window.NavApp.refresh();
    }
  }

  // ---------------------------------------------------------------------------
  // C5 · Bookmarklet 生成器
  // ---------------------------------------------------------------------------
  function buildBookmarklet(baseUrl) {
    var base = String(baseUrl || (window.location.origin + window.location.pathname)).replace(/[?#].*$/, "");
    // 注意：小书签内部不得出现未转义的单引号，全部使用双引号包裹字符串。
    var script = [
      "(function(){",
      "var b=\"" + base + "\";",
      "var u=encodeURIComponent(location.href);",
      "var t=encodeURIComponent(document.title||\"\");",
      "var s=encodeURIComponent((window.getSelection&&String(window.getSelection()))||\"\");",
      "var w=encodeURIComponent((window.getSelection&&String(window.getSelection()))||document.title||\"\");",
      "var q=document.querySelector(\"link[rel~='apple-touch-icon'][sizes][href],link[rel~='apple-touch-icon'][href],link[rel~='icon'][href]\");",
      "var i=\"\";",
      "if(q&&q.href){try{var p=new URL(q.getAttribute(\"href\"),location.href);if(/^https?:$/.test(p.protocol))i=encodeURIComponent(p.href);}catch(e){}}",
      "window.open(b+\"?ingest=1&url=\"+u+\"&title=\"+t+\"&why=\"+w+\"&selection=\"+s+\"&icon=\"+i,\"_blank\");",
      "})();"
    ].join("");
    return "javascript:" + script;
  }

  function bookmarkletHtml() {
    var code = buildBookmarklet();
    return '<a class="courier-bookmarklet" href="' + escapeHtml(code) + '" ' +
      'data-courier-bookmarklet="1" title="拖拽我到书签栏" ' +
      'onclick="event.preventDefault();return false;">✦ 盖章入馆 · EX LIBRIS</a>';
  }

  function copyBookmarklet() {
    var code = buildBookmarklet();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(code).then(function () {
        notify("小书签代码已复制", "粘贴到书签网址栏即可", "📋");
        return true;
      }).catch(function () {
        return false;
      });
    }
    return Promise.resolve(false);
  }

  // ---------------------------------------------------------------------------
  // A6 · Notion 映射
  // ---------------------------------------------------------------------------
  function siteToNotionRow(site) {
    return {
      Title: site.name || site.title || site.id || "",
      URL: site.url || "",
      Category: categoryLabel(site.category),
      Description: site.description || site.desc || "",
      CallNumber: callNumberFor(site),
      Status: site.status === "uncatalogued" ? "Uncatalogued" : "Catalogued",
      WhySaved: site.whySaved || "",
      Tags: Array.isArray(site.tags) ? site.tags.join(" / ") : "",
      Notes: site.notes || "",
      Icon: site.favicon || ""
    };
  }

  function notionRowToSite(row) {
    if (!row) return null;
    var url = normalizeUrl(row.URL || row.url || "");
    if (!isHttpUrl(url)) return null;
    var statusText = String(row.Status || row.status || "").toLowerCase();
    var status = /uncatalog|待编目|tmp/.test(statusText) ? "uncatalogued" : "catalogued";
    var tagsRaw = row.Tags || row.tags || "";
    var tags = Array.isArray(tagsRaw)
      ? tagsRaw.map(String)
      : String(tagsRaw).split(/[\/,，、|]/).map(function (tag) { return tag.trim(); }).filter(Boolean);
    return {
      name: String(row.Title || row.title || url),
      url: url,
      category: categoryIdFromLabel(row.Category || row.category) || "tools",
      description: String(row.Description || row.description || ""),
      whySaved: String(row.WhySaved || row.whySaved || ""),
      notes: String(row.Notes || row.notes || ""),
      favicon: safeIngestIcon(row.Icon || row.icon || row.Favicon || row.favicon || ""),
      tags: tags,
      status: status,
      visibility: "public",
      createdAt: Date.now()
    };
  }

  function exportRows(options) {
    var config = options || {};
    var includeUncatalogued = config.includeUncatalogued !== false;
    var sites = includeUncatalogued ? allSitesIncludingUncatalogued() : (window.NavApp.getAllSites ? window.NavApp.getAllSites() : []);
    return sites
      .filter(function (site) {
        if (!site || !site.url) return false;
        // 暗月私密卷宗绝不进入任何导出通道。
        if (site.visibility === "shadow") return false;
        return true;
      })
      .map(siteToNotionRow);
  }

  function toCsv(rows) {
    var list = rows || exportRows();
    var escapeCell = function (value) {
      var text = String(value === undefined || value === null ? "" : value);
      if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
      return text;
    };
    var lines = [NOTION_FIELDS.join(",")];
    list.forEach(function (row) {
      lines.push(NOTION_FIELDS.map(function (field) { return escapeCell(row[field]); }).join(","));
    });
    return lines.join("\n");
  }

  /** 极简 RFC 4180 解析器：支持引号转义与字段内换行。 */
  function parseCsv(text) {
    var source = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    var rows = [];
    var row = [];
    var cell = "";
    var inQuotes = false;
    for (var i = 0; i < source.length; i += 1) {
      var ch = source.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (source.charAt(i + 1) === '"') { cell += '"'; i += 1; }
          else { inQuotes = false; }
        } else {
          cell += ch;
        }
        continue;
      }
      if (ch === '"') { inQuotes = true; continue; }
      if (ch === ",") { row.push(cell); cell = ""; continue; }
      if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
      cell += ch;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    if (!rows.length) return [];
    var header = rows.shift().map(function (name) { return name.trim(); });
    return rows
      .filter(function (line) { return line.some(function (value) { return String(value || "").trim(); }); })
      .map(function (line) {
        var object = {};
        header.forEach(function (name, index) {
          if (!name) return;
          object[name] = line[index] === undefined ? "" : line[index];
        });
        return object;
      });
  }

  function exportJson() {
    var rows = exportRows();
    return {
      database: "EX LIBRIS · 馆藏 CMS",
      version: "2.0",
      generatedAt: new Date().toISOString(),
      fields: NOTION_FIELDS.slice(),
      total: rows.length,
      results: rows
    };
  }

  function importRows(raw, options) {
    var config = options || {};
    var rows = Array.isArray(raw) ? raw : [];
    var result = { created: 0, skipped: 0, sites: [] };
    var existingUrls = new Set(allSitesIncludingUncatalogued().map(function (site) {
      return normalizeUrl(site && site.url);
    }));
    rows.forEach(function (row) {
      var site = notionRowToSite(row);
      if (!site) { result.skipped += 1; return; }
      if (existingUrls.has(site.url) && !config.allowDuplicates) { result.skipped += 1; return; }
      if (!window.NavOverrides || typeof window.NavOverrides.addSite !== "function") {
        result.skipped += 1;
        return;
      }
      var created = window.NavOverrides.addSite(site);
      if (created) {
        existingUrls.add(site.url);
        result.created += 1;
        result.sites.push(created);
        if (window.NavLedger && typeof window.NavLedger.ensureFirstSeen === "function") {
          window.NavLedger.ensureFirstSeen(created.id, Date.now());
        }
      } else {
        result.skipped += 1;
      }
    });
    if (result.created) refreshArchive();
    return result;
  }

  function importText(text, format) {
    var raw = String(text || "").trim();
    if (!raw) return { created: 0, skipped: 0, sites: [] };
    var kind = format;
    if (!kind) kind = raw.charAt(0) === "{" || raw.charAt(0) === "[" ? "json" : "csv";
    if (kind === "json") {
      var parsed = JSON.parse(raw);
      var rows = Array.isArray(parsed) ? parsed : (parsed.results || parsed.rows || parsed.data || []);
      return importRows(rows);
    }
    return importRows(parseCsv(raw));
  }

  // ---------------------------------------------------------------------------
  // A6 · Cloudflare Worker 端点（可选）
  // ---------------------------------------------------------------------------
  function getEndpoint() {
    try {
      return String(window.localStorage.getItem(WORKER_STORAGE_KEY) || "");
    } catch (error) {
      return "";
    }
  }

  function setEndpoint(url) {
    var value = String(url || "").trim();
    try {
      if (value) window.localStorage.setItem(WORKER_STORAGE_KEY, value);
      else window.localStorage.removeItem(WORKER_STORAGE_KEY);
    } catch (error) {}
    renderFooter();
    return getEndpoint();
  }

  function pushToWorker() {
    var endpoint = getEndpoint();
    var payload = exportJson();
    if (!endpoint || !isHttpUrl(endpoint)) {
      state.lastSync = { at: Date.now(), ok: false, mode: "local", message: "未配置 Worker 端点 · 使用本地导出" };
      renderFooter();
      return Promise.resolve(state.lastSync);
    }
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, SYNC_TIMEOUT_MS);
    return fetch(endpoint, {
      method: "POST",
      signal: controller ? controller.signal : undefined,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (response) {
      clearTimeout(timer);
      if (!response.ok) throw new Error("HTTP " + response.status);
      state.lastSync = { at: Date.now(), ok: true, mode: "worker", message: "已推送 " + payload.total + " 条至 Worker" };
      renderFooter();
      return state.lastSync;
    }).catch(function () {
      clearTimeout(timer);
      state.lastSync = { at: Date.now(), ok: false, mode: "local", message: "Worker 不可达 · 已回落本地导出" };
      renderFooter();
      return state.lastSync;
    });
  }

  // ---------------------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------------------
  function download(filename, content, mime) {
    try {
      var blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
      return true;
    } catch (error) {
      return false;
    }
  }

  function renderConfirm() {
    var slot = document.getElementById("courier-confirm");
    if (!slot) return;
    var payload = state.pending;
    if (!payload) {
      slot.innerHTML = '<p class="courier-empty">暂无待确认的飞鸽来信。可用小书签从任意网页盖章传书。</p>';
      return;
    }
    slot.innerHTML = [
      '<article class="courier-letter" data-courier-letter="1">',
      '<header class="courier-letter-head">',
      '<span class="courier-kicker">INCOMING · 飞鸽来信</span>',
      '<span class="courier-letter-time">', escapeHtml(formatStamp(payload.at)), '</span>',
      '</header>',
      '<h3 class="courier-letter-title">', escapeHtml(payload.title || payload.url), '</h3>',
      '<p class="courier-letter-url">', escapeHtml(payload.url), '</p>',
      payload.why ? '<p class="courier-letter-why"><span>收录动机</span>' + escapeHtml(payload.why) + '</p>' : "",
      payload.selection ? '<blockquote class="courier-letter-quote">' + escapeHtml(payload.selection) + '</blockquote>' : "",
      '<div class="courier-letter-actions">',
      '<button type="button" class="courier-btn courier-btn--primary" data-courier-commit="uncatalogued">⌘ 存入待编目匣</button>',
      '<button type="button" class="courier-btn" data-courier-commit="catalogued">✦ 盖章入正式馆藏</button>',
      '<button type="button" class="courier-btn courier-btn--ghost" data-courier-discard="1">✕ 退回飞鸽</button>',
      '</div>',
      '</article>'
    ].join("");
  }

  function renderBookmarklet() {
    var slot = document.getElementById("courier-bookmarklet-slot");
    if (!slot) return;
    slot.innerHTML = bookmarkletHtml();
  }

  function renderFooter() {
    var status = document.getElementById("courier-status");
    if (!status) return;
    var endpoint = getEndpoint();
    var sync = state.lastSync;
    status.innerHTML = [
      '<span class="courier-status-item">',
      '<strong>Worker</strong> ',
      endpoint ? escapeHtml(endpoint) : "未配置 · 本地零损耗导出",
      '</span>',
      '<span class="courier-status-item">',
      '<strong>最近同步</strong> ',
      sync.at ? escapeHtml(formatStamp(sync.at) + " · " + sync.message) : "尚未同步",
      '</span>'
    ].join("");
    var endpointInput = document.getElementById("courier-endpoint");
    if (endpointInput && endpointInput.value !== endpoint) endpointInput.value = endpoint;
  }

  function renderStats() {
    var rows = exportRows();
    var el = document.getElementById("courier-stats");
    if (!el) return;
    el.textContent =
      "可导出 " + rows.length + " 卷 · " +
      "公开 " + rows.length + " · 私密 0 · " +
      "字段 " + NOTION_FIELDS.length + " 列";
  }

  function render() {
    renderConfirm();
    renderBookmarklet();
    renderStats();
    renderFooter();
  }

  // ---------------------------------------------------------------------------
  // 开合
  // ---------------------------------------------------------------------------
  function open(options) {
    var modal = document.getElementById("courier-modal");
    var backdrop = document.getElementById("courier-backdrop");
    if (!modal) return false;
    // Batch 2：同一弹窗两种模式 —— ingest（盖章入馆小书签 + 来信确认）/
    // sync（同步与备份：云同步 / Notion / 导出 三页签，页签由 js/hall.js 管理）。
    modal.setAttribute("data-courier-mode", options && options.mode === "sync" ? "sync" : "ingest");
    lastActiveElement = document.activeElement;
    state.open = true;
    render();
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add("courier-open");
    return true;
  }

  function close() {
    var modal = document.getElementById("courier-modal");
    var backdrop = document.getElementById("courier-backdrop");
    if (!modal) return false;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    if (backdrop) backdrop.hidden = true;
    state.open = false;
    document.body.classList.remove("courier-open");
    // 从馆务抽屉打开时，原触发按钮已随抽屉隐藏：焦点改回顶栏「馆务」按钮。
    var returnTo = lastActiveElement && lastActiveElement.offsetParent !== null
      ? lastActiveElement
      : document.getElementById("btn-hall-menu");
    if (returnTo && typeof returnTo.focus === "function") {
      returnTo.focus();
    }
    return true;
  }

  function isOpen() {
    return state.open;
  }

  function toggle() {
    return state.open ? close() : open();
  }

  function discard() {
    state.pending = null;
    renderConfirm();
    notify("已退回飞鸽", "来信已放回信袋", "✕");
  }

  // ---------------------------------------------------------------------------
  // 事件
  // ---------------------------------------------------------------------------
  function bindEvents() {
    if (bound) return;
    bound = true;

    var entry = document.getElementById("btn-courier-entry");
    var mobileEntry = document.getElementById("btn-courier-mobile");
    var closeBtn = document.getElementById("btn-close-courier");
    var dismissBtn = document.getElementById("btn-dismiss-courier");
    var backdrop = document.getElementById("courier-backdrop");
    var modal = document.getElementById("courier-modal");
    var copyBtn = document.getElementById("btn-courier-copy-bookmarklet");
    var csvBtn = document.getElementById("btn-courier-export-csv");
    var jsonBtn = document.getElementById("btn-courier-export-json");
    var importBtn = document.getElementById("btn-courier-import");
    var pushBtn = document.getElementById("btn-courier-push");
    var saveEndpointBtn = document.getElementById("btn-courier-save-endpoint");

    if (entry) entry.addEventListener("click", function (event) {
      event.preventDefault();
      toggle();
    });
    if (mobileEntry) mobileEntry.addEventListener("click", function (event) {
      event.preventDefault();
      open();
    });
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (dismissBtn) dismissBtn.addEventListener("click", close);
    if (backdrop) backdrop.addEventListener("click", close);

    if (copyBtn) {
      copyBtn.addEventListener("click", function (event) {
        event.preventDefault();
        copyBookmarklet();
      });
    }
    if (csvBtn) {
      csvBtn.addEventListener("click", function (event) {
        event.preventDefault();
        var csv = toCsv();
        state.lastExport = { at: Date.now(), kind: "csv", bytes: csv.length };
        download("mynav-notion-export.csv", csv, "text/csv;charset=utf-8");
        notify("Notion CSV 已导出", exportRows().length + " 卷 · " + NOTION_FIELDS.length + " 列字段", "📤");
        renderStats();
      });
    }
    if (jsonBtn) {
      jsonBtn.addEventListener("click", function (event) {
        event.preventDefault();
        var payload = exportJson();
        state.lastExport = { at: Date.now(), kind: "json", bytes: JSON.stringify(payload).length };
        download("mynav-notion-export.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
        notify("Notion JSON 已导出", payload.total + " 卷 · database v2.0", "📤");
        renderStats();
      });
    }
    if (importBtn) {
      importBtn.addEventListener("click", function (event) {
        event.preventDefault();
        var area = document.getElementById("courier-import-text");
        var text = area ? area.value : "";
        if (!text.trim()) {
          notify("尚无粘贴内容", "支持 Notion CSV 或 JSON 导出文件", "ℹ");
          return;
        }
        try {
          var result = importText(text);
          notify("导入完成", "新增 " + result.created + " 卷 · 跳过 " + result.skipped + " 卷", "📥");
          if (area) area.value = "";
          render();
        } catch (error) {
          notify("导入失败", String(error && error.message || error), "⚠");
        }
      });
    }
    if (pushBtn) {
      pushBtn.addEventListener("click", function (event) {
        event.preventDefault();
        pushToWorker().then(function (result) {
          notify(result.ok ? "已推送至 Notion 桥" : "已回落本地导出", result.message, result.ok ? "☁" : "🧷");
        });
      });
    }
    if (saveEndpointBtn) {
      saveEndpointBtn.addEventListener("click", function (event) {
        event.preventDefault();
        var input = document.getElementById("courier-endpoint");
        var saved = setEndpoint(input ? input.value : "");
        notify(saved ? "Worker 端点已保存" : "已清空 Worker 端点", saved || "改用本地导出", "🧷");
      });
    }

    if (modal) {
      modal.addEventListener("click", function (event) {
        var commit = event.target.closest("[data-courier-commit]");
        if (commit) {
          event.preventDefault();
          commitIngest(commit.getAttribute("data-courier-commit"));
          return;
        }
        if (event.target.closest("[data-courier-discard]")) {
          event.preventDefault();
          discard();
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.open) {
        event.preventDefault();
        close();
      }
    });
  }

  function init() {
    bindEvents();
    render();
    // URL 参数自动接收：?ingest=1&url=...&title=...&why=...
    setTimeout(function () {
      if (parseIngestParams()) ingestFromParams();
    }, 120);
    if (window.NavApp && !window.NavApp.Courier) {
      window.NavApp.Courier = api;
    }
    return api;
  }

  function getState() {
    return {
      open: state.open,
      pending: state.pending,
      pendingCount: state.pending ? 1 : 0,
      endpoint: getEndpoint(),
      lastSync: Object.assign({}, state.lastSync),
      lastExport: state.lastExport,
      bookmarklet: buildBookmarklet(),
      fields: NOTION_FIELDS.slice(),
      exportable: exportRows().length,
      pendingIcon: state.pending ? state.pending.icon || "" : ""
    };
  }

  // Deterministic hooks for the real-browser acceptance run.
  function ingestForTest(payload) {
    if (!payload || !isHttpUrl(payload.url)) return false;
    return ingestFromParams({
      payload: {
        ingest: true,
        url: payload.url,
        title: payload.title || "",
        why: payload.why || "",
        selection: payload.selection || "",
        icon: safeIngestIcon(payload.icon || ""),
        category: payload.category || "tools",
        mode: payload.mode === "catalogued" ? "catalogued" : "uncatalogued",
        at: Date.now()
      },
      clean: false
    });
  }

  var api = {
    init,
    open,
    close,
    toggle,
    isOpen,
    ingestFromParams,
    ingestForTest,
    parseIngestParams,
    cleanIngestParams,
    commitIngest,
    discard,
    buildBookmarklet,
    bookmarkletHtml,
    copyBookmarklet,
    exportRows,
    exportJson,
    toCsv,
    parseCsv,
    importText,
    importRows,
    siteToNotionRow,
    notionRowToSite,
    getEndpoint,
    setEndpoint,
    pushToWorker,
    render,
    getState,
    NOTION_FIELDS,
    SYNC_TIMEOUT_MS
  };

  return api;
});
