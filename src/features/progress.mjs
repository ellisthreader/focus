import { addDays, dateKey, parseDateKey, startOfWeek } from "../core/date.mjs";
import * as learningView from "./learning-view.mjs";
import * as goalsView from "./goals-view.mjs";

export const page = Object.freeze({
  id: "progress",
  label: "Progress",
  icon: "trend"
});

const bindings = new WeakMap();
const COMPLETE_STATUSES = new Set(["complete", "completed", "done", "archived"]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function currentDate(ctx) {
  if (ctx?.todayKey) {
    try {
      return parseDateKey(ctx.todayKey);
    } catch {
      // Fall through to the supplied clock.
    }
  }
  const value = typeof ctx?.now === "function" ? ctx.now() : ctx?.now;
  const date = value === undefined ? new Date() : new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function weekDays(today) {
  const start = startOfWeek(today, 1);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    return {
      date,
      key: dateKey(date),
      short: new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(date),
      label: new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric"
      }).format(date)
    };
  });
}

function habitEntries(habit) {
  return habit?.entries && typeof habit.entries === "object" && !Array.isArray(habit.entries)
    ? habit.entries
    : {};
}

function habitTarget(habit) {
  return Math.max(1, finite(habit?.target, 1));
}

function scheduledOn(habit, date) {
  const frequency = String(habit?.frequency || "daily").toLowerCase();
  if (frequency === "weekdays") return date.getDay() > 0 && date.getDay() < 6;
  return frequency !== "weekly";
}

function weekHabitResult(habit, days) {
  const entries = habitEntries(habit);
  const target = habitTarget(habit);
  const frequency = String(habit?.frequency || "daily").toLowerCase();

  if (frequency === "weekly") {
    const total = days.reduce((sum, day) => sum + Math.max(0, finite(entries[day.key])), 0);
    return { completed: total >= target ? 1 : 0, expected: 1 };
  }

  return days.reduce((result, day) => {
    if (!scheduledOn(habit, day.date)) return result;
    result.expected += 1;
    if (finite(entries[day.key]) >= target) result.completed += 1;
    return result;
  }, { completed: 0, expected: 0 });
}

function previousScheduledDate(date, habit) {
  let candidate = addDays(date, -1);
  for (let lookback = 0; lookback < 14; lookback += 1) {
    if (scheduledOn(habit, candidate)) return candidate;
    candidate = addDays(candidate, -1);
  }
  return null;
}

function dailyStreak(habit, today) {
  const entries = habitEntries(habit);
  const target = habitTarget(habit);
  let cursor = new Date(today);
  let streak = 0;

  if (!scheduledOn(habit, cursor)) cursor = previousScheduledDate(cursor, habit);
  if (!cursor) return 0;
  for (let index = 0; index < 3660; index += 1) {
    if (finite(entries[dateKey(cursor)]) < target) break;
    streak += 1;
    cursor = previousScheduledDate(cursor, habit);
    if (!cursor) break;
  }
  return streak;
}

function weeklyStreak(habit, today) {
  const entries = habitEntries(habit);
  const target = habitTarget(habit);
  let weekStart = startOfWeek(today, 1);
  let streak = 0;

  for (let index = 0; index < 520; index += 1) {
    const total = Array.from({ length: 7 }, (_, day) => dateKey(addDays(weekStart, day)))
      .reduce((sum, key) => sum + Math.max(0, finite(entries[key])), 0);
    if (total < target) break;
    streak += 1;
    weekStart = addDays(weekStart, -7);
  }
  return streak;
}

function habitStreak(habit, today) {
  return String(habit?.frequency || "daily").toLowerCase() === "weekly"
    ? weeklyStreak(habit, today)
    : dailyStreak(habit, today);
}

function improvementProgress(item) {
  const current = Math.max(0, finite(item?.progress));
  const target = Math.max(1, finite(item?.target, 100));
  return {
    current,
    target,
    percent: Math.min(100, Math.max(0, Math.round((current / target) * 100)))
  };
}

