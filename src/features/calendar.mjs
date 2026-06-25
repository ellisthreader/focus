import {
  addDays,
  dateKey,
  daysInMonthGrid,
  parseDateKey
} from "../core/date.mjs";

export const page = {
  id: "calendar",
  label: "Calendar",
  icon: "calendar"
};

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const bindings = new WeakMap();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function asDate(value) {
  try {
    const parsed = typeof value === "string" && DATE_KEY_PATTERN.test(value)
      ? parseDateKey(value)
      : new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  } catch {
    return null;
  }
}

function validDateKey(value, fallback) {
  const parsed = asDate(value);
  return parsed ? dateKey(parsed) : fallback;
}

function localeOf(ctx) {
  return ctx?.locale || undefined;
}

function formatDate(value, options, ctx) {
  const parsed = asDate(value);
  if (!parsed) return "";
  return new Intl.DateTimeFormat(localeOf(ctx), options).format(parsed);
}

function eventStart(event) {
  return asDate(event?.start ?? event?.startAt ?? event?.startsAt ?? event?.date);
}

function eventEnd(event, start) {
  return asDate(event?.end ?? event?.endAt ?? event?.endsAt) || start;
}

function reminderDate(reminder) {
  return asDate(reminder?.dueAt ?? reminder?.remindAt ?? reminder?.date);
}

function eventsOnDate(events, key) {
  const dayStart = parseDateKey(key);
  const dayEnd = addDays(dayStart, 1);

  return events.filter((event) => {
    const start = eventStart(event);
    if (!start) return false;
    const end = eventEnd(event, start);
    return start < dayEnd && (end > dayStart || start >= dayStart);
  });
}

function remindersOnDate(reminders, key) {
  return reminders.filter((reminder) => {
    const due = reminderDate(reminder);
    return due && dateKey(due) === key;
  });
}

function itemTime(item, kind, ctx) {
  if (kind === "event" && item?.allDay) return "All day";
  const value = kind === "event" ? eventStart(item) : reminderDate(item);
  return value
    ? formatDate(value, { hour: "numeric", minute: "2-digit" }, ctx)
    : "Any time";
}

function itemTimestamp(item, kind) {
  const value = kind === "event" ? eventStart(item) : reminderDate(item);
  return value?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function shiftMonth(value, amount) {
  const source = asDate(value) || new Date();
  const day = source.getDate();
  const shifted = new Date(source.getFullYear(), source.getMonth() + amount, 1);
  const lastDay = new Date(
    shifted.getFullYear(),
    shifted.getMonth() + 1,
    0
  ).getDate();
  shifted.setDate(Math.min(day, lastDay));
  return shifted;
}

function renderDay(day, selectedKey, todayKey, events, reminders, ctx) {
  const key = dateKey(day);
  const selectedDate = parseDateKey(selectedKey);
  const dayEvents = eventsOnDate(events, key);
  const dayReminders = remindersOnDate(reminders, key);
  const total = dayEvents.length + dayReminders.length;
  const isToday = key === todayKey;
  const isSelected = key === selectedKey;
  const classes = [
    "calendar-day",
    day.getMonth() === selectedDate.getMonth()
      && day.getFullYear() === selectedDate.getFullYear()
      ? ""
      : "outside",
    isToday ? "today" : "",
    isSelected ? "selected" : ""
  ].filter(Boolean).join(" ");
  const fullLabel = formatDate(day, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }, ctx);
  const countLabel = total === 0
    ? "no items"
    : `${dayEvents.length} ${dayEvents.length === 1 ? "event" : "events"}, ${dayReminders.length} ${dayReminders.length === 1 ? "reminder" : "reminders"}`;
  const label = `${fullLabel}, ${countLabel}${isToday ? ", today" : ""}${isSelected ? ", selected" : ""}`;
  const dots = Array.from({ length: Math.min(total, 3) }, () => "<span></span>").join("");

  return `
    <button
      class="${classes}"
      type="button"
      data-action="select-date"
      data-date="${key}"
      aria-label="${escapeHtml(label)}"
      aria-pressed="${isSelected}"
      ${isToday ? 'aria-current="date"' : ""}
      tabindex="${isSelected ? "0" : "-1"}"
    >
      <span class="day-number">${day.getDate()}</span>
      ${dots ? `<span class="day-dots" aria-hidden="true">${dots}</span>` : ""}
    </button>
  `;
}

function eventMeta(event) {
  return [event?.category, event?.location].filter(Boolean).join(" · ");
}

