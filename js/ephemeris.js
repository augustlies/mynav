/**
 * Module: C2 — 观星简报台 · Daily Ephemeris
 *
 * 古典双栏铅字《观星台晨报》。三条信源通道：
 *   1. 内置确定性司天监晨间星历简报（12 条，离线可读，零网络依赖）
 *   2. 可配置外部 JSON / RSS 聚合源（AbortController 2000ms 超时，失败静默回落内置）
 *   3. 一键捕获闭环：每条简报可 [ ✦ 收入待编目匣 ]，直接调用 NavApp.Uncatalogued
 *
 * 与 Phase 4A 的关系：本模块只读不写，绝不触碰卡片画布渲染；
 * 初始化经 app.js 的 safeInit 注册，任何异常都不会中断主画布。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavEphemeris = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FETCH_TIMEOUT_MS = 2000;
  var STORAGE_KEY = "MYNAV_EPHEMERIS_SOURCES";

  var COLUMNS = [
    { id: "ai", label: "AI 思考", code: "COLUMN I · AI CONTEMPLATION" },
    { id: "workshop", label: "工程工坊", code: "COLUMN II · ENGINEERING ATELIER" },
    { id: "study", label: "深度研习", code: "COLUMN III · DEEP STUDY" }
  ];

  /**
   * 12 条确定性晨报。日期偏移以「刊期基准日」为锚，逐日轮转，
   * 因此同一台机器同一天永远读到同一份报纸（可复现、可断言）。
   */
  var BULLETINS = [
    {
      id: "eph-01",
      column: "ai",
      kicker: "前沿观测",
      title: "推理模型的「思考预算」正在取代参数量成为新标尺",
      summary: "多家实验室开始公开推理时延与思维链长度曲线。选型时先问「一次回答愿意等几秒」，再谈模型大小。",
      source: "arXiv · cs.CL",
      url: "https://arxiv.org/list/cs.CL/recent",
      tags: ["推理", "基准", "选型"]
    },
    {
      id: "eph-02",
      column: "ai",
      kicker: "工程实务",
      title: "小模型 + 好提示词，正在吃掉一半的轻量级 Agent 需求",
      summary: "把工具调用 schema 收紧、失败重试做对，7B 级别的本地模型已能稳定跑通表单填报与信息抽取。",
      source: "Hacker News",
      url: "https://news.ycombinator.com/",
      tags: ["小模型", "agent", "本地部署"]
    },
    {
      id: "eph-03",
      column: "ai",
      kicker: "数字古籍",
      title: "古籍 OCR 的下一步：版面分析先行，字符识别其次",
      summary: "双栏竖排与批注夹注是识别率杀手。先做栏线检测与阅读顺序还原，整体准确率提升远大于换更大的识别模型。",
      source: "中国哲学书电子化计划",
      url: "https://ctext.org/",
      tags: ["ocr", "古籍", "版面分析"]
    },
    {
      id: "eph-04",
      column: "ai",
      kicker: "极客工具",
      title: "把 Embedding 缓存进本地 SQLite，是最便宜的一次提速",
      summary: "RAG 检索里最贵的往往不是生成而是重复向量化。按内容哈希做一层本地缓存，冷启动成本立刻减半。",
      source: "Simon Willison's Weblog",
      url: "https://simonwillison.net/",
      tags: ["rag", "缓存", "sqlite"]
    },
    {
      id: "eph-05",
      column: "workshop",
      kicker: "开源工坊",
      title: "View Transitions 已可跨文档使用，页面转场不再需要框架",
      summary: "原生跨文档转场配合 @view-transition 即可获得连贯的页面切换。迁移动画库之前，先量一量它到底占了多少帧。",
      source: "Chrome for Developers",
      url: "https://developer.chrome.com/",
      tags: ["css", "view-transitions", "性能"]
    },
    {
      id: "eph-06",
      column: "workshop",
      kicker: "工程规范",
      title: "Container Queries 之后，媒体查询只该负责「整页级」决策",
      summary: "组件宽度由容器决定，页面栅格由视口决定。把两者混写，是响应式样式失控最常见的源头。",
      source: "MDN Web Docs",
      url: "https://developer.mozilla.org/",
      tags: ["css", "container-queries", "响应式"]
    },
    {
      id: "eph-07",
      column: "workshop",
      kicker: "工具链",
      title: "本地优先（Local-first）应用的同步难题，答案常在冲突合并策略",
      summary: "CRDT 不是银弹。先定义「什么算同一条记录」，再选合并算法；否则同步层写得多漂亮都救不回来。",
      source: "Ink & Switch",
      url: "https://www.inkandswitch.com/",
      tags: ["local-first", "同步", "crdt"]
    },
    {
      id: "eph-08",
      column: "workshop",
      kicker: "运维备忘",
      title: "Edge Function 的冷启动，多半死在依赖体积而不是运行时",
      summary: "把 SDK 换成 fetch，把校验换成 Web Crypto，冷启动常能从 400ms 压到 30ms 以内。",
      source: "Cloudflare Blog",
      url: "https://blog.cloudflare.com/",
      tags: ["edge", "冷启动", "serverless"]
    },
    {
      id: "eph-09",
      column: "study",
      kicker: "深度研习",
      title: "读代码的效率，取决于你能否先画出它的「数据流草图」",
      summary: "进入陌生仓库时，先找入口与持久化边界，再补中间。顺序反了，读三天也只是记住了一堆函数名。",
      source: "The Pragmatic Engineer",
      url: "https://blog.pragmaticengineer.com/",
      tags: ["阅读源码", "方法论"]
    },
    {
      id: "eph-10",
      column: "study",
      kicker: "数字人文",
      title: "版本比对（Collation）的自动化，先解决「对齐」再谈「差异」",
      summary: "异文校勘的核心难点是段落重排而非字词替换。先把章节锚点对齐，diff 结果才具备学术可用性。",
      source: "Digital Humanities Quarterly",
      url: "http://www.digitalhumanities.org/dhq/",
      tags: ["数字人文", "校勘", "diff"]
    },
    {
      id: "eph-11",
      column: "study",
      kicker: "长期主义",
      title: "个人知识库的复利，来自「重读」而不是「多存」",
      summary: "每周固定翻一次三个月前的收藏，比每天新存十条更能改变判断力。收藏馆的价值在回访率。",
      source: "馆长批注",
      url: "https://en.wikipedia.org/wiki/Commonplace_book",
      tags: ["知识管理", "复利", "回访"]
    },
    {
      id: "eph-12",
      column: "study",
      kicker: "极客工具",
      title: "用 SQLite 做全文检索，比想象中更适合个人规模的数据",
      summary: "FTS5 配合 trigram 分词，几万条笔记的检索延迟仍在个位数毫秒，且整个库就是一个可备份的文件。",
      source: "SQLite Documentation",
      url: "https://www.sqlite.org/fts5.html",
      tags: ["sqlite", "fts5", "检索"]
    }
  ];

  var state = {
    open: false,
    column: "all",
    sources: [],
    sourceStatus: "builtin",
    sourceNote: "内置确定性星历简报",
    lastFetchedAt: 0,
    captured: {},
    items: []
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
      window.NavShortcuts.showToast(title, subtitle || "", icon || "🗞️");
    }
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function todayKey(date) {
    var d = date || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function editionNumber(date) {
    // 以 2026-01-01 为第一卷刊期基准，逐日累加，保证同日恒定。
    var base = Date.UTC(2026, 0, 1);
    var d = date || new Date();
    var now = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.max(1, Math.floor((now - base) / 86400000) + 1);
  }

  function issueDateText(date) {
    var d = date || new Date();
    var weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    return d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日 · " + weekdays[d.getDay()];
  }

  // ---------------------------------------------------------------------------
  // 自定义信源（JSON / RSS）
  // ---------------------------------------------------------------------------
  function readSources() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(function (item) {
          if (typeof item === "string") return { url: item, kind: "auto" };
          if (item && typeof item.url === "string") {
            return { url: item.url, kind: item.kind === "rss" ? "rss" : "json" };
          }
          return null;
        })
        .filter(Boolean)
        .slice(0, 5);
    } catch (error) {
      return [];
    }
  }

  function writeSources(list) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list || []));
    } catch (error) {}
    state.sources = readSources();
    return state.sources;
  }

  function stripTags(value) {
    return String(value || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  }

  function pickColumn(text) {
    var value = String(text || "").toLowerCase();
    if (/ai|模型|llm|提示|agent|推理/.test(value)) return "ai";
    if (/工程|dev|code|开源|css|js|部署|运维/.test(value)) return "workshop";
    return "study";
  }

  function parseJsonFeed(text) {
    var data = JSON.parse(text);
    var list = Array.isArray(data) ? data : (data.items || data.articles || data.data || []);
    if (!Array.isArray(list)) return [];
    return list.slice(0, 12).map(function (item, index) {
      var title = item.title || item.name || item.headline || "未命名简报";
      return {
        id: "feed-" + index,
        column: item.column && /^(ai|workshop|study)$/.test(item.column)
          ? item.column
          : pickColumn(item.category || title),
        kicker: item.kicker || item.category || "外部信源",
        title: stripTags(title),
        summary: stripTags(item.summary || item.description || item.excerpt || ""),
        source: stripTags(item.source || "外部聚合"),
        url: /^https?:\/\//i.test(item.url || item.link || "") ? (item.url || item.link) : "",
        tags: Array.isArray(item.tags) ? item.tags.slice(0, 4).map(String) : []
      };
    });
  }

  function parseRssFeed(text) {
    var doc = null;
    try {
      doc = new DOMParser().parseFromString(text, "text/xml");
    } catch (error) {
      return [];
    }
    if (!doc) return [];
    var nodes = Array.prototype.slice.call(doc.querySelectorAll("item, entry")).slice(0, 12);
    return nodes.map(function (node, index) {
      var pick = function (tag) {
        var el = node.querySelector(tag);
        return el ? el.textContent : "";
      };
      var linkNode = node.querySelector("link");
      var href = linkNode ? (linkNode.getAttribute("href") || linkNode.textContent) : "";
      var title = pick("title") || "未命名简报";
      return {
        id: "rss-" + index,
        column: pickColumn(title + " " + pick("category")),
        kicker: stripTags(pick("category")) || "RSS 信源",
        title: stripTags(title),
        summary: stripTags(pick("description") || pick("summary") || pick("content")),
        source: stripTags(pick("author") || "RSS 聚合"),
        url: /^https?:\/\//i.test(href || "") ? href : "",
        tags: []
      };
    });
  }

  /**
   * 带 2000ms AbortController 的聚合抓取。任何失败都静默回落内置简报，
   * 绝不抛出、绝不阻塞 UI。
   */
  function fetchRemote(sources) {
    if (!sources.length || typeof fetch !== "function") {
      return Promise.resolve({ ok: false, items: [], note: "内置确定性星历简报" });
    }
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, FETCH_TIMEOUT_MS);

    return fetch(sources[0].url, {
      signal: controller ? controller.signal : undefined,
      headers: { Accept: "application/json, application/rss+xml, text/xml, */*" }
    })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.text();
      })
      .then(function (text) {
        var kind = sources[0].kind;
        var items = [];
        if (kind === "rss") {
          items = parseRssFeed(text);
        } else if (kind === "json") {
          items = parseJsonFeed(text);
        } else {
          items = /^\s*</.test(text) ? parseRssFeed(text) : parseJsonFeed(text);
          if (!items.length && /^\s*</.test(text)) items = parseRssFeed(text);
        }
        if (!items.length) throw new Error("empty feed");
        return { ok: true, items: items, note: "外部聚合信源 · " + sources[0].url };
      })
      .catch(function () {
        return { ok: false, items: [], note: "外部信源不可达 · 已回落内置星历" };
      })
      .then(function (result) {
        clearTimeout(timer);
        return result;
      });
  }

  // ---------------------------------------------------------------------------
  // 条目渲染
  // ---------------------------------------------------------------------------
  function getItems() {
    return state.items.length ? state.items : BULLETINS.slice();
  }

  function isCaptured(itemId) {
    if (state.captured[itemId]) return true;
    // 以 URL 判重，避免刷新后按钮回退成未封存状态。
    var item = getItems().filter(function (entry) { return entry.id === itemId; })[0];
    if (!item || !window.NavUncatalogued || typeof window.NavUncatalogued.getAll !== "function") return false;
    var existing = window.NavUncatalogued.getAll().filter(function (site) {
      return site && String(site.url || "").trim() === String(item.url || "").trim();
    })[0];
    return Boolean(existing);
  }

  function capturedLabel(itemId) {
    var applied = state.captured[itemId];
    if (applied && applied.tmpNumber) return "✓ 已封存 " + applied.tmpNumber;
    var item = getItems().filter(function (entry) { return entry.id === itemId; })[0];
    if (item && window.NavUncatalogued && typeof window.NavUncatalogued.getAll === "function") {
      var existing = window.NavUncatalogued.getAll().filter(function (site) {
        return site && String(site.url || "").trim() === String(item.url || "").trim();
      })[0];
      if (existing) {
        var number = typeof window.NavUncatalogued.getTmpNumber === "function"
          ? window.NavUncatalogued.getTmpNumber(existing)
          : "";
        return "✓ 已封存 " + (number || "");
      }
    }
    return "";
  }

  function renderItem(item) {
    var captured = isCaptured(item.id);
    var label = captured ? (capturedLabel(item.id) || "✓ 已封存") : "✦ 收入待编目匣";
    return [
      '<article class="ephemeris-bulletin', captured ? " is-captured" : "", '" data-ephemeris-id="', escapeHtml(item.id), '">',
      '<header class="ephemeris-bulletin-head">',
      '<span class="ephemeris-kicker">', escapeHtml(item.kicker || "星历简报"), '</span>',
      '<span class="ephemeris-source">', escapeHtml(item.source || "司天监"), '</span>',
      '</header>',
      '<h3 class="ephemeris-bulletin-title">', escapeHtml(item.title), '</h3>',
      '<p class="ephemeris-bulletin-summary">', escapeHtml(item.summary || ""), '</p>',
      item.tags && item.tags.length
        ? '<div class="ephemeris-bulletin-tags">' + item.tags.map(function (tag) {
          return '<span>#' + escapeHtml(tag) + '</span>';
        }).join("") + '</div>'
        : "",
      '<footer class="ephemeris-bulletin-foot">',
      item.url
        ? '<a class="ephemeris-source-link" href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer">原文 ↗</a>'
        : '<span class="ephemeris-source-link is-muted">馆内刊载</span>',
      '<button type="button" class="ephemeris-capture', captured ? " is-captured" : "", '"',
      ' data-ephemeris-capture="', escapeHtml(item.id), '"',
      captured ? ' disabled aria-disabled="true"' : '',
      '>', escapeHtml(label), '</button>',
      '</footer>',
      '</article>'
    ].join("");
  }

  function renderBody() {
    var body = document.getElementById("ephemeris-body");
    if (!body) return;
    var items = getItems();
    var columns = state.column === "all"
      ? COLUMNS
      : COLUMNS.filter(function (column) { return column.id === state.column; });

    body.innerHTML = columns.map(function (column) {
      var columnItems = items.filter(function (item) { return item.column === column.id; });
      return [
        '<section class="ephemeris-column" data-ephemeris-column="', column.id, '">',
        '<header class="ephemeris-column-head">',
        '<span class="ephemeris-column-code">', escapeHtml(column.code), '</span>',
        '<h2>', escapeHtml(column.label), '</h2>',
        '<span class="ephemeris-column-count">', String(columnItems.length).padStart(2, "0"), ' 则</span>',
        '</header>',
        '<div class="ephemeris-column-rule" aria-hidden="true"></div>',
        columnItems.length
          ? columnItems.map(renderItem).join("")
          : '<p class="ephemeris-column-empty">此栏今日无新刊。</p>',
        '</section>'
      ].join("");
    }).join("");

    var start = items.length ? 1 : 0;
    var numberEl = document.getElementById("ephemeris-total");
    if (numberEl) numberEl.textContent = String(items.length).padStart(2, "0");
    var rangeEl = document.getElementById("ephemeris-range");
    if (rangeEl) rangeEl.textContent = start + "–" + items.length;
  }

  function renderMasthead() {
    var dateEl = document.getElementById("ephemeris-date");
    if (dateEl) dateEl.textContent = issueDateText();
    var volEl = document.getElementById("ephemeris-volume");
    if (volEl) volEl.textContent = "VOL. 2026 · 第 " + String(editionNumber()).padStart(3, "0") + " 期";
    var statusEl = document.getElementById("ephemeris-source-status");
    if (statusEl) {
      statusEl.textContent = state.sourceStatus === "remote"
        ? "外部信源 · " + state.sourceNote
        : state.sourceStatus === "fallback"
          ? "外部信源不可达 · 已回落内置星历"
          : "内置确定性星历 · 离线可读";
    }
    var stampEl = document.getElementById("ephemeris-stamp");
    if (stampEl) {
      stampEl.textContent = todayKey();
    }
  }

  function syncColumnButtons() {
    Array.prototype.slice.call(document.querySelectorAll("[data-ephemeris-column-btn]")).forEach(function (button) {
      var active = button.getAttribute("data-ephemeris-column-btn") === state.column;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function syncCaptureButtons() {
    Array.prototype.slice.call(document.querySelectorAll("[data-ephemeris-capture]")).forEach(function (button) {
      var itemId = button.getAttribute("data-ephemeris-capture");
      var captured = isCaptured(itemId);
      var label = captured ? (capturedLabel(itemId) || "✓ 已封存") : "✦ 收入待编目匣";
      button.textContent = label;
      button.classList.toggle("is-captured", captured);
      if (captured) {
        button.setAttribute("disabled", "disabled");
        button.setAttribute("aria-disabled", "true");
      } else {
        button.removeAttribute("disabled");
        button.removeAttribute("aria-disabled");
      }
    });
  }

  function render() {
    renderMasthead();
    renderBody();
    syncColumnButtons();
  }

  // ---------------------------------------------------------------------------
  // 一键捕获闭环（联动 B 待编目匣）
  // ---------------------------------------------------------------------------
  function capture(itemId) {
    var item = getItems().filter(function (entry) { return entry.id === itemId; })[0];
    if (!item) return null;
    if (isCaptured(itemId)) {
      var existingLabel = capturedLabel(itemId);
      notify("此卷已在暗星带", existingLabel || "无需重复封存", "✓");
      return { duplicate: true };
    }
    if (!window.NavOverrides || typeof window.NavOverrides.addSite !== "function") {
      notify("待编目匣不可用", "账本模块尚未就绪", "⚠");
      return null;
    }
    // 收录动机自动填入该条简报摘要，满足「为什么现在收下它」的唯一线索。
    var whySaved = "《观星台晨报》" + (item.kicker || "星历简报") + "：" + item.summary;
    var site = window.NavOverrides.addSite({
      name: item.title,
      url: item.url || (window.location.origin + window.location.pathname + "#ephemeris-" + item.id),
      description: item.summary,
      whySaved: whySaved,
      category: item.column === "workshop" ? "dev" : (item.column === "ai" ? "ai" : "knowledge"),
      tags: (item.tags || []).concat(["晨报", "ephemeris"]),
      status: "uncatalogued",
      visibility: "public",
      createdAt: Date.now()
    });
    var tmpNumber = site && window.NavUncatalogued && typeof window.NavUncatalogued.getTmpNumber === "function"
      ? window.NavUncatalogued.getTmpNumber(site)
      : (site ? "TMP" : "");
    state.captured[itemId] = { at: Date.now(), siteId: site ? site.id : "", tmpNumber: tmpNumber };
    if (site && window.NavLedger && typeof window.NavLedger.ensureFirstSeen === "function") {
      window.NavLedger.ensureFirstSeen(site.id, Date.now());
    }
    if (window.NavUncatalogued && typeof window.NavUncatalogued.renderDrawer === "function") {
      window.NavUncatalogued.renderDrawer();
    }
    if (window.NavApp && typeof window.NavApp.updateBadges === "function") {
      window.NavApp.updateBadges();
    }
    syncCaptureButtons();
    notify("已封存至待编目匣", item.title + " · " + tmpNumber, "✦");
    return { site: site, tmpNumber: tmpNumber, whySaved: whySaved };
  }

  // ---------------------------------------------------------------------------
  // 开合
  // ---------------------------------------------------------------------------
  function open() {
    var backdrop = document.getElementById("ephemeris-backdrop");
    var modal = document.getElementById("ephemeris-modal");
    if (!backdrop || !modal) return false;
    lastActiveElement = document.activeElement;
    render();
    backdrop.hidden = false;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    state.open = true;
    document.body.classList.add("ephemeris-open");
    var closeBtn = document.getElementById("btn-close-ephemeris");
    if (closeBtn) setTimeout(function () { closeBtn.focus(); }, 60);
    if (!state.lastFetchedAt) loadSources();
    return true;
  }

  function close() {
    var backdrop = document.getElementById("ephemeris-backdrop");
    var modal = document.getElementById("ephemeris-modal");
    if (!modal) return false;
    if (backdrop) backdrop.hidden = true;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    state.open = false;
    document.body.classList.remove("ephemeris-open");
    if (lastActiveElement && typeof lastActiveElement.focus === "function") {
      lastActiveElement.focus();
    }
    return true;
  }

  function isOpen() {
    return state.open;
  }

  function toggle() {
    return state.open ? close() : open();
  }

  function setColumn(columnId) {
    state.column = /^(ai|workshop|study)$/.test(columnId) ? columnId : "all";
    renderBody();
    syncColumnButtons();
    return state.column;
  }

  // ---------------------------------------------------------------------------
  // 信源装载
  // ---------------------------------------------------------------------------
  function loadSources() {
    state.sources = readSources();
    state.lastFetchedAt = Date.now();
    if (!state.sources.length) {
      state.items = BULLETINS.slice();
      state.sourceStatus = "builtin";
      state.sourceNote = "内置确定性星历简报";
      render();
      return Promise.resolve({ ok: true, source: "builtin", count: state.items.length });
    }
    renderMasthead();
    return fetchRemote(state.sources).then(function (result) {
      if (result.ok && result.items.length) {
        state.items = result.items;
        state.sourceStatus = "remote";
        state.sourceNote = result.note;
      } else {
        state.items = BULLETINS.slice();
        state.sourceStatus = "fallback";
        state.sourceNote = result.note;
      }
      render();
      return { ok: result.ok, source: state.sourceStatus, count: state.items.length };
    });
  }

  function setSources(list) {
    writeSources(list);
    state.lastFetchedAt = 0;
    return loadSources();
  }

  // ---------------------------------------------------------------------------
  // 事件
  // ---------------------------------------------------------------------------
  function bindEvents() {
    if (bound) return;
    bound = true;

    var entry = document.getElementById("btn-ephemeris-entry");
    var mobileEntry = document.getElementById("btn-ephemeris-mobile");
    var closeBtn = document.getElementById("btn-close-ephemeris");
    var dismissBtn = document.getElementById("btn-dismiss-ephemeris");
    var backdrop = document.getElementById("ephemeris-backdrop");
    var modal = document.getElementById("ephemeris-modal");

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

    if (modal) {
      modal.addEventListener("click", function (event) {
        var columnBtn = event.target.closest("[data-ephemeris-column-btn]");
        if (columnBtn) {
          event.preventDefault();
          setColumn(columnBtn.getAttribute("data-ephemeris-column-btn"));
          return;
        }
        var captureBtn = event.target.closest("[data-ephemeris-capture]");
        if (captureBtn) {
          event.preventDefault();
          event.stopPropagation();
          capture(captureBtn.getAttribute("data-ephemeris-capture"));
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      var target = event.target;
      var tag = target && target.tagName ? target.tagName.toLowerCase() : "";
      var inEditable = tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
      if (event.key === "m" || event.key === "M") {
        if (inEditable) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (document.getElementById("shortcuts-modal") &&
          document.getElementById("shortcuts-modal").style.display !== "none") return;
        event.preventDefault();
        toggle();
        return;
      }
      if (event.key === "Escape" && state.open) {
        event.preventDefault();
        close();
      }
    });
  }

  function init() {
    bindEvents();
    state.sources = readSources();
    state.items = BULLETINS.slice();
    render();
    if (window.NavApp && !window.NavApp.Ephemeris) {
      window.NavApp.Ephemeris = api;
    }
    return api;
  }

  function getState() {
    return {
      open: state.open,
      column: state.column,
      items: getItems().slice(),
      bulletins: BULLETINS.length,
      sourceStatus: state.sourceStatus,
      sourceNote: state.sourceNote,
      sources: state.sources.slice(),
      captured: Object.assign({}, state.captured),
      edition: editionNumber(),
      date: issueDateText()
    };
  }

  var api = {
    init,
    open,
    close,
    toggle,
    isOpen,
    render,
    renderBody,
    setColumn,
    capture,
    loadSources,
    setSources,
    getSources: readSources,
    getItems,
    getState,
    issueDateText,
    editionNumber,
    BULLETINS,
    COLUMNS,
    FETCH_TIMEOUT_MS,
    STORAGE_KEY
  };

  return api;
});