function isLongTerm(item) {
  const markers = [item?.kind, item?.type, item?.horizon, item?.area]
    .map((value) => String(value || "").toLowerCase());
  return Boolean(item?.longTerm)
    || markers.some((value) => value === "goal" || /long[\s-]?term/.test(value));
}

function renderHabit(habit, days, today) {
  const entries = habitEntries(habit);
  const target = habitTarget(habit);
  const streak = habitStreak(habit, today);
  const result = weekHabitResult(habit, days);
  const unit = String(habit?.unit || "times");

  return `
    <li class="habit-row" data-habit-id="${escapeHtml(habit.id)}">
      <div class="row-content">
        <strong>${escapeHtml(habit.name || habit.title || "Untitled habit")}</strong>
        <span>${escapeHtml(`${result.completed} of ${result.expected} this week · ${streak} ${String(habit.frequency).toLowerCase() === "weekly" ? "week" : "day"} streak`)}</span>
      </div>
      <div class="habit-week" aria-label="${escapeHtml(`${habit.name || "Habit"} check-ins`)}">
        ${days.map((day) => {
          const value = Math.max(0, finite(entries[day.key]));
          const complete = value >= target;
          const scheduled = scheduledOn(habit, day.date)
            || String(habit?.frequency || "").toLowerCase() === "weekly";
          return `
            <button
              class="day-cell${complete ? " complete" : ""}"
              type="button"
              data-action="check-habit"
              data-id="${escapeHtml(habit.id)}"
              data-date="${day.key}"
              data-value="${complete ? 0 : target}"
              aria-pressed="${complete}"
              aria-label="${escapeHtml(`${day.label}: ${complete ? "completed" : scheduled ? "not completed" : "not scheduled"}${value ? `, ${value} ${unit}` : ""}`)}"
              ${scheduled ? "" : "disabled"}
            >${escapeHtml(day.short)}</button>
          `;
        }).join("")}
      </div>
      <button
        class="button quiet"
        type="button"
        data-action="open-editor"
        data-kind="habit"
        data-id="${escapeHtml(habit.id)}"
      >Edit</button>
    </li>
  `;
}

function renderImprovement(item, options = {}) {
  const progress = improvementProgress(item);
  const metric = String(item?.metric || "%");
  const step = Math.max(1, finite(item?.step, 1));
  const nextValue = Math.min(progress.target, progress.current + step);
  const complete = COMPLETE_STATUSES.has(String(item?.status || "").toLowerCase())
    || progress.current >= progress.target;

  return `
    <li class="list-row" data-improvement-id="${escapeHtml(item.id)}">
      <span class="badge${complete ? " success" : ""}">${complete ? "Complete" : escapeHtml(item.area || options.label || "Personal")}</span>
      <div class="row-content">
        <strong>${escapeHtml(item.title || "Untitled improvement")}</strong>
        <span>${escapeHtml(`${progress.current} of ${progress.target} ${metric}`.trim())}</span>
        <progress
          value="${Math.min(progress.current, progress.target)}"
          max="${progress.target}"
          aria-label="${escapeHtml(`${item.title || "Improvement"}: ${progress.percent}% complete`)}"
        >${progress.percent}%</progress>
      </div>
      <div class="toolbar-row">
        ${complete ? "" : `
          <button
            class="button quiet"
            type="button"
            data-action="update-improvement"
            data-id="${escapeHtml(item.id)}"
            data-value="${nextValue}"
            aria-label="${escapeHtml(`Add ${step} ${metric} to ${item.title || "improvement"}`)}"
          >+${step}</button>
        `}
        <button
          class="button quiet"
          type="button"
          data-action="open-editor"
          data-kind="improvement"
          data-id="${escapeHtml(item.id)}"
        >Edit</button>
        <button
          class="button quiet"
          type="button"
          data-action="delete-improvement"
          data-id="${escapeHtml(item.id)}"
          aria-label="${escapeHtml(`Delete ${item.title || "improvement"}`)}"
        >Delete</button>
      </div>
    </li>
  `;
}

