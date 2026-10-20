/**
 * Module: A2 two-digit call-number chords and R serendipity key.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavFolioKeys = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CHORD_WINDOW_MS = 450;
  let buffer = "";
  let bufferTimer = null;
  let stampTimer = null;
  let bound = false;
  let hooks = {
    onOpenNumber: null,
    onRandom: null,
    onCategorySwitch: null
  };

  function isEditable(element) {
    if (!element) return false;
    const tag = element.tagName ? element.tagName.toLowerCase() : "";
    return tag === "input" || tag === "textarea" || tag === "select" ||
      element.isContentEditable || element.getAttribute("contenteditable") === "true";
  }

  function isModalOpen() {
    const ids = [
      "bookplate-modal",
      "shortcuts-modal",
      "colophon-modal",
      "today-open-modal",
      "card-edit-modal",
      "hidden-cards-modal",
      "snippets-modal"
    ];
    return ids.some(function (id) {
      const modal = document.getElementById(id);
      return modal && modal.style.display !== "none";
    }) || (function () {
      const drawer = document.getElementById("uncatalogued-drawer");
      return drawer && !drawer.hidden;
    })();
  }

  function showStamp(title, subtitle, tone) {
    const stamp = document.getElementById("folio-chord-stamp");
    if (!stamp) return;
    const titleEl = stamp.querySelector(".chord-stamp-title");
    const subEl = stamp.querySelector(".chord-stamp-sub");
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = subtitle || "";
    stamp.classList.toggle("is-error", tone === "error");
    stamp.classList.add("is-visible");
    clearTimeout(stampTimer);
    stampTimer = setTimeout(function () {
      stamp.classList.remove("is-visible");
    }, 1900);
  }

  function resetBuffer() {
    buffer = "";
    clearTimeout(bufferTimer);
    bufferTimer = null;
  }

  function openByCode(code) {
    const result = hooks.onOpenNumber ? hooks.onOpenNumber(code) : null;
    if (result && result.site) {
      const domain = (function () {
        try { return new URL(result.site.url).hostname.replace(/^www\./, ""); }
        catch (error) { return result.site.url; }
      })();
      showStamp("正在调阅 № " + code + " · " + result.site.name, domain);
      if (window.NavApp && typeof window.NavApp.openSite === "function") {
        window.NavApp.openSite(result.site.id);
      } else {
        window.open(result.site.url, "_blank", "noopener,noreferrer");
      }
    } else {
      showStamp("索书号未收录 · № " + code, "请核对当前馆藏编号", "error");
    }
  }

  function acceptDigit(digit) {
    if (!buffer) {
      buffer = digit;
      showStamp("索书号 · " + digit + "_", "450ms 内按下第二位数字");
      clearTimeout(bufferTimer);
      bufferTimer = setTimeout(resetBuffer, CHORD_WINDOW_MS);
      return;
    }
    const code = buffer + digit;
    resetBuffer();
    openByCode(code);
  }

  function handleKeydown(event) {
    if (event.defaultPrevented || event.isComposing) return;
    if (isEditable(event.target) || isModalOpen()) return;
    if (event.ctrlKey || event.metaKey) return;
    const key = event.key;

    if (event.altKey && /^[1-7]$/.test(key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (hooks.onCategorySwitch) hooks.onCategorySwitch(Number(key) - 1);
      return;
    }

    if (/^\d$/.test(key) && !event.altKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      acceptDigit(key);
      return;
    }

    if ((key === "r" || key === "R") && !event.altKey && !event.repeat) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (hooks.onRandom) hooks.onRandom();
      return;
    }

    if (key === "Escape") resetBuffer();
  }

  function init(customHooks) {
    hooks = Object.assign(hooks, customHooks || {});
    if (bound) return;
    bound = true;
    window.addEventListener("keydown", handleKeydown, true);
  }

  return {
    init,
    CHORD_WINDOW_MS
  };
});
