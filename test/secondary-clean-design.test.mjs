import test from "node:test";
import assert from "node:assert/strict";
import * as performance from "../src/features/performance.mjs";
import * as timeline from "../src/features/timeline.mjs";
import * as work from "../src/features/work.mjs";
import * as insights from "../src/features/insights.mjs";

const now = new Date("2026-06-08T10:00:00.000Z");

test("Performance prioritizes overall health and core live readings", () => {
  const html = performance.render({
    settings: { pcPerformance: { cpuThreshold: 95, temperatureThreshold: 90 } }
  }, {
    pcPerformance: {
      status: "ready",
      cpu: { usagePercent: 42, logicalCores: 8, speedMHz: 3200 },
      temperature: { available: true, celsius: 61, source: "CPU package" },
      memory: { usagePercent: 55, usedBytes: 8e9, totalBytes: 16e9 },
      disk: { available: true, usagePercent: 70, availableBytes: 100e9, path: "/" },
      network: {},
      system: {}
    }
  });

  assert.match(html, /class="performance-health performance-health--success"/);
  assert.match(html, /id="performance-overview-title">Core readings/);
  assert.match(html, /<details class="performance-page__details">/);
});

test("Timeline groups a compact chronological stream behind one filter row", () => {
  const html = timeline.render({
    timeline: [{
      id: "entry-1",
      type: "journal",
      title: "Daily note",
      detail: "A useful moment",
      occurredAt: now.getTime()
    }]
  }, { now, todayKey: "2026-06-08" });

  assert.match(html, /class="timeline-controls"/);
  assert.match(html, /class="timeline-stream"/);
  assert.match(html, /class="timeline-day__header"/);
  assert.equal((html.match(/Add moment/g) || []).length, 0);
});

test("Timeline renders malformed timestamps without crashing", () => {
  const html = timeline.render({
    timeline: [{
      id: "entry-invalid-time",
      type: "journal",
      title: "Imported note",
      occurredAt: "not-a-date"
    }]
  }, { now, todayKey: "2026-06-08" });

  assert.match(html, /Imported note/);
  assert.match(html, /Time unavailable/);
});

test("Work keeps records primary and progressively discloses project totals", () => {
  const html = work.render({
    workItems: [{
      id: "work-1",
      title: "Focus redesign",
      project: "Focus",
      status: "active",
      summary: "Simplify the interface",
      updatedAt: now.getTime()
    }]
  }, { now });

  assert.match(html, /class="card work-page__items"/);
  assert.match(html, /<details class="work-projects">/);
  assert.equal((html.match(/>Add work</g) || []).length, 0);
});

test("Insights presents one headline before supporting patterns and reflection", () => {
  const html = insights.render({
    tasks: [{ id: "task-1", title: "Done", completed: true }],
    habits: [],
    sessions: [{
      id: "session-1",
      startedAt: now.toISOString(),
      activeMs: 25 * 60 * 1000,
      focusRating: 4
    }]
  }, { now, model: { averageFocusScore: 80, sessionCount: 1 } });

  assert.match(html, /class="insight-headline"/);
  assert.match(html, /class="insight-support"/);
  assert.match(html, /id="reflection-title">Reflection prompt/);
});