export function render(state = {}, ctx = {}) {
  const habits = list(state.habits);
  const goals = list(state.personalGoals).filter((item) => !item.deletedAt);
  const today = currentDate(ctx);
  const days = weekDays(today);
  const weekly = habits.reduce((total, habit) => {
    const result = weekHabitResult(habit, days);
    total.completed += result.completed;
    total.expected += result.expected;
    return total;
  }, { completed: 0, expected: 0 });
  const weeklyPercent = weekly.expected
    ? Math.round((weekly.completed / weekly.expected) * 100)
    : 0;
  const bestStreak = habits.reduce((best, habit) => Math.max(best, habitStreak(habit, today)), 0);
  const completedGoals = goals.filter((item) => COMPLETE_STATUSES.has(String(item?.status || "").toLowerCase())).length;
  const activeView = ["habits", "goals", "learning"].includes(state.ui?.progressView)
    ? state.ui.progressView
    : "habits";
  const learningCount = list(state.learningItems).filter((item) => !item.deletedAt).length;

  return `
    <main class="page progress-page" aria-labelledby="progress-title">
      <header class="page-header">
        <div>
          <p class="eyebrow">This week</p>
          <h1 id="progress-title">Progress</h1>
          <p>${weekly.expected
            ? `${weekly.completed} of ${weekly.expected} habit check-ins complete`
            : "Progress becomes clearer after a few days of activity."}</p>
        </div>
        <details class="progress-add">
          <summary class="button secondary">Add</summary>
          <div class="card">
            <button class="button quiet" type="button" data-action="open-editor" data-kind="habit">New habit</button>
            <button class="button quiet" type="button" data-action="open-editor" data-kind="personalGoal">New goal</button>
          </div>
        </details>
      </header>

      <section class="progress-overview" aria-label="Weekly progress summary">
        <article class="progress-overview-item">
          <span>Weekly completion</span>
          <strong>${weeklyPercent}%</strong>
          <progress value="${weekly.completed}" max="${Math.max(1, weekly.expected)}">${weeklyPercent}%</progress>
        </article>
        <article class="progress-overview-item">
          <span>Best current streak</span>
          <strong>${bestStreak} ${bestStreak === 1 ? "day" : "days"}</strong>
        </article>
        <article class="progress-overview-item">
          <span>Goals complete</span>
          <strong>${completedGoals} of ${goals.length}</strong>
        </article>
      </section>

      <div class="progress-tabs" role="tablist" aria-label="Progress views">
        <button
          class="progress-tab${activeView === "habits" ? " is-active" : ""}"
          id="progress-tab-habits"
          type="button"
          role="tab"
          aria-selected="${activeView === "habits"}"
          aria-controls="progress-panel-habits"
          data-action="switch-progress-view"
          data-view="habits"
          ${activeView === "habits" ? "" : 'tabindex="-1"'}
        >Habits <span>${habits.length}</span></button>
        <button
          class="progress-tab${activeView === "goals" ? " is-active" : ""}"
          id="progress-tab-goals"
          type="button"
          role="tab"
          aria-selected="${activeView === "goals"}"
          aria-controls="progress-panel-goals"
          data-action="switch-progress-view"
          data-view="goals"
          ${activeView === "goals" ? "" : 'tabindex="-1"'}
        >Goals <span>${goals.length}</span></button>
        <button
          class="progress-tab${activeView === "learning" ? " is-active" : ""}"
          id="progress-tab-learning"
          type="button"
          role="tab"
          aria-selected="${activeView === "learning"}"
          aria-controls="progress-panel-learning"
          data-action="switch-progress-view"
          data-view="learning"
          ${activeView === "learning" ? "" : 'tabindex="-1"'}
        >Learning <span>${learningCount}</span></button>
      </div>

      <section
        class="card progress-panel"
        id="progress-panel-habits"
        role="tabpanel"
        aria-labelledby="progress-tab-habits"
        data-progress-panel="habits"
        ${activeView === "habits" ? "" : "hidden"}
      >
        <div class="section-header">
          <div>
            <h2 id="habits-title">Habits</h2>
            <p>Small actions, tracked across the current week.</p>
          </div>
          <button class="button quiet" type="button" data-action="open-editor" data-kind="habit">Add habit</button>
        </div>
        ${habits.length
          ? `<ul class="habit-list">${habits.map((habit) => renderHabit(habit, days, today)).join("")}</ul>`
          : '<p class="empty-state">No habits yet. Start with one action worth repeating.</p>'}
      </section>

      <section
        class="progress-panel"
        id="progress-panel-goals"
        role="tabpanel"
        aria-labelledby="progress-tab-goals"
        data-progress-panel="goals"
        ${activeView === "goals" ? "" : "hidden"}
      >
        ${goalsView.render(state, ctx)}
      </section>

      <section
        class="progress-panel"
        id="progress-panel-learning"
        role="tabpanel"
        aria-labelledby="progress-tab-learning"
        data-progress-panel="learning"
        ${activeView === "learning" ? "" : "hidden"}
      >
        ${learningView.render(state, ctx)}
      </section>
    </main>
  `;
}

