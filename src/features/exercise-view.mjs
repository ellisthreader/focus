import { dateKey, parseDateKey, startOfWeek } from "../core/date.mjs";
import {
  GYM_PROGRAM,
  GYM_PROGRAM_KEY,
  gymMuscleCoverage,
  trainingPlanRecord
} from "./gym-program.mjs";

const bindings = new WeakMap();

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
  const input = typeof ctx?.now === "function" ? ctx.now() : ctx?.now;
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input ?? Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function sessionDate(session) {
  try {
    return parseDateKey(session?.date);
  } catch {
    return null;
  }
}

function formatDate(value, ctx) {
  const date = sessionDate({ date: value });
  if (!date) return "Date not recorded";
  return new Intl.DateTimeFormat(ctx?.locale, {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatMinutes(value) {
  const minutes = Math.max(0, Math.round(finite(value)));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function sessionsThisWeek(sessions, today) {
  const start = startOfWeek(today, 1);
  const startKey = dateKey(start);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const endKey = dateKey(end);
  return sessions
    .filter((session) => session?.date >= startKey && session.date <= endKey)
    .sort((left, right) => String(right.date).localeCompare(String(left.date))
      || finite(right.createdAt) - finite(left.createdAt));
}

function personalRecords(sessions) {
  const records = [];
  const exerciseWeights = new Map();

  for (const session of sessions) {
    for (const exercise of list(session?.exercises)) {
      const name = String(exercise?.name || "").trim();
      const weight = finite(exercise?.weightKg);
      if (name && weight > 0 && weight > (exerciseWeights.get(name) || 0)) {
        exerciseWeights.set(name, weight);
      }
    }
  }

  for (const [name, weight] of exerciseWeights) {
    records.push({ label: name, value: `${weight} kg`, rank: weight });
  }

  const longestDistance = sessions.reduce((best, session) => finite(session?.distanceKm) > finite(best?.distanceKm) ? session : best, null);
  if (finite(longestDistance?.distanceKm) > 0) {
    records.push({
      label: `Longest ${longestDistance.name || longestDistance.type || "distance session"}`,
      value: `${finite(longestDistance.distanceKm)} km`,
      rank: finite(longestDistance.distanceKm)
    });
  }

  const longestDuration = sessions.reduce((best, session) => finite(session?.durationMinutes) > finite(best?.durationMinutes) ? session : best, null);
  if (finite(longestDuration?.durationMinutes) > 0) {
    records.push({
      label: `Longest ${longestDuration.name || longestDuration.type || "session"}`,
      value: formatMinutes(longestDuration.durationMinutes),
      rank: finite(longestDuration.durationMinutes)
    });
  }

  return records.sort((left, right) => right.rank - left.rank || left.label.localeCompare(right.label)).slice(0, 6);
}

function renderSessions(sessions, ctx) {
  if (!sessions.length) {
    return '<div class="empty-state"><p>No workouts logged this week.</p></div>';
  }
  return `
    <ol class="item-list">
      ${sessions.map((session) => {
        const details = [
          session.type,
          finite(session.durationMinutes) > 0 ? formatMinutes(session.durationMinutes) : "",
          finite(session.distanceKm) > 0 ? `${finite(session.distanceKm)} km` : "",
          finite(session.effort) > 0 ? `Effort ${finite(session.effort)}/5` : ""
        ].filter(Boolean);
        return `
          <li class="list-row" data-workout-id="${escapeHtml(session.id)}">
            <time class="badge" datetime="${escapeHtml(session.date)}">${escapeHtml(formatDate(session.date, ctx))}</time>
            <span class="row-content">
              <strong>${escapeHtml(session.name || "Workout")}</strong>
              ${details.length ? `<span>${escapeHtml(details.join(" · "))}</span>` : ""}
              ${session.notes ? `<span>${escapeHtml(session.notes)}</span>` : ""}
            </span>
            <button class="button button--ghost button--sm" type="button" data-action="exercise/edit-workout">Edit</button>
          </li>
        `;
      }).join("")}
    </ol>
  `;
}

function renderRecords(records) {
  return `
    <section class="card" aria-labelledby="exercise-records-title">
      <header class="card__header">
        <div>
          <h2 class="card__title" id="exercise-records-title">Personal records</h2>
          <p class="card__description">Derived from completed workout sessions.</p>
        </div>
      </header>
      <div class="card__body">
        ${records.length ? `
          <ul class="item-list">
            ${records.map((record) => `
              <li class="list-row">
                <span class="row-content"><strong>${escapeHtml(record.label)}</strong></span>
                <span class="badge success">${escapeHtml(record.value)}</span>
              </li>
            `).join("")}
          </ul>
        ` : '<p class="empty-state">Records will appear after workouts include distance, duration, or exercise weight.</p>'}
      </div>
    </section>
  `;
}

function renderPlans(plans) {
  const active = plans.filter((plan) => plan.active !== false);
  return `
    <details class="card" data-training-plans>
      <summary>Training plan${active.length ? ` (${active.length} active)` : ""}</summary>
      <div class="card__body">
        <div class="toolbar-row">
          <p class="muted">Plans store your training intent and weekly frequency.</p>
          <button class="button button--secondary button--sm" type="button" data-action="exercise/add-plan">Add plan</button>
        </div>
        ${active.length ? `
          <ul class="item-list">
            ${active.map((plan) => `
              <li class="list-row" data-plan-id="${escapeHtml(plan.id)}">
                <span class="badge">${escapeHtml(`${Math.max(0, finite(plan.weeklyTarget))} / week`)}</span>
                <span class="row-content">
                  <strong>${escapeHtml(plan.name || "Untitled plan")}</strong>
                  ${plan.goal ? `<span>${escapeHtml(plan.goal)}</span>` : ""}
                </span>
                <button class="button button--ghost button--sm" type="button" data-action="exercise/edit-plan">Edit</button>
              </li>
            `).join("")}
          </ul>
        ` : '<p class="empty-state">No active training plan.</p>'}
        <p class="disclaimer">Training plans do not provide rehabilitation or medical prescriptions.</p>
      </div>
    </details>
  `;
}

function renderGymProgram(plans) {
  const active = plans.some((plan) => !plan.deletedAt && plan.active !== false && plan.templateKey === GYM_PROGRAM_KEY);
  const coverage = gymMuscleCoverage();
  const majorMuscles = new Set([
    "Back", "Biceps", "Calves", "Chest", "Core", "Glutes",
    "Hamstrings", "Quads", "Shoulders", "Triceps"
  ]);
  const audited = coverage.filter((item) => majorMuscles.has(item.muscle));
  return `
    <section class="card gym-program" aria-labelledby="gym-program-title">
      <header class="card__header">
        <div>
          <p class="eyebrow">Four-day split</p>
          <h2 class="card__title" id="gym-program-title">${escapeHtml(GYM_PROGRAM.name)}</h2>
          <p class="card__description">${escapeHtml(GYM_PROGRAM.goal)}</p>
        </div>
        <button
          class="button button--primary"
          type="button"
          data-action="exercise/use-growth-plan"
          ${active ? "disabled" : ""}
        >${active ? "Plan active" : "Use this plan"}</button>
      </header>
      <div class="card__body stack">
        <div class="gym-program__days">
          ${GYM_PROGRAM.days.map((day, index) => `
            <details class="gym-day"${index === 0 ? " open" : ""}>
              <summary>
                <span><strong>${escapeHtml(day.name)}</strong><small>${escapeHtml(day.note)}</small></span>
                <span class="badge">${day.exercises.length} exercises</span>
              </summary>
              <div class="gym-day__content">
                <ol class="gym-exercise-list">
                  ${day.exercises.map((item) => `
                    <li class="gym-exercise">
                      <span class="gym-exercise__order" aria-hidden="true"></span>
                      <span class="row-content">
                        <strong>${escapeHtml(item.name)}</strong>
                        <span>${escapeHtml(item.primary.join(", "))}${item.secondary.length ? ` · also ${escapeHtml(item.secondary.join(", "))}` : ""}</span>
                      </span>
                      <span class="gym-exercise__prescription"><strong>${item.sets} sets</strong><span>${escapeHtml(item.reps)} reps</span></span>
                    </li>
                  `).join("")}
                </ol>
                <button class="button button--secondary button--sm" type="button" data-action="exercise/log-program-day" data-day="${escapeHtml(day.name)}">Log ${escapeHtml(day.name)}</button>
              </div>
            </details>
          `).join("")}
        </div>
        <section aria-labelledby="muscle-coverage-title">
          <div class="section-header">
            <div>
              <h3 id="muscle-coverage-title">Weekly muscle coverage</h3>
              <p class="muted">Primary sets count fully; secondary compound work counts as half a stimulating set.</p>
            </div>
          </div>
          <div class="gym-coverage-grid">
            ${audited.map((item) => `
              <article class="gym-coverage-item">
                <span>${escapeHtml(item.muscle)}</span>
                <strong>${item.stimulatingSets} sets</strong>
                <small>${item.weeklyExposures} weekly ${item.weeklyExposures === 1 ? "exposure" : "exposures"}</small>
              </article>
            `).join("")}
          </div>
        </section>
        <details class="gym-guidance">
          <summary>How to progress</summary>
          <ul>${GYM_PROGRAM.guidance.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </details>
        <p class="disclaimer">This is a general hypertrophy template, not individualized medical or rehabilitation advice. Adjust exercises around pain, injuries, equipment, experience, and qualified coaching.</p>
      </div>
    </section>
  `;
}

export function render(state = {}, ctx = {}) {
  const sessions = list(state?.workoutSessions);
  const weeklySessions = sessionsThisWeek(sessions, currentDate(ctx));
  const weeklyMinutes = weeklySessions.reduce((total, session) => total + Math.max(0, finite(session.durationMinutes)), 0);
  const weeklyLoad = weeklySessions.reduce((total, session) => {
    const minutes = Math.max(0, finite(session.durationMinutes));
    const effort = Math.max(0, finite(session.effort));
    return effort ? total + (minutes * effort) : total;
  }, 0);
  const records = personalRecords(sessions);
  const loadSummary = weeklyLoad ? ` · ${Math.round(weeklyLoad)} effort-min` : "";

  return `
    <section class="exercise-view" data-health-view="exercise" aria-labelledby="exercise-view-title">
      <header class="page-header">
        <div class="page-header__content">
          <p class="eyebrow">This week</p>
          <h1 class="page-header__title" id="exercise-view-title">Exercise</h1>
          <p class="page-header__description">${weeklySessions.length} ${weeklySessions.length === 1 ? "session" : "sessions"} · ${escapeHtml(formatMinutes(weeklyMinutes))}${escapeHtml(loadSummary)}</p>
        </div>
        <div class="page-header__actions">
          <button class="button button--primary" type="button" data-action="exercise/log-workout">Log workout</button>
        </div>
      </header>
      <div class="page-grid">
        <section class="card" aria-labelledby="exercise-sessions-title">
          <header class="card__header">
            <div>
              <h2 class="card__title" id="exercise-sessions-title">This week</h2>
              <p class="card__description">Completed sessions and recorded training time.</p>
            </div>
          </header>
          <div class="card__body">${renderSessions(weeklySessions, ctx)}</div>
        </section>
        ${renderRecords(records)}
      </div>
      ${renderGymProgram(list(state?.trainingPlans))}
      ${renderPlans(list(state?.trainingPlans))}
      <p class="muted">Recovery observations can add context to training without producing a medical warning. <button class="button button--ghost button--sm" type="button" data-action="exercise/open-recovery">Open Recovery</button></p>
    </section>
  `;
}

export function bind(root, actions = {}) {
  if (!root?.addEventListener) return;
  const previous = bindings.get(root);
  if (previous) root.removeEventListener("click", previous.click);

  const click = (event) => {
    const control = event.target?.closest?.("[data-action]");
    if (!control || !root.contains(control) || control.disabled) return;
    const action = control.dataset.action;

    if (action === "exercise/log-workout") {
      actions.openEditor?.("workout");
    } else if (action === "exercise/edit-workout") {
      const id = control.closest?.("[data-workout-id]")?.dataset.workoutId;
      if (id) actions.openEditor?.("workout", id);
    } else if (action === "exercise/add-plan") {
      actions.openEditor?.("trainingPlan");
    } else if (action === "exercise/edit-plan") {
      const id = control.closest?.("[data-plan-id]")?.dataset.planId;
      if (id) actions.openEditor?.("trainingPlan", id);
    } else if (action === "exercise/use-growth-plan") {
      actions.dispatch?.({ type: "trainingPlan/add", payload: trainingPlanRecord() });
    } else if (action === "exercise/log-program-day") {
      const day = GYM_PROGRAM.days.find((item) => item.name === control.dataset.day);
      const checklist = day?.exercises
        .map((item) => `${item.name}: ${item.sets} x ${item.reps}`)
        .join("\n");
      actions.openEditor?.("workout", "", {
        prefill: {
          name: day?.name || control.dataset.day,
          type: "strength",
          notes: checklist ? `Planned session:\n${checklist}` : ""
        }
      });
    } else if (action === "exercise/open-recovery") {
      if (typeof actions.showHealthView === "function") actions.showHealthView("recovery");
      else actions.navigate?.("health", { view: "recovery" });
    }
  };

  root.addEventListener("click", click);
  bindings.set(root, { click });
}
