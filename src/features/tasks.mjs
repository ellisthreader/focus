import { dateKey, parseDateKey, relativeDayLabel } from "../core/date.mjs";

export const page = Object.freeze({
  id: "tasks",
  label: "Tasks",
  icon: "check"
});

const FILTERS = [
  ["today", "Today"],
  ["upcoming", "Upcoming"],
  ["all", "All"]
];
const bindings = new WeakMap();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function validDateKey(value) {
  try {
    return value ? dateKey(parseDateKey(String(value).slice(0, 10))) : "";
  } catch {
    return "";
  }
}

function dueLabel(value, today) {
  const key = validDateKey(value);
  if (!key) return "No due date";
  if (key < today) return `Overdue · ${relativeDayLabel(parseDateKey(key), parseDateKey(today))}`;
  return relativeDayLabel(parseDateKey(key), parseDateKey(today));
}

function reminderLabel(value, today) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "No time set";
  const day = relativeDayLabel(date, parseDateKey(today));
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
  return `${day} · ${time}`;
}

function matchesFilter(task, filter, today) {
  if (filter === "all") return true;
  if (task.completed) return false;
  const due = validDateKey(task.dueDate);
  if (filter === "today") return Boolean(due && due <= today);
  return Boolean(due && due > today);
}

function taskCounts(tasks, today) {
  return {
    today: tasks.filter((task) => matchesFilter(task, "today", today)).length,
    upcoming: tasks.filter((task) => matchesFilter(task, "upcoming", today)).length,
    all: tasks.length
  };
}

function renderTask(task, today) {
  const priority = ["low", "medium", "high"].includes(task.priority)
    ? task.priority
    : "medium";
  const completed = Boolean(task.completed);
  return `
    <li class="task-row${completed ? " is-complete" : ""}" data-task-id="${escapeHtml(task.id)}">
      <input
        type="checkbox"
        data-action="toggle-task"
        aria-label="${completed ? "Mark incomplete" : "Complete"} ${escapeHtml(task.title)}"
        ${completed ? "checked" : ""}
      >
      <button class="row-content" type="button" data-action="edit-task">
        <strong>${escapeHtml(task.title)}</strong>
        <span>${escapeHtml(priority)} priority · ${escapeHtml(dueLabel(task.dueDate, today))}</span>
      </button>
      <details class="row-action-menu">
        <summary class="icon-button" aria-label="Actions for ${escapeHtml(task.title)}">
          <span aria-hidden="true">More</span>
        </summary>
        <div class="row-action-menu__content">
          ${completed ? "" : '<button class="button button--ghost button--sm" type="button" data-action="focus-task">Start focus</button>'}
          <button class="button button--ghost button--sm" type="button" data-action="delete-task">
            Delete task
          </button>
        </div>
      </details>
    </li>
  `;
}

function renderReminder(reminder, today) {
  return `
    <li class="list-row" data-reminder-id="${escapeHtml(reminder.id)}">
      <span class="badge${reminder.completed ? " success" : ""}">
        ${reminder.completed ? "Done" : "Reminder"}
      </span>
      <button class="row-content" type="button" data-action="edit-reminder">
        <strong>${escapeHtml(reminder.title)}</strong>
        <span>${escapeHtml(reminderLabel(reminder.dueAt, today))}</span>
      </button>
      <details class="row-action-menu">
        <summary class="icon-button" aria-label="Actions for ${escapeHtml(reminder.title)}">
          <span aria-hidden="true">More</span>
        </summary>
        <div class="row-action-menu__content">
          <button class="button button--ghost button--sm" type="button" data-action="delete-reminder">
            Delete reminder
          </button>
        </div>
      </details>
    </li>
  `;
}

function currentDateKey(ctx) {
  const supplied = validDateKey(ctx?.todayKey);
  const now = typeof ctx?.now === "function" ? ctx.now() : ctx?.now;
  try {
    return supplied || dateKey(now ?? Date.now());
  } catch {
    return dateKey();
  }
}

