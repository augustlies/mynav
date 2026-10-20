/**
 * Module: D5 — 网页琥珀 · 离线快照与防失联保险箱
 *
 * 为馆藏卡片（尤其是 ★ 私人典藏）生成本地「琥珀拓片（Amber Rubbing）」：
 *   · 核心功能摘要（提炼自卡片描述 / 馆主批注 / 标签）
 *   · 关键路由备忘（主机、路径、快捷子路由）
 *   · 封存时间戳与拓片编号
 *   · 自动拼装的 Wayback Machine 历史镜像锚点
 *
 * 死链触发：当 Phase 4A 的 telemetry 把卡片标记为 offline
 * （`.is-offline` / `[data-probe-status="offline"]`）时，卡片右下角浮现
 * 琥珀金徽章 `[ 📜 调阅拓片 ]`；点击它原地打开 `#amber-modal` 碑拓阅览室，
 * 绝不跳转已失效的外链。
 *
 * 持久化：MYNAV_LEDGER_V2.amberVault（经 NavLedger 读写，仅存本机）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavAmber = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var WAYBACK_PREFIX = "https://web.archive.org/web/*/";

  var state = {
    open: false,
    siteId: "",
    lastSealedAt: 0
  };

  var bound = false;
  var observer = null;
  var injectTimer = null;
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
      window.NavShortcuts.showToast(title, subtitle || "", icon || "📜");
    }
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function formatStamp(timestamp) {
    var d = new Date(Number(timestamp) || Date.now());
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function safeHost(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (error) {
      return String(url || "");
    }
  }

  function safePath(url) {
    try {
      var parsed = new URL(url);
      return (parsed.pathname || "/") + (parsed.search || "");
    } catch (error) {
      return "/";
    }
  }

  function waybackUrl(url) {
    if (!url) return WAYBACK_PREFIX;
    return WAYBACK_PREFIX + String(url).replace(/^https?:\/\//i, "");
  }

  // ---------------------------------------------------------------------------
  // 账本存取
  // ---------------------------------------------------------------------------
  function getVault() {
    if (window.NavLedger && typeof window.NavLedger.getAmberVault === "function") {
      return window.NavLedger.getAmberVault();
    }
    return {};
  }

  function getRubbing(siteId) {
    var vault = getVault();
    return vault && vault[siteId] ? vault[siteId] : null;
  }

  function writeRubbing(siteId, rubbing) {
    if (window.NavLedger && typeof window.NavLedger.setAmberRubbing === "function") {
      return window.NavLedger.setAmberRubbing(siteId, rubbing);
    }
    return null;
  }

  function removeRubbing(siteId) {
    if (window.NavLedger && typeof window.NavLedger.removeAmberRubbing === "function") {
      return window.NavLedger.removeAmberRubbing(siteId);
    }
    return false;
  }

  function siteById(siteId) {
    var all = window.NavApp && typeof window.NavApp.getAllSites === "function"
      ? window.NavApp.getAllSites()
      : [];
    var found = all.filter(function (site) { return site && site.id === siteId; })[0];
    if (found) return found;
    if (window.NavOverrides && typeof window.NavOverrides.getAllIncludingUncatalogued === "function") {
      return window.NavOverrides.getAllIncludingUncatalogued(true)
        .filter(function (site) { return site && site.id === siteId; })[0] || null;
    }
    return null;
  }

  function isFavorite(siteId) {
    return Boolean(window.NavFavorites && typeof window.NavFavorites.has === "function" && window.NavFavorites.has(siteId));
  }

  function marginaliaNotes(siteId) {
    if (window.NavLedger && typeof window.NavLedger.getMarginalia === "function") {
      return String(window.NavLedger.getMarginalia(siteId) || "");
    }
    return "";
  }

  // ---------------------------------------------------------------------------
  // 拓片内容生成
  // ---------------------------------------------------------------------------
  /**
   * 生成确定性 Markdown 拓片正文。不依赖网络：抓取可用则用提炼摘要，
   * 不可达则用卡片元数据自动拼装，永远有内容可调阅。
   */
  function buildSnapshotText(site, extra) {
    var data = extra || {};
    var name = (site && (site.name || site.title)) || "未命名馆藏";
    var url = (site && site.url) || "";
    var tags = Array.isArray(site && site.tags) ? site.tags : [];
    var notes = marginaliaNotes(site ? site.id : "");
    var description = data.summary || (site && (site.description || site.desc)) || "馆藏暂无简介。";
    var subLinks = Array.isArray(site && site.subLinks) ? site.subLinks : [];
    var sealedAt = data.sealedAt || Date.now();
    var callNumber = data.callNumber || (site && site.callNumber) || "";

    var lines = [
      "# 琥珀拓片 · AMBER RUBBING",
      "",
      "**" + name + "**" + (callNumber ? "　·　№ " + callNumber : ""),
      "原文地址：" + url,
      "封存时间：" + formatStamp(sealedAt),
      "拓片编号：" + (data.amberNo || "AMBER-" + String(site ? site.id : "guest").slice(0, 8).toUpperCase()),
      "",
      "## 一 · 核心功能摘要",
      description,
      "",
      "## 二 · 关键路由备忘",
      "- 主机　　" + (safeHost(url) || "—"),
      "- 路径　　" + (safePath(url) || "/"),
      subLinks.length
        ? subLinks.slice(0, 4).map(function (link) {
          return "- 子路由　" + (link.label || link.name || "入口") + "　→　" + (link.url || "");
        }).join("\n")
        : "- 子路由　　暂无登记",
      "",
      "## 三 · 馆藏索引",
      "- 分类　　" + (site && site.category ? site.category : "未分类"),
      "- 标签　　" + (tags.length ? tags.join(" / ") : "无"),
      "",
      "## 四 · 馆主批注",
      notes || "（尚未批注。可在卡片背面写下评注，拓片将自动收入。）",
      "",
      "## 五 · 互联网档案馆",
      "Wayback Machine：" + waybackUrl(url),
      "",
      "—— 此拓片由馆内离线封存，与原文网页的存亡无关。"
    ];
    return lines.join("\n");
  }

  /**
   * 封存一张卡片。customSnapshot 可传字符串（整段拓片文本）或对象
   * { summary, snapshot, note }，便于测试与命令注入。
   */
  function sealSite(siteId, customSnapshot) {
    var site = siteById(siteId);
    if (!site) return null;

    var custom = {};
    if (typeof customSnapshot === "string") {
      custom.snapshot = customSnapshot;
    } else if (customSnapshot && typeof customSnapshot === "object") {
      custom = customSnapshot;
    }

    var existing = getRubbing(siteId);
    var sealedAt = Number(custom.sealedAt) || Date.now();
    var amberNo = existing && existing.amberNo
      ? existing.amberNo
      : "AMBER-" + String(siteId).replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase() + "-" + String(Date.now()).slice(-4);

    var snapshot = custom.snapshot || buildSnapshotText(site, {
      sealedAt: sealedAt,
      amberNo: amberNo,
      summary: custom.summary
    });
    var rubbing = {
      siteId: siteId,
      name: site.name || site.title || siteId,
      url: site.url || "",
      host: safeHost(site.url),
      callNumber: site.callNumber || "",
      summary: custom.summary || site.description || site.desc || "",
      snapshot: snapshot,
      note: custom.note !== undefined ? custom.note : (existing && existing.note) || marginaliaNotes(siteId),
      wayback: waybackUrl(site.url),
      amberNo: amberNo,
      favorite: isFavorite(siteId),
      sealedAt: sealedAt,
      updatedAt: Date.now(),
      source: custom.source || "manual"
    };

    writeRubbing(siteId, rubbing);
    state.lastSealedAt = Date.now();
    markSealedCard(siteId);
    if (state.open && state.siteId === siteId) renderRubbing(siteId);
    return rubbing;
  }

  function unsealSite(siteId) {
    var ok = removeRubbing(siteId);
    var card = document.querySelector('.entry-card[data-site-id="' + String(siteId).replace(/"/g, '\\"') + '"]');
    if (card) card.removeAttribute("data-amber-sealed");
    if (state.open && state.siteId === siteId) close();
    return ok;
  }

  /** 为全部 ★ 私人典藏补一份拓片（自动封存，跳过已存在者）。 */
  function autoSealFavorites() {
    var all = window.NavApp && typeof window.NavApp.getAllSites === "function"
      ? window.NavApp.getAllSites()
      : [];
    var sealed = 0;
    all.forEach(function (site) {
      if (!site || !isFavorite(site.id)) return;
      if (getRubbing(site.id)) return;
      if (sealSite(site.id, { source: "auto-favorite" })) sealed += 1;
    });
    return sealed;
  }

  function sealAll() {
    var all = window.NavApp && typeof window.NavApp.getAllSites === "function"
      ? window.NavApp.getAllSites()
      : [];
    var sealed = 0;
    all.forEach(function (site) {
      if (!site) return;
      if (sealSite(site.id, { source: "bulk" })) sealed += 1;
    });
    return sealed;
  }

  // ---------------------------------------------------------------------------
  // 卡片徽章注入
  // ---------------------------------------------------------------------------
  function isOfflineCard(card) {
    if (!card) return false;
    // 探针节点是权威信源；卡片上的 data-probe-status / .is-offline 只是镜像，
    // 供外部按 Phase 4B 契约的两种口径查询。没有探针时才回落到镜像。
    var probe = card.querySelector(".card-star-probe");
    if (probe) {
      return probe.getAttribute("data-probe-status") === "offline" || probe.classList.contains("is-offline");
    }
    return card.classList.contains("is-offline") ||
      card.getAttribute("data-probe-status") === "offline";
  }

  function buildBadgeNode() {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "card-amber-badge";
    button.setAttribute("data-amber-open", "1");
    button.setAttribute("aria-label", "调阅琥珀拓片");
    button.title = "原文星轨受阻 · 调阅本地琥珀拓片";
    button.innerHTML = '<span aria-hidden="true">📜</span> 调阅拓片';
    return button;
  }

  function injectBadges() {
    var cards = Array.prototype.slice.call(document.querySelectorAll(".entry-card[data-site-id]"));
    var injected = 0;
    cards.forEach(function (card) {
      if (!card.querySelector(".card-amber-badge")) {
        card.appendChild(buildBadgeNode());
        injected += 1;
      }
      syncCard(card);
      injectBackplate(card);
    });
    return injected;
  }

  /** 卡片背面（藏书票批注层）落一枚拓片入口，便于离线时手动调阅。 */
  function injectBackplate(card) {
    var panel = card.querySelector(".card-marginalia");
    if (!panel || panel.querySelector("[data-amber-open]")) return;
    var siteId = card.getAttribute("data-site-id");
    if (!siteId) return;
    var block = document.createElement("div");
    block.className = "marginalia-amber-block";
    block.innerHTML = [
      '<div class="marginalia-section-label">网页琥珀 · AMBER</div>',
      '<button type="button" class="marginalia-amber-btn" data-amber-open="1" data-amber-site="',
      escapeHtml(siteId),
      '">📜 调阅拓片</button>'
    ].join("");
    panel.appendChild(block);
  }

  function markSealedCard(siteId) {
    var card = document.querySelector('.entry-card[data-site-id="' + String(siteId).replace(/"/g, '\\"') + '"]');
    if (card) {
      card.setAttribute("data-amber-sealed", "1");
      syncCard(card);
    }
  }

  function syncCard(card) {
    if (!card) return;
    var badge = card.querySelector(".card-amber-badge");
    if (!badge) return;
    var siteId = card.getAttribute("data-site-id");
    var offline = isOfflineCard(card);
    // 把探针状态回写到卡片本身：Phase 4B 契约要求卡片可被
    // `[data-probe-status="offline"]` 或 `.is-offline` 两种口径识别。
    if (offline) {
      card.setAttribute("data-probe-status", "offline");
      card.classList.add("is-offline", "card--amber-offline");
    } else {
      var probe = card.querySelector(".card-star-probe");
      var status = probe ? probe.getAttribute("data-probe-status") : "";
      if (status && status !== "offline") card.setAttribute("data-probe-status", status);
      else card.removeAttribute("data-probe-status");
      card.classList.remove("is-offline", "card--amber-offline");
    }
    var sealed = Boolean(siteId && getRubbing(siteId));
    badge.setAttribute("data-amber-site", siteId || "");
    badge.classList.toggle("is-visible", offline);
    badge.classList.toggle("is-sealed", sealed);
    badge.setAttribute("aria-hidden", offline ? "false" : "true");
    badge.tabIndex = offline ? 0 : -1;
    if (offline) {
      badge.title = sealed
        ? "原文星轨受阻 · 调阅已封存的琥珀拓片"
        : "原文星轨受阻 · 点击就地封存并调阅拓片";
    }
    if (sealed) card.setAttribute("data-amber-sealed", "1");
  }

  function syncCards() {
    Array.prototype.slice.call(document.querySelectorAll(".entry-card[data-site-id]")).forEach(syncCard);
  }

  function observeContent() {
    var area = document.getElementById("archive-content-area");
    if (!area || typeof MutationObserver !== "function") return;
    if (observer) observer.disconnect();
    observer = new MutationObserver(function () {
      if (injectTimer) return;
      injectTimer = setTimeout(function () {
        injectTimer = null;
        injectBadges();
      }, 120);
    });
    observer.observe(area, { childList: true, subtree: true });
  }

  // ---------------------------------------------------------------------------
  // 拓片阅览室
  // ---------------------------------------------------------------------------
  function renderRubbing(siteId) {
    var rubbing = getRubbing(siteId);
    var body = document.getElementById("amber-body");
    var title = document.getElementById("amber-title");
    var meta = document.getElementById("amber-meta");
    var note = document.getElementById("amber-note");
    var wayback = document.getElementById("amber-wayback");
    var snapshot = document.getElementById("amber-snapshot");
    var status = document.getElementById("amber-status");
    if (!body) return;

    if (!rubbing) {
      if (title) title.textContent = "尚无拓片";
      if (meta) meta.textContent = "此卷尚未封存";
      if (note) note.textContent = "";
      if (snapshot) snapshot.textContent = "该馆藏尚无本地拓片。点击下方「就地封存」立即生成一份。";
      if (wayback) {
        wayback.hidden = true;
        wayback.setAttribute("href", "#");
      }
      if (status) status.textContent = "未封存 · 原文仍可直连";
      return;
    }

    if (title) title.textContent = rubbing.name || siteId;
    if (meta) {
      meta.textContent = rubbing.amberNo + " · 封存于 " + formatStamp(rubbing.sealedAt);
    }
    if (note) {
      note.textContent = rubbing.note || "馆主尚未批注。拓片本身即为最忠实的备忘。";
    }
    if (snapshot) snapshot.textContent = rubbing.snapshot || buildSnapshotText(siteById(siteId), { sealedAt: rubbing.sealedAt });
    if (wayback) {
      wayback.hidden = false;
      wayback.setAttribute("href", rubbing.wayback || waybackUrl(rubbing.url));
      wayback.textContent = "互联网档案馆 · 时光机 ↗";
    }
    if (status) {
      status.textContent = "已封存 · " + (rubbing.host || safeHost(rubbing.url)) + " · 可离线调阅";
    }
  }

  function openRubbing(siteId) {
    var modal = document.getElementById("amber-modal");
    var backdrop = document.getElementById("amber-backdrop");
    if (!modal) return false;
    var id = siteId;
    if (!id) return false;
    if (!getRubbing(id)) {
      // 调阅即封存：确保任何时刻都有内容可读。
      sealSite(id, { source: "open-on-demand" });
    }
    state.siteId = id;
    state.open = true;
    lastActiveElement = document.activeElement;
    renderRubbing(id);
    if (backdrop) backdrop.hidden = false;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("amber-open");
    var closeBtn = document.getElementById("btn-close-amber");
    if (closeBtn) setTimeout(function () { closeBtn.focus(); }, 60);
    return true;
  }

  function open(siteId) {
    if (siteId) return openRubbing(siteId);
    // 无参调用：优先取第一张离线卡，其次第一张已封存拓片。
    var offline = Array.prototype.slice.call(document.querySelectorAll(".entry-card.is-offline[data-site-id]"))[0];
    if (offline) return openRubbing(offline.getAttribute("data-site-id"));
    var vault = getVault();
    var keys = Object.keys(vault);
    if (keys.length) return openRubbing(keys[0]);
    var first = document.querySelector(".entry-card[data-site-id]");
    return first ? openRubbing(first.getAttribute("data-site-id")) : false;
  }

  function close() {
    var modal = document.getElementById("amber-modal");
    var backdrop = document.getElementById("amber-backdrop");
    if (!modal) return false;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    if (backdrop) backdrop.hidden = true;
    state.open = false;
    state.siteId = "";
    document.body.classList.remove("amber-open");
    if (lastActiveElement && typeof lastActiveElement.focus === "function") {
      lastActiveElement.focus();
    }
    return true;
  }

  function isOpen() {
    return state.open;
  }

  function copyRubbing() {
    var rubbing = getRubbing(state.siteId);
    if (!rubbing) return Promise.resolve(false);
    var text = rubbing.snapshot || "";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        notify("拓片已复制", rubbing.amberNo, "📋");
        return true;
      }).catch(function () {
        return false;
      });
    }
    return Promise.resolve(false);
  }

  // ---------------------------------------------------------------------------
  // 事件
  // ---------------------------------------------------------------------------
  function bindEvents() {
    if (bound) return;
    bound = true;

    var closeBtn = document.getElementById("btn-close-amber");
    var dismissBtn = document.getElementById("btn-dismiss-amber");
    var backdrop = document.getElementById("amber-backdrop");
    var resealBtn = document.getElementById("btn-amber-reseal");
    var copyBtn = document.getElementById("btn-amber-copy");
    var modal = document.getElementById("amber-modal");

    if (closeBtn) closeBtn.addEventListener("click", close);
    if (dismissBtn) dismissBtn.addEventListener("click", close);
    if (backdrop) backdrop.addEventListener("click", close);

    if (resealBtn) {
      resealBtn.addEventListener("click", function () {
        if (!state.siteId) return;
        sealSite(state.siteId, { source: "reseal" });
        renderRubbing(state.siteId);
        notify("拓片已重新封存", state.siteId, "📜");
      });
    }
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        copyRubbing();
      });
    }

    // 徽章点击：绝不冒泡到卡片链接，绝不打开已失效的外链。
    document.addEventListener("click", function (event) {
      var trigger = event.target.closest("[data-amber-open]");
      if (!trigger) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      var siteId = trigger.getAttribute("data-amber-site");
      if (!siteId) {
        var card = trigger.closest(".entry-card[data-site-id]");
        siteId = card ? card.getAttribute("data-site-id") : "";
      }
      if (siteId) openRubbing(siteId);
      else open();
    }, true);

    if (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target.closest("[data-amber-close]")) {
          event.preventDefault();
          close();
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.open) {
        event.preventDefault();
        close();
      }
    });

    // 遥测巡检结果广播（telemetry.js 在 probeAll / resetProbes 之后派发）。
    // 探针节点可能刚刚被重新注入，先补挂徽章再同步状态。
    window.addEventListener("mynav-probe-updated", function () {
      injectBadges();
      syncCards();
    });
    window.addEventListener("nav-overrides-changed", function () {
      setTimeout(function () { injectBadges(); }, 90);
    });
    window.addEventListener("mynav-ledger-changed", function () {
      if (state.open && state.siteId) renderRubbing(state.siteId);
    });
  }

  function init() {
    bindEvents();
    injectBadges();
    observeContent();
    autoSealFavorites();
    if (window.NavApp && !window.NavApp.Amber) {
      window.NavApp.Amber = api;
    }
    return api;
  }

  function getState() {
    var vault = getVault();
    var ids = Object.keys(vault);
    return {
      open: state.open,
      siteId: state.siteId,
      sealed: ids.length,
      sealedIds: ids,
      vault: vault,
      visibleBadges: document.querySelectorAll(".card-amber-badge.is-visible").length,
      badges: document.querySelectorAll(".card-amber-badge").length,
      lastSealedAt: state.lastSealedAt
    };
  }

  var api = {
    init,
    sealSite,
    unsealSite,
    openRubbing,
    open,
    close,
    isOpen,
    copyRubbing,
    autoSealFavorites,
    sealAll,
    injectBadges,
    syncCards,
    renderRubbing,
    getRubbing,
    getVault,
    getState,
    waybackUrl,
    buildSnapshotText,
    WAYBACK_PREFIX
  };

  return api;
});
