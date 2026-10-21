/**
 * Module: A7 physical astronomy clock and sundial.
 *
 * The archive deliberately keeps this module dependency-free. It reads the
 * browser clock, derives local sidereal time from the observer longitude, and
 * writes only the small CSS variables consumed by the daylight theme.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavAstronomy = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const OBSERVER = {
    longitude: 121.4737,
    latitudeLabel: "+38°47′"
  };
  const SPINE_OBSERVER = {
    longitude: 121.4737,
    declinationLabel: "+38°47′"
  };
  const SYNODIC_MONTH_DAYS = 29.530588853;
  const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);
  const MOON_PHASES = [
    { symbol: "🌑", name: "朔月", key: "new" },
    { symbol: "🌒", name: "蛾眉月", key: "waxing-crescent" },
    { symbol: "🌓", name: "上弦月", key: "first-quarter" },
    { symbol: "🌔", name: "盈凸月", key: "waxing-gibbous" },
    { symbol: "🌕", name: "望月", key: "full" },
    { symbol: "🌖", name: "亏凸月", key: "waning-gibbous" },
    { symbol: "🌗", name: "下弦月", key: "last-quarter" },
    { symbol: "🌘", name: "残月", key: "waning-crescent" }
  ];

  let bound = false;
  let timerId = null;
  let mockHour = null;
  let lastAngle = null;
  // Phase 5：恒星时字符串每秒刷新，日晷 CSS 变量与月相降频到每 60 秒。
  const SUNDIAL_INTERVAL_MS = 60000;
  let lastSundialAt = 0;
  let lastMoonKey = null;

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function nowDate() {
    const date = new Date();
    if (mockHour !== null) {
      const hour = Math.floor(mockHour);
      const minute = Math.round((mockHour - hour) * 60);
      date.setHours(hour, minute, 0, 0);
    }
    return date;
  }

  /**
   * Greenwich mean sidereal time converted to local sidereal time.
   * The formula is intentionally kept in degrees until the final display
   * conversion so both the clock and test hook remain easy to inspect.
   */
  function getLocalSiderealTime(date, longitude) {
    const when = date instanceof Date && !Number.isNaN(date.getTime()) ? date : nowDate();
    const observerLongitude = Number.isFinite(Number(longitude)) ? Number(longitude) : OBSERVER.longitude;
    const julianDate = when.getTime() / 86400000 + 2440587.5;
    const daysSinceJ2000 = julianDate - 2451545.0;
    const gmstDegrees = 280.46061837 + 360.98564736629 * daysSinceJ2000;
    const localDegrees = ((gmstDegrees + observerLongitude) % 360 + 360) % 360;
    const totalSeconds = localDegrees / 15 * 3600;
    let hours = Math.floor(totalSeconds / 3600) % 24;
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = Math.floor(totalSeconds % 60);
    if (hours < 0) hours += 24;
    if (minutes < 0) minutes += 60;
    if (seconds < 0) seconds += 60;
    return {
      degrees: localDegrees,
      hours,
      minutes,
      seconds,
      text: "LST " + pad(hours) + "h " + pad(minutes) + "m " + pad(seconds) + "s"
    };
  }

  function getMoonPhase(date) {
    const when = date instanceof Date && !Number.isNaN(date.getTime()) ? date : nowDate();
    const elapsedDays = (when.getTime() - KNOWN_NEW_MOON_MS) / 86400000;
    const cycle = ((elapsedDays / SYNODIC_MONTH_DAYS) % 1 + 1) % 1;
    const index = Math.round(cycle * MOON_PHASES.length) % MOON_PHASES.length;
    const phase = MOON_PHASES[index];
    return Object.assign({ cycle }, phase);
  }

  function getSundialAngle(hour) {
    const value = Number(hour);
    const safeHour = Number.isFinite(value) ? value : nowDate().getHours();
    // 06:00 = -45deg, 12:00 = 0deg, 18:00 = +45deg.
    return clamp((safeHour - 12) * 7.5, -45, 45);
  }

  function getSundialLength(angle) {
    // The shadow is longest near the edges of the daylight window and
    // shortest at local noon. This gives the background a subtle breathing
    // motion without making the paper feel animated.
    const normalized = Math.min(1, Math.abs(angle) / 45);
    return (12 + normalized * 10).toFixed(1) + "px";
  }

  function applySundial(date) {
    const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const angle = getSundialAngle(hour);
    const angleText = (Math.round(angle * 10) / 10).toFixed(1).replace(/\.0$/, "") + "deg";
    const length = getSundialLength(angle);
    const root = document.documentElement;
    root.style.setProperty("--sundial-angle", angleText);
    root.style.setProperty("--sundial-length", length);
    root.style.setProperty("--sundial-shadow-x", (-angle / 45 * 7).toFixed(2) + "px");
    root.style.setProperty("--sundial-shadow-y", (8 + Math.abs(angle) / 45 * 7).toFixed(2) + "px");
    lastAngle = angle;
    return { angle, angleText, length };
  }

  function render() {
    if (typeof document === "undefined") return null;
    const date = nowDate();
    const sidereal = getLocalSiderealTime(date, OBSERVER.longitude);
    const spineSidereal = getLocalSiderealTime(date, SPINE_OBSERVER.longitude);
    const moon = getMoonPhase(date);
    const colophon = document.querySelector(".spine-colophon");
    if (colophon) {
      let line = colophon.querySelector(".spine-astronomy-line");
      if (!line) {
        line = document.createElement("span");
        line.className = "spine-astronomy-line";
        const rule = colophon.querySelector(".spine-colophon-rule");
        if (rule && rule.nextSibling) colophon.insertBefore(line, rule.nextSibling);
        else colophon.insertBefore(line, colophon.firstChild);
      }
      line.textContent = spineSidereal.text + " · DEC " + SPINE_OBSERVER.declinationLabel;

      let moonLine = colophon.querySelector(".spine-moon-phase");
      if (!moonLine) {
        moonLine = document.createElement("span");
        moonLine.className = "spine-moon-phase";
        line.insertAdjacentElement("afterend", moonLine);
      }
      moonLine.textContent = moon.symbol + " " + moon.name;
      lastMoonKey = moon.key;
    }
    const sundial = applySundial(date);
    lastSundialAt = Date.now();
    return { sidereal, moon, sundial };
  }

  /**
   * Phase 5 tick：每秒只重写恒星时字符串（一次 DOM textContent 写入），
   * 把耗时的日晷 CSS 变量计算与月相计算降频到每 60 秒。
   * 页面不可见时直接早退，不空转。
   */
  function tick() {
    if (typeof document === "undefined") return null;
    if (document.hidden) return null;

    const date = nowDate();
    const spineSidereal = getLocalSiderealTime(date, SPINE_OBSERVER.longitude);
    const colophon = document.querySelector(".spine-colophon");
    if (colophon) {
      const line = colophon.querySelector(".spine-astronomy-line");
      if (line) {
        line.textContent = spineSidereal.text + " · DEC " + SPINE_OBSERVER.declinationLabel;
      }
    }

    if (Date.now() - lastSundialAt >= SUNDIAL_INTERVAL_MS) {
      const moon = getMoonPhase(date);
      if (moon.key !== lastMoonKey) {
        const moonLine = colophon && colophon.querySelector(".spine-moon-phase");
        if (moonLine) moonLine.textContent = moon.symbol + " " + moon.name;
        lastMoonKey = moon.key;
      }
      applySundial(date);
      lastSundialAt = Date.now();
    }
    return null;
  }

  function setMockTime(hour) {
    const value = Number(hour);
    if (!Number.isFinite(value)) return null;
    mockHour = clamp(value, 0, 23.9999);
    // 测试钩子必须立即重算日晷，不能被 60s 降频挡住。
    lastSundialAt = 0;
    return render();
  }

  function resetMockTime() {
    mockHour = null;
    lastSundialAt = 0;
    return render();
  }

  function triggerMeteor() {
    const particles = typeof window !== "undefined" ? window.NavParticlesBg : null;
    if (particles && typeof particles.triggerMeteor === "function") {
      return particles.triggerMeteor();
    }
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-meteor-requested", String(Date.now()));
    }
    return false;
  }

  function init() {
    if (bound) return;
    bound = true;
    render();
    timerId = window.setInterval(tick, 1000);
  }

  return {
    init,
    render,
    tick,
    setMockTime,
    resetMockTime,
    triggerMeteor,
    getLocalSiderealTime,
    getMoonPhase,
    getSundialAngle,
    OBSERVER,
    MOON_PHASES,
    getLastSundialAngle() {
      return lastAngle;
    },
    stop() {
      if (timerId) window.clearInterval(timerId);
      timerId = null;
      bound = false;
    }
  };
});
