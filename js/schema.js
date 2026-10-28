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
    // Batch 3：只读这一条批注，不再为每张卡片深拷贝整本 MYNAV_LEDGER_V2（首屏省下约 60ms@4×CPU）。
    const navLedger = typeof window !== "undefined" ? window.NavLedger : null;
    let ledgerNotes;
    if (navLedger && typeof navLedger.getMarginalia === "function") {
      ledgerNotes = navLedger.getMarginalia(item.id) || undefined;
    } else if (navLedger && typeof navLedger.getAll === "function") {
      const ledger = navLedger.getAll();
      ledgerNotes = ledger && ledger.marginalia && ledger.marginalia[item.id];
    }
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

  // ---------------------------------------------------------------------------
  // Icon resolution
  // ---------------------------------------------------------------------------
  // Static catalogues carry checked-in PNGs. Entries added at runtime may only
  // have a URL, so resolve them through privacy-safe, image-only providers.
  const LOCAL_ICON_IDS = new Set([
    "ai-chatgpt", "ai-claude", "ai-deepseek-platform", "ai-deepseek", "ai-gemini",
    "ai-hark", "ai-muse", "dev-caniuse", "dev-cloudflare", "dev-github", "dev-mdn",
    "dev-stackoverflow", "dev-vercel", "learn-bilibili", "learn-cnki",
    "learn-ecut-ehall", "learn-ecut", "learn-juejin", "learn-runoob", "learn-sspai",
    "tool-cobalt", "tool-icon-icons", "tool-notion", "tool-processon", "tool-tinypng",
    "tool-yuque", "dev-qinglong", "dev-gcp-console", "dev-dujing", "dev-termius",
    "learn-youtube", "learn-scholar", "learn-ecut-atrust", "social-telegram",
    "mail-gmail", "mail-163", "social-discord", "social-x"
  ]);
  const PROBE_STEP_ATTR = "data-icon-probe-step";

  function hostnameOf(url) {
    try {
      return String(new URL(String(url || "").trim()).hostname || "").toLowerCase();
    } catch (error) {
      return "";
    }
  }

  function isPrivateOrIpHost(hostname) {
    const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
    if (!host) return true;
    if (host === "localhost" || host.endsWith(".localhost") ||
        host.endsWith(".local") || host.endsWith(".lan") ||
        host.endsWith(".internal") || host.endsWith(".home")) return true;
    if (host.includes(":")) return true;
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!ipv4) return false;
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((part) => part < 0 || part > 255)) return true;
    // Any literal IPv4 address is a self-hosted service, never a brand we can
    // look up safely. Public addresses like the 203.0.113.10 probe must not
    // leak to favicon providers either.
    return true;
  }

  function buildMonogramDataUri(titleOrDomain) {
    const raw = String(titleOrDomain || "").trim().replace(/^https?:\/\//i, "");
    const ch = Array.from(raw.replace(/^www\./i, "")).find((character) => /[\p{L}\p{N}]/u.test(character)) || "✦";
    const safe = String(ch).toUpperCase()
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">' +
      '<rect width="64" height="64" rx="12" fill="#182030" fill-opacity="0.08"/>' +
      '<text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" ' +
      'font-family="Cinzel, Noto Serif SC, Georgia, serif" font-size="30" ' +
      'font-weight="600" fill="#8C5A32">' + safe + '</text></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function safeImageSource(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^icons\/[a-z0-9._/-]+\.(?:png|ico|svg)$/i.test(text)) return text;
    if (/^https?:\/\/[^\s"'<>]+$/i.test(text)) return text;
    if (/^data:image\/svg\+xml(?:;charset=utf-8)?,/i.test(text)) return text;
    return "";
  }

  // DDG first, then icon.horse, then Google S2, then the inline monogram.
  // Providers are image endpoints with no CORS requirement for <img>, so a
  // failure is isolated to the element and can never break the page.
  // Note: a provider 404 is still reported by Chromium's network console;
  // that is browser-level noise we cannot suppress. The catalogue itself is
  // fully local, so a cold start issues zero provider requests.
  function iconProviders(hostname) {
    const domain = encodeURIComponent(hostname);
    return [
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      `https://icon.horse/icon/${domain}`,
      `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
    ];
  }

  function resolveIcon(site, fallbackText) {
    const item = site || {};
    const id = String(item.id || "").trim();
    const explicit = safeImageSource(item.favicon || "");
    const local = safeImageSource(item.iconPath || "");
    if (local) return local;
    if (/^icons\//i.test(explicit)) return explicit;
    if (id && LOCAL_ICON_IDS.has(id)) return `icons/${encodeURIComponent(id)}.png`;
    if (explicit) return explicit;
    const hostname = hostnameOf(item.url || item.href || "");
    if (!hostname || isPrivateOrIpHost(hostname)) {
      return buildMonogramDataUri(fallbackText || item.name || item.title || hostname);
    }
    return iconProviders(hostname)[0];
  }

  function iconAttributes(site, fallbackText) {
    const item = site || {};
    const src = resolveIcon(item, fallbackText);
    if (!src) return "";
    const hostname = hostnameOf(item.url || item.href || "");
    const explicit = safeImageSource(item.favicon || "");
    const providers = hostname && !isPrivateOrIpHost(hostname) ? iconProviders(hostname) : [];
    const fallbacks = (/^https?:\/\//i.test(src)
      ? providers.filter((url) => url !== src)
      : providers).slice(0, 2);
    const monogram = buildMonogramDataUri(fallbackText || item.name || item.title || hostname || idOf(item));
    const attrs = [
      `src="${escapeAttribute(src)}"`,
      `data-icon-fallback="${escapeAttribute(monogram)}"`,
      `data-icon-probe-step="0"`
    ];
    if (explicit && /^https?:\/\//i.test(explicit) && src === explicit) {
      attrs.push(`data-icon-explicit="1"`);
    }
    attrs.push(`data-fallback-1="${escapeAttribute(fallbacks[0] || monogram)}"`);
    attrs.push(`data-fallback-2="${escapeAttribute(fallbacks[1] || monogram)}"`);
    return attrs.join(" ");
  }

  function idOf(site) {
    return String((site && site.id) || "").trim();
  }

  function escapeAttribute(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function iconFallbackChain(image) {
    if (!image) return [];
    return [
      image.getAttribute("data-fallback-1") || "",
      image.getAttribute("data-fallback-2") || "",
      image.getAttribute("data-icon-fallback") || ""
    ].filter(Boolean);
  }

  function handleIconError(image) {
    if (!image || image.dataset.iconFallbackLocked === "true") return false;
    const chain = iconFallbackChain(image);
    const step = Math.max(0, Number(image.getAttribute(PROBE_STEP_ATTR) || 0));
    let next = step;
    while (next < chain.length) {
      const candidate = chain[next];
      if (candidate && candidate !== image.getAttribute("src")) {
        image.setAttribute(PROBE_STEP_ATTR, String(next + 1));
        // The last rung is the in-memory SVG. Lock immediately so even a
        // pathological data-URI failure can never re-enter the handler.
        if (/^data:image\//i.test(candidate)) image.dataset.iconFallbackLocked = "true";
        image.src = candidate;
        return true;
      }
      next += 1;
    }
    image.setAttribute(PROBE_STEP_ATTR, String(chain.length));
    image.dataset.iconFallbackLocked = "true";
    image.onerror = null;
    return false;
  }

  function bindIconFallbacks(root) {
    const scope = root && typeof root.querySelectorAll === "function" ? root : document;
    if (!scope.querySelectorAll) return 0;
    let count = 0;
    scope.querySelectorAll("img[data-icon-fallback]:not([data-icon-bound])").forEach((image) => {
      image.setAttribute("data-icon-bound", "1");
      image.addEventListener("error", function () { handleIconError(image); });
      image.addEventListener("load", function () {
        if (image.naturalWidth > 0) image.dataset.iconLoaded = "true";
      });
      count += 1;
    });
    return count;
  }

  function waitForIcon(image, timeoutMs) {
    if (!image) return Promise.resolve({ event: "missing", complete: false, naturalWidth: 0 });
    const limit = Math.max(250, Number(timeoutMs) || 3000);
    if (image.complete) {
      return Promise.resolve({
        event: image.naturalWidth > 0 ? "complete" : "error",
        complete: true,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight
      });
    }
    return new Promise((resolve) => {
      let settled = false;
      let timer = null;
      const snapshot = function (eventName) {
        resolve({
          event: eventName,
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight
        });
      };
      const finish = function (eventName) {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        // Decode after the load event so naturalWidth is stable in Chromium.
        const done = function () {
          snapshot(eventName);
        };
        if (typeof image.decode === "function") {
          // decode() can hang for a lazy image that never entered the
          // viewport; bound it so callers always settle.
          const decodeTimer = setTimeout(done, limit);
          image.decode().then(function () {
            clearTimeout(decodeTimer);
            done();
          }).catch(function () {
            clearTimeout(decodeTimer);
            done();
          });
        } else {
          done();
        }
      };
      image.addEventListener("load", function () { finish("load"); }, { once: true });
      image.addEventListener("error", function () { finish("error"); }, { once: true });
      timer = setTimeout(function () { finish("timeout"); }, limit);
    });
  }

  return {
    formatCallNumber,
    normalizeItemSchema,
    normalizeItems,
    resolveIcon,
    iconAttributes,
    handleIconError,
    bindIconFallbacks,
    waitForIcon,
    isPrivateOrIpHost,
    buildMonogramDataUri,
    hostnameOf
  };
});
