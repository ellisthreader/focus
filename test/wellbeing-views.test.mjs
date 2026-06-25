import test from "node:test";
import assert from "node:assert/strict";
import * as recovery from "../src/features/recovery-view.mjs";
import * as exercise from "../src/features/exercise-view.mjs";

const ctx = {
  todayKey: "2026-06-08",
  now: new Date(2026, 5, 8, 12, 0, 0),
  locale: "en-GB"
};

function eventRoot(dataset = {}) {
  const listeners = new Map();
  return {
    dataset,
    listeners,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    contains() {
      return true;
    }
  };
}

function control(dataset, owner = {}) {
  return {
    dataset,
    disabled: false,
    closest(selector) {
      if (selector.includes("data-action")) return this;
      if (selector.includes("data-routine-id") && owner.routineId) {
        return { dataset: { routineId: owner.routineId } };
      }
      if (selector.includes("data-workout-id") && owner.workoutId) {
        return { dataset: { workoutId: owner.workoutId } };
      }
      if (selector.includes("data-plan-id") && owner.planId) {
        return { dataset: { planId: owner.planId } };
      }
      return null;
    }
  };
}

test("Recovery empty state does not turn unknown observations into values", () => {
  const html = recovery.render({
    healthEntries: [{
      id: "health-1",
      date: "2026-06-08",
      sleepHours: null,
      energy: null,
      stress: null,
      soreness: null
    }]
  }, ctx);

  assert.match(html, /No recovery observations have been recorded yet/);
  assert.match(html, /No body measurements recorded/);
  assert.match(html, /No active wellness routines/);
  assert.doesNotMatch(html, /Energy 0\/5|Stress 0\/5|Soreness 0\/5|0 hours of sleep/);
  assert.doesNotMatch(html, /readiness score/i);
});

test("Recovery renders recorded evidence, measurements, and routine completion", () => {
  const html = recovery.render({
    healthEntries: [{
      id: "health-1",
      date: "2026-06-08",
      sleepHours: 7.5,
      sleepQuality: 4,
      energy: 3,
      stress: 2,
      soreness: null,
      weightKg: 72.4,
      restingHeartRate: 58,
      recoveryNote: "Late training session"
    }],
    wellnessRoutines: [{
      id: "routine-1",
      name: "Vitamin D",
      kind: "supplement",
      dose: "1 tablet",
      scheduleTime: "08:00",
      active: true
    }],
    wellnessLogs: [{
      id: "log-1",
      routineId: "routine-1",
      date: "2026-06-08",
      taken: true,
      takenAt: 100
    }]
  }, ctx);

  assert.match(html, /7.5 hours of sleep/);
  assert.match(html, /Sleep quality 4\/5/);
  assert.match(html, /Energy 3\/5/);
  assert.match(html, /Stress 2\/5/);
  assert.doesNotMatch(html, /Soreness/);
  assert.match(html, /72.4 kg/);
  assert.match(html, /58 bpm/);
  assert.match(html, /Vitamin D/);
  assert.match(html, />Logged</);
});

test("Recovery binds measurement, routine editor, and logging actions", () => {
  const root = eventRoot({ todayKey: "2026-06-08" });
  const opened = [];
  const dispatched = [];
  recovery.bind(root, {
    openEditor(kind, id) {
      opened.push([kind, id]);
    },
    dispatch(action) {
      dispatched.push(action);
    }
  });

  root.listeners.get("click")({
    target: control({ action: "recovery/add-routine" })
  });
  root.listeners.get("click")({
    target: control({ action: "recovery/edit-routine" }, { routineId: "routine-1" })
  });
  root.listeners.get("click")({
    target: control({ action: "recovery/log-routine", taken: "true" }, { routineId: "routine-1" })
  });

  assert.deepEqual(opened, [
    ["wellnessRoutine", undefined],
    ["wellnessRoutine", "routine-1"]
  ]);
  assert.deepEqual(dispatched, [{
    type: "wellness/log",
    payload: {
      routineId: "routine-1",
      date: "2026-06-08",
      taken: true
    }
  }]);
});

