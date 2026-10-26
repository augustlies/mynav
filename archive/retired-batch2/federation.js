/**
 * Module: D7 — 馆际互借 · 联邦星图寻星镜
 *
 * · 生成标准公开馆藏清单 public-collection.json：
 *     馆名、卷号、恒星时签名 + 全部 visibility === "public" 的公开卡片。
 *     暗月私密卷宗（visibility === "shadow"）在生成、导出、下载三条通道
 *     上都会被硬过滤，绝不外泄。
 * · 「邻近星系 · 寻星镜」面板：2 个内置邻馆节点（确定性沙盒数据），
 *     也支持填写任意 /public-collection.json 地址（2000ms AbortController，
 *     失败静默回落内置沙盒）。
 * · 浏览友馆藏书 → [ ✦ 拓印入馆 ] → 抄入本地待编目匣，自动标记
 *     「拓印自：星系 α」来源。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavFederation = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MANIFEST_URL = "public-collection.json";
  var FETCH_TIMEOUT_MS = 2000;
  var MANIFEST_VERSION = "2.0";
  var LIBRARY_NAME = "EX LIBRIS · 个人数字收藏馆";
  var VOLUME = "VOL. 2026";

  /**
   * 邻馆节点的确定性沙盒数据。字段与 public-collection.json 完全一致，
   * 因此同一套渲染与抄录逻辑可以同时消化内置节点与真实拉取结果。
   */
  var NEIGHBORS = [
    {
      id: "alpha",
      name: "星系 α · 极客工坊典藏",
      code: "FEDERATION NODE α",
      motto: "工具即手艺 · TOOLS AS CRAFT",
      curator: "工坊主 · The Tinkerer",
      signature: "LST 22h 41m 08s",
      items: [
        {
          id: "alpha-01",
          title: "Portainer",
          url: "https://www.portainer.io/",
          category: "dev",
          description: "轻量容器管理面板，单条 docker run 即可接管本地所有容器。",
          tags: ["docker", "运维", "面板"],
          callsign: "α-01"
        },
        {
          id: "alpha-02",
          title: "Carbon",
          url: "https://carbon.now.sh/",
          category: "tools",
          description: "把代码片段渲染成优雅的图片，写技术文章配图首选。",
          tags: ["代码", "配图", "分享"],
          callsign: "α-02"
        },
        {
          id: "alpha-03",
          title: "Explainshell",
          url: "https://explainshell.com/",
          category: "dev",
          description: "逐段拆解 shell 命令含义，读长参数命令时最省事的工具。",
          tags: ["shell", "命令行", "查手册"],
          callsign: "α-03"
        },
        {
          id: "alpha-04",
          title: "Crontab.guru",
          url: "https://crontab.guru/",
          category: "dev",
          description: "把 cron 表达式翻译成英文短句，定时任务调试必备。",
          tags: ["cron", "定时任务"],
          callsign: "α-04"
        },
        {
          id: "alpha-05",
          title: "Regex101",
          url: "https://regex101.com/",
          category: "dev",
          description: "带解释与测试用例的正则调试器，支持多语言引擎差异对照。",
          tags: ["正则", "调试"],
          callsign: "α-05"
        },
        {
          id: "alpha-06",
          title: "JSON Crack",
          url: "https://jsoncrack.com/",
          category: "tools",
          description: "把 JSON 直接展开成可交互节点图，快速看清嵌套结构。",
          tags: ["json", "可视化"],
          callsign: "α-06"
        }
      ]
    },
    {
      id: "beta",
      name: "星系 β · 数字人文与古籍馆",
      code: "FEDERATION NODE β",
      motto: "文本即星图 · TEXTS AS CONSTELLATIONS",
      curator: "馆正 · The Philologist",
      signature: "LST 03h 18m 55s",
      items: [
        {
          id: "beta-01",
          title: "中国哲学书电子化计划",
          url: "https://ctext.org/",
          category: "knowledge",
          description: "先秦至民国的古籍全文库，支持繁简对照与原文检索。",
          tags: ["古籍", "全文检索", "汉典"],
          callsign: "β-01"
        },
        {
          id: "beta-02",
          title: "Wikisource",
          url: "https://zh.wikisource.org/",
          category: "knowledge",
          description: "自由的文本图书馆，公版典籍与文献的协作校对版本。",
          tags: ["公版", "文本库", "校对"],
          callsign: "β-02"
        },
        {
          id: "beta-03",
          title: "Internet Archive",
          url: "https://archive.org/",
          category: "knowledge",
          description: "非营利数字图书馆，含 Wayback Machine 与海量扫描本。",
          tags: ["archive", "镜像", "扫描本"],
          callsign: "β-03"
        },
        {
          id: "beta-04",
          title: "Gallica",
          url: "https://gallica.bnf.fr/",
          category: "knowledge",
          description: "法国国家图书馆数字馆藏，中世纪手抄本以 IIIF 高清公开。",
          tags: ["手抄本", "iiif", "欧洲"],
          callsign: "β-04"
        },
        {
          id: "beta-05",
          title: "Open Library",
          url: "https://openlibrary.org/",
          category: "knowledge",
          description: "按 ISBN 组织书目元数据的开放图书馆，借阅与目录 API 齐备。",
          tags: ["书目", "元数据", "api"],
          callsign: "β-05"
        },
        {
          id: "beta-06",
          title: "中文 Wikisource · 四库全书目录",
          url: "https://zh.wikisource.org/wiki/%E5%9B%9B%E5%BA%AB%E5%85%A8%E6%9B%B8",
          category: "knowledge",
          description: "四库全书总目提要的可检索索引，适合做版本源流考证。",
          tags: ["四库", "目录学", "考证"],
          callsign: "β-06"
        }
      ]
    }
  ];

  var state = {
    open: false,
    activeNodeId: "local",
    nodes: [],
    remoteManifest: null,
    lineage: {},
    lastFetch: { at: 0, ok: false, message: "尚未拉取" }
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
      window.NavShortcuts.showToast(title, subtitle || "", icon || "🔭");
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

  /** FNV-1a 32-bit：与 Phase 4A 遥测同一套确定性散列。 */
  function hashString(value) {
    var text = String(value || "");
    var hash = 0x811c9dc5;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  /** 恒星时签名：与左栏书脊同一口径的确定性戳记。 */
  function siderealSignature(seed) {
    var base = hashString(seed || "mynav");
    var hours = base % 24;
    var minutes = (base >>> 5) % 60;
    var seconds = (base >>> 11) % 60;
    return "LST " + pad(hours) + "h " + pad(minutes) + "m " + pad(seconds) + "s";
  }

  // ---------------------------------------------------------------------------
  // 公开馆藏清单
  // ---------------------------------------------------------------------------
  function publicSites() {
    var all = window.NavApp && typeof window.NavApp.getAllSites === "function"
      ? window.NavApp.getAllSites()
      : (window.NavOverrides && typeof window.NavOverrides.getSites === "function"
        ? window.NavOverrides.getSites()
        : (window.NAV_DATA && Array.isArray(window.NAV_DATA.sites) ? window.NAV_DATA.sites : []));
    return all.filter(function (site) {
      if (!site || !site.url) return false;
      // 隐私红线：暗月私密卷宗与待编目草稿绝不进入联邦星图。
      if (site.visibility === "shadow") return false;
      if (site.status && site.status !== "catalogued") return false;
      return true;
    });
  }

  function buildPublicManifest(options) {
    var config = options || {};
    var sites = publicSites();
    var entries = sites.map(function (site, index) {
      return {
        id: site.id,
        callNumber: String(index + 1).padStart(2, "0"),
        title: site.name || site.title || site.id,
        url: site.url,
        category: site.category || "",
        description: site.description || site.desc || "",
        tags: Array.isArray(site.tags) ? site.tags.slice() : [],
        whySaved: site.whySaved || ""
      };
    });
    var signatureSeed = entries.map(function (entry) { return entry.id + "|" + entry.url; }).join("~");
    return {
      schema: "mynav.public-collection",
      version: MANIFEST_VERSION,
      library: {
        name: LIBRARY_NAME,
        volume: VOLUME,
        curator: "馆主 · The Archivist",
        motto: "EX LIBRIS · 以星图为目录，以拓片为备份"
      },
      printedAt: config.printedAt || new Date().toISOString(),
      siderealSignature: config.signature || siderealSignature(signatureSeed),
      signatureHash: hashString(signatureSeed).toString(16).padStart(8, "0"),
      visibilityPolicy: "public-only",
      total: entries.length,
      shadowExcluded: 0,
      entries: entries
    };
  }

  /** 自检：任何 shadow 卡片混入清单都会返回 false 并列出来源。 */
  function auditManifest(manifest) {
    var raw = manifest || buildPublicManifest();
    var entries = Array.isArray(raw.entries) ? raw.entries : [];
    var all = window.NavOverrides && typeof window.NavOverrides.getAllIncludingUncatalogued === "function"
      ? window.NavOverrides.getAllIncludingUncatalogued(true)
      : [];
    // 暗月卷宗可能只存在于 NavSanctum 的内置名录里（尚未写进本地账本），
    // 因此三路合并：本地账本 + 暗月默认名录 + 待编目草稿。
    var sanctumDefaults = window.NavSanctum && typeof window.NavSanctum.getDefaultSites === "function"
      ? window.NavSanctum.getDefaultSites()
      : [];
    var shadowIds = new Set();
    all.concat(sanctumDefaults).forEach(function (site) {
      if (site && site.visibility === "shadow") shadowIds.add(site.id);
    });
    var leaked = entries.filter(function (entry) {
      if (!entry) return false;
      if (entry.visibility === "shadow") return true;
      if (shadowIds.has(entry.id)) return true;
      return /^shadow[-_]/.test(String(entry.id || ""));
    });
    return {
      valid: leaked.length === 0,
      total: entries.length,
      shadowKnown: shadowIds.size,
      leaked: leaked.map(function (entry) { return entry.id; })
    };
  }

  function downloadManifest() {
    var manifest = buildPublicManifest();
    try {
      var blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "public-collection.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
      notify("公开馆藏清单已导出", manifest.total + " 卷 · 0 卷暗月私密", "🔭");
      return true;
    } catch (error) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // 邻近星系装载
  // ---------------------------------------------------------------------------
  function localNode() {
    var manifest = buildPublicManifest();
    return {
      id: "local",
      name: "本馆 · EX LIBRIS",
      code: "LOCAL ARCHIVE",
      motto: "自身镜面 · SELF MIRROR",
      curator: "馆主",
      signature: manifest.siderealSignature,
      remote: false,
      items: manifest.entries.map(function (entry) {
        return {
          id: entry.id,
          title: entry.title,
          url: entry.url,
          category: entry.category,
          description: entry.description,
          tags: entry.tags,
          callsign: entry.callNumber
        };
      })
    };
  }

  function buildNodes() {
    var nodes = [localNode()];
    NEIGHBORS.forEach(function (node) {
      nodes.push({
        id: node.id,
        name: node.name,
        code: node.code,
        motto: node.motto,
        curator: node.curator,
        signature: node.signature,
        remote: true,
        items: node.items.slice()
      });
    });
    if (state.remoteManifest) {
      var remote = state.remoteManifest;
      nodes.push({
        id: "remote",
        name: (remote.library && remote.library.name) || "外部联邦节点",
        code: "REMOTE FEDERATION",
        motto: (remote.library && remote.library.motto) || "外部馆藏",
        curator: (remote.library && remote.library.curator) || "未署名",
        signature: remote.siderealSignature || siderealSignature(remote.signatureHash || "remote"),
        remote: true,
        external: true,
        items: (remote.entries || []).map(function (entry, index) {
          return {
            id: entry.id || "remote-" + index,
            title: entry.title || entry.name || "未命名",
            url: entry.url,
            category: entry.category || "",
            description: entry.description || "",
            tags: Array.isArray(entry.tags) ? entry.tags : [],
            callsign: entry.callNumber || String(index + 1).padStart(2, "0")
          };
        })
      });
    }
    return nodes;
  }

  function fetchRemoteManifest(url) {
    var target = String(url || "").trim();
    if (!target || typeof fetch !== "function") {
      return Promise.resolve({ ok: false, message: "请输入合法的 /public-collection.json 地址" });
    }
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, FETCH_TIMEOUT_MS);
    return fetch(target, { signal: controller ? controller.signal : undefined })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.entries)) throw new Error("malformed manifest");
        // 对端清单也必须不含暗月私密条目。
        var clean = data.entries.filter(function (entry) {
          return entry && entry.url && entry.visibility !== "shadow";
        });
        state.remoteManifest = Object.assign({}, data, { entries: clean });
        state.lastFetch = { at: Date.now(), ok: true, message: "已接入 " + clean.length + " 卷外部馆藏" };
        state.nodes = buildNodes();
        render();
        notify("邻近星系已接入", clean.length + " 卷外部馆藏", "🔭");
        return { ok: true, count: clean.length, manifest: state.remoteManifest };
      })
      .catch(function () {
        state.lastFetch = { at: Date.now(), ok: false, message: "外部节点不可达 · 保留内置沙盒" };
        renderFooter();
        return { ok: false, count: 0, message: state.lastFetch.message };
      })
      .then(function (result) {
        clearTimeout(timer);
        return result;
      });
  }

  // ---------------------------------------------------------------------------
  // 拓印入馆
  // ---------------------------------------------------------------------------
  function activeNode() {
    return state.nodes.filter(function (node) { return node.id === state.activeNodeId; })[0] || state.nodes[0];
  }

  function borrow(itemId, nodeId) {
    var node = nodeId
      ? state.nodes.filter(function (entry) { return entry.id === nodeId; })[0]
      : activeNode();
    if (!node) return null;
    var item = node.items.filter(function (entry) { return entry.id === itemId; })[0];
    if (!item) return null;

    var sourceLabel = "拓印自：" + node.name.replace(/^本馆 · /, "");
    var existing = window.NavOverrides && typeof window.NavOverrides.getAllIncludingUncatalogued === "function"
      ? window.NavOverrides.getAllIncludingUncatalogued(true).filter(function (site) {
        return site && String(site.url || "").trim() === String(item.url || "").trim();
      })[0]
      : null;
    if (existing) {
      notify("此卷已在馆中", (existing.name || existing.id) + " · 未重复拓印", "✓");
      return { site: existing, duplicate: true, source: sourceLabel };
    }
    if (!window.NavOverrides || typeof window.NavOverrides.addSite !== "function") return null;

    var category = ["ai", "dev", "knowledge", "tools", "social"].indexOf(item.category) >= 0
      ? item.category
      : "tools";
    var site = window.NavOverrides.addSite({
      name: item.title,
      url: item.url,
      description: item.description || "",
      whySaved: sourceLabel + " · " + (item.description || "馆际互借抄录"),
      notes: sourceLabel + "（" + node.code + " · " + item.callsign + "）",
      category: category,
      tags: (item.tags || []).concat(["馆际互借", node.id === "local" ? "本馆" : node.id]),
      status: "uncatalogued",
      visibility: "public",
      createdAt: Date.now()
    });
    if (!site) return null;
    if (window.NavLedger && typeof window.NavLedger.ensureFirstSeen === "function") {
      window.NavLedger.ensureFirstSeen(site.id, Date.now());
    }
    state.lineage[site.id] = { nodeId: node.id, nodeName: node.name, itemId: item.id, at: Date.now() };
    var tmpNumber = window.NavUncatalogued && typeof window.NavUncatalogued.getTmpNumber === "function"
      ? window.NavUncatalogued.getTmpNumber(site)
      : "";
    if (window.NavUncatalogued && typeof window.NavUncatalogued.renderDrawer === "function") {
      window.NavUncatalogued.renderDrawer();
    }
    if (window.NavApp && typeof window.NavApp.updateBadges === "function") {
      window.NavApp.updateBadges();
    }
    markBorrowed(item.id, node.id);
    notify("已拓印入馆", sourceLabel + " · " + tmpNumber, "✦");
    return { site: site, duplicate: false, source: sourceLabel, tmpNumber: tmpNumber };
  }

  function markBorrowed(itemId, nodeId) {
    Array.prototype.slice.call(document.querySelectorAll('[data-federation-borrow="' + String(itemId).replace(/"/g, '\\"') + '"]'))
      .forEach(function (button) {
        if (button.getAttribute("data-federation-node") !== String(nodeId)) return;
        button.classList.add("is-borrowed");
        button.textContent = "✓ 已拓印";
        button.setAttribute("aria-disabled", "true");
      });
  }

  // ---------------------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------------------
  function renderNodeRail() {
    var rail = document.getElementById("federation-rail");
    if (!rail) return;
    rail.innerHTML = state.nodes.map(function (node) {
      return [
        '<button type="button" class="federation-node-btn',
        node.id === state.activeNodeId ? " is-active" : "",
        '" data-federation-node="', escapeHtml(node.id), '"',
        ' aria-pressed="', node.id === state.activeNodeId ? "true" : "false", '">',
        '<span class="federation-node-code">', escapeHtml(node.code), '</span>',
        '<span class="federation-node-name">', escapeHtml(node.name), '</span>',
        '<span class="federation-node-count">', String(node.items.length).padStart(2, "0"), ' 卷</span>',
        '</button>'
      ].join("");
    }).join("");
  }

  function renderNodeHead() {
    var node = activeNode();
    var head = document.getElementById("federation-node-head");
    if (!head || !node) return;
    head.innerHTML = [
      '<div class="federation-head-main">',
      '<span class="federation-kicker">', escapeHtml(node.code), '</span>',
      '<h3>', escapeHtml(node.name), '</h3>',
      '<p class="federation-motto">', escapeHtml(node.motto || ""), '</p>',
      '</div>',
      '<div class="federation-head-meta">',
      '<span>馆正 · ', escapeHtml(node.curator || "未署名"), '</span>',
      '<span>', escapeHtml(node.signature || ""), '</span>',
      '</div>'
    ].join("");
  }

  function renderItems() {
    var list = document.getElementById("federation-list");
    var node = activeNode();
    if (!list || !node) return;
    if (!node.items.length) {
      list.innerHTML = '<p class="federation-empty">此星系暂无公开馆藏。</p>';
      return;
    }
    list.innerHTML = node.items.map(function (item) {
      var local = node.id === "local";
      var iconAttributes = "";
      if (window.NavSchema) {
        if (local) {
          iconAttributes = window.NavSchema.iconAttributes({
            id: item.id,
            name: item.title,
            url: item.url
          });
        } else if (typeof window.NavSchema.buildMonogramDataUri === "function") {
          // Neighbour catalogues are static sandbox data, not user-confirmed
          // sources. Never let an unfamiliar remote domain emit provider
          // requests (and the 404 console noise that comes with them) just
          // because a demo card is on screen.
          var seal = window.NavSchema.buildMonogramDataUri(item.title);
          iconAttributes = 'src="' + escapeHtml(seal) + '" ' +
            'data-icon-fallback="' + escapeHtml(seal) + '" ' +
            'data-icon-probe-step="0"';
        }
      }
      var iconHtml = iconAttributes
        ? '<img class="archive-icon-img" ' + iconAttributes + ' alt="" loading="lazy" width="24" height="24">'
        : "";
      return [
        '<article class="federation-card" data-federation-id="', escapeHtml(item.id), '">',
        '<header class="federation-card-head">',
        '<span class="archive-icon-box federation-card-icon" aria-hidden="true">', iconHtml, '</span>',
        '<span class="federation-callsign">', escapeHtml(item.callsign || ""), '</span>',
        '<span class="federation-category">', escapeHtml(item.category || "未分类"), '</span>',
        '</header>',
        '<h4 class="federation-card-title">',
        '<a href="', escapeHtml(item.url), '" target="_blank" rel="noopener noreferrer">',
        escapeHtml(item.title), ' ↗</a></h4>',
        '<p class="federation-card-desc">', escapeHtml(item.description || ""), '</p>',
        item.tags && item.tags.length
          ? '<div class="federation-card-tags">' + item.tags.slice(0, 4).map(function (tag) {
            return '<span>#' + escapeHtml(tag) + '</span>';
          }).join("") + '</div>'
          : "",
        '<footer class="federation-card-foot">',
        local
          ? '<span class="federation-local-mark">本馆自有馆藏</span>'
          : '<button type="button" class="federation-borrow" data-federation-borrow="' +
            escapeHtml(item.id) + '" data-federation-node="' + escapeHtml(node.id) + '">✦ 拓印入馆</button>',
        '</footer>',
        '</article>'
      ].join("");
    }).join("");
    if (window.NavSchema && typeof window.NavSchema.bindIconFallbacks === "function") {
      window.NavSchema.bindIconFallbacks(list);
    }
  }

  function renderFooter() {
    var footer = document.getElementById("federation-footer");
    if (!footer) return;
    var manifest = buildPublicManifest();
    var audit = auditManifest(manifest);
    footer.innerHTML = [
      '<span class="federation-stat">本馆公开卷 · <strong>', String(manifest.total), '</strong></span>',
      '<span class="federation-stat">暗月私密 · <strong>0</strong>（硬过滤）</span>',
      '<span class="federation-stat">清单签名 · <strong>', escapeHtml(manifest.siderealSignature), '</strong></span>',
      '<span class="federation-stat">外部节点 · ',
      escapeHtml(state.lastFetch.at ? state.lastFetch.message : "尚未拉取"),
      '</span>',
      '<span class="federation-stat">自检 · ', audit.valid ? "PASS" : "LEAK", '</span>'
    ].join("");
  }

  function render() {
    if (!state.nodes.length) state.nodes = buildNodes();
    if (!state.nodes.some(function (node) { return node.id === state.activeNodeId; })) {
      state.activeNodeId = state.nodes[0].id;
    }
    renderNodeRail();
    renderNodeHead();
    renderItems();
    renderFooter();
  }

  function selectNode(nodeId) {
    if (!nodeId) return false;
    if (!state.nodes.some(function (node) { return node.id === nodeId; })) return false;
    state.activeNodeId = nodeId;
    render();
    return true;
  }

  // ---------------------------------------------------------------------------
  // 开合
  // ---------------------------------------------------------------------------
  function open() {
    var modal = document.getElementById("federation-modal");
    var backdrop = document.getElementById("federation-backdrop");
    if (!modal) return false;
    lastActiveElement = document.activeElement;
    state.nodes = buildNodes();
    state.open = true;
    render();
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add("federation-open");
    return true;
  }

  function close() {
    var modal = document.getElementById("federation-modal");
    var backdrop = document.getElementById("federation-backdrop");
    if (!modal) return false;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    if (backdrop) backdrop.hidden = true;
    state.open = false;
    document.body.classList.remove("federation-open");
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

  // ---------------------------------------------------------------------------
  // 事件
  // ---------------------------------------------------------------------------
  function bindEvents() {
    if (bound) return;
    bound = true;

    var entry = document.getElementById("btn-federation-entry");
    var footerEntry = document.getElementById("btn-federation-footer");
    var mobileEntry = document.getElementById("btn-federation-mobile");
    var closeBtn = document.getElementById("btn-close-federation");
    var dismissBtn = document.getElementById("btn-dismiss-federation");
    var backdrop = document.getElementById("federation-backdrop");
    var modal = document.getElementById("federation-modal");
    var fetchBtn = document.getElementById("btn-federation-fetch");
    var exportBtn = document.getElementById("btn-federation-export");

    if (entry) entry.addEventListener("click", function (event) {
      event.preventDefault();
      toggle();
    });
    if (footerEntry) footerEntry.addEventListener("click", function (event) {
      event.preventDefault();
      open();
    });
    if (mobileEntry) mobileEntry.addEventListener("click", function (event) {
      event.preventDefault();
      open();
    });
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (dismissBtn) dismissBtn.addEventListener("click", close);
    if (backdrop) backdrop.addEventListener("click", close);

    if (fetchBtn) {
      fetchBtn.addEventListener("click", function (event) {
        event.preventDefault();
        var input = document.getElementById("federation-endpoint");
        fetchRemoteManifest(input ? input.value : MANIFEST_URL);
      });
    }
    if (exportBtn) {
      exportBtn.addEventListener("click", function (event) {
        event.preventDefault();
        downloadManifest();
      });
    }

    if (modal) {
      modal.addEventListener("click", function (event) {
        var nodeBtn = event.target.closest("[data-federation-node]");
        if (nodeBtn && !event.target.closest("[data-federation-borrow]")) {
          event.preventDefault();
          selectNode(nodeBtn.getAttribute("data-federation-node"));
          return;
        }
        var borrowBtn = event.target.closest("[data-federation-borrow]");
        if (borrowBtn) {
          event.preventDefault();
          event.stopPropagation();
          borrow(
            borrowBtn.getAttribute("data-federation-borrow"),
            borrowBtn.getAttribute("data-federation-node")
          );
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.open) {
        event.preventDefault();
        close();
      }
    });

    window.addEventListener("nav-overrides-changed", function () {
      if (state.open) render();
    });
  }

  function init() {
    bindEvents();
    state.nodes = buildNodes();
    if (window.NavApp && !window.NavApp.Federation) {
      window.NavApp.Federation = api;
    }
    return api;
  }

  function getState() {
    var manifest = buildPublicManifest();
    return {
      open: state.open,
      activeNodeId: state.activeNodeId,
      nodes: state.nodes.map(function (node) {
        return { id: node.id, name: node.name, count: node.items.length, remote: Boolean(node.remote) };
      }),
      neighbors: NEIGHBORS.map(function (node) {
        return { id: node.id, name: node.name, count: node.items.length };
      }),
      manifest: {
        total: manifest.total,
        signature: manifest.siderealSignature,
        version: manifest.version,
        shadowExcluded: manifest.shadowExcluded
      },
      audit: auditManifest(manifest),
      lineage: Object.assign({}, state.lineage),
      lastFetch: Object.assign({}, state.lastFetch),
      manifestUrl: MANIFEST_URL
    };
  }

  var api = {
    init,
    open,
    close,
    toggle,
    isOpen,
    render,
    selectNode,
    borrow,
    buildPublicManifest,
    auditManifest,
    publicSites,
    downloadManifest,
    fetchRemoteManifest,
    siderealSignature,
    hashString,
    getState,
    getNodes: function () { return buildNodes(); },
    NEIGHBORS,
    MANIFEST_URL,
    MANIFEST_VERSION,
    FETCH_TIMEOUT_MS
  };

  return api;
});
