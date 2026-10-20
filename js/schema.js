/**
 * Module: Bookmark Item Schema v2 normalization (js/schema.js)
 * Adds 2.0 fields without mutating the source data or dropping legacy fields.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavSchema = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const VALID_STATUS = new Set(["catalogued", "uncatalogued"]);
  const VALID_VISIBILITY = new Set(["public", "shadow"]);

  function formatCallNumber(index) {
    return String(Math.max(0, Number(index) || 0) + 1).padStart(2, "0");
  }

  function normalizeSubLinks(subLinks) {
    if (!Array.isArray(subLinks)) return [];
    return subLinks
      .slice(0, 4)
      .map(function (link) {
        if (!link || typeof link !== "object") return null;
        const url = typeof link.url === "string" ? link.url.trim() : "";
        if (!/^https?:\/\//i.test(url)) return null;
        return {
          label: String(link.label || "子路由").trim().slice(0, 24),
          url: url
        };
      })
      .filter(Boolean);
  }

  function normalizeItemSchema(item, index) {
    if (!item || typeof item !== "object") return null;

    const normalized = Object.assign({}, item);
    normalized.tags = Array.isArray(item.tags)
      ? item.tags.map(function (tag) { return String(tag).trim(); }).filter(Boolean)
      : [];
    normalized.title = item.title || item.name || item.id || "未命名馆藏";
    normalized.desc = item.desc || item.description || "";
    normalized.description = item.description || item.desc || "";
    normalized.status = VALID_STATUS.has(item.status) ? item.status : "catalogued";
    normalized.whySaved = typeof item.whySaved === "string" ? item.whySaved : "";
    const ledger = typeof window !== "undefined" &&
      window.NavLedger &&
      typeof window.NavLedger.getAll === "function"
      ? window.NavLedger.getAll()
      : null;
    const ledgerNotes = ledger && ledger.marginalia && ledger.marginalia[item.id];
    normalized.notes = typeof ledgerNotes === "string"
      ? ledgerNotes
      : (typeof item.notes === "string" ? item.notes : "");
    normalized.subLinks = normalizeSubLinks(item.subLinks);
    normalized.visibility = VALID_VISIBILITY.has(item.visibility) ? item.visibility : "public";
    normalized.snapshotUrl = typeof item.snapshotUrl === "string" ? item.snapshotUrl : "";
    normalized.telemetry = item.telemetry && typeof item.telemetry === "object" ? item.telemetry : null;
    normalized.createdAt = Number.isFinite(item.createdAt) ? item.createdAt : 0;
    normalized.firstSeenAt = Number.isFinite(item.firstSeenAt) ? item.firstSeenAt : 0;
    normalized.callNumber = /^\d{2,3}$/.test(String(item.callNumber || ""))
      ? String(item.callNumber)
      : formatCallNumber(index);
    normalized.number = Number.isFinite(item.number) ? item.number : index + 1;

    return normalized;
  }

  function normalizeItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map(normalizeItemSchema).filter(Boolean);
  }

  return {
    formatCallNumber,
    normalizeItemSchema,
    normalizeItems
  };
});
