import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultState, normalizeState } from "../src/core/schema.mjs";
import { reduceAppState } from "../src/core/reducer.mjs";
import { mergeStates } from "../src/core/merge.mjs";
import {
  completeTimer,
  currentActiveMs,
  sessionFromTimer,
  startTimer,
  toggleTimerPause
} from "../src/core/timer.mjs";
import * as dashboard from "../src/features/dashboard.mjs";
import * as calendar from "../src/features/calendar.mjs";
import * as tasks from "../src/features/tasks.mjs";
import * as focus from "../src/features/focus.mjs";
import * as health from "../src/features/health.mjs";
import * as progress from "../src/features/progress.mjs";
import * as timeline from "../src/features/timeline.mjs";
import * as work from "../src/features/work.mjs";
import * as insights from "../src/features/insights.mjs";
import * as performance from "../src/features/performance.mjs";
import * as settings from "../src/features/settings.mjs";
import * as assistant from "../src/features/assistant.mjs";
import { buildSearchResults } from "../src/features/search.mjs";

const now = new Date(2026, 5, 7, 12, 0, 0).getTime();

function populatedState() {
  let state = createDefaultState(now);
  state = reduceAppState(state, { type: "task/add", payload: { title: "Ship Focus", dueDate: "2026-06-07", priority: "high", now } });
  state = reduceAppState(state, { type: "event/add", payload: { title: "Review", start: "2026-06-07T13:00:00.000Z", end: "2026-06-07T14:00:00.000Z", now } });
  state = reduceAppState(state, { type: "habit/add", payload: { name: "Walk", now } });
  state = reduceAppState(state, { type: "health/save", payload: { date: "2026-06-07", energy: 4, mood: 4, sleepHours: 7, now } });
  state = reduceAppState(state, { type: "work/add", payload: { title: "Personal OS", project: "Focus", now } });
  return state;
}

test("all personal OS pages render useful markup from one canonical state", () => {
  const state = populatedState();
  const ctx = { now: new Date(now), todayKey: "2026-06-07", model: { averageFocusScore: 72, sessionCount: 1 } };
  for (const module of [dashboard, assistant, calendar, tasks, focus, health, progress, performance, timeline, work, insights, settings]) {
    const html = module.render(state, ctx);
    assert.match(html, /<main|<section/);
    assert.ok(html.length > 300, `${module.page.id} should render substantive content`);
  }
});

test("Today renders live PC performance and alert controls", () => {
  const state = populatedState();
  const html = dashboard.render(state, {
    now: new Date(now),
    todayKey: "2026-06-07",
    pcPerformance: {
      status: "ready",
      cpu: { usagePercent: 42, logicalCores: 8, speedMHz: 3200, loadAverage: [1, 0.8, 0.5] },
      temperature: { available: true, celsius: 61, source: "CPU package" },
      memory: { usagePercent: 55, usedBytes: 8_000_000_000, totalBytes: 16_000_000_000 },
      disk: { available: true, usagePercent: 70, availableBytes: 100_000_000_000, path: "/" },
      network: { available: true, receivedBytesPerSecond: 2000, sentBytesPerSecond: 1000 },
      system: { uptimeSeconds: 7200 },
      alerts: []
    }
  });

  assert.match(html, /PC performance/);
  assert.match(html, /Temperature/);
  assert.match(html, /Download/);
  assert.match(html, /Open performance/);
});

test("PC Performance page renders live system detail and thresholds", () => {
  const state = populatedState();
  const html = performance.render(state, {
    pcPerformance: {
      status: "ready",
      cpu: { usagePercent: 42, logicalCores: 8, model: "Test CPU", speedMHz: 3200, loadAverage: [1, 0.8, 0.5] },
      temperature: { available: true, celsius: 61, source: "CPU package" },
      memory: { usagePercent: 55, usedBytes: 8_000_000_000, totalBytes: 16_000_000_000 },
      disk: { available: true, usagePercent: 70, availableBytes: 100_000_000_000, path: "/" },
      network: { available: true, receivedBytesPerSecond: 2000, sentBytesPerSecond: 1000 },
      system: { hostname: "focus-pc", platform: "linux", release: "6.8", arch: "x64", uptimeSeconds: 7200 },
      alerts: []
    }
  });

  assert.match(html, /data-page="performance"/);
  assert.match(html, /Core readings/);
  assert.match(html, /Test CPU/);
  assert.match(html, /Active protection/);
});

