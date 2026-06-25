import test from "node:test";
import assert from "node:assert/strict";

import {
  SCHEMA_VERSION,
  createDefaultState,
  normalizeState
} from "../src/core/schema.mjs";
import { reduceAppState } from "../src/core/reducer.mjs";
import { mergeStates } from "../src/core/merge.mjs";

const NOW = Date.UTC(2026, 5, 8, 12);
const NEW_COLLECTIONS = [
  "nutritionEntries",
  "bodyMeasurements",
  "wellnessRoutines",
  "wellnessLogs",
  "workoutSessions",
  "trainingPlans",
  "financeEntries",
  "financeBudgets",
  "financeRecurring",
  "financeGoals",
  "learningItems",
  "learningLogs",
  "learningNotes"
];

test("schema v4 additively migrates v2 state with domain defaults", () => {
  const state = normalizeState({
    schemaVersion: 2,
    tasks: [{ id: "task-1", title: "Preserved", createdAt: NOW - 1 }],
    settings: { customSetting: "kept" },
    ui: { activePage: "health" }
  }, NOW);

  assert.equal(SCHEMA_VERSION, 4);
  assert.equal(state.schemaVersion, 4);
  assert.equal(state.tasks[0].title, "Preserved");
  assert.equal(state.settings.customSetting, "kept");
  assert.deepEqual(state.settings.nutritionGoals, {
    calories: null,
    proteinGrams: null,
    carbsGrams: null,
    fatGrams: null,
    fiberGrams: null,
    waterMl: null
  });
  assert.equal(state.settings.financeCurrency, "USD");
  assert.deepEqual(state.settings.financeGoals, {
    monthlySpendingMinor: null,
    monthlySavingMinor: null
  });
  assert.equal(state.settings.learningTargetMinutes, null);
  assert.equal(state.settings.privacy.optionalSync.finance, false);
  assert.equal(state.settings.privacy.assistant.local.recovery, false);
  assert.equal(state.settings.privacy.assistant.cloud.finance, false);
  assert.equal(state.settings.privacy.manualExport.includeSensitiveDomains, false);
  assert.equal(state.ui.healthView, "checkin");
  assert.equal(state.ui.progressView, "habits");
  assert.equal(state.ui.financeView, "overview");
  for (const collection of NEW_COLLECTIONS) assert.deepEqual(state[collection], []);
});

test("weekly learning targets preserve the full week range", () => {
  const state = normalizeState({
    schemaVersion: 3,
    settings: { learningTargetMinutes: 10080 }
  });

  assert.equal(state.settings.learningTargetMinutes, 10080);
});

test("schema rejects documents from a future version", () => {
  assert.throws(
    () => normalizeState({ schemaVersion: SCHEMA_VERSION + 1 }, NOW),
    /Unsupported schema version 5/
  );
});

test("health observations preserve missing null and explicit zero", () => {
  let state = normalizeState({
    schemaVersion: 2,
    healthEntries: [
      { id: "missing", date: "2026-06-07" },
      {
        id: "zero",
        date: "2026-06-08",
        sleepHours: 0,
        waterGlasses: 0,
        steps: 0,
        movementMinutes: 0,
        weightKg: null
      }
    ]
  }, NOW);

  assert.equal(state.healthEntries[0].sleepHours, null);
  assert.equal(state.healthEntries[0].energy, null);
  assert.equal(state.healthEntries[0].stress, null);
  assert.equal(state.healthEntries[1].sleepHours, 0);
  assert.equal(state.healthEntries[1].steps, 0);
  assert.equal(state.healthEntries[1].weightKg, null);

  state = reduceAppState(state, {
    type: "health/save",
    payload: {
      date: "2026-06-08",
      sleepHours: null,
      energy: 0,
      weightKg: null,
      now: NOW + 1
    }
  });
  const saved = state.healthEntries.find((entry) => entry.id === "zero");
  assert.equal(saved.sleepHours, null);
  assert.equal(saved.energy, 0);
  assert.equal(saved.weightKg, null);
  assert.equal(saved.mood, null);
});

test("finance records store integer non-negative minor units", () => {
  const state = normalizeState({
    schemaVersion: 3,
    financeEntries: [{
      id: "finance-1",
      date: "2026-06-08",
      label: "Groceries",
      amountMinor: 1299.7,
      kind: "expense",
      currency: "gbp",
      createdAt: NOW
    }],
    financeBudgets: [{
      id: "budget-1",
      category: "Food",
      monthlyLimitMinor: -50,
      createdAt: NOW
    }]
  }, NOW);

  assert.equal(state.financeEntries[0].amountMinor, 1300);
  assert.equal(state.financeEntries[0].currency, "GBP");
  assert.equal(state.financeBudgets[0].monthlyLimitMinor, 0);
  assert.equal(Number.isInteger(state.financeEntries[0].amountMinor), true);
});

