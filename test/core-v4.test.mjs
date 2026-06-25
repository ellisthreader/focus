import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultState, normalizeState } from "../src/core/schema.mjs";
import { reduceAppState } from "../src/core/reducer.mjs";
import { mergeStates } from "../src/core/merge.mjs";
import {
  projectAssistantContext,
  projectBrowserState,
  projectExportState,
  projectSyncState
} from "../src/core/privacy.mjs";

const NOW = Date.UTC(2026, 5, 8, 12);

test("v4 migrates improvements once and keeps v4 goals separate from legacy tasks", () => {
  const state = normalizeState({
    schemaVersion: 3,
    tasks: [{ id: "task-1", title: "Keep task" }],
    goals: [{ id: "legacy-task", text: "Legacy task" }],
    personalGoals: [{
      id: "goal-1",
      title: "Canonical",
      current: 3,
      target: 10,
      createdAt: NOW,
      updatedAt: NOW
    }],
    improvements: [{
      id: "goal-1",
      title: "Stale duplicate",
      progress: 1,
      target: 10
    }, {
      id: "goal-2",
      title: "Migrated",
      progress: 40,
      target: 100,
      metric: "%"
    }]
  }, NOW);

  assert.equal(state.schemaVersion, 4);
  assert.deepEqual(state.tasks.map((item) => item.id), ["task-1", "legacy-task"]);
  assert.deepEqual(state.personalGoals.map((item) => item.id), ["goal-1", "goal-2"]);
  assert.equal(state.personalGoals[1].current, 40);
  assert.equal(state.personalGoals[1].unit, "%");
  assert.deepEqual(state.improvements, []);

  const current = normalizeState({
    schemaVersion: 4,
    goals: [{ id: "not-a-task", text: "Do not remigrate" }]
  }, NOW);
  assert.deepEqual(current.tasks, []);
});

test("v4 normalizes new settings, UI state, medical records, and singleton emergency profile", () => {
  const state = normalizeState({
    schemaVersion: 4,
    settings: {
      dailyDashboard: { morningStart: "99:00", dayStart: "12:00", eveningStart: "20:30", mode: "morning" },
      weeklyReview: { reviewDay: 9, includeFinance: true }
    },
    ui: { todayMode: "evening", insightsView: "weekly" },
    medicalAppointments: [{ id: "appt-1", title: "Checkup", start: "2026-06-09T09:00:00Z" }],
    medicalRecords: [{ id: "record-1", date: "2026-06-01", title: "Result", kind: "test" }],
    emergencyProfiles: [
      { id: "old", bloodType: "A+", updatedAt: NOW },
      { id: "new", bloodType: "O+", updatedAt: NOW + 1 }
    ]
  }, NOW);

  assert.equal(state.settings.dailyDashboard.morningStart, "05:00");
  assert.equal(state.settings.dailyDashboard.eveningStart, "20:30");
  assert.equal(state.settings.weeklyReview.reviewDay, 6);
  assert.equal(state.ui.todayMode, "evening");
  assert.equal(state.ui.insightsView, "weekly");
  assert.equal(state.medicalAppointments.length, 1);
  assert.equal(state.medicalRecords.length, 1);
  assert.equal(state.emergencyProfiles.length, 1);
  assert.equal(state.emergencyProfiles[0].id, "emergency-profile");
  assert.equal(state.emergencyProfiles[0].bloodType, "O+");
});

test("new v4 reducers tombstone records and routine completion IDs are deterministic", () => {
  let state = createDefaultState(NOW);
  const cases = [
    ["personalGoals", "personalGoal", { id: "goal-1", title: "Goal" }],
    ["goalMilestones", "goalMilestone", { id: "milestone-1", goalId: "goal-1", title: "Step" }],
    ["medicalAppointments", "medicalAppointment", { id: "appointment-1", title: "Visit" }],
    ["medicalRecords", "medicalRecord", { id: "record-1", date: "2026-06-08", title: "Result" }],
    ["dailyRoutineItems", "dailyRoutineItem", { id: "routine-1", title: "Plan day" }]
  ];

  for (const [collection, actionName, record] of cases) {
    state = reduceAppState(state, { type: `${actionName}/add`, payload: { ...record, now: NOW } });
    state = reduceAppState(state, { type: `${actionName}/delete`, payload: { id: record.id, now: NOW + 1 } });
    assert.equal(state[collection][0].deletedAt, NOW + 1);
  }

  state = reduceAppState(state, {
    type: "dailyRoutineLog/set",
    payload: { routineItemId: "routine-1", date: "2026-06-08", completed: true, now: NOW + 2 }
  });
  state = reduceAppState(state, {
    type: "dailyRoutineLog/set",
    payload: { routineItemId: "routine-1", date: "2026-06-08", completed: false, now: NOW + 3 }
  });
  assert.equal(state.dailyRoutineLogs.length, 1);
  assert.equal(state.dailyRoutineLogs[0].id, "daily-routine-log:routine-1:2026-06-08");
  assert.equal(state.dailyRoutineLogs[0].status, "pending");
});

