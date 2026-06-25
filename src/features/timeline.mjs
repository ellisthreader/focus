export const page = {
  id: "timeline",
  label: "Timeline",
  icon: "timeline"
};

const bindings = new WeakMap();
const FILTER_ORDER = ["all", "work", "focus", "task", "wellbeing", "learning", "finance", "journal"];
const FILTER_LABELS = {
  all: "All",
  work: "Work",
  focus: "Focus",
  task: "Tasks",
  health: "Health",
  wellbeing: "Wellbeing",
  learning: "Learning",
  finance: "Finance",
  journal: "Notes",
  habit: "Habits",
  calendar: "Calendar"
};

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

function asDate(value, fallback = null) {
  const input = typeof value === "function" ? value() : value;
  if (input === null || input === undefined || input === "") return fallback;
  if (input instanceof Date) return Number.isFinite(input.getTime()) ? new Date(input.getTime()) : fallback;
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [year, month, day] = input.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }
  const date = new Date(typeof input === "number" || /^\d+$/.test(String(input)) ? Number(input) : input);
  return Number.isFinite(date.getTime()) ? date : fallback;
}

function timestamp(...values) {
  for (const value of values) {
    const date = asDate(value);
    if (date) return date.getTime();
  }
  return null;
}

function dateKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = asDate(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayKey(ctx) {
  return dateKey(ctx?.todayKey) || dateKey(typeof ctx?.now === "function" ? ctx.now() : ctx?.now) || dateKey(Date.now());
}

function labelDay(key, today, ctx) {
  const date = asDate(key);
  if (!date) return "Unknown day";
  if (key === today) return "Today";
  const previous = new Date(asDate(today).getTime());
  previous.setDate(previous.getDate() - 1);
  if (key === dateKey(previous)) return "Yesterday";
  return new Intl.DateTimeFormat(ctx?.locale, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(date);
}

function labelTime(value, ctx) {
  const date = asDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(ctx?.locale, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function durationLabel(milliseconds) {
  const minutes = Math.max(0, Math.round(finite(milliseconds) / 60000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function timelineType(value) {
  const type = String(value || "journal").toLowerCase();
  if (["note", "notes", "journal", "moment", "milestone"].includes(type)) return "journal";
  if (["session", "focus-session", "focus"].includes(type)) return "focus";
  if (["task", "tasks", "completed-task"].includes(type)) return "task";
  if (["event", "calendar", "meeting"].includes(type)) return "calendar";
  if (["health", "wellness", "check-in", "checkin"].includes(type)) return "health";
  if (["nutrition", "meal", "exercise", "workout", "body", "recovery", "wellbeing"].includes(type)) return "wellbeing";
  if (["learning", "study"].includes(type)) return "learning";
  if (["finance", "transaction"].includes(type)) return "finance";
  if (["habit", "habits"].includes(type)) return "habit";
  if (["work", "project"].includes(type)) return "work";
  return type.replace(/[^a-z0-9_-]+/g, "-") || "journal";
}

function completed(task) {
  return Boolean(task?.completed || ["completed", "done"].includes(task?.status));
}

function sessionMs(session) {
  const active = finite(session?.activeMs, -1);
  if (active > 0) return active;
  const duration = finite(session?.durationMs, -1);
  if (duration >= 0) return duration;
  const start = asDate(session?.startedAt || session?.start);
  const end = asDate(session?.endedAt || session?.completedAt || session?.end);
  return start && end ? Math.max(0, end.getTime() - start.getTime()) : 0;
}

function metricParts(entry) {
  return [
    Number.isFinite(Number(entry?.sleepHours)) ? `${finite(entry.sleepHours)}h sleep` : "",
    Number.isFinite(Number(entry?.energy)) ? `Energy ${finite(entry.energy)}/5` : "",
    Number.isFinite(Number(entry?.mood)) ? `Mood ${finite(entry.mood)}/5` : "",
    Number.isFinite(Number(entry?.movementMinutes)) ? `${finite(entry.movementMinutes)} min movement` : "",
    String(entry?.note || "").trim()
  ].filter(Boolean);
}

function entryId(prefix, item, occurredAt, index) {
  return String(item?.id || item?.entityId || `${prefix}-${finite(occurredAt)}-${index}`);
}

function explicitEntries(state, indexOffset) {
  return list(state?.timeline ?? state?.timelineEntries).map((item, index) => {
    const type = timelineType(item.type);
    const occurredAt = timestamp(item.occurredAt, item.createdAt, item.updatedAt);
    return {
      id: entryId("timeline", item, occurredAt, index + indexOffset),
      source: "timeline",
      type,
      entityId: item.entityId || null,
      title: item.title || "Timeline note",
      detail: item.detail || item.summary || item.body || "",
      occurredAt,
      editorKind: type === "journal" && item.entityId ? "journal" : "",
      editorId: item.entityId || ""
    };
  });
}

function derivedEntries(state) {
  const tasks = list(state?.tasks)
    .filter(completed)
    .map((item, index) => {
      const occurredAt = timestamp(item.completedAt, item.updatedAt, item.createdAt, item.dueDate);
      return {
        id: entryId("task", item, occurredAt, index),
        source: "task",
        type: "task",
        entityId: item.id || null,
        title: `Completed: ${item.title || "Untitled task"}`,
        detail: [item.priority && `${item.priority} priority`, item.notes].filter(Boolean).join(" · "),
        occurredAt,
        editorKind: "task",
        editorId: item.id || ""
      };
    });

  const sessions = list(state?.sessions).length ? list(state.sessions) : list(state?.focus?.sessions);
  const focus = sessions.map((item, index) => {
    const occurredAt = timestamp(item.endedAt, item.completedAt, item.startedAt, item.start);
    return {
      id: entryId("focus", item, occurredAt, index),
      source: "focus",
      type: "focus",
      entityId: item.id || null,
      title: `Focused: ${item.title || "Untitled focus block"}`,
      detail: [durationLabel(sessionMs(item)), item.project || "General"].filter(Boolean).join(" · "),
      occurredAt,
      editorKind: "session",
      editorId: item.id || ""
    };
  });

  const healthEntries = list(state?.healthEntries).length ? list(state.healthEntries) : list(state?.healthCheckIns);
  const health = healthEntries.map((item, index) => {
    const occurredAt = timestamp(item.updatedAt, item.recordedAt, item.createdAt, item.date);
    return {
      id: entryId("health", item, occurredAt, index),
      source: "health",
      type: "health",
      entityId: item.id || null,
      title: "Wellness check-in",
      detail: metricParts(item).join(" · "),
      occurredAt,
      editorKind: "health",
      editorId: item.id || item.date || ""
    };
  });

  const journals = list(state?.journalEntries ?? state?.journals).map((item, index) => {
    const occurredAt = timestamp(item.createdAt, item.updatedAt, item.date);
    return {
      id: entryId("journal", item, occurredAt, index),
      source: "journal",
      type: "journal",
      entityId: item.id || null,
      title: item.title || "Daily note",
      detail: item.body || item.note || "",
      occurredAt,
      editorKind: "journal",
      editorId: item.id || ""
    };
  });

  const workItems = list(state?.workItems).length ? list(state.workItems) : list(state?.workUpdates);
  const work = workItems.map((item, index) => {
    const occurredAt = timestamp(item.updatedAt, item.completedAt, item.createdAt);
    return {
      id: entryId("work", item, occurredAt, index),
      source: "work",
      type: "work",
      entityId: item.id || null,
      title: `Updated work: ${item.title || "Untitled work"}`,
      detail: [item.project, item.summary || item.notes, item.status].filter(Boolean).join(" · "),
      occurredAt,
      editorKind: "work",
      editorId: item.id || ""
    };
  });

  const nutrition = list(state?.nutritionEntries).filter((item) => !item.deletedAt).map((item, index) => ({
    id: entryId("nutrition", item, timestamp(item.createdAt, item.date), index),
    source: "nutrition",
    type: "wellbeing",
    entityId: item.id || null,
    title: `Meal logged: ${item.name || "Meal"}`,
    detail: [item.mealType, Number.isFinite(Number(item.calories)) ? `${Math.round(item.calories)} kcal` : "", item.confidence].filter(Boolean).join(" · "),
    occurredAt: timestamp(item.createdAt, item.date),
    editorKind: "nutrition",
    editorId: item.id || ""
  }));
  const workouts = list(state?.workoutSessions).filter((item) => !item.deletedAt).map((item, index) => ({
    id: entryId("workout", item, timestamp(item.startedAt, item.createdAt, item.date), index),
    source: "workout",
    type: "wellbeing",
    entityId: item.id || null,
    title: `Workout: ${item.name || item.activity || "Exercise"}`,
    detail: Number.isFinite(Number(item.durationMinutes)) ? `${item.durationMinutes} minutes` : "",
    occurredAt: timestamp(item.startedAt, item.createdAt, item.date),
    editorKind: "workout",
    editorId: item.id || ""
  }));
  const learning = list(state?.learningLogs).filter((item) => !item.deletedAt).map((item, index) => ({
    id: entryId("learning", item, timestamp(item.createdAt, item.date), index),
    source: "learning",
    type: "learning",
    entityId: item.id || null,
    title: `Studied: ${item.title || item.subject || "Learning session"}`,
    detail: Number.isFinite(Number(item.durationMinutes)) ? `${item.durationMinutes} minutes` : "",
    occurredAt: timestamp(item.createdAt, item.date),
    editorKind: "learningLog",
    editorId: item.id || ""
  }));
  const finance = state?.settings?.privacy?.financeTimeline === true
    ? list(state?.financeEntries).filter((item) => !item.deletedAt).map((item, index) => ({
      id: entryId("finance", item, timestamp(item.createdAt, item.date), index),
      source: "finance",
      type: "finance",
      entityId: item.id || null,
      title: item.kind === "income" ? "Income recorded" : item.kind === "refund" ? "Refund recorded" : "Expense recorded",
      detail: item.category || "",
      occurredAt: timestamp(item.createdAt, item.date),
      editorKind: "financeEntry",
      editorId: item.id || ""
    }))
    : [];
  const milestones = list(state?.goalMilestones).filter((item) => (
    !item.deletedAt
    && (item.completedAt || ["completed", "done"].includes(String(item.status || "").toLowerCase()))
  )).map((item, index) => ({
    id: entryId("goal-milestone", item, timestamp(item.completedAt, item.updatedAt, item.createdAt), index),
    source: "goalMilestone",
    type: "habit",
    entityId: item.id || null,
    title: `Goal milestone completed: ${item.title || "Milestone"}`,
    detail: item.targetDate ? `Target ${item.targetDate}` : "Personal goal",
    occurredAt: timestamp(item.completedAt, item.updatedAt, item.createdAt),
    editorKind: "goalMilestone",
    editorId: item.id || ""
  }));

  return [...tasks, ...focus, ...health, ...nutrition, ...workouts, ...learning, ...finance, ...milestones, ...journals, ...work];
}

function buildEntries(state) {
  const entries = [...derivedEntries(state), ...explicitEntries(state, 10000)];
  const seen = new Set();
  return entries
    .filter((entry) => {
      const logicalKey = entry.entityId ? `${entry.type}:${entry.entityId}` : `${entry.source}:${entry.id}`;
      if (seen.has(logicalKey)) return false;
      seen.add(logicalKey);
      return true;
    })
    .sort((left, right) => right.occurredAt - left.occurredAt || left.title.localeCompare(right.title));
}

function activeFilter(state, entries) {
  return timelineType(state?.ui?.timelineFilter || "all");
}

function filtersFor(entries, active) {
  const present = new Set(entries.map((entry) => entry.type));
  if (active !== "all") present.add(active);
  const unknown = [...present].filter((type) => !FILTER_ORDER.includes(type)).sort();
  return [...FILTER_ORDER, ...unknown];
}

function renderFilters(entries, filter) {
  return `
    <nav class="filter-bar" aria-label="Timeline filters">
      ${filtersFor(entries, filter).map((type) => `
        <button type="button" data-action="set-timeline-filter" data-filter="${escapeHtml(type)}" aria-pressed="${filter === type}">
          ${escapeHtml(FILTER_LABELS[type] || type)}
        </button>
      `).join("")}
    </nav>
  `;
}

function renderEntry(entry, ctx) {
  const title = escapeHtml(entry.title || "Timeline entry");
  const detail = escapeHtml(entry.detail || FILTER_LABELS[entry.type] || entry.type);
  const timestamp = asDate(entry.occurredAt);
  const content = `
    <strong>${title}</strong>
    <span>${detail}</span>
  `;
  return `
    <li class="timeline-entry" data-type="${escapeHtml(entry.type)}">
      <span class="timeline-marker" aria-hidden="true"></span>
      ${entry.editorKind
        ? `<button class="row-content" type="button" data-action="open-editor" data-kind="${escapeHtml(entry.editorKind)}" data-id="${escapeHtml(entry.editorId)}">${content}</button>`
        : `<div class="row-content">${content}</div>`}
      ${timestamp
        ? `<time class="meta" datetime="${timestamp.toISOString()}">${escapeHtml(labelTime(timestamp, ctx))}</time>`
        : '<span class="meta">Time unavailable</span>'}
    </li>
  `;
}

function renderGroups(entries, ctx) {
  const today = todayKey(ctx);
  const groups = new Map();
  entries.forEach((entry) => {
    const key = dateKey(entry.occurredAt) || today;
    groups.set(key, [...(groups.get(key) || []), entry]);
  });
  return `
    <section class="timeline-stream" aria-label="Chronological activity">
      ${[...groups.entries()].map(([key, items]) => `
        <section class="timeline-day" aria-labelledby="timeline-day-${escapeHtml(key)}">
          <header class="timeline-day__header">
            <h2 id="timeline-day-${escapeHtml(key)}">${escapeHtml(labelDay(key, today, ctx))}</h2>
            <p>${items.length} ${items.length === 1 ? "moment" : "moments"}</p>
          </header>
          <ol class="timeline-list">${items.map((entry) => renderEntry(entry, ctx)).join("")}</ol>
        </section>
      `).join("")}
    </section>
  `;
}

export function render(state = {}, ctx = {}) {
  const entries = buildEntries(state);
  const filter = activeFilter(state, entries);
  const visible = filter === "all" ? entries : entries.filter((entry) => entry.type === filter);

  return `
    <main class="page timeline-page" data-page="timeline" aria-labelledby="timeline-title">
      <header class="page-header">
        <div>
          <p class="eyebrow">${entries.length} ${entries.length === 1 ? "moment" : "moments"} recorded</p>
          <h1 id="timeline-title">Timeline</h1>
          <p>A chronological record of completed work, focus, health, and personal notes.</p>
        </div>
      </header>
      <div class="timeline-controls">${renderFilters(entries, filter)}</div>
      ${visible.length
        ? renderGroups(visible, ctx)
        : `<section class="timeline-empty empty-state"><p>${filter === "all" ? "Your activity will build a timeline as you use Focus." : "No timeline items match this filter."}</p><button class="button button--secondary button--sm" type="button" data-action="${filter === "all" ? "open-editor" : "set-timeline-filter"}" data-kind="journal" data-filter="all">${filter === "all" ? "Add a note" : "Clear filters"}</button></section>`}
    </main>
  `;
}

function openEditor(actions, kind, id) {
  if (!kind) return;
  if (typeof actions.openEditor === "function") {
    actions.openEditor(kind, id || undefined);
  } else {
    actions.dispatch?.({ type: "editor/open", payload: { kind, id: id || undefined } });
  }
}

export function bind(root, actions = {}) {
  if (!root?.addEventListener) return;
  const previous = bindings.get(root);
  if (previous) root.removeEventListener("click", previous);

  const onClick = (event) => {
    const control = event.target?.closest?.("[data-action]");
    if (!control || !root.contains(control) || control.disabled) return;
    const action = control.dataset.action;
    event.preventDefault();

    if (action === "set-timeline-filter") {
      actions.dispatch?.({
        type: "ui/setTimelineFilter",
        payload: { filter: control.dataset.filter || "all" }
      });
    } else if (action === "open-editor") {
      openEditor(actions, control.dataset.kind || "journal", control.dataset.id);
    }
  };

  root.addEventListener("click", onClick);
  bindings.set(root, onClick);
}
