const test = require("node:test");
const assert = require("node:assert/strict");

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); }
  };
}

let ledgerConfig = { instruments: {} };

global.window = {
  localStorage: memoryStorage(),
  NavLedger: {
    getTelemetryConfig() { return Object.assign({}, ledgerConfig); },
    setTelemetryConfig(next) { ledgerConfig = Object.assign({}, next); }
  }
};

const probe = require("../js/probe.js");

test("auto probe defaults off when the ledger has no explicit setting", () => {
  assert.equal(probe.getTelemetryConfig().autoProbe, false);
});

test("setAutoProbe only turns on for explicit true", () => {
  assert.equal(probe.setAutoProbe("yes"), false);
  assert.equal(probe.getTelemetryConfig().autoProbe, false);
  assert.equal(probe.setAutoProbe(true), true);
  assert.equal(probe.getTelemetryConfig().autoProbe, true);
  assert.equal(probe.setAutoProbe(false), false);
});

test("ignored sites are persisted and excluded from probes", () => {
  assert.equal(probe.isProbeIgnored("site-a"), false);
  assert.equal(probe.setProbeIgnored("site-a", true), true);
  assert.equal(probe.isProbeIgnored("site-a"), true);
  assert.equal(probe.getProbe("site-a").status, "ignored");
  assert.equal(JSON.parse(global.window.localStorage.getItem("mynav_probe_ignored_v1"))[0], "site-a");

  assert.equal(probe.setProbeIgnored("site-a", false), false);
  assert.equal(probe.isProbeIgnored("site-a"), false);
  assert.deepEqual(JSON.parse(global.window.localStorage.getItem("mynav_probe_ignored_v1")), []);
});
