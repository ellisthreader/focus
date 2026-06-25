import assert from "node:assert/strict";
import test from "node:test";

import {
  projectAssistantApplicationContext,
  projectAssistantContext,
  projectBrowserState,
  projectExportState,
  projectFolderSyncState,
  projectMysqlSyncState,
  projectSyncState
} from "../src/core/privacy.mjs";
import {
  exportPersistedState,
  loadPersistedState,
  savePersistedState
} from "../src/core/persistence.mjs";

const sensitiveCollections = [
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
  "learningNotes"
];

function stateWithPrivacy(privacy = {}) {
  return {
    settings: { privacy },
    tasks: [{ id: "task-1", title: "Visible" }],
    nutritionEntries: [{
      id: "meal-1",
      date: "2026-06-08",
      calories: 600,
      proteinGrams: 40,
      notes: "private meal note"
    }],
    bodyMeasurements: [{ id: "body-1", date: "2026-06-08", weightKg: 70 }],
    wellnessRoutines: [{ id: "routine-1", name: "Private medication", active: true }],
    wellnessLogs: [{ id: "log-1", routineId: "routine-1", date: "2026-06-08", taken: true }],
    workoutSessions: [{ id: "workout-1", date: "2026-06-08", durationMinutes: 45, notes: "private" }],
    trainingPlans: [{ id: "plan-1", name: "Plan", active: true }],
    financeEntries: [{
      id: "money-1",
      kind: "expense",
      amountMinor: 2500,
      account: "Private account",
      notes: "Private finance note"
    }],
    financeBudgets: [{ id: "budget-1", active: true, monthlyLimitMinor: 10000 }],
    financeRecurring: [{ id: "recurring-1", name: "Private bill" }],
    financeGoals: [{ id: "goal-1", name: "Private goal", active: true }],
    learningItems: [{ id: "learning-1", status: "active", title: "Course" }],
    learningLogs: [{ id: "study-1", durationMinutes: 30 }],
    learningNotes: [{
      id: "note-1",
      title: "Private note",
      body: "secret note body",
      nextReviewDate: "2026-06-10"
    }]
  };
}

test("browser fallback excludes sensitive collections by default without mutating state", () => {
  const state = stateWithPrivacy();
  const projected = projectBrowserState(state);

  for (const key of sensitiveCollections) assert.equal(key in projected, false, key);
  assert.deepEqual(projected.tasks, state.tasks);
  assert.equal(state.financeEntries[0].account, "Private account");
});

test("browser, sync, and export projections honor destination opt-ins", () => {
  const state = stateWithPrivacy({
    browserStorage: { wellbeing: true },
    optionalSync: { finance: true, learningNotes: true },
    manualExport: { includeSensitiveDomains: true }
  });

  const browser = projectBrowserState(state);
  assert.deepEqual(browser.nutritionEntries, state.nutritionEntries);
  assert.deepEqual(browser.workoutSessions, state.workoutSessions);
  assert.equal("financeEntries" in browser, false);
  assert.equal("learningNotes" in browser, false);

  const sync = projectSyncState(state);
  assert.equal("nutritionEntries" in sync, false);
  assert.deepEqual(sync.financeEntries, state.financeEntries);
  assert.deepEqual(sync.learningNotes, state.learningNotes);

  const exported = projectExportState(state);
  for (const key of sensitiveCollections) assert.deepEqual(exported[key], state[key], key);
});

test("sync and export exclude wellbeing, finance, and learning notes by default", () => {
  for (const projected of [projectSyncState(stateWithPrivacy()), projectExportState(stateWithPrivacy())]) {
    for (const key of sensitiveCollections) assert.equal(key in projected, false, key);
    assert.deepEqual(projected.learningItems, [{ id: "learning-1", status: "active", title: "Course" }]);
  }
});

test("grouped health aliases opt wellbeing into sync, export, and assistant summaries", () => {
  const state = stateWithPrivacy({
    syncHealth: true,
    exportHealth: true,
    localAiHealth: true
  });

  assert.deepEqual(projectSyncState(state).nutritionEntries, state.nutritionEntries);
  assert.deepEqual(projectExportState(state).workoutSessions, state.workoutSessions);
  assert.deepEqual(
    Object.keys(projectAssistantContext(state, { provider: "local" })).sort(),
    ["exercise", "focus", "nutrition", "recovery"]
  );
});

test("assistant projection is opt-in per provider and returns summaries only", () => {
  const state = stateWithPrivacy({
    assistant: {
      local: { nutrition: true, finance: true, learning: true },
      cloud: { exercise: true }
    }
  });

  const local = projectAssistantContext(state, { provider: "local" });
  assert.deepEqual(Object.keys(local).sort(), ["finance", "focus", "learning", "nutrition"]);
  assert.equal(local.nutrition.entryCount, 1);
  assert.equal(local.finance.spendingMinor, 2500);
  assert.equal(local.learning.noteCount, 1);
  assert.doesNotMatch(JSON.stringify(local), /Private account|finance note|secret note body|meal note/);

  const cloud = projectAssistantContext(state, { provider: "cloud" });
  assert.deepEqual(Object.keys(cloud).sort(), ["exercise", "focus"]);
  assert.equal(cloud.exercise.totalDurationMinutes, 45);
  assert.deepEqual(
    Object.keys(projectAssistantContext(stateWithPrivacy(), { provider: "cloud" })),
    ["focus"]
  );
});