export function render(state = {}, ctx = {}) {
  const tasks = Array.isArray(state.tasks) ? state.tasks.filter(Boolean) : [];
  const reminders = Array.isArray(state.reminders) ? state.reminders.filter(Boolean) : [];
  const today = currentDateKey(ctx);
  const filter = FILTERS.some(([id]) => id === state.ui?.taskFilter)
    ? state.ui.taskFilter
    : "today";
  const counts = taskCounts(tasks, today);
  const visibleTasks = tasks
    .filter((task) => matchesFilter(task, filter, today))
    .sort((left, right) => {
      if (Boolean(left.completed) !== Boolean(right.completed)) return left.completed ? 1 : -1;
      const leftDue = validDateKey(left.dueDate) || "9999-12-31";
      const rightDue = validDateKey(right.dueDate) || "9999-12-31";
      return leftDue.localeCompare(rightDue);
    });
  const activeReminders = reminders
    .filter((item) => !item.completed)
    .sort((left, right) => String(left.dueAt || "").localeCompare(String(right.dueAt || "")));

  return `
    <main class="page tasks-page" aria-labelledby="tasks-title">
      <header class="page-header">
        <div>
          <p class="eyebrow">${counts.today} due today</p>
          <h1 id="tasks-title">Tasks</h1>
          <p>${tasks.filter((task) => !task.completed).length} open · ${tasks.filter((task) => task.completed).length} complete</p>
        </div>
      </header>

      <form class="card task-quick-add task-quick-add--inline" data-task-quick-add>
        <div class="task-quick-add__primary">
          <label class="sr-only" for="task-quick-add-title">Task title</label>
          <input id="task-quick-add-title" name="title" required maxlength="180" autocomplete="off" placeholder="Add a task">
          <button class="button primary" type="submit">Add task</button>
        </div>
        <details class="task-quick-add__advanced">
          <summary>Due date and priority</summary>
          <div class="form-grid">
            <label class="field">
              <span>Due</span>
              <input name="dueDate" type="date" value="${today}">
            </label>
            <label class="field">
              <span>Priority</span>
              <select name="priority">
                <option value="low">Low</option>
                <option value="medium" selected>Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
        </details>
      </form>

      <section class="card" aria-labelledby="task-list-title">
        <div class="section-header">
          <div>
            <h2 id="task-list-title">${FILTERS.find(([id]) => id === filter)?.[1]} tasks</h2>
            <p>${visibleTasks.length} ${visibleTasks.length === 1 ? "task" : "tasks"}</p>
          </div>
          <div class="filter-bar" aria-label="Task filters">
            ${FILTERS.map(([id, label]) => `
              <button
                type="button"
                data-action="set-task-filter"
                data-filter="${id}"
                aria-pressed="${filter === id}"
              >${label} <span aria-hidden="true">${counts[id]}</span></button>
            `).join("")}
          </div>
        </div>
        ${visibleTasks.length
          ? `<ul class="task-list">${visibleTasks.map((task) => renderTask(task, today)).join("")}</ul>`
          : '<p class="empty-state">Nothing here. Add a task when something needs your attention.</p>'}
      </section>

      <details class="card subtle task-reminders">
        <summary class="task-reminders__summary">
          <span>
            <strong id="reminders-title">Reminders</strong>
            <small>${activeReminders.length} active</small>
          </span>
          <span class="button button--ghost button--sm" aria-hidden="true">View</span>
        </summary>
        <div class="task-reminders__content" aria-labelledby="reminders-title">
          <div class="section-header">
            <p class="muted">Time-sensitive prompts kept separate from your task list.</p>
            <button class="button button--secondary button--sm" type="button" data-action="add-reminder">Add reminder</button>
          </div>
          ${activeReminders.length
            ? `<ul class="item-list">${activeReminders.map((item) => renderReminder(item, today)).join("")}</ul>`
            : '<p class="empty-state">No active reminders.</p>'}
        </div>
      </details>
    </main>
  `;
}

export function bind(root, actions = {}) {
  if (!root?.addEventListener) return;
  const previous = bindings.get(root);
  if (previous) {
    root.removeEventListener("click", previous.onClick);
    root.removeEventListener("change", previous.onChange);
    root.removeEventListener("submit", previous.onSubmit);
  }

  const onSubmit = (event) => {
    const form = event.target.closest("[data-task-quick-add]");
    if (!form || !root.contains(form)) return;
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    if (!String(values.title || "").trim()) return;
    actions.dispatch?.({ type: "task/add", payload: values });
    form.reset();
  };

  const onClick = (event) => {
    const control = event.target.closest("[data-action]");
    if (!control || !root.contains(control)) return;
    const taskId = control.closest("[data-task-id]")?.dataset.taskId;
    const reminderId = control.closest("[data-reminder-id]")?.dataset.reminderId;

    if (control.dataset.action === "set-task-filter") {
      actions.dispatch?.({
        type: "ui/setTaskFilter",
        payload: { filter: control.dataset.filter }
      });
    } else if (control.dataset.action === "edit-task" && taskId) {
      actions.openEditor?.("task", taskId);
    } else if (control.dataset.action === "focus-task" && taskId) {
      actions.startFocusForTask?.(taskId);
    } else if (control.dataset.action === "delete-task" && taskId) {
      actions.dispatch?.({ type: "task/delete", payload: { id: taskId } });
    } else if (control.dataset.action === "add-reminder") {
      actions.openEditor?.("reminder");
    } else if (control.dataset.action === "edit-reminder" && reminderId) {
      actions.openEditor?.("reminder", reminderId);
    } else if (control.dataset.action === "delete-reminder" && reminderId) {
      actions.dispatch?.({ type: "reminder/delete", payload: { id: reminderId } });
    }
  };

  const onChange = (event) => {
    const checkbox = event.target.closest('[data-action="toggle-task"]');
    const taskId = checkbox?.closest("[data-task-id]")?.dataset.taskId;
    if (!taskId) return;
    actions.dispatch?.({
      type: "task/toggle",
      payload: { id: taskId, completed: checkbox.checked }
    });
  };

  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  root.addEventListener("submit", onSubmit);
  bindings.set(root, { onClick, onChange, onSubmit });
}
