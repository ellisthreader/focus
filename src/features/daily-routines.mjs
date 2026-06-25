const bindings = new WeakMap();
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DEFAULT_BOUNDARIES = Object.freeze({
  morningStart: "05:00",
  dayStart: "12:00",
  eveningStart: "18:00"
});

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

function clean(value) {
  return String(value ?? "").trim();
}

function timestamp(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clockMinutes(value) {
  const match = CLOCK_PATTERN.exec(clean(value));
  return match ? (Number(match[1]) * 60) + Number(match[2]) : null;
}

function localDateKey(value = new Date()) {
  if (typeof value === "string" && DATE_KEY_PATTERN.test(value)) return value;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dashboardSettings(value = {}) {
  return value?.dailyDashboard && typeof value.dailyDashboard === "object"
    ? value.dailyDashboard
    : value;
}

export function dailyRoutineBoundaries(value = {}) {
  const settings = dashboardSettings(value);
  const candidate = {
    morningStart: CLOCK_PATTERN.test(clean(settings?.morningStart))
      ? clean(settings.morningStart)
      : DEFAULT_BOUNDARIES.morningStart,
    dayStart: CLOCK_PATTERN.test(clean(settings?.dayStart))
      ? clean(settings.dayStart)
      : DEFAULT_BOUNDARIES.dayStart,
    eveningStart: CLOCK_PATTERN.test(clean(settings?.eveningStart))
      ? clean(settings.eveningStart)
      : DEFAULT_BOUNDARIES.eveningStart
  };
  const minutes = Object.values(candidate).map(clockMinutes);
  return minutes[0] < minutes[1] && minutes[1] < minutes[2]
    ? candidate
    : { ...DEFAULT_BOUNDARIES };
}

export function selectDailyRoutineMode(value = new Date(), settings = {}) {
  const configured = dashboardSettings(settings);
  const selectedMode = clean(configured?.mode).toLowerCase();
  if (["morning", "day", "evening"].includes(selectedMode)) return selectedMode;

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) return "day";
  const boundaries = dailyRoutineBoundaries(configured);
  const nowMinutes = (date.getHours() * 60) + date.getMinutes();
  const morningStart = clockMinutes(boundaries.morningStart);
  const dayStart = clockMinutes(boundaries.dayStart);
  const eveningStart = clockMinutes(boundaries.eveningStart);

  if (nowMinutes < morningStart || nowMinutes >= eveningStart) return "evening";
  if (nowMinutes < dayStart) return "morning";
  return "day";
}

export function dailyRoutineLogId(routineItemId, date) {
  const itemId = clean(routineItemId);
  const dateKey = localDateKey(date);
  if (!itemId || !dateKey) return "";
  return `daily-routine-log:${encodeURIComponent(itemId)}:${dateKey}`;
}

export function findDailyRoutineLog(logs, routineItemId, date) {
  const itemId = clean(routineItemId);
  const dateKey = localDateKey(date);
  if (!itemId || !dateKey) return null;

  return list(logs)
    .filter((log) => (
      log
      && !log.deletedAt
      && clean(log.routineItemId) === itemId
      && localDateKey(log.date) === dateKey
    ))
    .sort((left, right) => (
      timestamp(right.updatedAt) - timestamp(left.updatedAt)
      || timestamp(right.createdAt) - timestamp(left.createdAt)
      || clean(right.id).localeCompare(clean(left.id))
    ))[0] || null;
}

export function dailyRoutineStatus(logs, routineItemId, date) {
  const status = clean(findDailyRoutineLog(logs, routineItemId, date)?.status).toLowerCase();
  return ["completed", "skipped"].includes(status) ? status : "pending";
}

export function dailyRoutineItemsForPeriod(state = {}, period, date = new Date()) {
  const normalizedPeriod = clean(period).toLowerCase();
  const weekday = (date instanceof Date ? date : new Date(date)).getDay();
  return list(state?.dailyRoutineItems)
    .filter((item) => {
      if (!item || item.deletedAt || item.active === false || item.enabled === false) return false;
      if (clean(item.period).toLowerCase() !== normalizedPeriod) return false;
      return !Array.isArray(item.weekdays)
        || item.weekdays.length === 0
        || item.weekdays.map(Number).includes(weekday);
    })
    .sort((left, right) => (
      Number(left.order ?? Number.MAX_SAFE_INTEGER) - Number(right.order ?? Number.MAX_SAFE_INTEGER)
      || clean(left.title).localeCompare(clean(right.title))
      || clean(left.id).localeCompare(clean(right.id))
    ));
}

export function dailyRoutineSummary(state = {}, period, date = new Date()) {
  const items = dailyRoutineItemsForPeriod(state, period, date);
  const dateKey = localDateKey(date);
  const statuses = items.map((item) => dailyRoutineStatus(state?.dailyRoutineLogs, item.id, dateKey));
  return {
    date: dateKey,
    period: clean(period).toLowerCase(),
    total: items.length,
    completed: statuses.filter((status) => status === "completed").length,
    skipped: statuses.filter((status) => status === "skipped").length,
    remaining: statuses.filter((status) => status === "pending").length
  };
}

function renderRoutineItem(item, status, dateKey) {
  const itemId = escapeHtml(item.id);
  const title = escapeHtml(item.title || "Untitled routine item");
  const completed = status === "completed";
  const skipped = status === "skipped";
  const page = clean(item.actionPage || item.targetPage || item.page);
  const view = clean(item.actionView || item.targetView || item.view);
  const titleMarkup = page
    ? `
      <button
        class="today-list__content"
        type="button"
        data-action="routine/navigate"
        data-page="${escapeHtml(page)}"
        ${view ? `data-view="${escapeHtml(view)}"` : ""}
      >
        <span class="today-list__title">${title}</span>
        <span class="today-list__meta">${skipped ? "Skipped today" : completed ? "Completed today" : "Open related area"}</span>
      </button>
    `
    : `
      <span class="today-list__content">
        <span class="today-list__title">${title}</span>
        <span class="today-list__meta">${skipped ? "Skipped today" : completed ? "Completed today" : "Not completed"}</span>
      </span>
    `;

  return `
    <li class="today-list__item" data-routine-item-id="${itemId}" data-routine-status="${escapeHtml(status)}">
      <button
        class="today-check"
        type="button"
        role="checkbox"
        aria-checked="${completed ? "true" : "false"}"
        aria-label="${completed ? "Mark incomplete" : "Complete"} ${title}"
        data-action="routine/toggle"
        data-item-id="${itemId}"
        data-date="${escapeHtml(dateKey)}"
        data-status="${escapeHtml(status)}"
      >${completed ? "✓" : ""}</button>
      ${titleMarkup}
      <button
        class="button button--ghost button--sm"
        type="button"
        data-action="routine/skip"
        data-item-id="${itemId}"
        data-date="${escapeHtml(dateKey)}"
        data-status="${escapeHtml(status)}"
        aria-label="${skipped ? "Restore" : "Skip"} ${title}"
      >${skipped ? "Restore" : "Skip"}</button>
    </li>
  `;
}

export function renderDailyRoutine(state = {}, ctx = {}) {
  const settings = state?.settings?.dailyDashboard || {};
  if (settings.showRoutineCard === false) return "";

  const now = ctx?.now instanceof Date ? ctx.now : new Date(ctx?.now || Date.now());
  const selectedMode = ["auto", "morning", "day", "evening"].includes(state?.ui?.todayMode)
    ? state.ui.todayMode
    : "auto";
  const mode = selectedMode === "auto"
    ? selectDailyRoutineMode(now, settings)
    : selectedMode;
  const modeTabs = `
    <div class="tab-list today-mode-tabs" role="tablist" aria-label="Today mode">
      ${[
        ["auto", "Auto"],
        ["morning", "Morning"],
        ["day", "Day"],
        ["evening", "Evening"]
      ].map(([value, label]) => `
        <button
          class="tab${selectedMode === value ? " is-active" : ""}"
          type="button"
          role="tab"
          aria-selected="${selectedMode === value}"
          data-action="routine/set-mode"
          data-mode="${value}"
        >${label}</button>
      `).join("")}
    </div>
  `;
  if (mode === "day") return modeTabs;

  const dateKey = DATE_KEY_PATTERN.test(clean(ctx?.todayKey))
    ? clean(ctx.todayKey)
    : localDateKey(now);
  const items = dailyRoutineItemsForPeriod(state, mode, now);
  const summary = dailyRoutineSummary(state, mode, dateKey);
  const title = mode === "morning" ? "Morning routine" : "Evening routine";
  const description = summary.total
    ? `${summary.completed} of ${summary.total} complete${summary.skipped ? ` · ${summary.skipped} skipped` : ""}`
    : "A short checklist for this part of your day";

  return `
    ${modeTabs}
    <section class="card today-card daily-routine" aria-labelledby="daily-routine-title" data-daily-routine data-period="${mode}" data-date="${escapeHtml(dateKey)}">
      <header class="card__header">
        <div>
          <h2 class="card__title" id="daily-routine-title">${title}</h2>
          <p class="card__description">${escapeHtml(description)}</p>
        </div>
        <button class="button button--ghost button--sm" type="button" data-action="routine/navigate" data-page="settings" data-view="personal">Manage</button>
      </header>
      <div class="card__body">
        ${items.length
          ? `<ul class="today-list daily-routine__list">${items.map((item) => (
            renderRoutineItem(item, dailyRoutineStatus(state?.dailyRoutineLogs, item.id, dateKey), dateKey)
          )).join("")}</ul>`
          : `
            <div class="today-empty today-empty--compact">
              <p>No ${mode} routine items yet.</p>
              <button class="button button--secondary button--sm" type="button" data-action="routine/navigate" data-page="settings" data-view="personal">Set up routine</button>
            </div>
          `}
      </div>
    </section>
  `;
}

function option(value, current, label) {
  return `<option value="${value}"${value === current ? " selected" : ""}>${label}</option>`;
}

export function renderDailyDashboardSettings(state = {}) {
  const settings = state?.settings?.dailyDashboard || {};
  const boundaries = dailyRoutineBoundaries(settings);
  const mode = ["auto", "morning", "day", "evening"].includes(settings.mode)
    ? settings.mode
    : "auto";
  const items = list(state?.dailyRoutineItems)
    .filter((item) => item && !item.deletedAt)
    .sort((left, right) => (
      clean(left.period).localeCompare(clean(right.period))
      || Number(left.order ?? Number.MAX_SAFE_INTEGER) - Number(right.order ?? Number.MAX_SAFE_INTEGER)
    ));

  return `
    <section class="card" aria-labelledby="daily-dashboard-settings-title">
      <header class="card__header">
        <div>
          <h2 class="card__title" id="daily-dashboard-settings-title">Morning and evening</h2>
          <p class="card__description">Today can select a calm routine automatically from your local time.</p>
        </div>
      </header>
      <form class="card__body stack" data-daily-dashboard-form>
        <label class="field field--toggle">
          <span><span class="field__label">Show routine card</span><span class="field__hint">Only appears during the selected morning or evening period.</span></span>
          <input name="showRoutineCard" type="checkbox"${settings.showRoutineCard === false ? "" : " checked"}>
        </label>
        <div class="form-grid">
          <label class="field">
            <span class="field__label">Today mode</span>
            <select name="mode">
              ${option("auto", mode, "Automatic")}
              ${option("morning", mode, "Morning")}
              ${option("day", mode, "Day")}
              ${option("evening", mode, "Evening")}
            </select>
          </label>
          <label class="field"><span class="field__label">Morning starts</span><input name="morningStart" type="time" value="${boundaries.morningStart}"></label>
          <label class="field"><span class="field__label">Day starts</span><input name="dayStart" type="time" value="${boundaries.dayStart}"></label>
          <label class="field"><span class="field__label">Evening starts</span><input name="eveningStart" type="time" value="${boundaries.eveningStart}"></label>
        </div>
        <div class="form-actions"><button class="button button--secondary" type="submit">Save daily dashboard</button></div>
      </form>
      <div class="card__body stack">
        <div class="row-between">
          <strong>Routine items</strong>
          <button class="button button--ghost button--sm" type="button" data-action="routine/open-editor" data-kind="dailyRoutineItem">Add item</button>
        </div>
        ${items.length ? `
          <ul class="list">
            ${items.map((item) => `
              <li class="list-row" data-routine-item-id="${escapeHtml(item.id)}">
                <span class="badge">${escapeHtml(item.period || "Routine")}</span>
                <span class="list-row__content"><strong>${escapeHtml(item.title || "Untitled routine item")}</strong></span>
                <button class="button button--ghost button--sm" type="button" data-action="routine/open-editor" data-kind="dailyRoutineItem" data-id="${escapeHtml(item.id)}">Edit</button>
                <button class="button button--ghost button--sm" type="button" data-action="routine/delete-item" data-id="${escapeHtml(item.id)}">Delete</button>
              </li>
            `).join("")}
          </ul>
        ` : '<p class="empty-state">No routine items configured.</p>'}
      </div>
    </section>
  `;
}

export function bindDailyRoutine(root, actions = {}) {
  if (!root?.addEventListener) return;
  const previous = bindings.get(root);
  if (previous) previous();

  const onClick = (event) => {
    const control = event.target?.closest?.("[data-action]");
    if (!control || root.contains?.(control) === false || control.disabled) return;
    const action = control.dataset.action;
    if (!action?.startsWith("routine/")) return;
    event.preventDefault?.();

    if (action === "routine/navigate") {
      const page = clean(control.dataset.page);
      const view = clean(control.dataset.view);
      if (page && view && typeof actions.openSearchResult === "function") {
        actions.openSearchResult({ page, view });
      } else if (page) {
        actions.navigate?.(page);
      }
      return;
    }

    if (action === "routine/open-editor") {
      actions.openEditor?.(control.dataset.kind || "dailyRoutineItem", control.dataset.id || undefined);
      return;
    }
    if (action === "routine/set-mode") {
      actions.dispatch?.({ type: "ui/setTodayMode", payload: { mode: control.dataset.mode || "auto" } });
      return;
    }
    if (action === "routine/delete-item" && control.dataset.id) {
      actions.dispatch?.({ type: "dailyRoutineItem/delete", payload: { id: control.dataset.id } });
      return;
    }

    const routineItemId = clean(control.dataset.itemId);
    const date = localDateKey(control.dataset.date);
    const currentStatus = ["completed", "skipped"].includes(control.dataset.status)
      ? control.dataset.status
      : "pending";
    if (!routineItemId || !date) return;

    const status = action === "routine/toggle"
      ? currentStatus === "completed" ? "pending" : "completed"
      : action === "routine/skip"
        ? currentStatus === "skipped" ? "pending" : "skipped"
        : "";
    if (!status) return;

    const payload = {
      id: dailyRoutineLogId(routineItemId, date),
      routineItemId,
      date,
      status
    };
    if (typeof actions.setDailyRoutineStatus === "function") {
      actions.setDailyRoutineStatus(payload);
    } else {
      actions.dispatch?.({ type: "dailyRoutineLog/set", payload });
    }
  };

  root.addEventListener("click", onClick);
  const cleanup = () => {
    root.removeEventListener("click", onClick);
    bindings.delete(root);
  };
  bindings.set(root, cleanup);
  return cleanup;
}

export const render = renderDailyRoutine;
export const bind = bindDailyRoutine;
