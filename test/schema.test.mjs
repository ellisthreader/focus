import test from "node:test";
import assert from "node:assert/strict";

import {
  SCHEMA_VERSION,
  createDefaultState,
  createId,
  migrateLegacyState,
  normalizeState
} from "../src/core/schema.mjs";

const NOW = Date.UTC(2026, 5, 7, 12);

test("createDefaultState returns a complete current personal OS state", () => {
  const state = createDefaultState(NOW);

  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  assert.equal(state.theme, "light");
  assert.deepEqual(state.profile, {
    name: "",
    email: "",
    avatar: "",
    bio: "",
    primaryGoal: "",
    fitnessGoal: "",
    nutritionGoal: "",
    learningGoal: "",
    workStart: "",
    workEnd: "",
    wakeTime: "",
    sleepTime: "",
    timeZone: ""
  });
  assert.deepEqual(state.onboarding, {
    completed: false,
    completedAt: null,
    skippedAt: null,
    version: 0
  });
  assert.equal(state.settings.dailyGoalMinutes, 360);
  assert.deepEqual(state.settings.pcPerformance, {
    enabled: true,
    notificationsEnabled: true,
    cpuThreshold: 95,
    temperatureThreshold: 90,
    memoryThreshold: 95,
    diskThreshold: 95,
    sustainedSamples: 3,
    cooldownMinutes: 15
  });
  assert.equal(state.timer.status, "idle");
  assert.equal(state.timer.goalMinutes, 50);
  assert.equal(state.ui.activePage, "today");
  assert.equal(state.ui.selectedDate, "2026-06-07");

  for (const key of [
    "tasks", "reminders", "events", "habits", "healthEntries", "workItems",
    "improvements", "journalEntries", "timeline", "sessions"
  ]) {
    assert.deepEqual(state[key], []);
  }
  assert.deepEqual(state.manualDailyMinutes, {});
  assert.deepEqual(state.manualDailyUpdatedAt, {});
});

test("createId creates unique, prefixed identifiers without platform APIs", () => {
  const first = createId("task");
  const second = createId("task");
  const sanitized = createId("daily note");

  assert.match(first, /^task-/);
  assert.match(sanitized, /^daily-note-/);
  assert.notEqual(first, second);
});

test("migrateLegacyState preserves focus data and maps goals to tasks", () => {
  const session = {
    id: "session-1",
    title: "Build migration",
    project: "Focus",
    tags: ["coding"],
    startedAt: NOW - 3_000_000,
    endedAt: NOW,
    durationMs: 3_000_000,
    activeMs: 2_700_000,
    pausedMs: 300_000,
    pauseCount: 1,
    focusRating: 5,
    energy: 4,
    goalMinutes: 50,
    taskId: "task-linked"
  };
  const legacy = {
    theme: "dark",
    sideTab: "goals",
    settings: {
      dailyGoalMinutes: 420,
      blockGoalMinutes: 60,
      shortBreakMinutes: 12,
      customSetting: "preserved"
    },
    sessions: [session],
    timer: {
      id: "timer-1",
      status: "running",
      mode: "focus",
      title: "Current work",
      startedAt: NOW - 60_000,
      lastResumedAt: NOW - 30_000,
      activeMs: 30_000,
      goalMinutes: 60
    },
    manualDailyMinutes: { "2026-06-07": 75 },
    manualDailyUpdatedAt: { "2026-06-07": NOW - 1_000 },
    goals: [
      { id: "goal-1", text: "Ship personal OS", completed: false, createdAt: NOW - 10_000 },
      { id: "goal-2", text: "Archive old task", completed: true, createdAt: NOW - 20_000, completedAt: NOW - 5_000 }
    ]
  };

  const state = migrateLegacyState(legacy, NOW);

  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  assert.equal(state.theme, "dark");
  assert.equal(state.settings.dailyGoalMinutes, 420);
  assert.equal(state.settings.customSetting, "preserved");
  assert.deepEqual(state.sessions[0], session);
  assert.equal(state.timer.status, "running");
  assert.equal(state.timer.lastResumedAt, NOW - 30_000);
  assert.deepEqual(state.manualDailyMinutes, { "2026-06-07": 75 });
  assert.deepEqual(state.manualDailyUpdatedAt, { "2026-06-07": NOW - 1_000 });
  assert.equal(state.tasks.length, 2);
  assert.deepEqual(
    state.tasks.map(({ id, title, completed, status }) => ({ id, title, completed, status })),
    [
      { id: "goal-1", title: "Ship personal OS", completed: false, status: "inbox" },
      { id: "goal-2", title: "Archive old task", completed: true, status: "completed" }
    ]
  );
  assert.equal("goals" in state, false);
});

