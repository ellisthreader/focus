import * as nutritionView from "./nutrition-view.mjs";
import * as recoveryView from "./recovery-view.mjs";
import * as exerciseView from "./exercise-view.mjs";
import * as medicalView from "./medical-view.mjs";

export const page = {
  id: "health",
  label: "Health",
  icon: "heart"
};

const bindings = new WeakMap();
const scaleOptions = [
  [1, "Very low"],
  [2, "Low"],
  [3, "Steady"],
  [4, "Good"],
  [5, "Great"]
];

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

function optionalNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function inputValue(value) {
  const number = optionalNumber(value);
  return number === null ? "" : String(number);
}

function asDate(value) {
  const input = typeof value === "function" ? value() : value;
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input ?? Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function dateKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = asDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function previousDateKey(key, daysBack) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - daysBack);
  return dateKey(date);
}

function entriesFrom(state) {
  return list(state?.healthEntries).length
    ? list(state.healthEntries)
    : list(state?.healthCheckIns);
}

function entryDate(entry) {
  const value = entry?.date || entry?.dateKey || entry?.recordedAt || entry?.createdAt;
  return value ? dateKey(value) : "";
}

function entryFor(entries, key) {
  return entries
    .filter((entry) => entry && entryDate(entry) === key)
    .sort((left, right) => finite(right.updatedAt || right.createdAt) - finite(left.updatedAt || left.createdAt))[0] || null;
}

function formatDay(key, ctx, long = false) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat(ctx?.locale, long
    ? { weekday: "long", month: "long", day: "numeric" }
    : { weekday: "short", month: "short", day: "numeric" }).format(date);
}

function renderScale(name, label, selected) {
  return `
    <fieldset class="health-scale">
      <legend class="field__label">${escapeHtml(label)}</legend>
      <div class="health-scale-options">
        ${scaleOptions.map(([value, optionLabel]) => {
          const id = `health-${name}-${value}`;
          return `
            <label class="health-scale-option" for="${id}">
              <input
                id="${id}"
                name="${escapeHtml(name)}"
                type="radio"
                value="${value}"
                ${value === selected ? "checked" : ""}
              >
              <span class="health-scale-value" aria-hidden="true">${value}</span>
              <span class="health-scale-label">${escapeHtml(optionLabel)}</span>
            </label>
          `;
        }).join("")}
      </div>
    </fieldset>
  `;
}

function renderCheckIn(entry, key, ctx) {
  const energy = optionalNumber(entry?.energy);
  const mood = optionalNumber(entry?.mood);
  return `
    <section class="card" aria-labelledby="health-check-in-title">
      <header class="card__header">
        <div>
          <h2 class="card__title" id="health-check-in-title">Daily check-in</h2>
          <p class="card__description">${escapeHtml(formatDay(key, ctx, true))}</p>
        </div>
      </header>
      <form class="card__body health-form" data-health-form data-action="health/save">
        <input type="hidden" name="date" value="${escapeHtml(key)}">
        <div class="health-primary-fields">
          <label class="field">
            <span class="field__label">Sleep</span>
            <input name="sleepHours" type="number" min="0" max="24" step="0.25" value="${escapeHtml(inputValue(entry?.sleepHours))}" aria-describedby="sleep-hint">
            <span class="field__hint" id="sleep-hint">Hours last night</span>
          </label>
          ${renderScale("energy", "Energy", energy)}
          ${renderScale("mood", "Mood", mood)}
        </div>
        <details class="health-details">
          <summary>Water, movement, and notes</summary>
          <div class="health-details-content">
            <div class="health-secondary-fields">
              <label class="field">
                <span class="field__label">Water</span>
                <input name="waterGlasses" type="number" min="0" step="1" value="${escapeHtml(inputValue(entry?.waterGlasses))}">
                <span class="field__hint">Glasses today</span>
              </label>
              <label class="field">
                <span class="field__label">Movement</span>
                <input name="movementMinutes" type="number" min="0" max="1440" step="1" value="${escapeHtml(inputValue(entry?.movementMinutes))}">
                <span class="field__hint">Minutes today</span>
              </label>
            </div>
            <label class="field">
              <span class="field__label">Note</span>
              <textarea name="note" rows="3" maxlength="1000" placeholder="Anything worth remembering?">${escapeHtml(entry?.note)}</textarea>
            </label>
            <div class="health-quick-actions" aria-label="Quick wellness updates">
              <button class="button button--secondary button--sm" type="button" data-action="health/increment" data-date="${escapeHtml(key)}" data-field="waterGlasses" data-delta="1">+1 water</button>
              <button class="button button--secondary button--sm" type="button" data-action="health/increment" data-date="${escapeHtml(key)}" data-field="movementMinutes" data-delta="10">+10 min movement</button>
            </div>
          </div>
        </details>
        <div class="health-form-actions">
          <button class="button button--primary" type="submit">Save check-in</button>
        </div>
      </form>
    </section>
  `;
}