test("Focus AI dock exposes typed, voice, and approval controls", () => {
  const state = populatedState();
  const html = assistant.renderDockedAssistant(state, {
    now: new Date(now),
    todayKey: "2026-06-07",
    assistant: {
      configured: true,
      status: "Waiting for approval",
      proposal: {
        id: "proposal-1",
        title: "Review this change",
        summary: "5 calendar events",
        actions: [],
        items: [{ type: "event/add", payload: { title: "Work", start: "2026-06-08T17:00:00.000Z" } }],
        count: 5,
        truncated: true
      }
    }
  });

  assert.match(html, /Focus AI/);
  assert.match(html, /data-assistant-action="record"/);
  assert.match(html, /data-assistant-action="approve"/);
  assert.match(html, /Ask Focus/);
  assert.match(html, /id="focus-ai-dock"/);
});

test("Focus AI dock renders an immediate visible thinking turn while a request runs", () => {
  const state = populatedState();
  const html = assistant.renderDockedAssistant(state, {
    assistant: {
      configured: true,
      runtimeAvailable: true,
      modelInstalled: true,
      provider: "local",
      model: "qwen3:4b-instruct",
      busy: true,
      status: "Thinking",
      requestStartedAt: 1_717_800_000_000,
      messages: [{
        role: "user",
        content: "Plan my afternoon",
        createdAt: "2026-06-08T12:00:00.000Z"
      }]
    }
  });

  assert.match(html, /data-assistant-thinking/);
  assert.match(html, /Generating response|Thinking/);
  assert.match(html, /Local models can take a little longer/);
  assert.match(html, /Plan my afternoon/);
  assert.match(html, /<time datetime=/);
});

test("reducer creates cross-domain timeline events without duplicating source state", () => {
  let state = populatedState();
  const task = state.tasks[0];
  state = reduceAppState(state, { type: "task/toggle", payload: { id: task.id, completed: true, now } });
  assert.equal(state.tasks[0].completed, true);
  assert.ok(state.timeline.some((item) => item.entityId === task.id && item.type === "task"));
  assert.equal(state.tasks.length, 1);
});

test("timer state survives pause, resume, completion, and session conversion", () => {
  const state = populatedState();
  let timer = startTimer(state, { title: "Deep work", project: "Focus", goalMinutes: 25 }, now);
  assert.equal(timer.status, "running");
  assert.equal(currentActiveMs(timer, now + 5_000), 5_000);

  timer = toggleTimerPause(timer, now + 5_000);
  assert.equal(timer.status, "paused");
  timer = toggleTimerPause(timer, now + 8_000);
  assert.equal(timer.status, "running");
  timer = completeTimer(timer, state.settings, now + 13_000);
  const session = sessionFromTimer(timer, now + 13_000);

  assert.equal(timer.status, "complete");
  assert.equal(session.title, "Deep work");
  assert.equal(session.activeMs, 10_000);
  assert.equal(session.pausedMs, 3_000);
});

test("entity merge keeps local active timer and newest records", () => {
  const local = populatedState();
  local.timer = startTimer(local, { title: "Current" }, now);
  const remote = normalizeState({
    ...local,
    timer: { status: "idle" },
    workItems: [{ ...local.workItems[0], summary: "Remote newer", updatedAt: now + 1000 }]
  }, now);
  const merged = mergeStates(local, remote);
  assert.equal(merged.timer.status, "running");
  assert.equal(merged.workItems[0].summary, "Remote newer");
});

test("global search covers navigation and personal records", () => {
  const results = buildSearchResults(populatedState(), "focus");
  assert.ok(results.some((item) => item.type === "command"));
  assert.ok(results.some((item) => item.type === "task" || item.type === "work"));
});

test("global search can open PC Performance", () => {
  const results = buildSearchResults(populatedState(), "performance");
  assert.ok(results.some((item) => item.page === "performance"));
});
