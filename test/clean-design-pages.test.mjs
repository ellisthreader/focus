import test from "node:test";
import assert from "node:assert/strict";
import * as calendar from "../src/features/calendar.mjs";
import * as dashboard from "../src/features/dashboard.mjs";
import * as tasks from "../src/features/tasks.mjs";
import * as focus from "../src/features/focus.mjs";
import * as health from "../src/features/health.mjs";
import * as progress from "../src/features/progress.mjs";

const ctx = {
  todayKey: "2026-06-08",
  now: new Date(2026, 5, 8, 12, 0, 0),
  locale: "en-GB"
};

function control(dataset = {}) {
  return {
    dataset,
    disabled: false,
    closest(selector) {
      return selector.includes("data-action") || selector.includes('role="tab"')
        ? this
        : null;
    }
  };
}

function eventRoot(queryResults = {}) {
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
    },
    querySelectorAll(selector) {
      return queryResults[selector] || [];
    }
  };
}

function tab(view) {
  const attributes = {};
  const classes = new Set(view === "habits" ? ["is-active"] : []);
  return {
    dataset: { action: "switch-progress-view", view },
    tabIndex: view === "habits" ? 0 : -1,
    attributes,
    focused: false,
    setAttribute(name, value) {
      attributes[name] = value;
    },
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      }
    },
    closest(selector) {
      return selector.includes("data-action") || selector.includes('role="tab"')
        ? this
        : null;
    },
    focus() {
      this.focused = true;
    }
  };
}

test("Calendar uses one compact toolbar and a simpler agenda surface", () => {
  const html = calendar.render({
    ui: { selectedDate: "2026-06-08" },
    events: [{
      id: "event-1",
      title: "Design review",
      start: "2026-06-08T09:00:00",
      end: "2026-06-08T10:00:00"
    }]
  }, ctx);

  assert.equal((html.match(/class="calendar-toolbar"/g) || []).length, 1);
  assert.match(html, /role="toolbar" aria-label="Calendar controls"/);
  assert.match(html, /class="calendar-month-label"[^>]*>June 2026</);
  assert.match(html, /class="icon-button calendar-nav-button"[^>]*aria-label="Previous month"/);
  assert.match(html, /class="icon-button calendar-nav-button"[^>]*aria-label="Next month"/);
  assert.equal((html.match(/>Add event</g) || []).length, 1);
  assert.match(html, /<aside class="calendar-agenda"/);
  assert.doesNotMatch(html, /<aside class="card calendar-agenda"/);
});

test("Calendar toolbar actions preserve date selection and event creation", () => {
  const root = eventRoot();
  const dispatched = [];
  const opened = [];
  calendar.bind(root, {
    dispatch(action) {
      dispatched.push(action);
    },
    openEditor(kind, id, options) {
      opened.push([kind, id, options]);
    }
  });

  root.listeners.get("click")({
    target: control({ action: "select-date", date: "2026-07-08" })
  });
  root.listeners.get("click")({
    target: control({ action: "add-event", date: "2026-06-08" })
  });

  assert.deepEqual(dispatched, [{
    type: "ui/selectDate",
    payload: { date: "2026-07-08" }
  }]);
  assert.deepEqual(opened, [["event", "", {
    prefill: {
      start: "2026-06-08T09:00:00",
      end: "2026-06-08T10:00:00"
    }
  }]]);
});

test("Health prioritizes sleep, energy, and mood with optional details", () => {
  const html = health.render({
    healthEntries: [{
      id: "health-1",
      date: "2026-06-08",
      sleepHours: 7.5,
      energy: 4,
      mood: 3,
      waterGlasses: 5,
      movementMinutes: 30,
      note: "Good pace"
    }]
  }, ctx);

  assert.match(html, /class="health-primary-fields"/);
  assert.equal((html.match(/type="radio"/g) || []).length, 10);
  assert.match(html, /name="energy"[\s\S]*value="4"[\s\S]*checked/);
  assert.match(html, /name="mood"[\s\S]*value="3"[\s\S]*checked/);
  assert.doesNotMatch(html, /<select/);
  assert.match(html, /<details class="health-details">/);
  assert.match(html, /<summary>Water, movement, and notes<\/summary>/);
  assert.match(html, /class="health-week-strip"/);
});

test("Health quick actions preserve increment dispatch behavior", () => {
  const root = eventRoot();
  const dispatched = [];
  health.bind(root, {
    dispatch(action) {
      dispatched.push(action);
    }
  });

  root.listeners.get("click")({
    preventDefault() {},
    target: control({
      action: "health/increment",
      date: "2026-06-08",
      field: "movementMinutes",
      delta: "10"
    })
  });

  assert.deepEqual(dispatched, [{
    type: "health/increment",
    payload: {
      date: "2026-06-08",
      field: "movementMinutes",
      delta: 10
    }
  }]);
});