function renderEvent(event, ctx) {
  const id = escapeHtml(event?.id);
  const title = escapeHtml(event?.title || "Untitled event");
  const completed = Boolean(event?.completed || event?.status === "completed" || event?.status === "done");
  const canComplete = Object.prototype.hasOwnProperty.call(event || {}, "completed");
  const completeButton = canComplete
    ? `<button class="icon-button" type="button" data-action="toggle-event" data-id="${id}" data-completed="${completed}" aria-label="${completed ? "Mark incomplete" : "Mark complete"}: ${title}" aria-pressed="${completed}">${completed ? "✓" : "○"}</button>`
    : `<span class="badge">${escapeHtml(itemTime(event, "event", ctx))}</span>`;

  return `
    <li class="agenda-row${completed ? " completed" : ""}">
      ${completeButton}
      <div class="row-content">
        <strong>${title}</strong>
        <span>${escapeHtml(eventMeta(event) || itemTime(event, "event", ctx))}</span>
      </div>
      <button class="button button--ghost button--sm" type="button" data-action="open-event" data-id="${id}">Open</button>
    </li>
  `;
}

function renderReminder(reminder, ctx) {
  const id = escapeHtml(reminder?.id);
  const title = escapeHtml(reminder?.title || "Reminder");
  const completed = Boolean(reminder?.completed);

  return `
    <li class="agenda-row${completed ? " completed" : ""}">
      <button
        class="icon-button"
        type="button"
        data-action="toggle-reminder"
        data-id="${id}"
        data-completed="${completed}"
        aria-label="${completed ? "Mark incomplete" : "Complete"}: ${title}"
        aria-pressed="${completed}"
      >${completed ? "✓" : "○"}</button>
      <div class="row-content">
        <strong>${title}</strong>
        <span>${escapeHtml(itemTime(reminder, "reminder", ctx))} · Reminder</span>
      </div>
      <button class="button button--ghost button--sm" type="button" data-action="open-reminder" data-id="${id}">Open</button>
    </li>
  `;
}

function renderAgenda(events, reminders, selectedKey, ctx) {
  const items = [
    ...eventsOnDate(events, selectedKey).map((item) => ({ item, kind: "event" })),
    ...remindersOnDate(reminders, selectedKey).map((item) => ({ item, kind: "reminder" }))
  ].sort((left, right) => itemTimestamp(left.item, left.kind) - itemTimestamp(right.item, right.kind));

  if (items.length === 0) {
    return `
      <div class="empty-state">
        <p>No plans here yet.</p>
        <button class="button button--secondary button--sm" type="button" data-action="add-event" data-date="${selectedKey}">Add an event</button>
      </div>
    `;
  }

  return `
    <ul class="agenda-list">
      ${items.map(({ item, kind }) => (
        kind === "event" ? renderEvent(item, ctx) : renderReminder(item, ctx)
      )).join("")}
    </ul>
  `;
}