test("new domain reducers add, update, and tombstone every collection", () => {
  const cases = [
    ["nutritionEntries", "nutritionEntry", { date: "2026-06-08", name: "Lunch" }],
    ["bodyMeasurements", "bodyMeasurement", { date: "2026-06-08", weightKg: null }],
    ["wellnessRoutines", "wellnessRoutine", { name: "Routine", kind: "supplement" }],
    ["wellnessLogs", "wellnessLog", { routineId: "routine-1", date: "2026-06-08", taken: true }],
    ["workoutSessions", "workoutSession", { date: "2026-06-08", name: "Run" }],
    ["trainingPlans", "trainingPlan", { name: "Three days" }],
    ["financeEntries", "financeEntry", { date: "2026-06-08", label: "Pay", amountMinor: 1000.4, kind: "income" }],
    ["financeBudgets", "financeBudget", { category: "Food", monthlyLimitMinor: 50000 }],
    ["financeRecurring", "financeRecurring", { name: "Rent", amountMinor: 80000, kind: "expense" }],
    ["financeGoals", "financeGoal", { name: "Buffer", targetAmountMinor: 100000 }],
    ["learningItems", "learningItem", { title: "Rust", kind: "skill" }],
    ["learningLogs", "learningLog", { date: "2026-06-08", title: "Rust study", durationMinutes: 30 }],
    ["learningNotes", "learningNote", { title: "Ownership", body: "Notes" }]
  ];

  let state = createDefaultState(NOW);
  for (const [collection, actionName, record] of cases) {
    state = reduceAppState(state, {
      type: `${actionName}/add`,
      payload: { ...record, id: `${collection}-1`, now: NOW }
    });
    assert.equal(state[collection].length, 1, `${collection} add`);

    state = reduceAppState(state, {
      type: `${actionName}/update`,
      payload: { id: `${collection}-1`, patch: { marker: "updated" }, now: NOW + 10 }
    });
    assert.equal(state[collection][0].marker, "updated", `${collection} update`);

    state = reduceAppState(state, {
      type: `${actionName}/delete`,
      payload: { id: `${collection}-1`, now: NOW + 20 }
    });
    assert.equal(state[collection][0].deletedAt, NOW + 20, `${collection} tombstone`);
  }
  assert.equal(state.financeEntries[0].amountMinor, 1000);
});

test("logging actions create concise timeline summaries", () => {
  let state = createDefaultState(NOW);
  state = reduceAppState(state, {
    type: "nutrition/add",
    payload: { id: "meal-1", date: "2026-06-08", name: "Porridge", calories: 400, now: NOW }
  });
  state = reduceAppState(state, {
    type: "health/save",
    payload: { date: "2026-06-08", sleepHours: 7, now: NOW + 1 }
  });
  state = reduceAppState(state, {
    type: "workout/add",
    payload: { id: "workout-1", date: "2026-06-08", name: "Upper body", durationMinutes: 45, now: NOW + 2 }
  });
  state = reduceAppState(state, {
    type: "finance/add",
    payload: { id: "finance-1", date: "2026-06-08", label: "Groceries", amountMinor: 2500, kind: "expense", now: NOW + 3 }
  });
  state = reduceAppState(state, {
    type: "learningLog/add",
    payload: { id: "learning-1", date: "2026-06-08", title: "Spanish", durationMinutes: 25, now: NOW + 4 }
  });

  assert.deepEqual(
    state.timeline.slice(0, 5).map((entry) => entry.type),
    ["learning", "finance", "exercise", "health", "nutrition"]
  );
  assert.equal(state.timeline.some((entry) => /Groceries/.test(entry.title)), true);
  assert.equal(state.timeline.some((entry) => /account|note/i.test(entry.detail)), false);
});

test("merge keeps freshest domain records and deletion wins timestamp ties", () => {
  const local = normalizeState({
    schemaVersion: 3,
    financeEntries: [{
      id: "finance-1",
      date: "2026-06-08",
      label: "Deleted locally",
      amountMinor: 100,
      kind: "expense",
      createdAt: NOW,
      updatedAt: NOW + 20,
      deletedAt: NOW + 20
    }],
    learningItems: [{
      id: "learning-1",
      title: "Older",
      createdAt: NOW,
      updatedAt: NOW + 10
    }]
  }, NOW);
  const remote = normalizeState({
    schemaVersion: 3,
    financeEntries: [{
      id: "finance-1",
      date: "2026-06-08",
      label: "Active remote",
      amountMinor: 100,
      kind: "expense",
      createdAt: NOW,
      updatedAt: NOW + 20
    }],
    learningItems: [{
      id: "learning-1",
      title: "Newer",
      createdAt: NOW,
      updatedAt: NOW + 30
    }]
  }, NOW);

  const merged = mergeStates(local, remote);
  assert.equal(merged.financeEntries[0].deletedAt, NOW + 20);
  assert.equal(merged.learningItems[0].title, "Newer");
});