function summary(entry) {
  if (!entry) return ["No check-in", "Nothing recorded for this day"];
  const sleep = optionalNumber(entry.sleepHours) === null ? "" : `${entry.sleepHours}h sleep`;
  const energy = optionalNumber(entry.energy) === null ? "" : `Energy ${entry.energy}/5`;
  const mood = optionalNumber(entry.mood) === null ? "" : `Mood ${entry.mood}/5`;
  const water = optionalNumber(entry.waterGlasses) === null ? "" : `${entry.waterGlasses} water`;
  const movement = optionalNumber(entry.movementMinutes) === null ? "" : `${entry.movementMinutes} min movement`;
  const note = String(entry.note || "").trim();
  return [
    [sleep, energy, mood].filter(Boolean).join(" · ") || "Check-in saved",
    [water, movement, note].filter(Boolean).join(" · ") || "No additional detail"
  ];
}

function renderWeek(entries, todayKey, ctx) {
  const days = Array.from({ length: 7 }, (_, index) => previousDateKey(todayKey, index)).reverse();
  return `
    <section class="card" aria-labelledby="health-week-title">
      <header class="card__header">
        <div>
          <h2 class="card__title" id="health-week-title">Last 7 days</h2>
          <p class="card__description">A simple view of your recent check-ins.</p>
        </div>
      </header>
      <div class="card__body">
        <ol class="health-week-strip">
          ${days.map((key) => {
            const entry = entryFor(entries, key);
            const [primary, secondary] = summary(entry);
            return `
              <li class="health-day-summary${entry ? " has-entry" : ""}">
                <time class="badge${entry ? " success" : ""}" datetime="${escapeHtml(key)}">${escapeHtml(formatDay(key, ctx))}</time>
                <span class="health-day-copy">
                  <strong>${escapeHtml(primary)}</strong>
                  <span>${escapeHtml(secondary)}</span>
                </span>
              </li>
            `;
          }).join("")}
        </ol>
      </div>
    </section>
  `;
}

export function render(state = {}, ctx = {}) {
  const todayKey = ctx.todayKey || dateKey(ctx.now);
  const entries = entriesFrom(state);
  const todayEntry = entryFor(entries, todayKey);
  const activeView = ["checkin", "recovery", "nutrition", "exercise", "medical"].includes(state.ui?.healthView)
    ? state.ui.healthView
    : "checkin";
  const tabs = [
    ["checkin", "Check-in"],
    ["recovery", "Recovery"],
    ["nutrition", "Nutrition"],
    ["exercise", "Exercise"],
    ["medical", "Medical"]
  ];
  const panels = {
    checkin: `<div class="page-grid">${renderCheckIn(todayEntry, todayKey, ctx)}${renderWeek(entries, todayKey, ctx)}</div>`,
    recovery: recoveryView.render(state, ctx),
    nutrition: nutritionView.render(state, ctx),
    exercise: exerciseView.render(state, ctx),
    medical: medicalView.render(state, ctx)
  };
  return `
    <main class="page health-page" data-page="health">
      <header class="page-header">
        <div class="page-header__content">
          <p class="eyebrow">Personal wellbeing</p>
          <h1 class="page-header__title">Health</h1>
          <p class="page-header__description">Check in, record recovery, understand your food, track exercise, and organize private medical information.</p>
        </div>
      </header>
      <div class="domain-tabs" role="tablist" aria-label="Health views">
        ${tabs.map(([view, label]) => `
          <button
            class="domain-tab${activeView === view ? " is-active" : ""}"
            type="button"
            role="tab"
            aria-selected="${activeView === view}"
            data-action="set-health-view"
            data-view="${view}"
          >${label}</button>
        `).join("")}
      </div>
      <section class="domain-panel" data-health-panel="${activeView}">
        ${panels[activeView]}
      </section>
      <p class="disclaimer">For personal wellness tracking only. This is not medical advice or a substitute for professional care.</p>
    </main>
  `;
}

export function bind(root, actions = {}) {
  if (!root?.addEventListener) return;
  const previous = bindings.get(root);
  if (previous) {
    root.removeEventListener("click", previous.click);
    root.removeEventListener("submit", previous.submit);
  }

  const submit = (event) => {
    const form = event.target?.closest?.('[data-action="health/save"]');
    if (!form || !root.contains(form)) return;
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    ["sleepHours", "energy", "mood", "waterGlasses", "movementMinutes"].forEach((field) => {
      values[field] = optionalNumber(values[field]);
    });
    actions.dispatch?.({ type: "health/save", payload: values });
  };

  const click = (event) => {
    const control = event.target?.closest?.("[data-action]");
    if (!control || !root.contains(control) || control.disabled) return;
    if (control.dataset.action === "set-health-view") {
      actions.dispatch?.({ type: "ui/setHealthView", payload: { view: control.dataset.view } });
    } else if (control.dataset.action === "health/increment") {
      event.preventDefault();
      actions.dispatch?.({
        type: "health/increment",
        payload: {
          date: control.dataset.date,
          field: control.dataset.field,
          delta: finite(control.dataset.delta, 1)
        }
      });
    }
  };

  recoveryView.bind(root, actions);
  nutritionView.bind(root, actions);
  exerciseView.bind(root, actions);
  medicalView.bind(root, actions);
  root.addEventListener("click", click);
  root.addEventListener("submit", submit);
  bindings.set(root, { click, submit });
}
