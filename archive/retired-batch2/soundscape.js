/**
 * Module: D6 Web Audio ambient observatory.
 *
 * AudioContext is created only from a user gesture. Synthetic buffers and
 * oscillators replace every external sound asset, keeping the archive useful
 * offline and avoiding autoplay violations.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavSoundscape = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const LABELS = {
    off: "寂静",
    active: "听风 · 鸣",
    pending: "听风 · 待唤醒"
  };

  let bound = false;
  let button = null;
  let context = null;
  let master = null;
  let darkBus = null;
  let lightBus = null;
  let darkNoise = null;
  let lightNoise = null;
  let darkPulseTimer = null;
  let darkTickTimer = null;
  let pendulumTimer = null;
  let observer = null;
  let wakeHandler = null;
  let intent = false;
  let pendingWake = false;
  let running = false;
  let activeTheme = "light";

  function getModeState() {
    return window.NavLedger && typeof window.NavLedger.getModeState === "function"
      ? window.NavLedger.getModeState()
      : { ambientSound: false };
  }

  function persistIntent(value) {
    if (window.NavLedger && typeof window.NavLedger.setModeState === "function") {
      window.NavLedger.setModeState({ ambientSound: Boolean(value) });
    }
  }

  function getCurrentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function isActive() {
    return Boolean(intent && !pendingWake);
  }

  function updateButton() {
    if (!button) return;
    const label = button.querySelector(".soundscape-label");
    const state = pendingWake ? "pending" : (intent ? "active" : "off");
    const text = LABELS[state];
    if (label) label.textContent = text;
    button.dataset.state = state;
    button.setAttribute("aria-pressed", intent && !pendingWake ? "true" : "false");
    button.setAttribute("aria-label", pendingWake
      ? "白噪音天文台：听风待唤醒，首次点击任意处恢复声场"
      : (intent ? "关闭白噪音天文台" : "开启白噪音天文台"));
    button.title = pendingWake
      ? "听风 · 待唤醒（首次点击页面恢复）"
      : (intent ? "听风 · 鸣（/sound 关闭）" : "寂静（/sound 开启）");
    button.classList.toggle("is-pending", pendingWake);
    button.classList.toggle("is-playing", intent && !pendingWake);
  }

  function makeNoiseBuffer(kind) {
    const sampleRate = context.sampleRate;
    const duration = 4;
    const length = sampleRate * duration;
    const buffer = context.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    if (kind === "pink") {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
      return buffer;
    }

    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      // Brownian integration with a gentle leak so the loop cannot drift.
      last = (last + 0.018 * white) / 1.018;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  function makeNoiseSource(kind) {
    const source = context.createBufferSource();
    source.buffer = makeNoiseBuffer(kind);
    source.loop = true;
    return source;
  }

  function rampGain(gainNode, value, seconds) {
    if (!gainNode || !context) return;
    const now = context.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(value, now + (seconds || 0.5));
  }

  function configureScenes() {
    activeTheme = getCurrentTheme();
    rampGain(darkBus, activeTheme === "dark" ? 0.11 : 0.0001, 0.5);
    rampGain(lightBus, activeTheme === "light" ? 0.13 : 0.0001, 0.5);
  }

  function connectNoise() {
    darkBus = context.createGain();
    lightBus = context.createGain();
    darkBus.gain.value = 0.0001;
    lightBus.gain.value = 0.0001;
    darkBus.connect(master);
    lightBus.connect(master);

    const darkFilter = context.createBiquadFilter();
    darkFilter.type = "lowpass";
    darkFilter.frequency.value = 160;
    darkFilter.Q.value = 0.45;
    darkNoise = makeNoiseSource("brown");
    const darkLevel = context.createGain();
    darkLevel.gain.value = 0.48;
    darkNoise.connect(darkFilter);
    darkFilter.connect(darkLevel);
    darkLevel.connect(darkBus);
    darkNoise.start();

    const lightFilter = context.createBiquadFilter();
    lightFilter.type = "bandpass";
    lightFilter.frequency.value = 500;
    lightFilter.Q.value = 0.72;
    lightNoise = makeNoiseSource("pink");
    const lightLevel = context.createGain();
    lightLevel.gain.value = 0.30;
    lightNoise.connect(lightFilter);
    lightFilter.connect(lightLevel);
    lightLevel.connect(lightBus);
    lightNoise.start();
  }

  function playTone(options) {
    if (!context || !running) return;
    const {
      destination,
      frequency,
      duration,
      gain,
      type,
      detune
    } = options;
    if (!destination) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const start = context.currentTime + (options.delay || 0);
    oscillator.type = type || "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    if (detune) oscillator.detune.setValueAtTime(detune, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(gain, start + Math.min(0.045, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.04);
  }

  function scheduleDarkEvents() {
    // Phase 5：仅在音频真正启动后挂载，stopAudio() 会彻底销毁。
    if (darkPulseTimer !== null || darkTickTimer !== null) return;
    darkPulseTimer = window.setInterval(function () {
      if (!running || !context || getCurrentTheme() !== "dark") return;
      playTone({
        destination: darkBus,
        frequency: 58 + Math.random() * 34,
        duration: 2.8,
        gain: 0.032,
        type: "sine"
      });
      playTone({
        destination: darkBus,
        frequency: 118 + Math.random() * 22,
        duration: 1.8,
        gain: 0.012,
        type: "sine",
        delay: 0.18,
        detune: 5
      });
    }, 7600);

    darkTickTimer = window.setInterval(function () {
      if (!running || !context || getCurrentTheme() !== "dark") return;
      playTone({
        destination: darkBus,
        frequency: 1680 + Math.random() * 180,
        duration: 0.026,
        gain: 0.007,
        type: "triangle"
      });
    }, 1000);
  }

  function scheduleLightEvents() {
    // Phase 5：仅在音频真正启动后挂载，stopAudio() 会彻底销毁。
    if (pendulumTimer !== null) return;
    pendulumTimer = window.setInterval(function () {
      if (!running || !context || getCurrentTheme() !== "light") return;
      playTone({
        destination: lightBus,
        frequency: 196,
        duration: 0.55,
        gain: 0.035,
        type: "sine"
      });
      playTone({
        destination: lightBus,
        frequency: 392,
        duration: 0.32,
        gain: 0.011,
        type: "sine",
        delay: 0.025
      });
    }, 2000);
  }

  function beginAudio() {
    if (context) return context;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = 0.0001;
      master.connect(context.destination);
      connectNoise();
      scheduleDarkEvents();
      scheduleLightEvents();
      configureScenes();
      rampGain(master, 0.55, 0.8);
      running = true;
      if (context.state === "suspended") {
        context.resume().catch(function () {});
      }
      return context;
    } catch (error) {
      context = null;
      return null;
    }
  }

  function stopAudio() {
    running = false;
    // Phase 5：关闭白噪音时彻底销毁全部声场定时器（零空转）。
    if (darkPulseTimer !== null) window.clearInterval(darkPulseTimer);
    if (darkTickTimer !== null) window.clearInterval(darkTickTimer);
    if (pendulumTimer !== null) window.clearInterval(pendulumTimer);
    darkPulseTimer = null;
    darkTickTimer = null;
    pendulumTimer = null;
    try {
      if (darkNoise) darkNoise.stop();
      if (lightNoise) lightNoise.stop();
    } catch (error) {}
    darkNoise = null;
    lightNoise = null;
    if (context) {
      try { context.close(); } catch (error) {}
    }
    context = null;
    master = null;
    darkBus = null;
    lightBus = null;
  }

  function unbindWake() {
    if (wakeHandler) {
      document.removeEventListener("pointerdown", wakeHandler, true);
      wakeHandler = null;
    }
  }

  function bindWake() {
    if (wakeHandler) return;
    wakeHandler = function (event) {
      if (event.target && event.target.closest && event.target.closest("#btn-soundscape-toggle")) {
        return;
      }
      unbindWake();
      if (!intent) return;
      beginAudio();
      pendingWake = false;
      updateButton();
    };
    document.addEventListener("pointerdown", wakeHandler, true);
  }

  function activate() {
    intent = true;
    pendingWake = false;
    beginAudio();
    persistIntent(true);
    unbindWake();
    updateButton();
    return true;
  }

  function deactivate() {
    intent = false;
    pendingWake = false;
    persistIntent(false);
    stopAudio();
    unbindWake();
    updateButton();
    return false;
  }

  function toggle() {
    if (pendingWake) return activate();
    return intent ? deactivate() : activate();
  }

  function handleThemeChange() {
    const next = getCurrentTheme();
    if (next === activeTheme) return;
    activeTheme = next;
    if (running) configureScenes();
  }

  function init() {
    if (bound) return;
    bound = true;
    button = document.getElementById("btn-soundscape-toggle");
    if (button) button.addEventListener("click", toggle);

    const stored = Boolean(getModeState().ambientSound);
    intent = stored;
    pendingWake = stored;
    updateButton();
    if (pendingWake) bindWake();

    // Phase 5：init() 不再创建 3 个常驻 setInterval。
    // 声场定时器只在 beginAudio()（真实音频启动）时挂载，stopAudio() 时销毁。

    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(handleThemeChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"]
      });
    }
  }

  return {
    init,
    toggle,
    activate,
    deactivate,
    isActive,
    isPending: function () { return pendingWake; },
    hasContext: function () { return Boolean(context); },
    beginAudio,
    labels: LABELS,
    stopAudio,
    // Phase 5：供验收断言「音频启动才挂载 / 关闭即销毁」。
    hasTimers: function () {
      return darkPulseTimer !== null || darkTickTimer !== null || pendulumTimer !== null;
    }
  };
});
