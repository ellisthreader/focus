import test from "node:test";
import assert from "node:assert/strict";
import {
  bindDailyRoutine,
  dailyRoutineLogId,
  dailyRoutineStatus,
  findDailyRoutineLog,
  renderDailyRoutine,
  selectDailyRoutineMode
} from "../src/features/daily-routines.mjs";

function localTime(hour, minute = 0) {
  return new Date(2026, 5, 8, hour, minute, 0);
}

function eventRoot() {
  const listeners = new Map();
  return {
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

function control(dataset) {
  return {
    dataset,
    disabled: false,
    closest(selector) {
      return selector.includes("data-action") ? this : null;
    }
  };
}

test("daily routine auto mode uses exact local-time boundaries", () => {
  const settings = {
    mode: "auto",
    morningStart: "05:30",
    dayStart: "11:45",
    eveningStart: "18:15"
  };

  assert.equal(selectDailyRoutineMode(localTime(5, 29), settings), "evening");
  assert.equal(selectDailyRoutineMode(localTime(5, 30), settings), "morning");
  assert.equal(selectDailyRoutineMode(localTime(11, 44), settings), "morning");
  assert.equal(selectDailyRoutineMode(localTime(11, 45), settings), "day");
  assert.equal(selectDailyRoutineMode(localTime(18, 14), settings), "day");
  assert.equal(selectDailyRoutineMode(localTime(18, 15), settings), "evening");
  assert.equal(selectDailyRoutineMode(localTime(23, 59), settings), "evening");
});

test("daily routine mode honors explicit selection and repairs invalid boundaries", () => {
  assert.equal(selectDailyRoutineMode(localTime(9), { mode: "evening" }), "evening");
  assert.equal(selectDailyRoutineMode(localTime(6), {
    mode: "auto",
    morningStart: "19:00",
    dayStart: "12:00",
    eveningStart: "08:00"
  }), "morning");
});

test("completion lookup is date-specific and deterministically selects the freshest log", () => {
  const logs = [
    {
      id: "older",
      routineItemId: "water",
      date: "2026-06-08",
      status: "skipped",
      updatedAt: 100
    },
    {
      id: "newer",
      routineItemId: "water",
      date: "2026-06-08",
      status: "completed",
      updatedAt: 200
    },
    {
      id: "tomorrow",
      routineItemId: "water",
      date: "2026-06-09",
      status: "completed",
      updatedAt: 300
    }
  ];

  assert.equal(findDailyRoutineLog(logs, "water", "2026-06-08")?.id, "newer");
  assert.equal(dailyRoutineStatus(logs, "water", "2026-06-08"), "completed");
  assert.equal(dailyRoutineStatus(logs, "water", "2026-06-07"), "pending");
  assert.equal(
    dailyRoutineLogId("water & vitamins", "2026-06-08"),
    "daily-routine-log:water%20%26%20vitamins:2026-06-08"
  );
});

test("routine rendering shows only the active period and today's completion", () => {
  const html = renderDailyRoutine({
    settings: {
      dailyDashboard: {
        mode: "auto",
        morningStart: "05:00",
        dayStart: "12:00",
        eveningStart: "18:00"
      }
    },
    dailyRoutineItems: [
      { id: "water", period: "morning", title: "Drink water", order: 1, active: true },
      { id: "review", period: "evening", title: "Review the day", order: 1, active: true }
    ],
    dailyRoutineLogs: [
      { id: "water-today", routineItemId: "water", date: "2026-06-08", status: "completed" },
      { id: "water-yesterday", routineItemId: "water", date: "2026-06-07", status: "skipped" }
    ]
  }, {
    now: localTime(8),
    todayKey: "2026-06-08"
  });

  assert.match(html, /Morning routine/);
  assert.match(html, /1 of 1 complete/);
  assert.match(html, /Drink water/);
  assert.match(html, /aria-checked="true"/);
  assert.doesNotMatch(html, /Review the day/);
});

test("routine binding dispatches deterministic toggle and skip updates", () => {
  const root = eventRoot();
  const dispatched = [];
  const navigated = [];
  bindDailyRoutine(root, {
    dispatch(action) {
      dispatched.push(action);
    },
    openSearchResult(result) {
      navigated.push(result);
    }
  });

  root.listeners.get("click")({
    target: control({
      action: "routine/toggle",
      itemId: "water",
      date: "2026-06-08",
      status: "pending"
    })
  });
  root.listeners.get("click")({
    target: control({
      action: "routine/skip",
      itemId: "water",
      date: "2026-06-08",
      status: "skipped"
    })
  });
  root.listeners.get("click")({
    target: control({
      action: "routine/navigate",
      page: "health",
      view: "recovery"
    })
  });

  assert.deepEqual(dispatched, [
    {
      type: "dailyRoutineLog/set",
      payload: {
        id: "daily-routine-log:water:2026-06-08",
        routineItemId: "water",
        date: "2026-06-08",
        status: "completed"
      }
    },
    {
      type: "dailyRoutineLog/set",
      payload: {
        id: "daily-routine-log:water:2026-06-08",
        routineItemId: "water",
        date: "2026-06-08",
        status: "pending"
      }
    }
  ]);
  assert.deepEqual(navigated, [{ page: "health", view: "recovery" }]);
});
