/**
 * Module: A3 Marginalia (card reverse / private notes / sub-routes).
 *
 * The card markup is owned by app.js. This module owns the interaction
 * keyboard affordances and a small public API so tests and other modules can
 * flip a card without duplicating DOM rules.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavMarginalia = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  let bound = false;

  function isEditable(element) {
    if (!element) return false;
    const tag = element.tagName ? element.tagName.toLowerCase() : "";
    return tag === "input" || tag === "textarea" || tag === "select" ||
      element.isContentEditable || element.getAttribute("contenteditable") === "true";
  }

  function getCard(siteId) {
    return Array.from(document.querySelectorAll(".entry-card")).find(function (card) {
      return card.getAttribute("data-site-id") === siteId;
    }) || null;
  }

  function closeAll(except) {
    document.querySelectorAll(".entry-card.is-flipped").forEach(function (card) {
      if (card !== except) card.classList.remove("is-flipped");
    });
  }

  function flip(siteId, force) {
    const card = typeof siteId === "string" ? getCard(siteId) : siteId;
    if (!card) return false;
    const next = typeof force === "boolean" ? force : !card.classList.contains("is-flipped");
    if (next) closeAll(card);
    card.classList.toggle("is-flipped", next);
    const panel = card.querySelector(".card-marginalia");
    if (panel) panel.setAttribute("aria-hidden", next ? "false" : "true");
    return next;
  }

  function handleKeydown(event) {
    if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey) return;
    if (isEditable(event.target)) return;
    const trigger = event.target.closest && event.target.closest("[data-marginalia-toggle]");
    if (!trigger) return;
    // The anchor would otherwise navigate; Enter is reserved for the reverse.
    event.preventDefault();
    event.stopImmediatePropagation();
    const card = trigger.closest(".entry-card");
    if (card) flip(card.getAttribute("data-site-id"));
  }

  function init() {
    if (bound) return;
    bound = true;
    document.addEventListener("keydown", handleKeydown, true);
    document.addEventListener("click", function (event) {
      if (event.target.closest(".entry-card") || event.target.closest(".card-marginalia")) return;
      closeAll();
    });
  }

  return {
    init,
    flip,
    closeAll
  };
});
