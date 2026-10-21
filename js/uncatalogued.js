/**
 * Module: B1-B4 uncatalogued drawer ("dark star belt").
 *
 * Uncatalogued entries are stored in the same override layer as catalogued
 * entries, but every public render path filters them out. Their temporary
 * numbers are derived from createdAt order and are intentionally not stable
 * museum call numbers.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavUncatalogued = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SEALED_AFTER_DAYS = 90;
  let bound = false;
  let lastActiveElement = null;
  let sealedCandidate = null;

  function getIconAttributes(site) {
    return window.NavSchema && typeof window.NavSchema.iconAttributes === "function"
      ? window.NavSchema.iconAttributes(site)
      : "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toast(title, subtitle, icon) {
    if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
      window.NavShortcuts.showToast(title, subtitle || "", icon || "⌘");
    }
  }

  function getCategories() {
    return window.NAV_DATA && Array.isArray(window.NAV_DATA.categories)
      ? window.NAV_DATA.categories
      : [];
  }

  function getAll() {
    if (!window.NavOverrides || typeof window.NavOverrides.getAllIncludingUncatalogued !== "function") {
      return [];
    }
    const raw = window.NavOverrides.getAllIncludingUncatalogued(true);
    const normalized = window.NavSchema && typeof window.NavSchema.normalizeItems === "function"
      ? window.NavSchema.normalizeItems(raw)
      : raw;
    return normalized.filter(function (site) {
      return site.status === "uncatalogued";
    }).sort(function (a, b) {
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  function getTmpNumber(site) {
    const all = getAll();
    const index = all.findIndex(function (item) { return item.id === site.id; });
    return "TMP-" + String(Math.max(0, index) + 1).padStart(2, "0");
  }

  function getDisplayNumber(site) {
    const tmp = getTmpNumber(site);
    const duplicateTmp = getAll().filter(function (item) {
      return getTmpNumber(item) === tmp;
    }).length > 1;
    return duplicateTmp ? site.id : tmp;
  }

  function isSealed(site) {
    if (!site || !site.createdAt) return false;
    const stat = window.NavLedger && typeof window.NavLedger.getStat === "function"
      ? window.NavLedger.getStat(site.id)
      : null;
    if (stat && stat.count > 0) return false;
    return Date.now() - site.createdAt > SEALED_AFTER_DAYS * 24 * 60 * 60 * 1000;
  }

  function pickSealedCandidate() {
    const allUncatalogued = getAll();
    if (allUncatalogued.length === 0) return null;
    const sealed = allUncatalogued.filter(isSealed);
    if (sealed.length === 0) return null;
    // 25% is the product intent. A deterministic test hook allows Playwright
    // to exercise the branch without depending on a lucky random draw.
    const force = window.__MYNAV_FORCE_SEALED_RANDOM__ === true;
    // The product asks for a 25% preference among random openings. Decide
    // the branch once so a forced test always selects a sealed card.
    if (!force && Math.random() >= 0.25) return null;
    const picked = sealed[Math.floor(Math.random() * sealed.length)];
    sealedCandidate = picked;
    return picked;
  }

  function renderCard(site) {
    const tmp = getDisplayNumber(site);
    const sealed = isSealed(site);
    const category = getCategories().find(function (cat) { return cat.id === site.category; });
    const iconAttributes = getIconAttributes(site);
    const iconHtml = iconAttributes
      ? '<img class="archive-icon-img" ' + iconAttributes + ' alt="" loading="lazy" width="24" height="24">'
      : "";
    return [
      '<article class="uncatalogued-card" data-uncatalogued-id="', escapeHtml(site.id),
      '" data-tmp-number="', escapeHtml(tmp), '">',
      '<div class="uncatalogued-card-head">',
      '<span class="archive-icon-box uncatalogued-card-icon" aria-hidden="true">', iconHtml, '</span>',
      '<span class="uncatalogued-tmp">', escapeHtml(tmp), '</span>',
      '<span class="uncatalogued-status-stamp">[ 留卷待查 ]</span>',
      sealed ? '<span class="uncatalogued-hourglass">⌛ 已封存三月</span>' : "",
      '</div>',
      '<h3 class="uncatalogued-card-title">',
      '<a href="', escapeHtml(site.url), '" target="_blank" rel="noopener noreferrer" data-uncatalogued-open="', escapeHtml(site.id), '">',
      escapeHtml(site.name || site.title || site.id), '</a></h3>',
      '<div class="uncatalogued-card-meta">', escapeHtml(category ? category.name : site.category || "未分类"),
      ' · ', escapeHtml((function () {
        try { return new URL(site.url).hostname.replace(/^www\./, ""); }
        catch (error) { return site.url; }
      })()), '</div>',
      '<p class="uncatalogued-why"><span>收录动机</span>', escapeHtml(site.whySaved || "尚未写下收录动机"), '</p>',
      '<div class="uncatalogued-card-actions">',
      '<button type="button" class="uncatalogued-crown" data-uncatalogued-crown="', escapeHtml(site.id), '">✦ 授予藏书票</button>',
      '<button type="button" class="uncatalogued-discard" data-uncatalogued-discard="', escapeHtml(site.id), '">✕ 移除</button>',
      '</div>',
      '</article>'
    ].join("");
  }

  function renderDrawer() {
    const list = document.getElementById("uncatalogued-list");
    const count = document.getElementById("uncatalogued-count");
    const sites = getAll();
    if (count) count.textContent = String(sites.length).padStart(2, "0");
    if (!list) return;
    list.innerHTML = sites.length
      ? sites.map(renderCard).join("")
      : '<div class="uncatalogued-empty"><span>⌘</span><p>暗星带暂无封存候选。</p><small>在上方输入网址与收录动机，回车即可留卷待查。</small></div>';
    if (window.NavSchema && typeof window.NavSchema.bindIconFallbacks === "function") {
      window.NavSchema.bindIconFallbacks(list);
    }
    if (window.NavApp && typeof window.NavApp.updateBadges === "function") {
      window.NavApp.updateBadges();
    }
  }

  function open() {
    const drawer = document.getElementById("uncatalogued-drawer");
    const backdrop = document.getElementById("uncatalogued-backdrop");
    if (!drawer || !backdrop) return;
    lastActiveElement = document.activeElement;
    renderDrawer();
    backdrop.hidden = false;
    drawer.hidden = false;
    document.body.classList.add("drawer-open");
    const input = document.getElementById("uncatalogued-url");
    if (input) setTimeout(function () { input.focus(); }, 80);
  }

  function close() {
    const drawer = document.getElementById("uncatalogued-drawer");
    const backdrop = document.getElementById("uncatalogued-backdrop");
    if (!drawer || !backdrop) return;
    drawer.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove("drawer-open");
    if (lastActiveElement && typeof lastActiveElement.focus === "function") {
      lastActiveElement.focus();
    }
  }

  function renderPotentialMatches(query) {
    if (!window.NavApp || typeof window.NavApp.getUncataloguedMatches !== "function") return "";
    const matches = window.NavApp.getUncataloguedMatches(query);
    if (!matches.length) return "";
    return [
      '<section class="uncatalogued-potential" data-uncatalogued-potential>',
      '<header><span>⏳ 来自待编目匣的潜在匹配</span><span>', matches.length, ' 卷</span></header>',
      '<div class="uncatalogued-potential-grid">',
      matches.map(function (site) {
        return [
          '<button type="button" class="potential-card" data-uncatalogued-open-drawer="', escapeHtml(site.id), '">',
          '<span class="potential-tmp">', escapeHtml(getDisplayNumber(site)), '</span>',
          '<strong>', escapeHtml(site.name || site.title || site.id), '</strong>',
          '<small>', escapeHtml(site.whySaved || site.url), '</small>',
          '<span class="potential-arrow">↗</span></button>'
        ].join("");
      }).join(""),
      '</div></section>'
    ].join("");
  }

  function describeSealedChoice(site) {
    if (!site) return "";
    return [
      "⌛ 发现一份封存逾三月的候选卷宗",
      "",
      site.name || site.title || site.id,
      site.whySaved || "",
      "",
      "输入 1 正式入馆，输入 2 销毁归档；取消则继续随机开卷。"
    ].join("\n");
  }

  function resolveSealedChoice(site, choice, options) {
    if (!site) return false;
    if (String(choice) === "1") {
      crown(site.id);
      return true;
    }
    if (String(choice) === "2") {
      discard(site.id);
      return true;
    }
    if (options && typeof options.onCancel === "function") {
      options.onCancel();
    } else if (window.NavApp && typeof window.NavApp.openRandom === "function") {
      window.NavApp.openRandom({ skipSealed: true });
    }
    return false;
  }

  function addFromForm() {
    const urlInput = document.getElementById("uncatalogued-url");
    const nameInput = document.getElementById("uncatalogued-name");
    const whyInput = document.getElementById("uncatalogued-why");
    const categoryInput = document.getElementById("uncatalogued-category");
    if (!urlInput || !nameInput || !whyInput) return;
    const url = urlInput.value.trim();
    const name = nameInput.value.trim();
    const whySaved = whyInput.value.trim();
    if (!/^https?:\/\/.+/i.test(url)) {
      toast("网址格式不合法", "需以 http:// 或 https:// 开头", "⚠");
      urlInput.focus();
      return;
    }
    if (!name) {
      toast("请填写网站名称", "候选书卷需要一个可辨认的题名", "ℹ");
      nameInput.focus();
      return;
    }
    if (!whySaved) {
      toast("请写下收录动机", "Why Saved 是候选书卷的唯一线索", "ℹ");
      whyInput.focus();
      return;
    }
    if (!window.NavOverrides || typeof window.NavOverrides.addSite !== "function") return;
    const site = window.NavOverrides.addSite({
      name: name,
      url: url,
      description: whySaved,
      whySaved: whySaved,
      category: categoryInput ? categoryInput.value : "ai",
      status: "uncatalogued",
      visibility: "public",
      createdAt: Date.now()
    });
    if (site && window.NavLedger) window.NavLedger.ensureFirstSeen(site.id, Date.now());
    urlInput.value = "";
    nameInput.value = "";
    whyInput.value = "";
    renderDrawer();
    toast("已封存候选书卷", "编号 " + getTmpNumber(site), "⌘");
  }

  function crown(siteId) {
    const sites = window.NavOverrides && typeof window.NavOverrides.getAllMergedSites === "function"
      ? window.NavOverrides.getAllMergedSites(true)
      : [];
    const site = sites.find(function (item) { return item.id === siteId; });
    if (!site || !window.NavOverrides) return;
    const categories = getCategories();
    const options = categories.map(function (cat, index) {
      return String(index + 1) + ". " + cat.name;
    }).join("\n");
    const answer = prompt("授予藏书票并编入哪个专栏？\n" + options, "1");
    if (answer === null) return;
    const index = Math.max(0, Math.min(categories.length - 1, (Number(answer) || 1) - 1));
    const target = categories[index] || categories[0];
    if (!target) return;
    window.NavOverrides.updateSite(site.id, {
      status: "catalogued",
      category: target.id,
      description: site.description || site.whySaved || ""
    });
    if (window.NavLedger && typeof window.NavLedger.ensureFirstSeen === "function") {
      window.NavLedger.ensureFirstSeen(site.id, site.createdAt || Date.now());
    }
    renderDrawer();
    toast("已授予藏书票", (site.name || site.id) + " → " + target.name, "✦");
  }

  function discard(siteId) {
    const sites = window.NavOverrides && typeof window.NavOverrides.getAllMergedSites === "function"
      ? window.NavOverrides.getAllMergedSites(true)
      : [];
    const site = sites.find(function (item) { return item.id === siteId; });
    if (!site || !window.NavOverrides) return;
    if (!confirm("确定销毁归档 “" + (site.name || site.id) + "” 吗？")) return;
    window.NavOverrides.deleteSite(site.id);
    renderDrawer();
    toast("已销毁归档", site.name || site.id, "✕");
  }

  function openSealedPrompt(site, options) {
    if (!site) return;
    const choice = prompt(describeSealedChoice(site), "1");
    return resolveSealedChoice(site, choice, options);
  }

  function bindEvents() {
    if (bound) return;
    bound = true;
    const entry = document.getElementById("btn-uncatalogued-entry");
    const mobileEntry = document.getElementById("btn-uncatalogued-mobile");
    const closeBtn = document.getElementById("btn-close-uncatalogued");
    const backdrop = document.getElementById("uncatalogued-backdrop");
    const addBtn = document.getElementById("btn-uncatalogued-add");
    const form = document.getElementById("uncatalogued-form");
    if (entry) entry.addEventListener("click", open);
    if (mobileEntry) mobileEntry.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (backdrop) backdrop.addEventListener("click", close);
    if (addBtn) addBtn.addEventListener("click", addFromForm);
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        addFromForm();
      });
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "u" || event.key === "U") {
        const target = event.target;
        const tag = target && target.tagName ? target.tagName.toLowerCase() : "";
        if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable) return;
        const drawer = document.getElementById("uncatalogued-drawer");
        if (drawer && !drawer.hidden) return;
        event.preventDefault();
        open();
      }
      if (event.key === "Escape") {
        const drawer = document.getElementById("uncatalogued-drawer");
        if (drawer && !drawer.hidden) {
          event.preventDefault();
          close();
        }
      }
    });
    const list = document.getElementById("uncatalogued-list");
    const categorySelect = document.getElementById("uncatalogued-category");
    if (categorySelect) {
      categorySelect.innerHTML = getCategories().map(function (category) {
        return '<option value="' + escapeHtml(category.id) + '">' +
          escapeHtml(category.name) + '</option>';
      }).join("");
    }
    if (list) {
      list.addEventListener("click", function (event) {
        const openBtn = event.target.closest("[data-uncatalogued-open]");
        if (openBtn) {
          event.preventDefault();
          if (window.NavApp) window.NavApp.openSite(openBtn.getAttribute("data-uncatalogued-open"));
          return;
        }
        const crownBtn = event.target.closest("[data-uncatalogued-crown]");
        if (crownBtn) {
          const siteId = crownBtn.getAttribute("data-uncatalogued-crown");
          crown(siteId);
          if (window.NavApp && typeof window.NavApp.refresh === "function") {
            window.NavApp.refresh();
          }
          return;
        }
        const discardBtn = event.target.closest("[data-uncatalogued-discard]");
        if (discardBtn) {
          discard(discardBtn.getAttribute("data-uncatalogued-discard"));
        }
      });
    }
    document.addEventListener("click", function (event) {
      const potential = event.target.closest("[data-uncatalogued-open-drawer]");
      if (!potential) return;
      event.preventDefault();
      open();
      const siteId = potential.getAttribute("data-uncatalogued-open-drawer");
      const card = document.querySelector('[data-uncatalogued-id="' + siteId.replace(/"/g, '\\"') + '"]');
      if (card) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  function init() {
    bindEvents();
  }

  return {
    init,
    open,
    close,
    renderDrawer,
    renderPotentialMatches,
    pickSealedCandidate,
    openSealedPrompt,
    describeSealedChoice,
    resolveSealedChoice,
    getAll,
    getTmpNumber,
    getDisplayNumber,
    isSealed,
    SEALED_AFTER_DAYS
  };
});
