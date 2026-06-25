const bindings = new WeakMap();

const macroFields = [
  ["calories", "Calories", "kcal"],
  ["proteinGrams", "Protein", "g"],
  ["carbsGrams", "Carbs", "g"],
  ["fatGrams", "Fat", "g"],
  ["fiberGrams", "Fibre", "g"]
];

const mealGroups = [
  ["breakfast", "Breakfast"],
  ["lunch", "Lunch"],
  ["dinner", "Dinner"],
  ["snack", "Snacks"]
];

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function clean(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeUrl(value) {
  try {
    const url = new URL(clean(value));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function titleCase(value, fallback) {
  const text = clean(value).replace(/[_-]+/g, " ");
  return text ? text.replace(/\b\w/g, (letter) => letter.toUpperCase()) : fallback;
}

function todayKey(ctx) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean(ctx?.todayKey))) return clean(ctx.todayKey);
  const source = typeof ctx?.now === "function" ? ctx.now() : ctx?.now;
  const date = source instanceof Date ? source : new Date(source ?? Date.now());
  const valid = Number.isFinite(date.getTime()) ? date : new Date();
  const year = valid.getFullYear();
  const month = String(valid.getMonth() + 1).padStart(2, "0");
  const day = String(valid.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function entryDate(entry) {
  return clean(entry?.date || entry?.dateKey || entry?.recordedAt || entry?.createdAt).slice(0, 10);
}

function total(entries, field) {
  return entries.reduce((sum, entry) => sum + finite(entry?.[field]), 0);
}

function formatAmount(value, unit) {
  const amount = Math.round(finite(value) * 10) / 10;
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 1 })}${unit === "kcal" ? ` ${unit}` : unit}`;
}

function sourceLabel(item) {
  const source = clean(item?.sourceType || item?.source || item?.provider).toLowerCase();
  const known = {
    ai_estimate: "AI estimate",
    open_food_facts: "Open Food Facts",
    usda: "USDA"
  };
  return known[source] || titleCase(source, "Manual");
}

function confidenceLabel(item) {
  return clean(item?.confidence).toLowerCase() === "manual"
    ? "User entered"
    : titleCase(item?.confidence, "User entered");
}

function provenance(item) {
  const url = safeUrl(item?.sourceUrl);
  const source = escapeHtml(sourceLabel(item));
  return `
    <span class="nutrition-provenance">
      Source:
      ${url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${source}</a>`
        : `<span>${source}</span>`}
      · Confidence: <span>${escapeHtml(confidenceLabel(item))}</span>
    </span>
  `;
}

function serving(item) {
  const amount = finite(item?.servingAmount);
  const unit = clean(item?.servingUnit);
  if (!amount && !unit) return "";
  return [amount || "", unit].filter(Boolean).join(" ");
}

function renderMacroStrip(entries) {
  return `
    <dl class="nutrition-macro-strip" aria-label="Today's nutrition totals">
      ${macroFields.map(([field, label, unit]) => `
        <div class="nutrition-macro">
          <dt>${label}</dt>
          <dd>${formatAmount(total(entries, field), unit)}</dd>
        </div>
      `).join("")}
    </dl>
  `;
}

function renderGoals(entries, goals) {
  if (goals?.enabled !== true) return "";
  return `
    <details class="nutrition-goals">
      <summary>Daily goal progress</summary>
      <div class="nutrition-goal-list">
        ${macroFields.map(([field, label, unit]) => {
          const current = total(entries, field);
          const goal = finite(goals[field]);
          const percent = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
          return `
            <div class="nutrition-goal">
              <div>
                <strong>${label}</strong>
                <span>${formatAmount(current, unit)} of ${formatAmount(goal, unit)}</span>
              </div>
              <progress value="${percent}" max="100" aria-label="${label} goal progress">${percent}%</progress>
            </div>
          `;
        }).join("")}
      </div>
    </details>
  `;
}

function renderEntry(entry) {
  return `
    <li class="nutrition-entry" data-nutrition-id="${escapeHtml(entry?.id)}">
      <div class="nutrition-entry__content">
        <strong>${escapeHtml(entry?.name || "Untitled food")}</strong>
        <span>${escapeHtml(serving(entry) || "Serving not specified")}</span>
        <span>${formatAmount(entry?.calories, "kcal")} · ${formatAmount(entry?.proteinGrams, "g")} protein · ${formatAmount(entry?.carbsGrams, "g")} carbs · ${formatAmount(entry?.fatGrams, "g")} fat</span>
        ${provenance(entry)}
      </div>
      <button class="button button--ghost button--sm" type="button" data-action="nutrition/delete" data-id="${escapeHtml(entry?.id)}">Delete</button>
    </li>
  `;
}

function renderMeals(entries) {
  if (!entries.length) {
    return '<p class="empty-state">No meals logged today. Search for food or add an entry manually.</p>';
  }

  const knownTypes = new Set(mealGroups.map(([type]) => type));
  const groups = mealGroups
    .map(([type, label]) => [type, label, entries.filter((entry) => clean(entry?.mealType).toLowerCase() === type)])
    .filter(([, , items]) => items.length);
  const other = entries.filter((entry) => !knownTypes.has(clean(entry?.mealType).toLowerCase()));
  if (other.length) groups.push(["other", "Other", other]);

  return groups.map(([type, label, items]) => `
    <section class="nutrition-meal-group" aria-labelledby="nutrition-${type}-title">
      <h4 id="nutrition-${type}-title">${label}</h4>
      <ul class="item-list">${items.map(renderEntry).join("")}</ul>
    </section>
  `).join("");
}

function searchResults(ctx) {
  return list(Array.isArray(ctx?.nutritionSearch)
    ? ctx.nutritionSearch
    : ctx?.nutritionSearch?.results || ctx?.nutritionSearch?.items);
}

