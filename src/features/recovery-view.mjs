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

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const input = typeof value === "function" ? value() : value;
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input ?? Date.now());
  const valid = Number.isFinite(date.getTime()) ? date : new Date();
  const year = valid.getFullYear();
  const month = String(valid.getMonth() + 1).padStart(2, "0");
  const day = String(valid.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function entryDate(entry) {
  const value = entry?.date || entry?.dateKey || entry?.recordedAt || entry?.createdAt;
  return value ? dateKey(value) : "";
}

function currentEntry(state, todayKey) {
  return list(state?.healthEntries).concat(list(state?.healthCheckIns))
    .filter((entry) => entryDate(entry) && entryDate(entry) <= todayKey)
    .sort((left, right) => {
      const dateDifference = entryDate(right).localeCompare(entryDate(left));
      if (dateDifference) return dateDifference;
      return Number(right.updatedAt || right.createdAt || 0) - Number(left.updatedAt || left.createdAt || 0);
    })[0] || null;
}

function formatDate(key, ctx) {
  const [year, month, day] = String(key).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat(ctx?.locale, {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatValue(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function recoveryEvidence(entry) {
  if (!entry) return [];
  const evidence = [];
  const sleepHours = optionalNumber(entry.sleepHours);
  const sleepQuality = optionalNumber(entry.sleepQuality);
  const energy = optionalNumber(entry.energy);
  const stress = optionalNumber(entry.stress);
  const soreness = optionalNumber(entry.soreness);

  if (sleepHours !== null) evidence.push(`${formatValue(sleepHours)} hours of sleep`);
  if (sleepQuality !== null) evidence.push(`Sleep quality ${formatValue(sleepQuality)}/5`);
  if (energy !== null) evidence.push(`Energy ${formatValue(energy)}/5`);
  if (stress !== null) evidence.push(`Stress ${formatValue(stress)}/5`);
  if (soreness !== null) evidence.push(`Soreness ${formatValue(soreness)}/5`);
  return evidence;
}

function measurements(entry) {
  if (!entry) return [];
  return [
    ["Weight", optionalNumber(entry.weightKg), "kg"],
    ["Body fat", optionalNumber(entry.bodyFatPercent), "%"],
    ["Waist", optionalNumber(entry.waistCm), "cm"],
    ["Resting heart rate", optionalNumber(entry.restingHeartRate), "bpm"]
  ].filter(([, value]) => value !== null);
}

function latestLog(logs, routineId, todayKey) {
  return logs
    .filter((log) => log?.routineId === routineId && log?.date && dateKey(log.date) === todayKey)
    .sort((left, right) => Number(right.takenAt || right.createdAt || 0) - Number(left.takenAt || left.createdAt || 0))[0] || null;
}

function renderSummary(entry, evidence, ctx) {
  if (!entry || !evidence.length) {
    return `
      <section class="card" aria-labelledby="recovery-summary-title">
        <header class="card__header">
          <div>
            <h2 class="card__title" id="recovery-summary-title">Current summary</h2>
            <p class="card__description">No recovery observations have been recorded yet.</p>
          </div>
        </header>
        <div class="card__body empty-state">
          <p>Record sleep, energy, stress, or soreness to build an evidence-based summary.</p>
        </div>
      </section>
    `;
  }

  return `
    <section class="card" aria-labelledby="recovery-summary-title">
      <header class="card__header">
        <div>
          <h2 class="card__title" id="recovery-summary-title">Current summary</h2>
          <p class="card__description">Latest recorded observations from ${escapeHtml(formatDate(entryDate(entry), ctx))}.</p>
        </div>
      </header>
      <div class="card__body">
        <p>Your current recovery context is based only on the observations below.</p>
        <ul class="item-list" aria-label="Recovery evidence">
          ${evidence.map((item) => `
            <li class="list-row">
              <span class="row-content"><strong>${escapeHtml(item)}</strong></span>
            </li>
          `).join("")}
        </ul>
        ${entry.recoveryNote ? `<p class="muted">${escapeHtml(entry.recoveryNote)}</p>` : ""}
      </div>
    </section>
  `;
}

function renderMeasurements(entry, todayKey) {
  const recorded = measurements(entry);
  const valueAttribute = (field) => {
    const value = optionalNumber(entry?.[field]);
    return value === null ? "" : ` value="${escapeHtml(formatValue(value))}"`;
  };
  return `
    <section class="card" aria-labelledby="body-measurements-title">
      <header class="card__header">
        <div>
          <h2 class="card__title" id="body-measurements-title">Body measurements</h2>
          <p class="card__description">${recorded.length ? "Latest recorded measurements." : "Measurements are optional."}</p>
        </div>
      </header>
      <div class="card__body">
        ${recorded.length ? `
          <dl class="summary-grid">
            ${recorded.map(([label, value, unit]) => `
              <div>
                <dt>${escapeHtml(label)}</dt>
                <dd>${escapeHtml(formatValue(value))} ${escapeHtml(unit)}</dd>
              </div>
            `).join("")}
          </dl>
        ` : '<p class="empty-state">No body measurements recorded.</p>'}
        <details>
          <summary>Record measurements</summary>
          <form data-action="recovery/save-measurements">
            <input type="hidden" name="date" value="${escapeHtml(todayKey)}">
            <div class="form-grid">
              <label class="field"><span class="field__label">Weight (kg)</span><input name="weightKg" type="number" min="0" step="0.1"${valueAttribute("weightKg")}></label>
              <label class="field"><span class="field__label">Body fat (%)</span><input name="bodyFatPercent" type="number" min="0" max="100" step="0.1"${valueAttribute("bodyFatPercent")}></label>
              <label class="field"><span class="field__label">Waist (cm)</span><input name="waistCm" type="number" min="0" step="0.1"${valueAttribute("waistCm")}></label>
              <label class="field"><span class="field__label">Resting heart rate</span><input name="restingHeartRate" type="number" min="0" step="1"${valueAttribute("restingHeartRate")}></label>
            </div>
            <button class="button button--secondary button--sm" type="submit">Save measurements</button>
          </form>
        </details>
      </div>
    </section>
  `;
}

function renderRoutines(state, todayKey) {
  const routines = list(state?.wellnessRoutines).filter((routine) => routine.active !== false);
  const logs = list(state?.wellnessLogs);
  return `
    <details class="card" data-wellness-routines>
      <summary>Medication and supplement routines</summary>
      <div class="card__body">
        <div class="toolbar-row">
          <p class="muted">Track your own routine schedule and completion. Focus does not recommend dosages.</p>
          <button class="button button--secondary button--sm" type="button" data-action="recovery/add-routine">Add routine</button>
        </div>
        ${routines.length ? `
          <ul class="item-list">
            ${routines.map((routine) => {
              const log = latestLog(logs, routine.id, todayKey);
              const taken = Boolean(log?.taken);
              const detail = [routine.dose, routine.scheduleTime, routine.instructions].filter(Boolean).join(" · ");
              return `
                <li class="list-row" data-routine-id="${escapeHtml(routine.id)}">
                  <span class="badge${taken ? " success" : ""}">${taken ? "Logged" : escapeHtml(routine.kind || "Routine")}</span>
                  <span class="row-content">
                    <strong>${escapeHtml(routine.name || "Untitled routine")}</strong>
                    ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
                  </span>
                  <div class="toolbar-row">
                    <button class="button button--secondary button--sm" type="button" data-action="recovery/log-routine" data-date="${escapeHtml(todayKey)}" data-taken="${taken ? "false" : "true"}">${taken ? "Undo" : "Mark taken"}</button>
                    <button class="button button--ghost button--sm" type="button" data-action="recovery/edit-routine">Edit</button>
                  </div>
                </li>
              `;
            }).join("")}
          </ul>
        ` : '<p class="empty-state">No active wellness routines.</p>'}
      </div>
    </details>
  `;
}

export function render(state = {}, ctx = {}) {
  const todayKey = ctx.todayKey || dateKey(ctx.now);
  const entry = currentEntry(state, todayKey);
  const evidence = recoveryEvidence(entry);

  return `
    <section class="recovery-view" data-health-view="recovery" aria-labelledby="recovery-view-title">
      <header class="page-header">
        <div class="page-header__content">
          <p class="eyebrow">Body and recovery</p>
          <h1 class="page-header__title" id="recovery-view-title">Recovery</h1>
          <p class="page-header__description">Review what you recorded in plain observational language.</p>
        </div>
      </header>
      <div class="page-grid">
        ${renderSummary(entry, evidence, ctx)}
        ${renderMeasurements(entry, todayKey)}
      </div>
      ${renderRoutines(state, todayKey)}
      <p class="disclaimer">For personal wellness tracking only. This is not medical advice or a substitute for professional care.</p>
    </section>
  `;
}

export function bind(root, actions = {}) {
  if (!root?.addEventListener) return;
  const previous = bindings.get(root);
  if (previous) {
    root.removeEventListener("click", previous.click);
    root.removeEventListener("submit", previous.submit);
  }

  const click = (event) => {
    const control = event.target?.closest?.("[data-action]");
    if (!control || !root.contains(control) || control.disabled) return;
    const routineId = control.closest?.("[data-routine-id]")?.dataset.routineId;

    if (control.dataset.action === "recovery/add-routine") {
      actions.openEditor?.("wellnessRoutine");
    } else if (control.dataset.action === "recovery/edit-routine" && routineId) {
      actions.openEditor?.("wellnessRoutine", routineId);
    } else if (control.dataset.action === "recovery/log-routine" && routineId) {
      actions.dispatch?.({
        type: "wellness/log",
        payload: {
          routineId,
          date: control.dataset.date || root.dataset?.todayKey,
          taken: control.dataset.taken !== "false"
        }
      });
    }
  };

  const submit = (event) => {
    const form = event.target?.closest?.('[data-action="recovery/save-measurements"]');
    if (!form || !root.contains(form)) return;
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    ["weightKg", "bodyFatPercent", "waistCm", "restingHeartRate"].forEach((field) => {
      values[field] = optionalNumber(values[field]);
    });
    actions.dispatch?.({ type: "health/save", payload: values });
  };

  root.addEventListener("click", click);
  root.addEventListener("submit", submit);
  bindings.set(root, { click, submit });
}
