const test = require("node:test");
const assert = require("node:assert/strict");

const {
  cpuUsage,
  evaluatePerformanceAlerts,
  networkRates,
  normalizePerformanceSettings
} = require("../pc-performance.cjs");

test("CPU usage is calculated from cumulative CPU time deltas", () => {
  assert.equal(cpuUsage({ idle: 400, total: 1000 }, { idle: 450, total: 1200 }), 75);
  assert.equal(cpuUsage(null, { idle: 450, total: 1200 }), null);
});

test("network throughput uses byte deltas over elapsed time", () => {
  assert.deepEqual(
    networkRates(
      { receivedBytes: 1000, sentBytes: 500, interfaces: 1 },
      { receivedBytes: 3000, sentBytes: 1500, interfaces: 2 },
      2000
    ),
    {
      available: true,
      receivedBytesPerSecond: 1000,
      sentBytesPerSecond: 500,
      interfaces: 2
    }
  );
});

test("performance settings are bounded and preserve opt-outs", () => {
  const settings = normalizePerformanceSettings({
    enabled: false,
    notificationsEnabled: false,
    cpuThreshold: 120,
    temperatureThreshold: 20,
    sustainedSamples: 0
  });

  assert.equal(settings.enabled, false);
  assert.equal(settings.notificationsEnabled, false);
  assert.equal(settings.cpuThreshold, 100);
  assert.equal(settings.temperatureThreshold, 50);
  assert.equal(settings.sustainedSamples, 1);
});

test("alerts require sustained samples and respect cooldowns", () => {
  const sample = {
    cpu: { usagePercent: 99 },
    temperature: { available: true, celsius: 96 },
    memory: { usagePercent: 60 },
    disk: { available: true, usagePercent: 70 }
  };
  const settings = normalizePerformanceSettings({
    sustainedSamples: 2,
    cooldownMinutes: 10
  });
  const state = {};

  assert.deepEqual(evaluatePerformanceAlerts(sample, settings, state, 1000), []);
  assert.deepEqual(
    evaluatePerformanceAlerts(sample, settings, state, 2000).map((alert) => alert.id),
    ["temperature", "cpu"]
  );
  assert.deepEqual(evaluatePerformanceAlerts(sample, settings, state, 3000), []);
  assert.deepEqual(
    evaluatePerformanceAlerts(sample, settings, state, 700_000).map((alert) => alert.id),
    ["temperature", "cpu"]
  );
});