function resultPayload(result, date) {
  return {
    ...result,
    date: clean(result?.date) || date,
    mealType: clean(result?.mealType) || "snack"
  };
}

function encodedPayload(value) {
  return escapeHtml(JSON.stringify(value));
}

function renderSearchResults(ctx, date) {
  const results = searchResults(ctx);
  const search = ctx?.nutritionSearch;
  const loading = !Array.isArray(search) && Boolean(search?.loading);
  const error = !Array.isArray(search) ? clean(search?.error) : "";
  if (loading) return '<p class="muted" role="status">Searching nutrition sources…</p>';
  if (error) return `<p class="empty-state" role="alert">${escapeHtml(error)} Manual entry remains available.</p>`;
  if (!results.length) return "";

  return `
    <ul class="item-list nutrition-search-results" aria-label="Nutrition lookup results">
      ${results.map((result) => `
        <li class="nutrition-search-result">
          <div class="nutrition-entry__content">
            <strong>${escapeHtml(result?.name || "Unnamed result")}</strong>
            <span>${escapeHtml(serving(result) || "Serving not specified")} · ${formatAmount(result?.calories, "kcal")} · ${formatAmount(result?.proteinGrams, "g")} protein</span>
            ${provenance(result)}
          </div>
          <button class="button button--secondary button--sm" type="button" data-action="nutrition/add-result" data-payload="${encodedPayload(resultPayload(result, date))}">Add</button>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderSavedMeals(state, date) {
  if (!Object.prototype.hasOwnProperty.call(state, "savedMeals")) return "";
  const meals = list(state.savedMeals);
  return `
    <details class="nutrition-saved-meals">
      <summary>Saved meals${meals.length ? ` (${meals.length})` : ""}</summary>
      <div class="nutrition-saved-meals__body">
        ${meals.length ? `
          <ul class="item-list">
            ${meals.map((meal) => `
              <li class="nutrition-search-result">
                <div class="nutrition-entry__content">
                  <strong>${escapeHtml(meal?.name || "Untitled meal")}</strong>
                  <span>${formatAmount(meal?.calories, "kcal")} · ${formatAmount(meal?.proteinGrams, "g")} protein</span>
                  ${provenance(meal)}
                </div>
                <button class="button button--secondary button--sm" type="button" data-action="nutrition/add-result" data-payload="${encodedPayload(resultPayload(meal, date))}">Log meal</button>
              </li>
            `).join("")}
          </ul>
        ` : '<p class="empty-state">No saved meals yet.</p>'}
      </div>
    </details>
  `;
}

export function render(state = {}, ctx = {}) {
  const date = todayKey(ctx);
  const entries = list(state.nutritionEntries).filter((entry) => entryDate(entry) === date);
  const goals = state?.settings?.nutritionGoals;
  return `
    <section class="health-subview nutrition-view" data-health-view="nutrition" aria-labelledby="nutrition-title">
      <header class="health-subview__header">
        <div>
          <p class="eyebrow">Today</p>
          <h2 id="nutrition-title">Nutrition</h2>
          <p class="muted">${formatAmount(total(entries, "calories"), "kcal")} · ${formatAmount(total(entries, "proteinGrams"), "g")} protein</p>
        </div>
        <button class="button button--secondary" type="button" data-action="nutrition/manual">Add manually</button>
      </header>

      ${renderMacroStrip(entries)}
      ${renderGoals(entries, goals)}

      <section class="card nutrition-capture" aria-labelledby="nutrition-search-title">
        <header class="card__header">
          <div>
            <h3 class="card__title" id="nutrition-search-title">Find food or a meal</h3>
            <p class="card__description">Review the serving and source before adding it.</p>
          </div>
        </header>
        <div class="card__body">
          <form class="nutrition-search-form" data-nutrition-search>
            <label class="field">
              <span class="field__label">Food or meal</span>
              <input name="query" type="search" maxlength="120" required autocomplete="off" placeholder="Search foods">
            </label>
            <button class="button button--primary" type="submit">Search</button>
          </form>
          ${renderSearchResults(ctx, date)}
        </div>
      </section>

      <section class="card nutrition-meals" aria-labelledby="nutrition-meals-title">
        <header class="card__header">
          <div>
            <h3 class="card__title" id="nutrition-meals-title">Today's meals</h3>
            <p class="card__description">${entries.length} ${entries.length === 1 ? "entry" : "entries"}</p>
          </div>
        </header>
        <div class="card__body">${renderMeals(entries)}</div>
      </section>

      ${renderSavedMeals(state, date)}
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

  const submit = (event) => {
    const form = event.target?.closest?.("[data-nutrition-search]");
    if (!form || !root.contains(form)) return;
    event.preventDefault();
    const query = clean(new FormData(form).get("query"));
    if (query) actions.searchNutrition?.(query);
  };

  const click = (event) => {
    const control = event.target?.closest?.("[data-action]");
    if (!control || !root.contains(control) || control.disabled) return;
    const action = control.dataset.action;
    if (action === "nutrition/manual") {
      actions.openEditor?.("nutrition");
    } else if (action === "nutrition/delete" && control.dataset.id) {
      actions.dispatch?.({ type: "nutrition/delete", payload: { id: control.dataset.id } });
    } else if (action === "nutrition/add-result" && control.dataset.payload) {
      try {
        actions.dispatch?.({ type: "nutrition/add", payload: JSON.parse(control.dataset.payload) });
      } catch {
        // Ignore malformed DOM payloads.
      }
    }
  };

  root.addEventListener("click", click);
  root.addEventListener("submit", submit);
  bindings.set(root, { click, submit });
}
