/**
 * Module: A5 「星轨联通探针」+ C4 「星轨遥测与机关台」 (js/telemetry.js)
 *
 * A5：每张正式馆藏卡片注入一枚 5px 星轨联通星点（.card-star-probe）。
 *     未巡检 = 静默黄铜微点；在线 = 恒星暖白呼吸灯 + Δt 读数；离线 = 暗红残星。
 *     手动触发：/ping 命令、[ 📡 巡检星轨 ] 按钮、NavApp.Telemetry.probeAll()。
 *     探测使用 AbortController 限制 2000ms 超时并做并发控制，绝不阻塞桌面。
 *
 * C4：右栏嵌入式「司天监遥测机关台」(.telemetry-deck)，默认 3 枚古典仪器表盘：
 *     算力余量表 / 星槎负载仪 / 「黄铜扳手」Webhook 机关拨片。
 *     配置持久化于 MYNAV_LEDGER_V2.telemetryConfig。
 *
 * 离线、未配置真实端点或自动化测试环境下，全部机关走确定性沙盒演练，绝不报错阻塞。
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavTelemetry = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PROBE_TIMEOUT_MS = 2000;
  const PROBE_CONCURRENCY = 4;
  const MOCK_MIN_MS = 12;
  const MOCK_SPAN_MS = 88;
  const AUTO_PROBE_DELAY_MS = 4000;
  const HOOK_TIMEOUT_MS = 5000;

  const DEFAULT_INSTRUMENTS = {
    quota: {
      id: "quota",
      label: "DeepSeek / OpenRouter",
      value: "余额充足",
      note: "预警线 20% · 点此更新额度记录",
      endpoint: ""
    },
    node: {
      id: "node",
      label: "sueexin.dev",
      value: "节点在线",
      expiresAt: "",
      note: "主域名续航倒计时"
    },
    hook: {
      id: "hook",
      label: "Cloudflare Pages 部署钩子",
      url: "",
      method: "POST",
      status: "",
      latencyMs: 0,
      at: 0
    }
  };

  let bound = false;
  let observer = null;
  let injectTimer = null;
  let probes = new Map();
  let probing = false;
  let autoProbeEnabled = true;
  let autoProbeScheduled = false;
  let deckOpen = false;
  let lastSummary = { probed: 0, online: 0, offline: 0, mock: false, at: 0 };

  // --------------------------------------------------------------------------
  // 工具函数
  // --------------------------------------------------------------------------
  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

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

  function localDateKey(timestamp) {
    const date = new Date(timestamp);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function daysUntil(dateText) {
    const raw = String(dateText || "").trim();
    if (!raw) return null;
    const target = new Date(raw + "T12:00:00");
    if (isNaN(target.getTime())) return null;
    const now = new Date();
    const a = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
    const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((a - b) / 86400000);
  }

  // --------------------------------------------------------------------------
  // 遥测配置（持久化于 MYNAV_LEDGER_V2.telemetryConfig）
  // --------------------------------------------------------------------------
  function cloneInstruments(source) {
    const base = {};
    Object.keys(DEFAULT_INSTRUMENTS).forEach(function (key) {
      base[key] = Object.assign({}, DEFAULT_INSTRUMENTS[key]);
    });
    if (source && typeof source === "object") {
      Object.keys(source).forEach(function (key) {
        if (!base[key]) {
          base[key] = Object.assign({}, source[key]);
          return;
        }
        base[key] = Object.assign({}, base[key], source[key]);
      });
    }
    Object.keys(base).forEach(function (key) {
      base[key].id = key;
    });
    return base;
  }

  function getTelemetryConfig() {
    if (window.NavLedger && typeof window.NavLedger.getTelemetryConfig === "function") {
      const config = window.NavLedger.getTelemetryConfig();
      return {
        autoProbe: config.autoProbe !== false,
        instruments: cloneInstruments(config.instruments)
      };
    }
    return { autoProbe: autoProbeEnabled, instruments: cloneInstruments(null) };
  }

  function setTelemetryConfig(patch) {
    const current = getTelemetryConfig();
    const next = {
      autoProbe: patch && patch.autoProbe !== undefined ? Boolean(patch.autoProbe) : current.autoProbe,
      instruments: cloneInstruments(
        patch && patch.instruments
          ? Object.assign({}, current.instruments, patch.instruments)
          : current.instruments
      )
    };
    if (window.NavLedger && typeof window.NavLedger.setTelemetryConfig === "function") {
      window.NavLedger.setTelemetryConfig(next);
    }
    autoProbeEnabled = next.autoProbe;
    renderDeck();
    return next;
  }

  function updateInstrument(id, patch) {
    const current = getTelemetryConfig();
    const target = current.instruments[id];
    if (!target) return null;
    const merged = Object.assign({}, target, patch || {});
    current.instruments[id] = merged;
    return setTelemetryConfig({ instruments: current.instruments });
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
      renderDeck();
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
    syncCards();
    renderDeck();
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
    node.classList.remove("is-idle", "is-online", "is-offline", "is-probing");
    node.classList.add("is-" + status);
    node.setAttribute("data-probe-status", status);
    if (status === "online") {
      const latency = Math.max(1, Number(entry.latencyMs) || 1);
      node.setAttribute("data-latency-ms", String(latency));
      node.title = "星轨畅通 · Δt " + latency + "ms";
    } else if (status === "offline") {
      node.setAttribute("data-latency-ms", "0");
      node.title = "星轨受阻 / 离线";
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
  function instrumentValueText(instrument) {
    if (instrument.id === "quota") {
      return instrument.label + " · " + instrument.value;
    }
    if (instrument.id === "node") {
      return instrument.label + " · " + instrument.value;
    }
    return instrument.label;
  }

  function instrumentNoteText(instrument) {
    if (instrument.id === "node") {
      const days = daysUntil(instrument.expiresAt);
      if (days === null) return "待登记续期日 · 点此登记";
      if (days < 0) return "已于 " + instrument.expiresAt + " 过期 " + Math.abs(days) + " 天";
      return "距续期 " + days + " 天 · " + instrument.expiresAt;
    }
    if (instrument.id === "hook") {
      if (instrument.status) return instrument.status;
      return instrument.url ? "已配置端点 · 待命" : "未配置真实端点 · 沙盒演练";
    }
    return instrument.note || "";
  }

  function renderDeck() {
    const body = document.getElementById("telemetry-deck-body");
    if (!body) return;
    const config = getTelemetryConfig();
    const quota = config.instruments.quota;
    const node = config.instruments.node;
    const hook = config.instruments.hook;

    body.innerHTML = [
      '<div class="telemetry-deck-instruments">',

      '<article class="telemetry-instrument telemetry-instrument--quota" data-instrument="quota">',
      '<span class="telemetry-instrument-label">算力余量表 · API QUOTA</span>',
      '<strong class="telemetry-instrument-value" data-instrument-value="quota">',
      escapeHtml(instrumentValueText(quota)), "</strong>",
      '<span class="telemetry-instrument-note" data-instrument-note="quota">',
      escapeHtml(instrumentNoteText(quota)), "</span>",
      '<div class="telemetry-instrument-actions">',
      '<button type="button" class="telemetry-instrument-btn" data-telemetry-edit="quota">⚙ 更新额度</button>',
      "</div>",
      "</article>",

      '<article class="telemetry-instrument telemetry-instrument--node" data-instrument="node">',
      '<span class="telemetry-instrument-label">星槎负载仪 · NODE STATUS</span>',
      '<strong class="telemetry-instrument-value" data-instrument-value="node">',
      escapeHtml(instrumentValueText(node)), "</strong>",
      '<span class="telemetry-instrument-note" data-instrument-note="node">',
      escapeHtml(instrumentNoteText(node)), "</span>",
      '<div class="telemetry-instrument-actions">',
      '<button type="button" class="telemetry-instrument-btn" data-telemetry-edit="node">⚙ 登记续期日</button>',
      "</div>",
      "</article>",

      '<article class="telemetry-instrument telemetry-instrument--hook" data-instrument="hook">',
      '<span class="telemetry-instrument-label">黄铜扳手 · WEBHOOK TRIGGER</span>',
      '<strong class="telemetry-instrument-value" data-instrument-value="hook">',
      escapeHtml(hook.label), "</strong>",
      '<span class="telemetry-instrument-note" data-instrument-note="hook" data-hook-status>',
      escapeHtml(instrumentNoteText(hook)), "</span>",
      '<div class="telemetry-instrument-actions">',
      '<button type="button" class="telemetry-brass-lever" data-telemetry-hook="hook"',
      ' aria-label="触发黄铜扳手机关">',
      '<span class="telemetry-lever-glyph" aria-hidden="true">🔧</span>',
      '<span class="telemetry-lever-label">扳动机关</span>',
      "</button>",
      '<button type="button" class="telemetry-instrument-btn" data-telemetry-edit="hook">⚙ 配置端点</button>',
      "</div>",
      "</article>",

      "</div>",
      '<p class="telemetry-deck-summary" data-telemetry-summary>',
      escapeHtml(summaryText()), "</p>"
    ].join("");
  }

  function summaryText() {
    if (!lastSummary.probed) {
      return "星轨巡检 · 尚未巡检（点 [ 📡 巡检星轨 ] 或输入 /ping）";
    }
    return "星轨巡检 · 在线 " + lastSummary.online + " · 离线 " + lastSummary.offline +
      (lastSummary.mock ? " · 沙盒演练" : "") + " · " +
      localDateKey(lastSummary.at) + " " +
      new Date(lastSummary.at).toTimeString().slice(0, 8);
  }

  function updateHookStatus(text) {
    const node = document.querySelector("[data-hook-status]");
    if (node) node.textContent = String(text || "");
  }

  async function triggerHook(id, options) {
    const config = getTelemetryConfig();
    const instrument = config.instruments[id];
    if (!instrument) return null;
    // The lever lives inside the re-rendered deck, so the animation has to be
    // re-applied to whichever node is live *after* the config write below.
    function animateLever() {
      const lever = document.querySelector('[data-telemetry-hook="' + id + '"]');
      if (!lever) return;
      lever.classList.remove("is-pulling", "is-pulled");
      // Force a reflow so the pull keyframes restart on a reused node.
      void lever.offsetWidth;
      lever.classList.add("is-pulling");
      setTimeout(function () {
        const live = document.querySelector('[data-telemetry-hook="' + id + '"]') || lever;
        live.classList.remove("is-pulling");
        live.classList.add("is-pulled");
      }, 320);
    }

    animateLever();

    const useMock = Boolean(options && options.mock) || !instrument.url;
    let statusText = "";
    let httpCode = 200;
    let latency = 0;

    if (useMock) {
      // 沙盒演练：离线、未配置真实 URL 或自动化测试时的确定性回执。
      latency = MOCK_MIN_MS + (hashString(id + instrument.label) % MOCK_SPAN_MS);
      statusText = "⚙️ 机关已触发 · HTTP " + httpCode + " (Δt " + latency + "ms · 沙盒演练)";
    } else {
      const started = (typeof performance !== "undefined" && performance.now)
        ? performance.now()
        : Date.now();
      const controller = new AbortController();
      const timer = setTimeout(function () { controller.abort(); }, HOOK_TIMEOUT_MS);
      try {
        const response = await fetch(instrument.url, {
          method: instrument.method || "POST",
          mode: "no-cors",
          cache: "no-store",
          signal: controller.signal
        });
        const ended = (typeof performance !== "undefined" && performance.now)
          ? performance.now()
          : Date.now();
        latency = Math.max(1, Math.round(ended - started));
        httpCode = response && response.status ? response.status : 200;
        statusText = "⚙️ 机关已触发 · HTTP " + httpCode + " (Δt " + latency + "ms)";
      } catch (error) {
        const ended = (typeof performance !== "undefined" && performance.now)
          ? performance.now()
          : Date.now();
        latency = Math.max(1, Math.round(ended - started));
        httpCode = 0;
        statusText = "⚙️ 机关受阻 · 未获回执 (Δt " + latency + "ms)";
      } finally {
        clearTimeout(timer);
      }
    }

    const updated = updateInstrument(id, {
      status: statusText,
      latencyMs: latency,
      at: Date.now()
    });
    // updateInstrument() re-renders the deck, which replaces the lever node and
    // would drop the "is-pulled" mark. Re-apply it to the fresh node.
    animateLever();
    updateHookStatus(statusText);
    notify(
      httpCode ? "黄铜扳手已拨动" : "黄铜扳手受阻",
      instrument.label + " · " + statusText,
      "⚙️"
    );
    return {
      ok: Boolean(httpCode),
      httpCode: httpCode,
      latencyMs: latency,
      mock: useMock,
      status: statusText,
      config: updated
    };
  }

  function editInstrument(id) {
    const config = getTelemetryConfig();
    const instrument = config.instruments[id];
    if (!instrument) return null;
    if (id === "quota") {
      const value = prompt("算力账户备注 / 余额记录", instrument.value || "余额充足");
      if (value === null) return null;
      const label = prompt("账户名称", instrument.label || "DeepSeek / OpenRouter");
      if (label === null) return null;
      const note = prompt("预警线备注", instrument.note || "预警线 20%");
      if (note === null) return null;
      return updateInstrument("quota", { value: value.trim(), label: label.trim(), note: note.trim() });
    }
    if (id === "node") {
      const label = prompt("节点 / 主域名", instrument.label || "sueexin.dev");
      if (label === null) return null;
      const value = prompt("节点状态摘要", instrument.value || "节点在线");
      if (value === null) return null;
      const expiresAt = prompt("续期日期 YYYY-MM-DD（留空则清除）", instrument.expiresAt || "");
      if (expiresAt === null) return null;
      return updateInstrument("node", {
        label: label.trim(),
        value: value.trim(),
        expiresAt: expiresAt.trim()
      });
    }
    const label = prompt("机关名称", instrument.label || "Cloudflare Pages 部署钩子");
    if (label === null) return null;
    const url = prompt("Webhook URL（留空则使用沙盒演练）", instrument.url || "");
    if (url === null) return null;
    const method = prompt("请求方法 GET / POST", instrument.method || "POST");
    if (method === null) return null;
    return updateInstrument("hook", {
      label: label.trim(),
      url: url.trim(),
      method: method.trim().toUpperCase() === "GET" ? "GET" : "POST",
      status: ""
    });
  }

  function openDeck() {
    const body = document.getElementById("telemetry-deck-body");
    const toggle = document.getElementById("btn-telemetry-toggle");
    if (!body) return false;
    deckOpen = true;
    body.hidden = false;
    if (toggle) {
      toggle.setAttribute("aria-expanded", "true");
      toggle.textContent = "⚙ 收起机关台";
    }
    renderDeck();
    return true;
  }

  function closeDeck() {
    const body = document.getElementById("telemetry-deck-body");
    const toggle = document.getElementById("btn-telemetry-toggle");
    if (!body) return false;
    deckOpen = false;
    body.hidden = true;
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "⚙ 机关台";
    }
    return true;
  }

  function toggleDeck() {
    return deckOpen ? closeDeck() : openDeck();
  }

  function isDeckOpen() {
    return deckOpen;
  }

  // --------------------------------------------------------------------------
  // 事件绑定与初始化
  // --------------------------------------------------------------------------
  function bindEvents() {
    if (bound) return;
    bound = true;

    const probeBtn = document.getElementById("btn-telemetry-probe");
    const toggleBtn = document.getElementById("btn-telemetry-toggle");
    const body = document.getElementById("telemetry-deck-body");

    if (probeBtn) {
      probeBtn.addEventListener("click", function () {
        probeAll({ mock: false, silent: false });
      });
    }
    if (toggleBtn) toggleBtn.addEventListener("click", toggleDeck);

    if (body) {
      body.addEventListener("click", function (event) {
        const hookBtn = event.target.closest("[data-telemetry-hook]");
        if (hookBtn) {
          event.preventDefault();
          triggerHook(hookBtn.getAttribute("data-telemetry-hook"));
          return;
        }
        const editBtn = event.target.closest("[data-telemetry-edit]");
        if (editBtn) {
          event.preventDefault();
          editInstrument(editBtn.getAttribute("data-telemetry-edit"));
        }
      });
    }

    window.addEventListener("nav-overrides-changed", function () {
      setTimeout(injectProbes, 90);
    });
    window.addEventListener("mynav-ledger-changed", function () {
      if (deckOpen) renderDeck();
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
    // Phase 5：机关台内部面板（3 台仪表）不再在 init 时预拼装，
    // 首次 openDeck() 时才按需构建；关闭后保留节点复用。
    scheduleAutoProbe();
    if (window.NavApp && !window.NavApp.Telemetry) {
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
      deckOpen: deckOpen,
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
    renderDeck();
    // 复位同样需要广播：Phase 4B 的琥珀徽章据此收起「调阅拓片」。
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

  const api = {
    init,
    probeAll,
    triggerHook,
    getState,
    getProbe,
    getTelemetryConfig,
    setTelemetryConfig,
    updateInstrument,
    editInstrument,
    openDeck,
    closeDeck,
    toggleDeck,
    isDeckOpen,
    injectProbes,
    syncCards,
    renderDeck,
    resetProbes,
    setAutoProbe,
    daysUntil,
    hashString,
    PROBE_TIMEOUT_MS,
    DEFAULT_INSTRUMENTS
  };

  return api;
});