export function render(state = {}, ctx = {}) {
  const suppliedNow = typeof ctx.now === "function" ? ctx.now() : ctx.now;
  const now = suppliedNow ?? Date.now();
  const fallbackTodayKey = validDateKey(now, dateKey(new Date()));
  const todayKey = validDateKey(ctx.todayKey, fallbackTodayKey);
  const selectedKey = validDateKey(
    state?.ui?.selectedDate ?? state?.selectedDate,
    todayKey
  );
  const selectedDate = parseDateKey(selectedKey);
  const events = Array.isArray(state?.events) ? state.events : [];
  const reminders = Array.isArray(state?.reminders) ? state.reminders : [];
  const gridDays = daysInMonthGrid(selectedDate, 1);
  const previousMonth = dateKey(shiftMonth(selectedDate, -1));
  const nextMonth = dateKey(shiftMonth(selectedDate, 1));
  const monthLabel = formatDate(selectedDate, { month: "long", year: "numeric" }, ctx);
  const selectedLabel = formatDate(selectedDate, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }, ctx);
  const weekdays = gridDays.slice(0, 7).map((day) => (
    `<div class="calendar-weekday">${escapeHtml(formatDate(day, { weekday: "short" }, ctx))}</div>`
  )).join("");

  return `
    <section class="page calendar-page" aria-labelledby="calendar-title">
      <header class="page-header">
        <div>
          <p class="eyebrow">Plan your time</p>
          <h1 id="calendar-title">Calendar</h1>
          <p>Keep the month and the selected day in one clear view.</p>
        </div>
      </header>

      <div class="calendar-shell">
        <section class="stack" aria-label="${escapeHtml(monthLabel)} month view">
          <div class="calendar-toolbar" role="toolbar" aria-label="Calendar controls">
            <div class="calendar-month-controls">
              <button class="icon-button calendar-nav-button" type="button" data-action="select-date" data-date="${previousMonth}" aria-label="Previous month">
                <span class="calendar-nav-icon" aria-hidden="true">‹</span>
              </button>
              <h2 class="calendar-month-label" aria-live="polite">${escapeHtml(monthLabel)}</h2>
              <button class="icon-button calendar-nav-button" type="button" data-action="select-date" data-date="${nextMonth}" aria-label="Next month">
                <span class="calendar-nav-icon" aria-hidden="true">›</span>
              </button>
            </div>
            <div class="calendar-toolbar-actions">
              <button class="button button--secondary button--sm" type="button" data-action="select-date" data-date="${todayKey}">Today</button>
              <button class="button button--primary button--sm" type="button" data-action="add-event" data-date="${selectedKey}">Add event</button>
            </div>
          </div>
          <div class="calendar-grid">
            ${weekdays}
            ${gridDays.map((day) => renderDay(
              day,
              selectedKey,
              todayKey,
              events,
              reminders,
              ctx
            )).join("")}
          </div>
        </section>

        <aside class="calendar-agenda" aria-labelledby="agenda-title">
          <header class="calendar-agenda-header">
            <span class="calendar-agenda-label">Agenda</span>
            <h2 id="agenda-title">${escapeHtml(selectedLabel)}</h2>
          </header>
          ${renderAgenda(events, reminders, selectedKey, ctx)}
        </aside>
      </div>
    </section>
  `;
}

function dispatchDate(actions, value) {
  const key = validDateKey(value, "");
  if (!key) return;
  actions?.dispatch?.({ type: "ui/selectDate", payload: { date: key } });
}

function keyboardDate(event, value) {
  const current = asDate(value);
  if (!current) return null;

  if (event.key === "ArrowLeft") return addDays(current, -1);
  if (event.key === "ArrowRight") return addDays(current, 1);
  if (event.key === "ArrowUp") return addDays(current, -7);
  if (event.key === "ArrowDown") return addDays(current, 7);
  if (event.key === "Home") return addDays(current, -((current.getDay() + 6) % 7));
  if (event.key === "End") return addDays(current, 6 - ((current.getDay() + 6) % 7));
  if (event.key === "PageUp") return shiftMonth(current, event.shiftKey ? -12 : -1);
  if (event.key === "PageDown") return shiftMonth(current, event.shiftKey ? 12 : 1);
  return null;
}

export function bind(root, actions = {}) {
  if (!root?.addEventListener) return;

  const previous = bindings.get(root);
  if (previous) {
    root.removeEventListener?.("click", previous.onClick);
    root.removeEventListener?.("keydown", previous.onKeyDown);
  }

  const onClick = (event) => {
    const control = event.target.closest?.("[data-action]");
    if (!control || !root.contains(control)) return;
    const action = control.dataset.action;
    const id = control.dataset.id;

    if (action === "select-date") {
      dispatchDate(actions, control.dataset.date);
    } else if (action === "add-event") {
      const date = control.dataset.date;
      actions.openEditor?.("event", "", date ? {
        prefill: {
          start: `${date}T09:00:00`,
          end: `${date}T10:00:00`
        }
      } : {});
    } else if (action === "open-event") {
      actions.openEditor?.("event", id);
    } else if (action === "open-reminder") {
      actions.openEditor?.("reminder", id);
    } else if (action === "toggle-reminder" || action === "complete-reminder") {
      actions.dispatch?.({
        type: "reminder/toggle",
        payload: { id, completed: control.dataset.completed !== "true" }
      });
    } else if (action === "toggle-event" || action === "complete-event") {
      actions.dispatch?.({
        type: "event/update",
        payload: {
          id,
          patch: { completed: control.dataset.completed !== "true" }
        }
      });
    }
  };

  const onKeyDown = (event) => {
    const day = event.target.closest?.('.calendar-day[data-date]');
    if (!day || !root.contains(day)) return;
    const next = keyboardDate(event, day.dataset.date);
    if (!next) return;
    event.preventDefault();
    dispatchDate(actions, dateKey(next));
  };

  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeyDown);
  bindings.set(root, { onClick, onKeyDown });
}