test("Recovery measurement form preserves blank optional values as null", () => {
  const root = eventRoot();
  const dispatched = [];
  const form = {
    closest(selector) {
      return selector.includes("recovery/save-measurements") ? this : null;
    }
  };
  const OriginalFormData = globalThis.FormData;
  globalThis.FormData = class {
    entries() {
      return [
        ["date", "2026-06-08"],
        ["weightKg", "72.4"],
        ["bodyFatPercent", ""],
        ["waistCm", ""],
        ["restingHeartRate", "58"]
      ];
    }
  };
  try {
    recovery.bind(root, { dispatch(action) { dispatched.push(action); } });
    root.listeners.get("submit")({ preventDefault() {}, target: form });
  } finally {
    globalThis.FormData = OriginalFormData;
  }

  assert.deepEqual(dispatched, [{
    type: "health/save",
    payload: {
      date: "2026-06-08",
      weightKg: 72.4,
      bodyFatPercent: null,
      waistCm: null,
      restingHeartRate: 58
    }
  }]);
});

test("Exercise empty state shows weekly totals and capture action", () => {
  const html = exercise.render({}, ctx);

  assert.match(html, /0 sessions · 0 min/);
  assert.match(html, /Log workout/);
  assert.match(html, /No workouts logged this week/);
  assert.match(html, /Balanced four-day growth plan/);
  assert.match(html, /Arms day/);
  assert.match(html, /Chest day/);
  assert.match(html, /Shoulder day/);
  assert.match(html, /Leg day/);
  assert.match(html, /Weekly muscle coverage/);
  assert.match(html, /No active training plan/);
  assert.match(html, /Open Recovery/);
  assert.doesNotMatch(html, /readiness/i);
});

test("Exercise renders current-week sessions, records, and active plans", () => {
  const html = exercise.render({
    workoutSessions: [
      {
        id: "workout-1",
        date: "2026-06-08",
        name: "Upper body",
        type: "strength",
        durationMinutes: 50,
        effort: 4,
        exercises: [{ name: "Bench press", sets: 3, reps: 8, weightKg: 70 }]
      },
      {
        id: "workout-2",
        date: "2026-06-07",
        name: "Long run",
        type: "run",
        durationMinutes: 75,
        distanceKm: 12
      }
    ],
    trainingPlans: [{
      id: "plan-1",
      name: "Balanced week",
      goal: "Build consistency",
      weeklyTarget: 3,
      active: true
    }]
  }, ctx);

  assert.match(html, /1 session · 50 min/);
  assert.match(html, /Upper body/);
  assert.doesNotMatch(html, /<strong>Long run<\/strong>/);
  assert.match(html, /Bench press/);
  assert.match(html, /70 kg/);
  assert.match(html, /Longest Long run/);
  assert.match(html, /12 km/);
  assert.match(html, /Balanced week/);
  assert.match(html, /3 \/ week/);
});

test("Exercise binds workout, plan, and Recovery navigation actions", () => {
  const root = eventRoot();
  const opened = [];
  const dispatched = [];
  const views = [];
  exercise.bind(root, {
    openEditor(kind, id, options) {
      opened.push([kind, id, options]);
    },
    dispatch(action) {
      dispatched.push(action);
    },
    showHealthView(view) {
      views.push(view);
    }
  });

  root.listeners.get("click")({ target: control({ action: "exercise/log-workout" }) });
  root.listeners.get("click")({
    target: control({ action: "exercise/edit-workout" }, { workoutId: "workout-1" })
  });
  root.listeners.get("click")({ target: control({ action: "exercise/add-plan" }) });
  root.listeners.get("click")({
    target: control({ action: "exercise/edit-plan" }, { planId: "plan-1" })
  });
  root.listeners.get("click")({ target: control({ action: "exercise/use-growth-plan" }) });
  root.listeners.get("click")({
    target: control({ action: "exercise/log-program-day", day: "Arms day" })
  });
  root.listeners.get("click")({ target: control({ action: "exercise/open-recovery" }) });

  assert.deepEqual(opened, [
    ["workout", undefined, undefined],
    ["workout", "workout-1", undefined],
    ["trainingPlan", undefined, undefined],
    ["trainingPlan", "plan-1", undefined],
    ["workout", "", {
      prefill: {
        name: "Arms day",
        type: "strength",
        notes: "Planned session:\nNeutral-grip lat pulldown: 3 x 6-10\nChest-supported row: 3 x 8-12\nEZ-bar curl: 3 x 8-12\nIncline dumbbell curl: 2 x 10-15\nCable triceps pressdown: 3 x 8-12\nOverhead cable triceps extension: 2 x 10-15\nCable crunch: 3 x 10-15"
      }
    }]
  ]);
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].type, "trainingPlan/add");
  assert.equal(dispatched[0].payload.weeklyTarget, 4);
  assert.deepEqual(views, ["recovery"]);
});