test("assistant projection always includes current focus goal progress", () => {
  const state = stateWithPrivacy();
  state.settings.dailyGoalMinutes = 120;
  state.sessions = [{
    id: "focus-1",
    startedAt: "2026-06-08T09:00:00.000Z",
    activeMs: 90 * 60 * 1000
  }];

  const context = projectAssistantContext(state, {
    provider: "local",
    currentDate: "2026-06-08"
  });

  assert.deepEqual(context.focus, {
    date: "2026-06-08",
    sessionCount: 1,
    focusedMinutes: 90,
    goalMinutes: 120,
    remainingMinutes: 30,
    completionPercent: 75
  });
});

test("assistant application context exposes bounded permitted records without private note fields", () => {
  const state = stateWithPrivacy({
    assistant: {
      local: {
        nutrition: true,
        recovery: true,
        exercise: true,
        finance: true,
        learning: true
      }
    }
  });
  state.events = [{ id: "event-1", title: "Dentist", start: "2026-06-09T09:00:00.000Z" }];
  state.reminders = [{ id: "reminder-1", title: "Take bins out", completed: false }];

  const context = projectAssistantApplicationContext(state, {
    provider: "local",
    currentDate: "2026-06-08"
  });

  assert.equal(context.version, 1);
  assert.equal(context.capabilities.mutationsRequireApproval, true);
  assert.equal(context.tasks[0].title, "Visible");
  assert.equal(context.calendar[0].title, "Dentist");
  assert.equal(context.reminders[0].title, "Take bins out");
  assert.equal(context.nutrition[0].calories, 600);
  assert.equal(context.finance[0].amountMinor, 2500);
  assert.equal(context.learning.items[0].title, "Course");
  assert.doesNotMatch(
    JSON.stringify(context),
    /private meal note|Private account|Private finance note|secret note body|"notes":"private"/i
  );

  const denied = projectAssistantApplicationContext(stateWithPrivacy(), {
    provider: "local",
    currentDate: "2026-06-08"
  });
  assert.equal("nutrition" in denied, false);
  assert.equal("finance" in denied, false);
  assert.equal("learning" in denied, false);
});

test("persistence mirrors a projection but sends full canonical state to desktop", async () => {
  const state = stateWithPrivacy();
  let localSnapshot;
  let desktopSnapshot;
  global.window = {
    localStorage: {
      setItem(key, value) {
        assert.equal(key, "focus-pattern-tracker:v2");
        localSnapshot = JSON.parse(value);
      }
    },
    focusDesktop: {
      async saveData(value) {
        desktopSnapshot = value;
        return { ok: true };
      }
    }
  };

  await savePersistedState(state);
  assert.equal("financeEntries" in localSnapshot, false);
  assert.deepEqual(desktopSnapshot.financeEntries, state.financeEntries);
  assert.notEqual(desktopSnapshot, state);
});

test("desktop load failures stop startup instead of falling back to partial browser data", async () => {
  global.window = {
    localStorage: {
      getItem() {
        return JSON.stringify({ tasks: [{ id: "partial", title: "Partial mirror" }] });
      }
    },
    focusDesktop: {
      async loadData() {
        return {
          ok: false,
          code: "LOCAL_LOAD_FAILED",
          error: "Primary and backup data are unreadable."
        };
      }
    }
  };

  await assert.rejects(
    loadPersistedState(),
    /Primary and backup data are unreadable/
  );
});

test("manual persistence export sends the export projection", async () => {
  const state = stateWithPrivacy({ manualExport: { finance: true } });
  let exported;
  global.window = {
    focusDesktop: {
      async exportData(value) {
        exported = value;
        return { ok: true };
      }
    }
  };

  await exportPersistedState(state);
  assert.deepEqual(exported.financeEntries, state.financeEntries);
  assert.equal("nutritionEntries" in exported, false);
  assert.equal("learningNotes" in exported, false);
});

test("one privacy policy consistently governs folder, mysql, export, and assistant projections", () => {
  const state = stateWithPrivacy({
    optionalSync: { wellbeing: false, finance: false, learningNotes: false },
    manualExport: { wellbeing: false, finance: false, learningNotes: false },
    assistant: {
      local: { nutrition: false, recovery: false, exercise: false, finance: false, learning: false },
      cloud: { nutrition: false, recovery: false, exercise: false, finance: false, learning: false }
    }
  });

  for (const snapshot of [projectFolderSyncState(state), projectMysqlSyncState(state), projectExportState(state)]) {
    assert.equal("nutritionEntries" in snapshot, false);
    assert.equal("healthEntries" in snapshot, false);
    assert.equal("financeEntries" in snapshot, false);
    assert.equal("learningNotes" in snapshot, false);
  }
  assert.deepEqual(
    Object.keys(projectAssistantContext(state, { provider: "local" })),
    ["focus"]
  );
  assert.deepEqual(
    Object.keys(projectAssistantContext(state, { provider: "cloud" })),
    ["focus"]
  );
});
