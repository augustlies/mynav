/**
 * Module: A5 「星轨联通探针」 (js/probe.js) —— Batch 2 从 telemetry.js 拆出
 *
 * 每张正式馆藏卡片注入一枚 5px 星轨联通星点（.card-star-probe）。
 * 未巡检 = 静默黄铜微点；在线 = 恒星暖白呼吸灯 + Δt 读数；离线 = 暗红残星。
 * 手动触发：/ping 命令、NavApp.Telemetry.probeAll()（别名，指向本模块）。
 * 巡检结束广播 `mynav-probe-updated`，琥珀死链兜底依赖它。
 *
 * C4 遥测机关台（仪表 + Webhook 扳手）已于 Batch 2 下线，见 archive/retired-batch2/。
 * MYNAV_LEDGER_V2.telemetryConfig 字段保留：这里只读写其中的 autoProbe，
 * instruments 原样透传、不再渲染。
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavProbe = factory();
    // 兼容别名：旧钩子 NavApp.Telemetry / window.NavTelemetry 仍可调用 probeAll。
    root.NavTelemetry = root.NavProbe;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PROBE_TIMEOUT_MS = 2000;
  const PROBE_CONCURRENCY = 4;
  const MOCK_MIN_MS = 12;
  const MOCK_SPAN_MS = 88;
  const AUTO_PROBE_DELAY_MS = 4000;

  let bound = false;
  let observer = null;
  let injectTimer = null;
  let probes = new Map();
  let probing = false;
  let autoProbeEnabled = true;
  let autoProbeScheduled = false;
  let lastSummary = { probed: 0, online: 0, offline: 0, mock: false, at: 0 };
  // Batch 3 · 疑似失效标记：只用已有巡检结果，不额外发请求。
  // 沙盒演练、本机断网、或离线占比过高（多半是网络问题而非站点死掉）时不标。
  const SUSPECT_MAX_RATIO = 0.6;
  const SUSPECT_TITLE = "可能已失效，考虑替换";
  let suspectTrusted = false;

  function notify(title, subtitle, icon) {
    if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
      window.NavShortcuts.showToast(title, subtitle || "", icon || "📡");
    }
  }

  // FNV-1a 32-bit：与藏书票印画同一套确定性散列思路，保证 mock 巡检可复现。
  function hashString(value) {
    let hash = 2166136261 >>> 0;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
  }

  // --------------------------------------------------------------------------
  // 配置（MYNAV_LEDGER_V2.telemetryConfig：只用 autoProbe，其余字段原样保留）
  // --------------------------------------------------------------------------
  function getTelemetryConfig() {
    if (window.NavLedger && typeof window.NavLedger.getTelemetryConfig === "function") {
      const config = window.NavLedger.getTelemetryConfig() || {};
      return Object.assign({}, config, { autoProbe: config.autoProbe !== false });
    }
    return { autoProbe: autoProbeEnabled };
  }

  function setTelemetryConfig(patch) {
    const next = Object.assign({}, getTelemetryConfig(), patch || {});
    next.autoProbe = next.autoProbe !== false;
    if (window.NavLedger && typeof window.NavLedger.setTelemetryConfig === "function") {
      window.NavLedger.setTelemetryConfig(next);
    }
    autoProbeEnabled = next.autoProbe;
    return next;
  }


  // --------------------------------------------------------------------------
  // A5 星轨联通探针
  // --------------------------------------------------------------------------
  function probeStatus(siteId) {
    const entry = probes.get(siteId);
    return entry ? entry.status : "idle";
  }

  function mockProbe(siteId) {
    const hash = hashString(siteId);
    const online = hash % 4 !== 0;
    return {
      status: online ? "online" : "offline",
      latencyMs: online ? MOCK_MIN_MS + (hash % MOCK_SPAN_MS) : 0,
      at: Date.now(),
      mock: true
    };
  }

  async function realProbe(site) {
    const started = (typeof performance !== "undefined" && performance.now)
      ? performance.now()
      : Date.now();
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, PROBE_TIMEOUT_MS);
    try {
      await fetch(site.url, {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal
      });
      const ended = (typeof performance !== "undefined" && performance.now)
        ? performance.now()
        : Date.now();
      return {
        status: "online",
        latencyMs: Math.max(1, Math.round(ended - started)),
        at: Date.now(),
        mock: false
      };
    } catch (error) {
      return { status: "offline", latencyMs: 0, at: Date.now(), mock: false };
    } finally {
      clearTimeout(timer);
    }
  }

  function probeTargets(options) {
    const cards = Array.from(document.querySelectorAll(".entry-card[data-site-id]"));
    let ids = cards.map(function (card) { return card.getAttribute("data-site-id"); }).filter(Boolean);
    const explicit = options && Array.isArray(options.ids) ? options.ids : null;
    if (explicit && explicit.length) {
      const wanted = new Set(explicit.map(String));
      ids = ids.filter(function (id) { return wanted.has(id); });
    }
    const limit = options && Number(options.limit) > 0 ? Number(options.limit) : 0;
    if (limit) ids = ids.slice(0, limit);
    return Array.from(new Set(ids));
  }

  function siteById(siteId) {
    if (window.NavApp && typeof window.NavApp.getSiteById === "function") {
      const site = window.NavApp.getSiteById(siteId);
      if (site) return site;
    }
    const all = window.NavApp && typeof window.NavApp.getAllSites === "function"
      ? window.NavApp.getAllSites()
      : [];
    return all.find(function (item) { return item.id === siteId; }) || null;
  }

  async function probeAll(options) {
    const config = options || {};
    if (probing) {
      return { probed: 0, online: 0, offline: 0, mock: Boolean(config.mock), busy: true, results: {} };
    }
    probing = true;
    const ids = probeTargets(config);
    const useMock = config.mock === true;

    ids.forEach(function (siteId) {
      probes.set(siteId, { status: "probing", latencyMs: 0, at: Date.now(), mock: useMock });
    });
    syncCards();

    if (ids.length === 0) {
      probing = false;
      lastSummary = { probed: 0, online: 0, offline: 0, mock: useMock, at: Date.now() };
      return { probed: 0, online: 0, offline: 0, mock: useMock, results: {} };
    }

    const results = {};
    if (useMock) {
      ids.forEach(function (siteId) {
        const result = mockProbe(siteId);
        probes.set(siteId, result);
        results[siteId] = result;
      });
    } else {
      let cursor = 0;
      const workers = [];
      const size = Math.max(1, Math.min(PROBE_CONCURRENCY, ids.length));
      for (let slot = 0; slot < size; slot += 1) {
        workers.push((async function () {
          while (cursor < ids.length) {
            const index = cursor;
            cursor += 1;
            const siteId = ids[index];
            const site = siteById(siteId);
            if (!site || !site.url) {
              const offline = { status: "offline", latencyMs: 0, at: Date.now(), mock: false };
              probes.set(siteId, offline);
              results[siteId] = offline;
              continue;
            }
            const result = await realProbe(site);
            probes.set(siteId, result);
            results[siteId] = result;
          }
        })());
      }
      await Promise.all(workers);
    }

    let online = 0;
    let offline = 0;
    ids.forEach(function (siteId) {
      const status = probes.get(siteId) ? probes.get(siteId).status : "offline";
      if (status === "online") online += 1;
      else offline += 1;
    });

    probing = false;
    lastSummary = { probed: ids.length, online: online, offline: offline, mock: useMock, at: Date.now() };
    suspectTrusted = !useMock && ids.length > 0 &&
      !(typeof navigator !== "undefined" && navigator.onLine === false) &&
      offline / ids.length <= SUSPECT_MAX_RATIO;
    syncCards();
    // Phase 4B · D5：巡检结果广播给网页琥珀，离线卡片的「调阅拓片」徽章
    // 依赖这次通知才会浮现。事件本身无副作用，纯通知。
    try {
      window.dispatchEvent(new CustomEvent("mynav-probe-updated", {
        detail: { probed: ids.length, online: online, offline: offline, mock: useMock }
      }));
    } catch (error) {}

    if (!config.silent) {
      notify(
        "星轨巡检完成",
        "在线 " + online + " · 离线 " + offline + (useMock ? " · 沙盒演练" : ""),
        "📡"
      );
    }

    return {
      probed: ids.length,
      online: online,
      offline: offline,
      mock: useMock,
      results: results
    };
  }

  // --------------------------------------------------------------------------
  // 卡片星点注入与状态渲染
  // --------------------------------------------------------------------------
  function probeAnchor(card) {
    if (card.classList.contains("card--slip")) {
      const slip = card.querySelector(".card-slip-domain");
      if (slip) return slip;
    }
    return card.querySelector(".card-domain-slug") || card.querySelector(".card-slip-domain");
  }

  function buildProbeNode() {
    const node = document.createElement("span");
    node.className = "card-star-probe is-idle";
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("data-probe-status", "idle");
    node.setAttribute("data-latency-ms", "0");
    node.title = "星轨未巡检";
    return node;
  }

  function applyProbe(card) {
    const siteId = card.getAttribute("data-site-id");
    const node = card.querySelector(".card-star-probe");
    if (!node || !siteId) return;
    const entry = probes.get(siteId);
    const status = entry ? entry.status : "idle";
    const suspect = status === "offline" && suspectTrusted && !(entry && entry.mock);
    card.toggleAttribute("data-link-suspect", suspect);
    node.classList.toggle("is-suspect", suspect);
    if (suspect) {
      node.removeAttribute("aria-hidden");
      node.setAttribute("role", "img");
      node.setAttribute("aria-label", SUSPECT_TITLE);
    } else if (node.getAttribute("role") === "img") {
      node.setAttribute("aria-hidden", "true");
      node.removeAttribute("role");
      node.removeAttribute("aria-label");
    }
    node.classList.remove("is-idle", "is-online", "is-offline", "is-probing");
    node.classList.add("is-" + status);
    node.setAttribute("data-probe-status", status);
    if (status === "online") {
      const latency = Math.max(1, Number(entry.latencyMs) || 1);
      node.setAttribute("data-latency-ms", String(latency));
      node.title = "星轨畅通 · Δt " + latency + "ms";
    } else if (status === "offline") {
      node.setAttribute("data-latency-ms", "0");
      node.title = suspect ? SUSPECT_TITLE : "星轨受阻 / 离线";
    } else if (status === "probing") {
      node.setAttribute("data-latency-ms", "0");
      node.title = "星轨巡检中…";
    } else {
      node.setAttribute("data-latency-ms", "0");
      node.title = "星轨未巡检";
    }
  }

  function injectProbes() {
    const cards = Array.from(document.querySelectorAll(".entry-card[data-site-id]"));
    let injected = 0;
    cards.forEach(function (card) {
      if (!card.querySelector(".card-star-probe")) {
        const anchor = probeAnchor(card);
        if (!anchor) return;
        anchor.insertAdjacentElement("afterend", buildProbeNode());
        injected += 1;
      }
      applyProbe(card);
    });
    return injected;
  }

  function syncCards() {
    Array.from(document.querySelectorAll(".entry-card[data-site-id]")).forEach(applyProbe);
  }

  function observeContent() {
    const area = document.getElementById("archive-content-area");
    if (!area || typeof MutationObserver !== "function") return;
    if (observer) observer.disconnect();
    observer = new MutationObserver(function () {
      if (injectTimer) return;
      injectTimer = setTimeout(function () {
        injectTimer = null;
        injectProbes();
      }, 110);
    });
    observer.observe(area, { childList: true, subtree: true });
  }

  // --------------------------------------------------------------------------
  // C4 遥测机关台

  // --------------------------------------------------------------------------
  // 事件绑定与初始化
  // --------------------------------------------------------------------------
  function bindEvents() {
    if (bound) return;
    bound = true;
    window.addEventListener("nav-overrides-changed", function () {
      setTimeout(injectProbes, 90);
    });
  }

  function scheduleAutoProbe() {
    if (autoProbeScheduled) return;
    autoProbeScheduled = true;
    const config = getTelemetryConfig();
    autoProbeEnabled = config.autoProbe !== false;
    if (!autoProbeEnabled) return;
    // 自动化测试环境（Playwright 会置 navigator.webdriver = true）保持确定性，
    // 首屏轻量探测只服务于真实访客。
    if (typeof navigator !== "undefined" && navigator.webdriver) return;
    // `window` 是这里唯一可靠的全局引用：本工厂函数没有接收 UMD 的 root 参数。
    if (typeof window !== "undefined" && window.__MYNAV_DISABLE_AUTOPROBE__ === true) return;
    setTimeout(function () {
      if (document.hidden) return;
      probeAll({ limit: 8, silent: true });
    }, AUTO_PROBE_DELAY_MS);
  }

  function init() {
    bindEvents();
    const config = getTelemetryConfig();
    autoProbeEnabled = config.autoProbe !== false;
    injectProbes();
    observeContent();
    scheduleAutoProbe();
    if (window.NavApp) {
      window.NavApp.Probe = api;
      window.NavApp.Telemetry = api;
    }
  }

  function getState() {
    const entries = {};
    probes.forEach(function (value, key) {
      entries[key] = Object.assign({}, value);
    });
    let online = 0;
    let offline = 0;
    let idle = 0;
    probes.forEach(function (value) {
      if (value.status === "online") online += 1;
      else if (value.status === "offline") offline += 1;
      else idle += 1;
    });
    return {
      probing: probing,
      probes: entries,
      online: online,
      offline: offline,
      idle: idle,
      mock: lastSummary.mock,
      lastSummary: Object.assign({}, lastSummary),
      autoProbe: autoProbeEnabled,
      probeNodes: document.querySelectorAll(".card-star-probe").length,
      config: getTelemetryConfig()
    };
  }

  function getProbe(siteId) {
    const entry = probes.get(siteId);
    return entry ? Object.assign({}, entry) : null;
  }

  function resetProbes() {
    probes = new Map();
    lastSummary = { probed: 0, online: 0, offline: 0, mock: false, at: 0 };
    syncCards();
    try {
      window.dispatchEvent(new CustomEvent("mynav-probe-updated", {
        detail: { probed: 0, online: 0, offline: 0, mock: false, reset: true }
      }));
    } catch (error) {}
    return true;
  }

  function setAutoProbe(enabled) {
    autoProbeEnabled = Boolean(enabled);
    setTelemetryConfig({ autoProbe: autoProbeEnabled });
    return autoProbeEnabled;
  }

  // 已下线的机关台接口保留为空操作，旧调用方不会抛错（retired in Batch 2）。
  function retired() { return false; }

  const api = {
    init,
    probeAll,
    getState,
    getProbe,
    getTelemetryConfig,
    setTelemetryConfig,
    injectProbes,
    syncCards,
    resetProbes,
    setAutoProbe,
    hashString,
    openDeck: retired,
    closeDeck: retired,
    toggleDeck: retired,
    isDeckOpen: retired,
    PROBE_TIMEOUT_MS
  };

  return api;
});