test("merge preserves nested settings and deduplicates routine logs", () => {
  const local = {
    schemaVersion: 4,
    settings: {
      dailyDashboard: { morningStart: "07:00" },
      privacy: { optionalSync: { finance: true } }
    },
    dailyRoutineLogs: [{
      id: "random-local",
      routineItemId: "routine-1",
      date: "2026-06-08",
      status: "completed",
      updatedAt: NOW + 2
    }]
  };
  const remote = {
    schemaVersion: 4,
    settings: {
      dailyDashboard: { eveningStart: "19:00" },
      privacy: { optionalSync: { medical: true } }
    },
    dailyRoutineLogs: [{
      id: "random-remote",
      routineItemId: "routine-1",
      date: "2026-06-08",
      status: "pending",
      updatedAt: NOW + 1
    }]
  };

  const merged = mergeStates(local, remote);
  assert.equal(merged.settings.dailyDashboard.morningStart, "07:00");
  assert.equal(merged.settings.dailyDashboard.eveningStart, "19:00");
  assert.equal(merged.settings.privacy.optionalSync.finance, true);
  assert.equal(merged.settings.privacy.optionalSync.medical, true);
  assert.equal(merged.dailyRoutineLogs.length, 1);
  assert.equal(merged.dailyRoutineLogs[0].status, "completed");
});

test("medical data and tagged timeline entries remain excluded from portable projections", () => {
  const state = {
    settings: { privacy: {} },
    medicalAppointments: [{ id: "appt-1", title: "Private appointment" }],
    medicalRecords: [{ id: "record-1", title: "Private result" }],
    emergencyProfiles: [{ id: "emergency-profile", bloodType: "O+" }],
    timeline: [
      { id: "public", title: "Public" },
      { id: "medical", title: "Private", privacyDomain: "medical" },
      { id: "finance", title: "Money", privacyDomain: "finance" }
    ]
  };

  for (const projected of [projectBrowserState(state), projectSyncState(state), projectExportState(state)]) {
    assert.equal("medicalAppointments" in projected, false);
    assert.equal("medicalRecords" in projected, false);
    assert.equal("emergencyProfiles" in projected, false);
    assert.deepEqual(projected.timeline.map((entry) => entry.id), ["public"]);
  }

  const explicit = projectSyncState({
    ...state,
    settings: { privacy: { optionalSync: { medical: true } } }
  });
  assert.equal("medicalRecords" in explicit, false);
  assert.deepEqual(explicit.timeline.map((entry) => entry.id), ["public"]);
});

test("assistant summaries ignore tombstones and excluded finance entries", () => {
  const state = {
    settings: {
      privacy: {
        assistant: {
          local: { nutrition: true, finance: true, learning: true }
        }
      }
    },
    nutritionEntries: [
      { id: "meal-1", calories: 500, proteinGrams: 20 },
      { id: "meal-2", calories: 900, deletedAt: NOW }
    ],
    financeEntries: [
      { id: "money-1", kind: "expense", amountMinor: 1000 },
      { id: "money-2", kind: "expense", amountMinor: 9000, excluded: true },
      { id: "money-3", kind: "income", amountMinor: 5000, deletedAt: NOW }
    ],
    learningItems: [{ id: "item-1", status: "active", deletedAt: NOW }],
    learningLogs: [{ id: "log-1", durationMinutes: 30 }, { id: "log-2", durationMinutes: 90, deletedAt: NOW }],
    learningNotes: []
  };

  const summary = projectAssistantContext(state, { provider: "local" });
  assert.equal(summary.nutrition.entryCount, 1);
  assert.equal(summary.nutrition.totalCalories, 500);
  assert.equal(summary.finance.transactionCount, 1);
  assert.equal(summary.finance.spendingMinor, 1000);
  assert.equal(summary.finance.incomeMinor, 0);
  assert.equal(summary.learning.activeItemCount, 0);
  assert.equal(summary.learning.studyMinutes, 30);
});