test("Progress shows a compact overview and one tab panel at a time", () => {
  const html = progress.render({
    habits: [{ id: "habit-1", name: "Walk", frequency: "daily", entries: {} }],
    personalGoals: [
      { id: "goal-1", title: "Read more", current: 2, target: 10, progressMode: "manual", status: "active" },
      { id: "goal-2", title: "Publish", status: "completed", current: 100, target: 100 }
    ],
    goalMilestones: [{ id: "milestone-1", goalId: "goal-1", title: "Finish chapter" }]
  }, ctx);

  assert.match(html, /class="progress-overview"/);
  assert.equal((html.match(/class="progress-overview-item"/g) || []).length, 3);
  assert.match(html, /role="tablist" aria-label="Progress views"/);
  assert.equal((html.match(/role="tab"/g) || []).length, 3);
  assert.match(html, /id="progress-panel-habits"[\s\S]*role="tabpanel"/);
  assert.match(html, /id="progress-panel-goals"[\s\S]*role="tabpanel"[\s\S]*hidden/);
  assert.match(html, /class="progress-subview goals-view"/);
  assert.match(html, /class="card goal-card"/);
  assert.match(html, /Completed goals \(1\)/);
});

test("Progress tabs support click and keyboard switching", () => {
  const habitsTab = tab("habits");
  const goalsTab = tab("goals");
  const habitsPanel = { dataset: { progressPanel: "habits" }, hidden: false };
  const goalsPanel = { dataset: { progressPanel: "goals" }, hidden: true };
  const root = eventRoot({
    '[role="tab"][data-view]': [habitsTab, goalsTab],
    "[data-progress-panel]": [habitsPanel, goalsPanel]
  });
  progress.bind(root);

  root.listeners.get("click")({ target: goalsTab });
  assert.equal(habitsPanel.hidden, true);
  assert.equal(goalsPanel.hidden, false);
  assert.equal(goalsTab.attributes["aria-selected"], "true");
  assert.equal(goalsTab.classList.contains("is-active"), true);

  let prevented = false;
  root.listeners.get("keydown")({
    key: "ArrowLeft",
    target: goalsTab,
    preventDefault() {
      prevented = true;
    }
  });
  assert.equal(prevented, true);
  assert.equal(habitsPanel.hidden, false);
  assert.equal(goalsPanel.hidden, true);
  assert.equal(habitsTab.focused, true);
});

test("Today keeps focus, next event, and priorities ahead of secondary summaries", () => {
  const html = dashboard.render({
    tasks: [{
      id: "task-1",
      title: "Review the clean design",
      dueDate: "2026-06-08",
      priority: "high",
      completed: false
    }],
    events: [{
      id: "event-1",
      title: "Design review",
      start: "2026-06-08T13:00:00",
      end: "2026-06-08T13:30:00"
    }]
  }, ctx);
  const focusIndex = html.indexOf('id="today-focus-title"');
  const eventIndex = html.indexOf('id="today-event-title"');
  const prioritiesIndex = html.indexOf('id="today-priorities-title"');
  const secondaryIndex = html.indexOf("data-secondary-summaries");

  assert.ok(focusIndex > -1);
  assert.ok(focusIndex < eventIndex);
  assert.ok(eventIndex < prioritiesIndex);
  assert.ok(prioritiesIndex < secondaryIndex);
  assert.match(html, /<details class="card today-more" data-secondary-summaries>/);
  assert.match(html, /Health, personal areas, PC performance, and recent work/);
  assert.equal((html.match(/data-action="start-timer"/g) || []).length, 1);
  assert.match(html, /data-action="open-editor" data-kind="task"/);
});

test("Tasks uses compact creation with disclosed fields, reminders, and destructive actions", () => {
  const html = tasks.render({
    tasks: [{
      id: "task-1",
      title: "Review the clean design",
      dueDate: "2026-06-08",
      priority: "high",
      completed: false
    }],
    reminders: [{
      id: "reminder-1",
      title: "Take a break",
      dueAt: "2026-06-08T14:00:00",
      completed: false
    }]
  }, ctx);
  const header = html.match(/<header class="page-header">([\s\S]*?)<\/header>/)?.[1] || "";

  assert.match(html, /task-quick-add task-quick-add--inline/);
  assert.match(html, /class="task-quick-add__primary"/);
  assert.match(html, /<details class="task-quick-add__advanced">/);
  assert.match(html, /<details class="row-action-menu">/);
  assert.match(html, /data-action="focus-task"/);
  assert.match(html, /data-action="delete-task"/);
  assert.match(html, /<details class="card subtle task-reminders">/);
  assert.match(html, /data-action="add-reminder"/);
  assert.doesNotMatch(header, /data-action="add-reminder"/);
});

test("Focus makes an active timer primary and collapses supporting detail", () => {
  const html = focus.render({
    timer: {
      status: "running",
      mode: "focus",
      title: "Review the clean design",
      goalMinutes: 25,
      activeMs: 5 * 60 * 1000,
      lastResumedAt: ctx.now.getTime()
    },
    settings: { dailyGoalMinutes: 120 }
  }, ctx);

  assert.match(html, /timer-hero timer-hero--running/);
  assert.match(html, /<details class="card focus-details">/);
  assert.doesNotMatch(html, /<details class="card focus-details" open>/);
  assert.match(html, /Session details/);
  assert.match(html, /Recent sessions/);
  assert.match(html, /data-action="pause-timer"/);
  assert.match(html, /data-action="navigate" data-page="tasks"/);
});

test("Focus exposes planning details when the timer is idle", () => {
  const html = focus.render({}, ctx);

  assert.match(html, /timer-hero timer-hero--idle/);
  assert.match(html, /<details class="card focus-details" open>/);
  assert.match(html, /data-action="start-timer"/);
  assert.match(html, /data-action="open-editor" data-kind="task"/);
});