test("normalizeState defensively repairs malformed input without mutating it", () => {
  const raw = {
    schemaVersion: 2,
    theme: "neon",
    profile: null,
    settings: {
      dailyGoalMinutes: -20,
      blockGoalMinutes: "500",
      shortBreakMinutes: "bad",
      pcPerformance: {
        cpuThreshold: 200,
        temperatureThreshold: 20,
        memoryThreshold: "bad",
        enabled: false
      }
    },
    tasks: [
      null,
      { id: "task-1", title: "  Keep me  ", priority: "urgent", completed: 1 },
      { title: " " }
    ],
    reminders: "bad",
    events: [{ title: "Broken" }],
    habits: [{ id: "habit-1", name: "Walk", entries: { "2026-06-07": "2", nope: 4 } }],
    healthEntries: [{ id: "health-1", date: "2026-06-07", mood: 99, sleepHours: -3 }],
    sessions: [{ id: "bad-session" }],
    timer: { status: "moving", mode: "unknown", activeMs: -1 },
    manualDailyMinutes: { "2026-06-07": 2000, invalid: 20 },
    manualDailyUpdatedAt: { "2026-06-07": "2026-06-07T11:00:00.000Z", invalid: NOW },
    ui: { selectedDate: "not-a-date", searchOpen: 1 }
  };
  const before = structuredClone(raw);

  const state = normalizeState(raw, NOW);

  assert.deepEqual(raw, before);
  assert.equal(state.theme, "light");
  assert.equal(state.settings.dailyGoalMinutes, 0);
  assert.equal(state.settings.blockGoalMinutes, 180);
  assert.equal(state.settings.shortBreakMinutes, 10);
  assert.equal(state.settings.pcPerformance.cpuThreshold, 100);
  assert.equal(state.settings.pcPerformance.temperatureThreshold, 50);
  assert.equal(state.settings.pcPerformance.memoryThreshold, 95);
  assert.equal(state.settings.pcPerformance.enabled, false);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].title, "Keep me");
  assert.equal(state.tasks[0].priority, "medium");
  assert.equal(state.tasks[0].status, "completed");
  assert.deepEqual(state.reminders, []);
  assert.deepEqual(state.events, []);
  assert.deepEqual(state.sessions, []);
  assert.deepEqual(state.habits[0].entries, { "2026-06-07": 2 });
  assert.equal(state.healthEntries[0].mood, 5);
  assert.equal(state.healthEntries[0].sleepHours, 0);
  assert.equal(state.timer.status, "idle");
  assert.equal(state.timer.mode, "focus");
  assert.equal(state.timer.activeMs, 0);
  assert.deepEqual(state.manualDailyMinutes, { "2026-06-07": 1440 });
  assert.deepEqual(state.manualDailyUpdatedAt, { "2026-06-07": Date.UTC(2026, 5, 7, 11) });
  assert.equal(state.ui.selectedDate, "2026-06-07");
  assert.equal(state.ui.searchOpen, true);
});

test("normalization accepts compatibility envelopes and is idempotent", () => {
  const legacyEnvelope = {
    version: 1,
    state: {
      goals: [{ id: "goal-1", text: "One migration", createdAt: NOW }],
      sessions: []
    }
  };

  const once = normalizeState(legacyEnvelope, NOW);
  const twice = normalizeState(once, NOW);

  assert.deepEqual(twice, once);
  assert.equal(once.tasks.length, 1);
  assert.equal(once.tasks[0].id, "goal-1");
});
