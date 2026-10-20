/**
 * Module: A8 Today's Opening / random provenance card.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavSerendipity = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  let currentSite = null;
  let currentCallNumber = "";
  let lastActiveElement = null;
  let bound = false;
  let rotateTimer = null;

  function getDomain(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); }
    catch (error) { return url || ""; }
  }

  function getCategoryName(categoryId) {
    const categories = window.NAV_DATA && Array.isArray(window.NAV_DATA.categories)
      ? window.NAV_DATA.categories
      : [];
    const category = categories.find(function (item) { return item.id === categoryId; });
    return category ? category.name : (categoryId || "ARCHIVE");
  }

  function open(site, callNumber) {
    if (!site) return;
    const modal = document.getElementById("today-open-modal");
    if (!modal) return;
    clearTimeout(rotateTimer);
    currentSite = site;
    currentCallNumber = callNumber || site.callNumber || "01";
    lastActiveElement = document.activeElement;

    const numberEl = document.getElementById("today-open-number");
    const titleEl = document.getElementById("today-open-site-title");
    const categoryEl = document.getElementById("today-open-category");
    const domainEl = document.getElementById("today-open-domain");
    const descEl = document.getElementById("today-open-desc");
    const tagsEl = document.getElementById("today-open-tags");
    const visitBtn = document.getElementById("btn-today-open-visit");

    if (numberEl) numberEl.textContent = "№ " + currentCallNumber;
    if (titleEl) titleEl.textContent = site.name || site.title || site.id;
    if (categoryEl) categoryEl.textContent = getCategoryName(site.category);
    if (domainEl) domainEl.textContent = getDomain(site.url);
    const liveNotes = window.NavLedger && typeof window.NavLedger.getMarginalia === "function"
      ? window.NavLedger.getMarginalia(site.id)
      : "";
    if (descEl) descEl.textContent = liveNotes || site.notes || site.whySaved || site.description || "暂无馆藏评注。";
    if (tagsEl) {
      const tags = Array.isArray(site.tags) ? site.tags.slice(0, 5) : [];
      tagsEl.innerHTML = tags.map(function (tag) {
        return "<span>#" + String(tag).replace(/[&<>"']/g, "") + "</span>";
      }).join("");
    }
    if (visitBtn) visitBtn.setAttribute("data-site-id", site.id);

    modal.style.display = "flex";
    const card = modal.querySelector(".today-open-card");
    if (card) {
      card.classList.remove("is-turning");
      // Restart the deterministic turn without relying on a random animation.
      void card.offsetWidth;
      if (!window.matchMedia || !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        card.classList.add("is-turning");
      }
    }
    document.body.classList.add("modal-open");
    const closeBtn = document.getElementById("btn-close-today-open");
    if (closeBtn) closeBtn.focus();
  }

  function spinAndOpen(site, callNumber) {
    if (rotateTimer) clearTimeout(rotateTimer);
    const root = document.querySelector(".folio-main");
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!root || reduced) {
      open(site, callNumber);
      return;
    }

    root.classList.remove("is-serendipity-spinning");
    void root.offsetWidth;
    root.classList.add("is-serendipity-spinning");
    rotateTimer = setTimeout(function () {
      root.classList.remove("is-serendipity-spinning");
      open(site, callNumber);
    }, 460);
  }

  function close() {
    const modal = document.getElementById("today-open-modal");
    if (!modal) return;
    clearTimeout(rotateTimer);
    const card = modal.querySelector(".today-open-card");
    if (card) card.classList.remove("is-turning");
    modal.style.display = "none";
    document.body.classList.remove("modal-open");
    currentSite = null;
    if (lastActiveElement && typeof lastActiveElement.focus === "function") {
      lastActiveElement.focus();
    }
  }

  function visitCurrent() {
    if (!currentSite) return;
    if (window.NavApp && typeof window.NavApp.openSite === "function") {
      window.NavApp.openSite(currentSite.id);
    } else {
      if (window.NavLedger) {
        window.NavLedger.recordAccess(currentSite.id);
      } else if (window.NavVisits) {
        window.NavVisits.record(currentSite.id);
      }
      window.open(currentSite.url, "_blank", "noopener,noreferrer");
    }
    if (window.NavShortcuts) {
      window.NavShortcuts.showToast("已开卷翻阅", currentSite.name, "📖");
    }
    close();
  }

  function init() {
    if (bound) return;
    bound = true;
    const modal = document.getElementById("today-open-modal");
    const closeBtn = document.getElementById("btn-close-today-open");
    const visitBtn = document.getElementById("btn-today-open-visit");
    const anotherBtn = document.getElementById("btn-today-open-another");
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (visitBtn) visitBtn.addEventListener("click", visitCurrent);
    if (anotherBtn) {
      anotherBtn.addEventListener("click", function () {
        close();
        if (window.NavApp && typeof window.NavApp.openRandom === "function") {
          window.NavApp.openRandom();
        }
      });
    }
    if (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target === modal) close();
      });
      modal.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        } else if (event.key === "Enter" && document.activeElement === visitBtn) {
          event.preventDefault();
          visitCurrent();
        } else if (event.key === "Enter" && document.activeElement === anotherBtn) {
          event.preventDefault();
          close();
          if (window.NavApp && typeof window.NavApp.openRandom === "function") {
            window.NavApp.openRandom();
          }
        }
      });
    }
  }

  return {
    init,
    open,
    spinAndOpen,
    close
  };
});