function switchProgressView(root, control) {
  const view = control.dataset.view;
  const tabs = root.querySelectorAll?.('[role="tab"][data-view]') || [];
  const panels = root.querySelectorAll?.("[data-progress-panel]") || [];

  tabs.forEach((tab) => {
    const selected = tab.dataset.view === view;
    tab.setAttribute("aria-selected", String(selected));
    tab.classList.toggle("is-active", selected);
    tab.tabIndex = selected ? 0 : -1;
  });
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.progressPanel !== view;
  });
}

export function bind(root, actions = {}) {
  if (!root) return;

  const previous = bindings.get(root);
  if (previous) {
    root.removeEventListener("click", previous.onClick);
    root.removeEventListener("keydown", previous.onKeyDown);
  }
  goalsView.bind(root, actions);

  const onClick = (event) => {
    const control = event.target?.closest?.("[data-action]");
    if (!control || !root.contains(control) || control.disabled) return;

    const action = control.dataset.action;
    const id = control.dataset.id;

    if (action === "switch-progress-view") {
      switchProgressView(root, control);
      actions.dispatch?.({ type: "ui/setProgressView", payload: { view: control.dataset.view } });
    } else if (action === "open-editor") {
      const kind = control.dataset.kind;
      if (kind) actions.openEditor?.(kind, id || "");
    } else if (action === "check-habit" && id) {
      actions.dispatch?.({
        type: "habit/check",
        payload: {
          id,
          date: control.dataset.date,
          value: finite(control.dataset.value)
        }
      });
    } else if (action === "update-improvement" && id) {
      actions.dispatch?.({
        type: "improvement/update",
        payload: {
          id,
          patch: { progress: finite(control.dataset.value) }
        }
      });
    } else if (action === "delete-improvement" && id) {
      actions.dispatch?.({
        type: "improvement/delete",
        payload: { id }
      });
    }
  };

  const onKeyDown = (event) => {
    const current = event.target?.closest?.('[role="tab"][data-view]');
    if (!current || !root.contains(current)) return;
    const tabs = Array.from(root.querySelectorAll?.('[role="tab"][data-view]') || []);
    const index = tabs.indexOf(current);
    if (index < 0) return;

    let nextIndex = index;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    switchProgressView(root, tabs[nextIndex]);
    actions.dispatch?.({ type: "ui/setProgressView", payload: { view: tabs[nextIndex].dataset.view } });
    tabs[nextIndex].focus?.();
  };

  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeyDown);
  learningView.bind(root, actions);
  bindings.set(root, { onClick, onKeyDown });
}
