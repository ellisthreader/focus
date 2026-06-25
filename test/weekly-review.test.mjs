import test from "node:test";
import assert from "node:assert/strict";
import { buildWeeklyReviewSnapshot } from "../src/core/weekly-review.mjs";
import * as insights from "../src/features/insights.mjs";

const now = new Date(2026, 5, 10, 12, 0, 0);

test("weekly review uses local Monday ranges and compares the previous week", () => {
  const snapshot = buildWeeklyReviewSnapshot({
    tasks: [
      { id: "current", completed: true, completedAt: new Date(2026, 5, 9, 10).getTime() },
      { id: "previous", completed: true, completedAt: new Date(2026, 5, 3, 10).getTime() }
    ],
    sessions: [
      { id: "current", startedAt: new Date(2026, 5, 8, 9).getTime(), activeMs: 30 * 60_000 },
      { id: "previous", startedAt: new Date(2026, 5, 2, 9).getTime(), activeMs: 45 * 60_000 }
    ]
  }, { now });

  assert.deepEqual(snapshot.current.range, {
    start: "2026-06-08",
    end: "2026-06-14",
    observationEnd: "2026-06-10"
  });
  assert.equal(snapshot.current.tasks.completed, 1);
  assert.equal(snapshot.previous.tasks.completed, 1);
  assert.equal(snapshot.current.focus.minutes, 30);
  assert.equal(snapshot.previous.focus.minutes, 45);
});

test("weekly review filters tombstones and excluded finance without combining currencies", () => {
  const snapshot = buildWeeklyReviewSnapshot({
    nutritionEntries: [
      { id: "meal", date: "2026-06-09", calories: 600, proteinGrams: 30 },
      { id: "deleted-meal", date: "2026-06-09", calories: 900, deletedAt: 1 }
    ],
    workoutSessions: [
      { id: "workout", date: "2026-06-09", durationMinutes: 40 },
      { id: "deleted-workout", date: "2026-06-09", durationMinutes: 90, deletedAt: 1 }
    ],
    financeEntries: [
      { id: "gbp", date: "2026-06-09", kind: "expense", amountMinor: 1200, currency: "GBP" },
      { id: "usd", date: "2026-06-09", kind: "income", amountMinor: 5000, currency: "USD" },
      { id: "excluded", date: "2026-06-09", kind: "expense", amountMinor: 9999, currency: "GBP", excluded: true },
      { id: "deleted", date: "2026-06-09", kind: "expense", amountMinor: 9999, currency: "GBP", deletedAt: 1 }
    ],
    learningLogs: [
      { id: "study", date: "2026-06-10", durationMinutes: 25 },
      { id: "deleted-study", date: "2026-06-10", durationMinutes: 70, deletedAt: 1 }
    ]
  }, { now });

  assert.deepEqual(snapshot.current.nutrition, { entries: 1, calories: 600, proteinGrams: 30 });
  assert.deepEqual(snapshot.current.exercise, { sessions: 1, minutes: 40 });
  assert.equal(snapshot.current.learning.minutes, 25);
  assert.equal(snapshot.current.finance.entries, 2);
  assert.equal(snapshot.current.finance.mixedCurrencies, true);
  assert.deepEqual(snapshot.current.finance.currencies.map((item) => item.currency), ["GBP", "USD"]);
  assert.match(snapshot.limitations.join(" "), /not combined or converted/);
});

test("weekly review reports habit attainment, milestone completions, and deterministic coverage", () => {
  const snapshot = buildWeeklyReviewSnapshot({
    habits: [{
      id: "habit",
      frequency: "daily",
      target: 1,
      createdAt: new Date(2026, 5, 8).getTime(),
      entries: { "2026-06-08": 1, "2026-06-09": 0, "2026-06-10": 1 }
    }],
    goalMilestones: [
      { id: "done", status: "completed", completedAt: new Date(2026, 5, 9).getTime() },
      { id: "deleted", status: "completed", completedAt: new Date(2026, 5, 9).getTime(), deletedAt: 1 }
    ]
  }, { now });

  assert.deepEqual(snapshot.current.habits, { completed: 2, expected: 3, rate: 67 });
  assert.equal(snapshot.current.milestones.completed, 1);
  assert.equal(snapshot.dataCoverage.level, "high");
  assert.equal(snapshot.dataCoverage.observedDays, 3);

  const empty = buildWeeklyReviewSnapshot({}, { now });
  assert.equal(empty.dataCoverage.level, "low");
  assert.match(empty.limitations.join(" "), /Data coverage is low/);
});

function tab(view) {
  const attributes = {};
  return {
    dataset: { action: "switch-insights-view", view },
    tabIndex: view === "overview" ? 0 : -1,
    setAttribute(name, value) {
      attributes[name] = value;
    },
    classList: { toggle() {} },
    focus() {
      this.focused = true;
    },
    closest() {
      return this;
    },
    attributes
  };
}

test("Insights renders accessible tabs and sends the exact deterministic snapshot", () => {
  const html = insights.render({
    tasks: [{ id: "task", completed: true, completedAt: now.getTime() }]
  }, { now });
  assert.match(html, /role="tablist" aria-label="Insights views"/);
  assert.match(html, /id="insights-tab-overview"[\s\S]*aria-selected="true"/);
  assert.match(html, /id="insights-panel-weekly"[\s\S]*role="tabpanel"/);
  assert.match(html, /Generate AI review/);

  const overview = tab("overview");
  const weekly = tab("weekly");
  const panels = [
    { dataset: { insightsPanel: "overview" }, hidden: false },
    { dataset: { insightsPanel: "weekly" }, hidden: true }
  ];
  const listeners = new Map();
  const root = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener() {},
    contains() {
      return true;
    },
    querySelectorAll(selector) {
      return selector.includes("data-insights-panel") ? panels : [overview, weekly];
    }
  };
  let received;
  insights.bind(root, {
    generateWeeklyReview(snapshot) {
      received = snapshot;
    }
  });
  listeners.get("keydown")({
    key: "ArrowRight",
    preventDefault() {},
    target: overview
  });
  assert.equal(overview.attributes["aria-selected"], "false");
  assert.equal(weekly.attributes["aria-selected"], "true");
  assert.equal(panels[0].hidden, true);
  assert.equal(panels[1].hidden, false);
  assert.equal(weekly.focused, true);

  const expected = buildWeeklyReviewSnapshot({
    tasks: [{ id: "task", completed: true, completedAt: now.getTime() }]
  }, { now });
  listeners.get("click")({
    preventDefault() {},
    target: {
      dataset: {
        action: "generate-weekly-review",
        weeklyReviewSnapshot: encodeURIComponent(JSON.stringify(expected))
      },
      disabled: false,
      closest() {
        return this;
      }
    }
  });
  assert.deepEqual(received, expected);
});
