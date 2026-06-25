import { icon } from "../ui/icons.mjs";
import { personalizationReadiness } from "../core/personalization.mjs";
import * as dailyRoutines from "./daily-routines.mjs";

export const page = Object.freeze({
  id: "today",
  label: "Today",
  icon: "home"
});

const bindings = new WeakMap();
const priorityRank = { high: 0, medium: 1, low: 2 };

function list(value) {
  return Array.isArray(value) ? value : [];
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

function asDate(value, fallback = null) {
  const input = typeof value === "function" ? value() : value;
  if (input === null || input === undefined || input === "") return fallback;
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [year, month, day] = input.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  return Number.isFinite(date.getTime()) ? date : fallback;
}

function localDateKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = asDate(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWith(formatter, value, fallback) {
  if (typeof formatter !== "function") return fallback;
  try {
    return formatter(value);
  } catch {
    return fallback;
  }
}

function formatDate(date, ctx) {
  const fallback = new Intl.DateTimeFormat(ctx?.locale, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(date);
  return formatWith(ctx?.formatDate, date, fallback);
}

function formatTime(value, ctx) {
  const date = asDate(value);
  if (!date) return "";
  const fallback = new Intl.DateTimeFormat(ctx?.locale, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
  return formatWith(ctx?.formatTime, date, fallback);
}

function formatShortDate(value, ctx) {
  const date = asDate(value);
  if (!date) return "";
  const fallback = new Intl.DateTimeFormat(ctx?.locale, {
    month: "short",
    day: "numeric"
  }).format(date);
  return formatWith(ctx?.formatShortDate, date, fallback);
}

function formatRelativeTime(value, now, ctx) {
  const date = asDate(value);
  if (!date) return "";
  const custom = formatWith(ctx?.formatRelativeTime, date, "");
  if (custom) return custom;

  const deltaMinutes = Math.round((date.getTime() - now.getTime()) / 60000);
  if (Math.abs(deltaMinutes) < 1) return "now";
  if (deltaMinutes > 0 && deltaMinutes < 60) return `in ${deltaMinutes} min`;
  if (deltaMinutes < 0 && deltaMinutes > -60) return `${Math.abs(deltaMinutes)} min ago`;

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours > 0 && deltaHours < 24) return `in ${deltaHours} hr`;
  if (deltaHours < 0 && deltaHours > -24) return `${Math.abs(deltaHours)} hr ago`;
  return formatShortDate(date, ctx);
}

function greeting(date, state) {
  const hour = date.getHours();
  const salutation = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const name = String(state?.profile?.firstName || state?.profile?.name || "").trim().split(/\s+/)[0];
  return name ? `${salutation}, ${name}` : salutation;
}

function isTaskComplete(task) {
  return Boolean(task?.completed || ["completed", "done", "cancelled"].includes(task?.status));
}

function taskDueValue(task) {
  return task?.dueAt || task?.dueDate || task?.date || "";
}

function topTasks(state) {
  return list(state?.tasks)
    .filter((task) => task && !isTaskComplete(task))
    .sort((left, right) => {
      const pinned = Number(Boolean(right.pinned || right.isPriority)) - Number(Boolean(left.pinned || left.isPriority));
      if (pinned) return pinned;
      const priority = (priorityRank[left.priority] ?? 3) - (priorityRank[right.priority] ?? 3);
      if (priority) return priority;
      const leftDue = asDate(taskDueValue(left))?.getTime() ?? Number.POSITIVE_INFINITY;
      const rightDue = asDate(taskDueValue(right))?.getTime() ?? Number.POSITIVE_INFINITY;
      return leftDue - rightDue;
    })
    .slice(0, 3);
}

function renderTasks(tasks, ctx) {
  if (!tasks.length) {
    return `
      <div class="today-empty">
        <p>A clear day. Choose what matters first.</p>
        <button class="button button--secondary button--sm" type="button" data-action="open-editor" data-kind="task">
          ${icon("plus")} Add a priority
        </button>
      </div>
    `;
  }

  return `
    <ul class="today-list today-task-list">
      ${tasks.map((task) => {
        const due = taskDueValue(task);
        const dueLabel = due ? formatShortDate(due, ctx) : "";
        const priority = ["high", "medium", "low"].includes(task.priority) ? task.priority : "normal";
        return `
          <li class="today-list__item" data-id="${escapeHtml(task.id)}">
            <button
              class="today-check"
              type="button"
              role="checkbox"
              aria-checked="false"
              aria-label="Complete ${escapeHtml(task.title || "task")}"
              data-action="toggle-task"
              data-id="${escapeHtml(task.id)}"
            >${icon("check", 16)}</button>
            <button class="today-list__content" type="button" data-action="open-editor" data-kind="task" data-id="${escapeHtml(task.id)}">
              <span class="today-list__title">${escapeHtml(task.title || "Untitled task")}</span>
              <span class="today-list__meta">${escapeHtml(dueLabel || `${priority} priority`)}</span>
            </button>
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

function eventStart(event) {
  return event?.start || event?.startAt || event?.startsAt || "";
}

function eventEnd(event) {
  return event?.end || event?.endAt || event?.endsAt || eventStart(event);
}

function nextEvent(state, now, todayKey) {
  const events = list(state?.events).length ? list(state.events) : list(state?.calendarEvents);
  return events
    .filter((event) => {
      const start = asDate(eventStart(event));
      const end = asDate(eventEnd(event), start);
      if (!start || !end || event?.cancelled || event?.status === "cancelled") return false;
      return event?.allDay ? localDateKey(start) >= todayKey : end.getTime() >= now.getTime();
    })
    .sort((left, right) => {
      const leftStart = asDate(eventStart(left))?.getTime() ?? Number.POSITIVE_INFINITY;
      const rightStart = asDate(eventStart(right))?.getTime() ?? Number.POSITIVE_INFINITY;
      return leftStart - rightStart;
    })[0] || null;
}

function renderNextEvent(event, now, ctx) {
  if (!event) {
    return `
      <div class="today-empty">
        <p>No more events scheduled.</p>
        <button class="button button--ghost button--sm" type="button" data-action="open-editor" data-kind="event">
          ${icon("plus")} Add event
        </button>
      </div>
    `;
  }

  const start = asDate(eventStart(event));
  const end = asDate(eventEnd(event));
  const time = event.allDay
    ? "All day"
    : [formatTime(start, ctx), formatTime(end, ctx)].filter(Boolean).join(" - ");
  const relation = start ? formatRelativeTime(start, now, ctx) : "";
  const location = String(event.location || "").trim();

  return `
    <button class="today-event" type="button" data-action="open-editor" data-kind="event" data-id="${escapeHtml(event.id)}">
      <span class="today-event__time">${escapeHtml(time || "Time not set")}</span>
      <span class="today-event__content">
        <strong>${escapeHtml(event.title || "Untitled event")}</strong>
        <small>${escapeHtml([relation, location].filter(Boolean).join(" · ") || "Next on your calendar")}</small>
      </span>
      ${icon("chevron", 18)}
    </button>
  `;
}

function timerFrom(state) {
  return state?.focus?.activeTimer || state?.focus?.timer || state?.timer || {};
}

function timerRemainingMs(timer, now, state) {
  if (timer.status === "complete") return 0;
  if (Number.isFinite(Number(timer.remainingMs))) return Math.max(0, Number(timer.remainingMs));
  const goalMinutes = finite(timer.goalMinutes, finite(state?.settings?.blockGoalMinutes, 25));
  const goalMs = Math.max(1, finite(timer.goalMs, goalMinutes * 60000));
  let activeMs = Math.max(0, finite(timer.activeMs ?? timer.elapsedMs));
  if (timer.status === "running" && timer.lastResumedAt) {
    activeMs += Math.max(0, now.getTime() - finite(timer.lastResumedAt, now.getTime()));
  }
  return Math.max(0, goalMs - activeMs);
}

function formatClock(milliseconds) {
  const seconds = Math.max(0, Math.ceil(finite(milliseconds) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function sessionStart(session) {
  return session?.startedAt || session?.start || session?.createdAt || "";
}

function sessionActiveMs(session) {
  if (Number.isFinite(Number(session?.activeMs))) return Math.max(0, Number(session.activeMs));
  if (Number.isFinite(Number(session?.durationMs))) return Math.max(0, Number(session.durationMs));
  const start = asDate(sessionStart(session));
  const end = asDate(session?.endedAt || session?.end || session?.completedAt);
  return start && end ? Math.max(0, end.getTime() - start.getTime()) : 0;
}

function focusSessions(state) {
  return list(state?.focus?.sessions).length ? list(state.focus.sessions) : list(state?.sessions);
}

function focusedTodayMs(state, todayKey) {
  const suppliedMinutes = Number(state?.focusSummary?.todayMinutes ?? state?.focus?.todayMinutes);
  if (Number.isFinite(suppliedMinutes)) return Math.max(0, suppliedMinutes * 60000);
  return focusSessions(state)
    .filter((session) => localDateKey(sessionStart(session)) === todayKey)
    .reduce((total, session) => total + sessionActiveMs(session), 0);
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.max(0, Math.round(finite(milliseconds) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function renderFocus(state, now, todayKey) {
  const timer = timerFrom(state);
  const status = ["running", "paused", "complete"].includes(timer.status) ? timer.status : "idle";
  const remaining = timerRemainingMs(timer, now, state);
  const focused = focusedTodayMs(state, todayKey);
  const title = String(timer.title || timer.task || "").trim();
  const label = status === "idle" ? "Ready for a focused block" : title || "Current focus block";

  let controls = `
    <button class="button button--primary" type="button" data-action="start-timer">
      ${icon("play")} Start focus
    </button>
  `;
  if (status === "running") {
    controls = `
      <button class="button button--secondary" type="button" data-action="pause-timer">${icon("pause")} Pause</button>
      <button class="button button--ghost" type="button" data-action="finish-timer">${icon("stop")} Finish</button>
    `;
  } else if (status === "paused") {
    controls = `
      <button class="button button--primary" type="button" data-action="start-timer">${icon("play")} Resume</button>
      <button class="button button--ghost" type="button" data-action="finish-timer">${icon("stop")} Finish</button>
    `;
  } else if (status === "complete") {
    controls = `
      <button class="button button--primary" type="button" data-action="finish-timer">${icon("check")} Save session</button>
    `;
  }

  return `
    <div class="today-focus" data-timer-status="${escapeHtml(status)}">
      <div>
        <p class="today-focus__label">${escapeHtml(label)}</p>
        <output class="today-focus__time" role="timer" aria-live="off">${formatClock(remaining)}</output>
        <p class="today-focus__summary">${escapeHtml(formatDuration(focused))} focused today</p>
      </div>
      <div class="today-focus__actions">${controls}</div>
    </div>
  `;
}

function healthEntries(state) {
  return list(state?.healthEntries).length ? list(state.healthEntries) : list(state?.healthCheckIns);
}

function healthDate(entry) {
  return entry?.date || entry?.dateKey || entry?.recordedAt || entry?.createdAt || "";
}

function todayHealth(state, todayKey) {
  return healthEntries(state)
    .filter((entry) => localDateKey(healthDate(entry)) === todayKey)
    .sort((left, right) => finite(right.updatedAt || right.createdAt) - finite(left.updatedAt || left.createdAt))[0] || null;
}

function scaleLabel(value, labels) {
  const number = Math.round(finite(value));
  return labels[number] || (number ? `${number}/5` : "Not set");
}

function renderHealth(entry) {
  if (!entry) {
    return `
      <div class="today-empty today-empty--compact">
        <p>How are you feeling today?</p>
        <button class="button button--secondary button--sm" type="button" data-action="open-editor" data-kind="health">
          ${icon("heart")} Check in
        </button>
      </div>
    `;
  }

  const energy = scaleLabel(entry.energy, ["", "Very low", "Low", "Steady", "Good", "High"]);
  const mood = scaleLabel(entry.mood, ["", "Difficult", "Low", "Okay", "Good", "Great"]);
  const sleep = finite(entry.sleepHours);
  const water = finite(entry.waterGlasses);
  return `
    <div class="today-health">
      <dl class="today-metrics">
        <div><dt>Energy</dt><dd>${escapeHtml(energy)}</dd></div>
        <div><dt>Mood</dt><dd>${escapeHtml(mood)}</dd></div>
        <div><dt>Sleep</dt><dd>${sleep ? `${escapeHtml(sleep)}h` : "Not set"}</dd></div>
        <div><dt>Water</dt><dd>${water ? escapeHtml(`${water} glasses`) : "Not set"}</dd></div>
      </dl>
      <button class="button button--ghost button--sm" type="button" data-action="open-editor" data-kind="health" data-id="${escapeHtml(entry.id)}">
        Update check-in
      </button>
    </div>
  `;
}

function previousDateKey(key, daysBack) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() - daysBack);
  return localDateKey(date);
}

function habitStreak(habit, todayKey) {
  const entries = habit?.entries && typeof habit.entries === "object" ? habit.entries : {};
  let streak = 0;
  for (let index = 0; index < 3660; index += 1) {
    if (finite(entries[previousDateKey(todayKey, index)]) <= 0) break;
    streak += 1;
  }
  return streak;
}

function renderProgress(state, todayKey) {
  const focusStreak = Math.max(0, finite(
    state?.progress?.focusStreak ?? state?.model?.streakDays ?? state?.focusModel?.streakDays
  ));
  const streaks = list(state?.habits)
    .map((habit) => ({ id: habit.id, name: habit.name || habit.title || "Habit", days: habitStreak(habit, todayKey) }))
    .filter((habit) => habit.days > 0)
    .sort((left, right) => right.days - left.days)
    .slice(0, 2);
  const improvement = list(state?.personalGoals)
    .filter((item) => item && !item.deletedAt && !["completed", "done", "archived"].includes(item.status))
    .sort((left, right) => finite(right.updatedAt || right.createdAt) - finite(left.updatedAt || left.createdAt))[0];

  if (!focusStreak && !streaks.length && !improvement) {
    return `
      <div class="today-empty today-empty--compact">
        <p>Small, consistent steps will appear here.</p>
        <button class="button button--ghost button--sm" type="button" data-action="navigate" data-page="progress">Open progress</button>
      </div>
    `;
  }

  const streakItems = [
    focusStreak ? `<li><strong>${focusStreak} day${focusStreak === 1 ? "" : "s"}</strong><span>Focus streak</span></li>` : "",
    ...streaks.map((habit) => `
      <li data-id="${escapeHtml(habit.id)}">
        <strong>${habit.days} day${habit.days === 1 ? "" : "s"}</strong>
        <span>${escapeHtml(habit.name)}</span>
      </li>
    `)
  ].filter(Boolean).join("");

  let improvementMarkup = "";
  if (improvement) {
    const target = Math.max(1, finite(improvement.target, 100));
    const current = Math.max(0, finite(improvement.current));
    improvementMarkup = `
      <button class="today-improvement" type="button" data-action="open-editor" data-kind="personalGoal" data-id="${escapeHtml(improvement.id)}">
        <span><strong>${escapeHtml(improvement.title || "Current goal")}</strong><small>${escapeHtml(`${current} of ${target} ${improvement.unit || ""}`.trim())}</small></span>
        <progress value="${Math.min(current, target)}" max="${target}" aria-label="${escapeHtml(improvement.title || "Improvement progress")}">${Math.round((current / target) * 100)}%</progress>
      </button>
    `;
  }

  return `
    ${streakItems ? `<ul class="today-streaks">${streakItems}</ul>` : ""}
    ${improvementMarkup}
  `;
}

function renderPersonalAreas(state, todayKey) {
  const meals = list(state?.nutritionEntries)
    .filter((entry) => !entry?.deletedAt && localDateKey(entry?.date) === todayKey);
  const weekStart = asDate(todayKey);
  weekStart?.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekStartKey = localDateKey(weekStart);
  const workouts = list(state?.workoutSessions)
    .filter((session) => !session?.deletedAt && session?.date >= weekStartKey && session?.date <= todayKey);
  const dueReviews = list(state?.learningNotes)
    .filter((note) => !note?.deletedAt && note?.nextReviewDate && note.nextReviewDate <= todayKey);
  const dueLimit = asDate(todayKey);
  dueLimit?.setDate(dueLimit.getDate() + 7);
  const dueLimitKey = localDateKey(dueLimit);
  const recurring = list(state?.financeRecurring)
    .filter((item) => (
      !item?.deletedAt
      && item?.active !== false
      && item?.nextDueDate >= todayKey
      && item?.nextDueDate <= dueLimitKey
    ));

  const items = [
    {
      page: "health",
      view: "nutrition",
      label: "Nutrition",
      value: `${meals.length} ${meals.length === 1 ? "meal" : "meals"} today`
    },
    {
      page: "health",
      view: "exercise",
      label: "Exercise",
      value: `${workouts.length} ${workouts.length === 1 ? "session" : "sessions"} this week`
    },
    {
      page: "progress",
      view: "learning",
      label: "Learning",
      value: dueReviews.length ? `${dueReviews.length} due ${dueReviews.length === 1 ? "review" : "reviews"}` : "No reviews due"
    },
    {
      page: "finance",
      label: "Finance",
      value: recurring.length ? `${recurring.length} recurring ${recurring.length === 1 ? "item" : "items"} due soon` : "Nothing recurring due soon"
    }
  ];

  return `
    <div class="today-personal-grid">
      ${items.map((item) => `
        <button
          class="today-personal-item"
          type="button"
          data-action="navigate"
          data-page="${item.page}"
          ${item.view ? `data-view="${item.view}"` : ""}
        >
          <span>${item.label}</span>
          <strong>${item.value}</strong>
        </button>
      `).join("")}
    </div>
  `;
}

function recentWork(state) {
  const explicit = list(state?.recentWork).length ? list(state.recentWork) : list(state?.workItems);
  if (explicit.length) {
    return explicit
      .filter(Boolean)
      .sort((left, right) => finite(right.updatedAt || right.occurredAt) - finite(left.updatedAt || left.occurredAt))
      .slice(0, 3)
      .map((item) => ({ ...item, kind: "work" }));
  }

  return focusSessions(state)
    .filter((session) => session && (session.title || session.project))
    .sort((left, right) => finite(right.endedAt || right.completedAt || right.startedAt) - finite(left.endedAt || left.completedAt || left.startedAt))
    .slice(0, 3)
    .map((session) => ({
      ...session,
      title: session.title || "Focus session",
      project: session.project || "Focus",
      updatedAt: session.endedAt || session.completedAt || session.startedAt,
      kind: "focus"
    }));
}

function renderRecentWork(items, now, ctx) {
  if (!items.length) {
    return `<div class="today-empty today-empty--compact"><p>Recent work will appear after your first update or focus session.</p></div>`;
  }

  return `
    <ul class="today-list today-work-list">
      ${items.map((item) => {
        const updatedAt = item.updatedAt || item.occurredAt || item.completedAt || item.endedAt;
        const action = item.kind === "focus" ? "navigate" : "open-editor";
        const extra = item.kind === "focus" ? 'data-page="focus"' : 'data-kind="work"';
        return `
          <li class="today-list__item" data-id="${escapeHtml(item.id)}">
            <button class="today-list__content" type="button" data-action="${action}" ${extra} data-id="${escapeHtml(item.id)}">
              <span class="today-list__title">${escapeHtml(item.title || "Untitled work")}</span>
              <span class="today-list__meta">${escapeHtml(item.project || item.status || "Personal")} · ${escapeHtml(formatRelativeTime(updatedAt, now, ctx) || "Recently")}</span>
            </button>
            ${icon("chevron", 18)}
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

function formatBytes(value) {
  const bytes = finite(value, 0);
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const amount = bytes / (1024 ** index);
  return `${amount >= 10 || index === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[index]}`;
}

function formatUptime(seconds) {
  const totalMinutes = Math.max(0, Math.floor(finite(seconds) / 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function performanceLevel(value, threshold) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "unknown";
  if (value >= threshold) return "danger";
  if (value >= threshold * 0.85) return "warning";
  return "healthy";
}

function performanceMetric(label, value, detail, percent, level) {
  const hasPercent = percent !== null && percent !== undefined && Number.isFinite(Number(percent));
  return `
    <div class="performance-metric performance-metric--${escapeHtml(level)}">
      <div class="performance-metric__header">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
      ${hasPercent ? `
        <div class="performance-meter" role="meter" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}">
          <span style="width: ${Math.min(100, Math.max(0, percent))}%"></span>
        </div>
      ` : ""}
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}

export function renderPerformance(state, ctx) {
  const sample = ctx?.pcPerformance || {};
  const settings = state?.settings?.pcPerformance || {};
  if (sample.status === "disabled" || settings.enabled === false) {
    return `
      <div class="today-empty today-empty--compact">
        <p>PC performance monitoring is turned off.</p>
        <button class="button button--secondary button--sm" type="button" data-action="navigate" data-page="settings">Open settings</button>
      </div>
    `;
  }
  if (sample.status !== "ready") {
    return `
      <div class="performance-state" role="status">
        <span class="performance-state__pulse" aria-hidden="true"></span>
        <div>
          <strong>${sample.status === "error" || sample.status === "unavailable" ? "Performance data unavailable" : "Reading PC performance"}</strong>
          <p>${escapeHtml(sample.error || "CPU usage needs a moment to establish a live baseline.")}</p>
        </div>
      </div>
    `;
  }

  const cpu = sample.cpu || {};
  const temperature = sample.temperature || {};
  const memory = sample.memory || {};
  const disk = sample.disk || {};
  const network = sample.network || {};
  const system = sample.system || {};
  const cpuThreshold = finite(settings.cpuThreshold, 95);
  const temperatureThreshold = finite(settings.temperatureThreshold, 90);
  const memoryThreshold = finite(settings.memoryThreshold, 95);
  const diskThreshold = finite(settings.diskThreshold, 95);
  const cpuValue = Number.isFinite(cpu.usagePercent) ? `${Math.round(cpu.usagePercent)}%` : "Sampling";
  const temperatureValue = temperature.available ? `${Math.round(temperature.celsius)}°C` : "Unavailable";
  const activeAlerts = list(sample.alerts);
  const alertMarkup = activeAlerts.length ? `
    <div class="performance-alert" role="alert">
      <strong>${escapeHtml(activeAlerts[0].title)}</strong>
      <span>${escapeHtml(activeAlerts[0].body)}</span>
    </div>
  ` : "";

  return `
    ${alertMarkup}
    <div class="performance-grid">
      ${performanceMetric(
        "CPU",
        cpuValue,
        `${cpu.logicalCores || 0} logical cores · ${Math.round(finite(cpu.speedMHz))} MHz`,
        cpu.usagePercent,
        performanceLevel(cpu.usagePercent, cpuThreshold)
      )}
      ${performanceMetric(
        "Temperature",
        temperatureValue,
        temperature.available ? temperature.source || "CPU sensor" : "No supported OS sensor found",
        temperature.available ? (temperature.celsius / temperatureThreshold) * 100 : null,
        performanceLevel(temperature.celsius, temperatureThreshold)
      )}
      ${performanceMetric(
        "Memory",
        `${Math.round(finite(memory.usagePercent))}%`,
        `${formatBytes(memory.usedBytes)} of ${formatBytes(memory.totalBytes)}`,
        memory.usagePercent,
        performanceLevel(memory.usagePercent, memoryThreshold)
      )}
      ${performanceMetric(
        "System disk",
        disk.available ? `${Math.round(finite(disk.usagePercent))}%` : "Unavailable",
        disk.available ? `${formatBytes(disk.availableBytes)} free on ${disk.path || "system disk"}` : "Disk statistics unavailable",
        disk.usagePercent,
        performanceLevel(disk.usagePercent, diskThreshold)
      )}
    </div>
    <dl class="performance-details">
      <div><dt>Download</dt><dd>${network.available && Number.isFinite(network.receivedBytesPerSecond) ? `${formatBytes(network.receivedBytesPerSecond)}/s` : "Sampling"}</dd></div>
      <div><dt>Upload</dt><dd>${network.available && Number.isFinite(network.sentBytesPerSecond) ? `${formatBytes(network.sentBytesPerSecond)}/s` : "Sampling"}</dd></div>
      <div><dt>Load average</dt><dd>${Array.isArray(cpu.loadAverage) ? cpu.loadAverage.map((value) => finite(value).toFixed(2)).join(" / ") : "Unavailable"}</dd></div>
      <div><dt>Uptime</dt><dd>${formatUptime(system.uptimeSeconds)}</dd></div>
    </dl>
  `;
}

function sectionHeader(id, title, action) {
  return `
    <header class="card__header">
      <h2 class="card__title" id="${id}">${title}</h2>
      ${action || ""}
    </header>
  `;
}

function renderDataReadiness(state) {
  const readiness = personalizationReadiness(state);
  if (readiness.ready) return "";
  const missing = readiness.areas.filter((area) => !area.complete).map((area) => area.label);
  return `
    <section class="card data-readiness" aria-labelledby="data-readiness-title">
      <div class="card__body">
        <div class="data-readiness__content">
          <div>
            <p class="eyebrow">Personalization</p>
            <h2 id="data-readiness-title">Give Focus better context</h2>
            <p>${readiness.completed} of ${readiness.total} areas ready. Add ${escapeHtml(missing.slice(0, 3).join(", ").toLowerCase())}${missing.length > 3 ? ", and more" : ""} for more useful planning and AI responses.</p>
          </div>
          <div class="data-readiness__meter">
            <strong>${readiness.percent}%</strong>
            <progress value="${readiness.completed}" max="${readiness.total}" aria-label="Personalization readiness">${readiness.percent}%</progress>
          </div>
        </div>
        <button class="button button--secondary button--sm" type="button" data-action="open-onboarding">Update personal baseline</button>
      </div>
    </section>
  `;
}

export function render(state = {}, ctx = {}) {
  const now = asDate(ctx.now, new Date()) || new Date();
  const todayKey = ctx.todayKey || localDateKey(now);
  const tasks = topTasks(state);
  const event = nextEvent(state, now, todayKey);
  const health = todayHealth(state, todayKey);
  const work = recentWork(state);
  const completedToday = list(state.tasks).filter((task) => (
    isTaskComplete(task) && localDateKey(task.completedAt) === todayKey
  )).length;
  const totalPriorities = completedToday + tasks.length;
  const progressSentence = totalPriorities
    ? `${completedToday} of ${totalPriorities} priorities complete`
    : "Make space for what matters";

  return `
    <main class="page page--wide today-page" data-page="today">
      <header class="page-header today-header">
        <div class="page-header__content">
          <p class="today-header__date"><time datetime="${escapeHtml(todayKey)}">${escapeHtml(formatDate(now, ctx))}</time></p>
          <h1 class="page-header__title">${escapeHtml(greeting(now, state))}</h1>
          <p class="page-header__description">${escapeHtml(progressSentence)}</p>
        </div>
      </header>

      <div class="today-primary stack">
        ${renderDataReadiness(state)}
        ${dailyRoutines.render(state, { ...ctx, now, todayKey })}
        <section class="card today-card today-card--focus" aria-labelledby="today-focus-title">
          ${sectionHeader(
            "today-focus-title",
            "Current focus",
            '<button class="button button--ghost button--sm" type="button" data-action="navigate" data-page="focus">Open focus</button>'
          )}
          <div class="card__body">${renderFocus(state, now, todayKey)}</div>
        </section>

        <div class="today-grid">
          <section class="card today-card" aria-labelledby="today-event-title">
            ${sectionHeader(
              "today-event-title",
              "Next event",
              '<button class="icon-button" type="button" data-action="navigate" data-page="calendar" aria-label="Open calendar">' + icon("calendar") + "</button>"
            )}
            <div class="card__body">${renderNextEvent(event, now, ctx)}</div>
          </section>

          <section class="card today-card" aria-labelledby="today-priorities-title">
            ${sectionHeader(
              "today-priorities-title",
              "Top priorities",
              '<button class="button button--ghost button--sm" type="button" data-action="navigate" data-page="tasks">View tasks</button>'
            )}
            <div class="card__body">${renderTasks(tasks, ctx)}</div>
          </section>
        </div>

        <details class="card today-more" data-secondary-summaries>
          <summary class="today-more__summary">
            <span>
              <strong>More today</strong>
              <small>Health, personal areas, PC performance, and recent work</small>
            </span>
            <span class="button button--ghost button--sm" aria-hidden="true">View summaries</span>
          </summary>
          <div class="today-more__content stack">
            <section class="today-summary" aria-labelledby="today-health-title">
              ${sectionHeader(
                "today-health-title",
                "Health check-in",
                '<button class="icon-button" type="button" data-action="navigate" data-page="health" aria-label="Open health">' + icon("heart") + "</button>"
              )}
              <div class="card__body">${renderHealth(health)}</div>
            </section>

            <section class="today-summary" aria-labelledby="today-progress-title">
              ${sectionHeader(
                "today-progress-title",
                "Progress &amp; streaks",
                '<button class="icon-button" type="button" data-action="navigate" data-page="progress" aria-label="Open progress">' + icon("trend") + "</button>"
              )}
              <div class="card__body">${renderProgress(state, todayKey)}</div>
            </section>

            <section class="today-summary" aria-labelledby="today-personal-title">
              ${sectionHeader("today-personal-title", "Personal areas", "")}
              <div class="card__body">${renderPersonalAreas(state, todayKey)}</div>
            </section>

            <section class="today-summary performance-card" aria-labelledby="today-performance-title">
              ${sectionHeader(
                "today-performance-title",
                "PC performance",
                '<button class="button button--ghost button--sm" type="button" data-action="navigate" data-page="performance">Open performance</button>'
              )}
              <div class="card__body">${renderPerformance(state, ctx)}</div>
            </section>

            <section class="today-summary" aria-labelledby="today-work-title">
              ${sectionHeader(
                "today-work-title",
                "Recent work",
                '<button class="button button--ghost button--sm" type="button" data-action="navigate" data-page="work">View all</button>'
              )}
              <div class="card__body">${renderRecentWork(work, now, ctx)}</div>
            </section>
          </div>
        </details>
      </div>
    </main>
  `;
}

export function bind(root, actions = {}) {
  if (!root?.addEventListener) return;

  const previous = bindings.get(root);
  if (previous) previous();
  const routineCleanup = dailyRoutines.bind(root, actions);

  const onClick = (event) => {
    const control = event.target?.closest?.("[data-action]");
    if (!control || root.contains?.(control) === false || control.disabled) return;

    const action = control.dataset.action;
    const id = control.dataset.id || undefined;
    event.preventDefault?.();

    if (action === "navigate") {
      const destination = control.dataset.page || id;
      if (destination && control.dataset.view && typeof actions.openSearchResult === "function") {
        actions.openSearchResult({ page: destination, view: control.dataset.view });
      } else if (destination) {
        actions.navigate?.(destination);
      }
    } else if (action === "open-editor") {
      const kind = control.dataset.kind;
      if (kind) actions.openEditor?.(kind, id);
    } else if (action === "open-onboarding") {
      actions.openOnboarding?.();
    } else if (action === "toggle-task" && id) {
      actions.dispatch?.({ type: "task/toggle", payload: { id } });
    } else if (action === "start-timer") {
      actions.startTimer?.();
    } else if (action === "pause-timer") {
      actions.pauseTimer?.();
    } else if (action === "finish-timer") {
      actions.finishTimer?.();
    }
  };

  root.addEventListener("click", onClick);
  const cleanup = () => {
    routineCleanup?.();
    root.removeEventListener("click", onClick);
    bindings.delete(root);
  };
  bindings.set(root, cleanup);
  return cleanup;
}
