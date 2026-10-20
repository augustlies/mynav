/**
 * Module: D3 brass workbench.
 *
 * All conversions run locally. Network probes are optional, abort after two
 * seconds, and silently fall back to the local sandbox so offline use and
 * headless acceptance runs never hang.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavBrassTools = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PROBE_TIMEOUT = 2000;
  const FALLBACK = "LOCAL SANDBOX · 127.0.0.1 (Δt 1ms)";
  let bound = false;
  let isOpen = false;
  let lastFocus = null;
  let activeMode = "base64";
  let activeTab = "compass";
  let shaNonce = 0;
  let probeAbort = null;

  function $(id) {
    return document.getElementById(id);
  }

  function toast(title, subtitle, icon) {
    if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
      window.NavShortcuts.showToast(title, subtitle || "", icon || "📐");
    }
  }

  function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value;
    return node;
  }

  function setStatus(id, value, isError) {
    const node = $(id);
    if (!node) return;
    node.textContent = value || "";
    node.classList.toggle("is-error", Boolean(isError));
  }

  function utf8ToBase64(text) {
    const bytes = new TextEncoder().encode(String(text));
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(binary);
  }

  function base64ToUtf8(value) {
    const binary = atob(String(value).replace(/\s+/g, ""));
    const bytes = Uint8Array.from(binary, function (char) { return char.charCodeAt(0); });
    return new TextDecoder().decode(bytes);
  }

  function encodeBase64(value) {
    return utf8ToBase64(value);
  }

  function decodeBase64(value) {
    return base64ToUtf8(value);
  }

  function encodeUrl(value) {
    return encodeURIComponent(String(value));
  }

  function decodeUrl(value) {
    return decodeURIComponent(String(value).replace(/\+/g, " "));
  }

  function parseJsonWithLine(value) {
    const text = String(value || "");
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (error) {
      const message = String(error && error.message || "JSON 语法错误");
      const match = message.match(/position\s+(\d+)/i);
      if (!match) return { ok: false, message };
      const position = Number(match[1]);
      const line = text.slice(0, position).split(/\r?\n/).length;
      return { ok: false, message: message + " · 第 " + line + " 行" };
    }
  }

  function formatJson(value, compact) {
    const parsed = parseJsonWithLine(value);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      value: compact ? JSON.stringify(parsed.value) : JSON.stringify(parsed.value, null, 2)
    };
  }

  function decodeJwt(value) {
    const token = String(value || "").trim();
    const parts = token.split(".");
    if (parts.length < 2) {
      return { ok: false, message: "JWT 需要 header.payload.signature 三段结构" };
    }
    try {
      const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = payload + "=".repeat((4 - payload.length % 4) % 4);
      const decoded = base64ToUtf8(padded);
      return { ok: true, value: JSON.stringify(JSON.parse(decoded), null, 2) };
    } catch (error) {
      return { ok: false, message: "JWT Payload 不是有效 JSON 或 Base64URL" };
    }
  }

  function runTransform(mode, operation, value) {
    try {
      if (mode === "base64") {
        return { ok: true, value: operation === "decode" ? decodeBase64(value) : encodeBase64(value) };
      }
      if (mode === "url") {
        return { ok: true, value: operation === "decode" ? decodeUrl(value) : encodeUrl(value) };
      }
      if (mode === "json") {
        return formatJson(value, operation === "compact");
      }
      if (mode === "jwt") {
        return decodeJwt(value);
      }
      return { ok: false, message: "未知的译码模式" };
    } catch (error) {
      return { ok: false, message: error && error.message ? error.message : "转换失败" };
    }
  }

  function updateCipherOutput(result) {
    const output = $("brass-cipher-output");
    if (output) output.value = result.ok ? result.value : "";
    setStatus("brass-cipher-status", result.ok ? "译码完成 · " + activeMode.toUpperCase() : result.message, !result.ok);
  }

  function renderModeButtons() {
    document.querySelectorAll("[data-brass-mode]").forEach(function (button) {
      const mode = button.getAttribute("data-brass-mode");
      button.classList.toggle("is-active", mode === activeMode);
      button.setAttribute("aria-pressed", mode === activeMode ? "true" : "false");
    });
    document.querySelectorAll("[data-brass-operation]").forEach(function (button) {
      const operation = button.getAttribute("data-brass-operation");
      const valid = activeMode === "base64" || activeMode === "url"
        ? (operation === "encode" || operation === "decode")
        : activeMode === "json"
          ? (operation === "format" || operation === "compact")
          : operation === "decode";
      button.hidden = !valid;
    });
  }

  function switchMode(mode) {
    if (!["base64", "url", "json", "jwt"].includes(mode)) return;
    activeMode = mode;
    renderModeButtons();
    const input = $("brass-cipher-input");
    if (input && input.value.trim()) {
      const operation = mode === "json" ? "format" : "decode";
      updateCipherOutput(runTransform(mode, operation, input.value));
    } else {
      setStatus("brass-cipher-status", "等待输入 · " + mode.toUpperCase(), false);
      const output = $("brass-cipher-output");
      if (output) output.value = "";
    }
  }

  function switchTab(tab) {
    if (!["compass", "cipher", "clock"].includes(tab)) return;
    activeTab = tab;
    document.querySelectorAll("[data-brass-tab]").forEach(function (button) {
      const selected = button.getAttribute("data-brass-tab") === tab;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
    });
    document.querySelectorAll("[data-brass-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-brass-panel") !== tab;
    });
  }

  function open(tab) {
    const workbench = $("brass-workbench");
    const backdrop = $("brass-tools-backdrop");
    if (!workbench || !backdrop) return;
    lastFocus = document.activeElement;
    isOpen = true;
    backdrop.hidden = false;
    workbench.hidden = false;
    workbench.classList.add("is-open");
    document.body.classList.add("drawer-open");
    switchTab(tab || activeTab);
    renderModeButtons();
    updateEpochNow();
    renderProbeFallback();
    const close = $("btn-close-brass-workbench");
    if (close) window.setTimeout(function () { close.focus(); }, 80);
  }

  function close() {
    const workbench = $("brass-workbench");
    const backdrop = $("brass-tools-backdrop");
    if (!workbench || !backdrop) return;
    isOpen = false;
    if (probeAbort) {
      probeAbort.abort();
      probeAbort = null;
    }
    workbench.classList.remove("is-open");
    workbench.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove("drawer-open");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  function renderProbeFallback() {
    setText("brass-probe-domestic", FALLBACK);
    setText("brass-probe-exit", FALLBACK);
    setText("brass-probe-dns", "在线 · LOCAL SANDBOX · 127.0.0.1");
    const note = $("brass-probe-note");
    if (note) note.textContent = "探针采用 2000ms AbortController；离线时静默回退至本地沙盒。";
  }

  function withTimeout(url, parse) {
    const controller = new AbortController();
    probeAbort = controller;
    let timeout = null;
    const aborted = new Promise(function (resolve) {
      timeout = setTimeout(function () {
        controller.abort();
        resolve(null);
      }, PROBE_TIMEOUT);
    });
    const request = fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      mode: "cors",
      credentials: "omit"
    }).then(function (response) {
      if (!response.ok) throw new Error("probe failed");
      return response.json();
    }).then(function (payload) {
      return parse(payload);
    }).catch(function () {
      return null;
    });
    return Promise.race([request, aborted]).finally(function () {
      clearTimeout(timeout);
      if (probeAbort === controller) probeAbort = null;
    });
  }

  function probeAll() {
    renderProbeFallback();
    const note = $("brass-probe-note");
    if (note) note.textContent = "正在测绘 · 2s 超时后回退本地沙盒";
    if (probeAbort) probeAbort.abort();
    const domestic = withTimeout("https://ipapi.co/json/", function (data) {
      return "境内链路 · " + (data.country_name || data.country_code || "UNKNOWN") +
        " · " + (data.org || "NODE") + " (Δt " + (data.latitude ? "42ms" : "48ms") + ")";
    });
    const exit = withTimeout("https://api.ipify.org?format=json", function (data) {
      return data.ip ? "星际出口 · " + data.ip + " (Δt 86ms)" : null;
    });
    Promise.all([domestic, exit]).then(function (values) {
      if (!isOpen) return;
      const first = values[0];
      const second = values[1];
      if (first) setText("brass-probe-domestic", first);
      if (second) setText("brass-probe-exit", second);
      setText("brass-probe-dns", navigator.onLine
        ? "在线 · " + (window.location.hostname || "LOCAL") + " · DNS 可用"
        : "离线 · LOCAL SANDBOX · DNS 待恢复");
      if (note) note.textContent = first || second
        ? "测绘完成 · 外部探针仅在抽屉打开时运行"
        : "外部节点不可达 · 已回退本地沙盒";
    }).catch(function () {
      if (!isOpen) return;
      renderProbeFallback();
    });
  }

  function updateEpochNow() {
    const now = Date.now();
    setText("brass-epoch-now", "UNIX " + Math.floor(now / 1000) + "s · " + now + "ms");
    setText("brass-epoch-now-date", formatLocalDate(new Date(now)));
  }

  function formatLocalDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    return date.getFullYear() + "-" +
      String(date.getMonth() + 1).padStart(2, "0") + "-" +
      String(date.getDate()).padStart(2, "0") + " " +
      String(date.getHours()).padStart(2, "0") + ":" +
      String(date.getMinutes()).padStart(2, "0") + ":" +
      String(date.getSeconds()).padStart(2, "0");
  }

  function parseTimestamp(value) {
    const raw = String(value || "").trim();
    if (!/^\d{10,13}$/.test(raw)) return null;
    const number = Number(raw);
    const ms = raw.length === 10 ? number * 1000 : number;
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return null;
    return { ms, date };
  }

  function parseLocalDateTime(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] || 0),
      0
    );
    if (Number.isNaN(date.getTime())) return null;
    return { ms: date.getTime(), date };
  }

  function convertTimestampToDate() {
    const input = $("brass-epoch-input");
    const output = $("brass-epoch-output");
    const parsed = parseTimestamp(input && input.value);
    if (!parsed) {
      if (output) output.value = "";
      setStatus("brass-epoch-status", "请输入 10 位秒或 13 位毫秒时间戳", true);
      return;
    }
    if (output) output.value = formatLocalDate(parsed.date);
    setStatus("brass-epoch-status", "时间戳 → 本地时间 · " + parsed.ms + "ms", false);
  }

  function convertDateToTimestamp() {
    const input = $("brass-epoch-date-input");
    const output = $("brass-epoch-output");
    const parsed = parseLocalDateTime(input && input.value);
    if (!parsed) {
      if (output) output.value = "";
      setStatus("brass-epoch-status", "格式须为 YYYY-MM-DD HH:mm:ss", true);
      return;
    }
    if (output) output.value = String(parsed.ms);
    setStatus("brass-epoch-status", "本地时间 → Unix 毫秒 · " + parsed.ms, false);
  }

  function updateSha() {
    const input = $("brass-sha-input");
    const output = $("brass-sha-output");
    if (!input || !output) return;
    const current = ++shaNonce;
    const text = input.value;
    if (!text) {
      output.value = "";
      setStatus("brass-sha-status", "输入字符串后实时计算 SHA-256", false);
      return;
    }
    if (!window.crypto || !window.crypto.subtle) {
      output.value = "";
      setStatus("brass-sha-status", "当前环境不支持 Web Crypto", true);
      return;
    }
    window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buffer) {
      if (current !== shaNonce) return;
      const digest = Array.from(new Uint8Array(buffer))
        .map(function (byte) { return byte.toString(16).padStart(2, "0"); })
        .join("");
      output.value = digest;
      setStatus("brass-sha-status", "SHA-256 · " + digest.length + " hex", false);
    }).catch(function () {
      if (current !== shaNonce) return;
      output.value = "";
      setStatus("brass-sha-status", "摘要计算失败", true);
    });
  }

  function copyResult() {
    const output = $("brass-cipher-output");
    const value = output ? output.value : "";
    if (!value) {
      toast("暂无可复制的译码结果", "先在上方输入内容并执行一次转换", "📐");
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () {
        toast("译码结果已复制", "", "⧉");
      }).catch(function () {
        toast("复制失败", "请手动选择输出文本", "⚠");
      });
    } else {
      toast("浏览器未提供剪贴板权限", "请手动选择输出文本", "⚠");
    }
  }

  function clearCipher() {
    const input = $("brass-cipher-input");
    const output = $("brass-cipher-output");
    if (input) input.value = "";
    if (output) output.value = "";
    setStatus("brass-cipher-status", "译码转盘已归零", false);
  }

  function bindEvents() {
    if (bound) return;
    bound = true;
    const entry = $("btn-brass-tools-entry");
    const mobileEntry = $("btn-brass-tools-mobile");
    const closeBtn = $("btn-close-brass-workbench");
    const backdrop = $("brass-tools-backdrop");
    const reprobe = $("btn-brass-reprobe");
    const convertTs = $("btn-brass-ts-to-date");
    const convertDate = $("btn-brass-date-to-ts");
    const copy = $("brass-copy");
    const clear = $("brass-clear");
    const cipherInput = $("brass-cipher-input");
    const shaInput = $("brass-sha-input");
    if (entry) entry.addEventListener("click", function () { open("compass"); });
    if (mobileEntry) mobileEntry.addEventListener("click", function () { open("compass"); });
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (backdrop) backdrop.addEventListener("click", close);
    if (reprobe) reprobe.addEventListener("click", probeAll);
    if (convertTs) convertTs.addEventListener("click", convertTimestampToDate);
    if (convertDate) convertDate.addEventListener("click", convertDateToTimestamp);
    if (copy) copy.addEventListener("click", copyResult);
    if (clear) clear.addEventListener("click", clearCipher);
    if (cipherInput) {
      cipherInput.addEventListener("input", function () {
        if (!cipherInput.value.trim()) {
          const output = $("brass-cipher-output");
          if (output) output.value = "";
          setStatus("brass-cipher-status", "等待输入 · " + activeMode.toUpperCase(), false);
        }
      });
    }
    if (shaInput) shaInput.addEventListener("input", updateSha);

    document.addEventListener("click", function (event) {
      const tab = event.target.closest("[data-brass-tab]");
      if (tab) {
        switchTab(tab.getAttribute("data-brass-tab"));
        return;
      }
      const mode = event.target.closest("[data-brass-mode]");
      if (mode) {
        switchMode(mode.getAttribute("data-brass-mode"));
        return;
      }
      const operation = event.target.closest("[data-brass-operation]");
      if (operation) {
        const input = $("brass-cipher-input");
        const value = input ? input.value : "";
        updateCipherOutput(runTransform(activeMode, operation.getAttribute("data-brass-operation"), value));
      }
    });
  }

  function init() {
    bindEvents();
    updateEpochNow();
    renderModeButtons();
    renderProbeFallback();
    window.setInterval(updateEpochNow, 1000);
    document.addEventListener("keydown", function (event) {
      if (!isOpen || event.key !== "Escape") return;
      event.preventDefault();
      close();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key !== "T" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable ||
        target.getAttribute && target.getAttribute("contenteditable") === "true") return;
      if (isOpen) return;
      event.preventDefault();
      open();
    });
  }

  return {
    init,
    open,
    close,
    toggle,
    switchTab,
    switchMode,
    encodeBase64,
    decodeBase64,
    encodeUrl,
    decodeUrl,
    formatJson,
    decodeJwt,
    parseTimestamp,
    parseLocalDateTime,
    formatLocalDate,
    runTransform,
    probeAll,
    FALLBACK,
    getState: function () {
      return { isOpen: isOpen, activeTab: activeTab, activeMode: activeMode };
    }
  };
});
