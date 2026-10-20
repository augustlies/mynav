/**
 * Module: C3 constellation launchers and multi-cast search.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavConstellations = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DEFAULTS = [
    { id: "research", name: "科研星群", itemIds: ["ai-chatgpt", "ai-gemini", "ai-claude", "learn-scholar"] },
    { id: "creation", name: "创作与AI", itemIds: ["ai-hark", "ai-deepseek", "tool-notion", "ai-muse"] },
    { id: "infra", name: "基建运维", itemIds: ["dev-github", "dev-vercel", "dev-cloudflare", "dev-gcp-console"] }
  ];

  const MULTICAST_ENGINES = [
    { name: "Google", url: "https://www.google.com/search?q=" },
    { name: "GitHub", url: "https://github.com/search?q=" },
    { name: "Bing", url: "https://www.bing.com/search?q=" }
  ];

  let bound = false;

  function toast(title, subtitle, icon) {
    if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
      window.NavShortcuts.showToast(title, subtitle || "", icon || "✦");
    }
  }

  function getConstellations() {
    const stored = window.NavLedger && typeof window.NavLedger.getConstellations === "function"
      ? window.NavLedger.getConstellations()
      : [];
    if (Array.isArray(stored) && stored.length > 0) return stored.slice();
    return DEFAULTS.map(function (item) {
      return { id: item.id, name: item.name, itemIds: item.itemIds.slice() };
    });
  }

  function renderRail() {
    const rail = document.getElementById("constellation-rail");
    if (!rail) return;
    const presets = getConstellations();
    rail.innerHTML = presets.map(function (preset) {
      return '<button type="button" class="constellation-chip" data-constellation-id="' +
        String(preset.id).replace(/[^a-z0-9_-]/gi, "") + '">✦ ' +
        escapeHtml(preset.name) + '</button>';
    }).join("") +
      '<button type="button" class="constellation-chip constellation-chip--add" data-constellation-add>+ 星群</button>';
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getAvailableSites() {
    if (window.NavApp && typeof window.NavApp.getAllSites === "function") {
      return window.NavApp.getAllSites();
    }
    if (window.NavOverrides && typeof window.NavOverrides.getSites === "function") {
      return window.NavOverrides.getSites();
    }
    return [];
  }

  function normalizeItemIds(itemIds, sites) {
    const valid = new Set(sites.map(function (site) { return site.id; }));
    const seen = new Set();
    return (Array.isArray(itemIds) ? itemIds : []).filter(function (id) {
      if (!valid.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function createCustom() {
    const sites = getAvailableSites();
    if (sites.length === 0) {
      toast("馆内尚无可绑定站点", "请先收录藏书", "ℹ");
      return false;
    }
    const name = prompt("星群名称（2~12 字）", "");
    if (!name || !name.trim()) return false;
    const roster = sites.map(function (site, index) {
      return String(index + 1) + ". " + (site.name || site.id);
    }).join("\n");
    const answer = prompt(
      "选择 2~4 个馆内站点，以逗号分隔编号：\n\n" + roster,
      "1,2"
    );
    if (answer === null) return false;
    const indexes = String(answer).split(/[,，\s]+/).map(function (value) {
      return Number(value) - 1;
    }).filter(function (index) {
      return Number.isInteger(index) && index >= 0 && index < sites.length;
    });
    const itemIds = normalizeItemIds(indexes.map(function (index) {
      return sites[index].id;
    }), sites);
    if (itemIds.length < 2 || itemIds.length > 4) {
      toast("星群需绑定 2~4 个站点", "请重新输入有效编号", "⚠");
      return false;
    }
    const all = getConstellations();
    const id = "custom-" + Date.now().toString(36);
    const next = all.concat([{
      id: id,
      name: name.trim().slice(0, 24),
      itemIds: itemIds
    }]);
    if (window.NavLedger && typeof window.NavLedger.setConstellations === "function") {
      window.NavLedger.setConstellations(next);
    }
    renderRail();
    toast("星群已编入星图", name.trim() + " · " + itemIds.length + " 卷", "✦");
    return true;
  }

  function openPreset(id) {
    const preset = getConstellations().find(function (item) { return item.id === id; });
    if (!preset) return;
    const ids = normalizeItemIds(preset.itemIds, getAvailableSites());
    if (!ids.length) {
      toast("星群尚未绑定站点", preset.name, "ℹ");
      return;
    }
    let initiated = 0;
    ids.forEach(function (siteId) {
      // window.open() frequently returns null when noopener/noreferrer is
      // requested, even when the browser allowed the popup. Treat a valid
      // openSite call as the projection instead of reporting a false block.
      if (window.NavApp && typeof window.NavApp.openSite === "function") {
        try {
          if (window.NavApp.openSite(siteId)) initiated += 1;
        } catch (error) {
          // Keep dispatching the rest of the constellation.
        }
      }
    });
    if (initiated === 0) {
      toast("星群尚未投射", "请允许弹窗后重试，或逐张点击藏书", "⚠");
      return;
    }
    toast(
      "星群连珠已投射",
      preset.name + " · " + initiated + " 卷" + (initiated < ids.length ? "（部分未编排）" : ""),
      "✦"
    );
  }

  function highlight(id, on) {
    const preset = getConstellations().find(function (item) { return item.id === id; });
    const ids = new Set(preset ? preset.itemIds : []);
    document.querySelectorAll(".entry-card").forEach(function (card) {
      card.classList.toggle("constellation-highlight", on && ids.has(card.getAttribute("data-site-id")));
    });
  }

  function multicast(value) {
    const query = String(value || "").trim();
    if (!query) {
      toast("请输入检索词", "群星会诊需要一枚关键词", "ℹ");
      return false;
    }
    const urls = MULTICAST_ENGINES.map(function (engine) {
      return engine.url + encodeURIComponent(query);
    });
    urls.forEach(function (url) {
      // With noopener/noreferrer, window.open commonly returns null. The
      // projection itself is the success signal; a browser-level blocker
      // cannot be distinguished reliably without losing that safety option.
      window.open(url, "_blank", "noopener,noreferrer");
    });
    toast("群星会诊已投射", "Google · GitHub · Bing 同时检索", "✦");
    return true;
  }

  function bindEvents() {
    if (bound) return;
    bound = true;
    const rail = document.getElementById("constellation-rail");
    if (rail) {
      rail.addEventListener("click", function (event) {
        const add = event.target.closest("[data-constellation-add]");
        if (add) {
          createCustom();
          return;
        }
        const chip = event.target.closest("[data-constellation-id]");
        if (!chip) return;
        openPreset(chip.getAttribute("data-constellation-id"));
      });
      rail.addEventListener("pointerover", function (event) {
        const chip = event.target.closest("[data-constellation-id]");
        if (!chip) return;
        highlight(chip.getAttribute("data-constellation-id"), true);
      });
      rail.addEventListener("pointerout", function (event) {
        const chip = event.target.closest("[data-constellation-id]");
        if (!chip) return;
        highlight(chip.getAttribute("data-constellation-id"), false);
      });
    }
    document.addEventListener("keydown", function (event) {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "Enter") {
        const input = document.getElementById("archive-search-input");
        if (input) {
          // The search input has its own capture-phase Enter router in
          // app.js. That router owns the multicast branch and must be the
          // only caller for this target, otherwise the same query is opened
          // twice. Keep this global fallback for non-search focus targets.
          if (event.target === input) return;
          event.preventDefault();
          multicast(input.value);
        }
      }
    }, true);
  }

  function init() {
    renderRail();
    bindEvents();
  }

  return {
    init,
    renderRail,
    getConstellations,
    multicast,
    createCustom,
    normalizeItemIds,
    DEFAULTS
  };
});
