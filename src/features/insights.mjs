import { buildWeeklyReviewSnapshot } from "../core/weekly-review.mjs";

export const page = {
  id: "insights",
  label: "Insights",
  icon: "spark"
};

const bindings = new WeakMap();
const COMPLETE_STATUSES = new Set(["complete", "completed", "done", "archived"]);
const CANCELLED_STATUSES = new Set(["cancelled", "canceled"]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function asDate(value) {
  const input = typeof value === "function" ? value() : value;
  if (input === null || input === undefined || input === "") return null;
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  return Number.isFinite(date.getTime()) ? date : null;
}

function nowFrom(ctx) {
  return asDate(ctx?.now) || new Date();
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

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function sessionsFrom(state) {
  const nested = list(state?.focus?.sessions);
  return nested.length ? nested : list(state?.sessions);
}

function sessionStart(session) {
  return asDate(session?.startedAt ?? session?.start ?? session?.createdAt);
}

function sessionRating(session) {
  const rating = finite(session?.focusRating ?? session?.rating);
  return rating === null ? null : clamp(rating, 1, 5);
}

function average(values) {
  const usable = values.filter((value) => finite(value) !== null).map(Number);
  return usable.length
    ? usable.reduce((total, value) => total + value, 0) / usable.length
    : null;
}

function focusInsight(state, model) {
  const sessions = sessionsFrom(state);
  const ratings = sessions.map(sessionRating).filter((value) => value !== null);
  const modeledScore = finite(model?.averageFocusScore);
  const modeledCount = finite(model?.sessionCount);
  const hasModeledHistory = modeledCount === null ? ratings.length > 0 : modeledCount > 0;

  if (modeledScore !== null && hasModeledHistory) {
    const count = Math.max(0, Math.round(modeledCount ?? ratings.length));
    return {
      value: `${Math.round(clamp(modeledScore, 0, 100))}/100`,
      detail: count
        ? `Local focus model summary from ${count} ${count === 1 ? "session" : "sessions"}.`
        : "Local focus model summary; more sessions will make it easier to interpret.",
      available: count > 0,
      strength: count
    };
  }

  const rating = average(ratings);
  if (rating === null) {
    return {
      value: "Not enough data",
      detail: "Rate completed focus sessions to establish a baseline.",
      available: false,
      strength: 0
    };
  }

  return {
    value: `${Math.round((rating / 5) * 100)}/100`,
    detail: `Average of ${ratings.length} self-rated ${ratings.length === 1 ? "session" : "sessions"}, scaled from 1-5.`,
    available: true,
    strength: ratings.length
  };
}

function formatHour(hour, ctx) {
  const safeHour = ((Math.floor(hour) % 24) + 24) % 24;
  const date = new Date(2020, 0, 1, safeHour);
  return new Intl.DateTimeFormat(ctx?.locale, { hour: "numeric" }).format(date);
}

function bestTimeInsight(state, model, ctx) {
  const modeled = list(model?.bestHours).find((item) => (
    finite(item?.hour) !== null && finite(item?.count, 1) > 0
  ));
  if (modeled) {
    const hour = finite(modeled.hour, 0);
    const count = Math.max(1, Math.round(finite(modeled.count, 1)));
    if (count < 2) {
      return {
        value: "Still learning",
        detail: "Complete another rated session in this time window before treating it as a pattern.",
        available: false,
        strength: count
      };
    }
    return {
      value: `${formatHour(hour, ctx)} to ${formatHour(hour + 1, ctx)}`,
      detail: `Strongest window in the local focus model, observed across ${count} sessions.`,
      available: true,
      strength: count
    };
  }

  const groups = new Map();
  sessionsFrom(state).forEach((session) => {
    const start = sessionStart(session);
    const rating = sessionRating(session);
    if (!start || rating === null) return;
    const period = Math.floor(start.getHours() / 3) * 3;
    const group = groups.get(period) || [];
    group.push(rating);
    groups.set(period, group);
  });
  const candidates = [...groups.entries()]
    .filter(([, ratings]) => ratings.length >= 2)
    .sort((left, right) => average(right[1]) - average(left[1]));

  if (!candidates.length) {
    return {
      value: "Still learning",
      detail: "Complete at least two rated sessions in a similar time window.",
      available: false,
      strength: 0
    };
  }

  const [hour, ratings] = candidates[0];
  return {
    value: `${formatHour(hour, ctx)} to ${formatHour(hour + 3, ctx)}`,
    detail: `Highest average self-rating among time windows with at least two sessions (${ratings.length} observed).`,
    available: true,
    strength: ratings.length
  };
}

function taskInsight(state) {
  const tasks = list(state?.tasks).filter((task) => (
    !CANCELLED_STATUSES.has(String(task?.status || "").toLowerCase())
  ));
  const completed = tasks.filter((task) => (
    Boolean(task?.completed)
    || COMPLETE_STATUSES.has(String(task?.status || "").toLowerCase())
  )).length;

  if (!tasks.length) {
    return {
      value: "No tasks yet",
      detail: "Task completion will appear after you add work.",
      available: false,
      strength: 0
    };
  }

  return {
    value: `${Math.round((completed / tasks.length) * 100)}%`,
    detail: `${completed} of ${tasks.length} tracked ${tasks.length === 1 ? "task is" : "tasks are"} marked complete.`,
    available: true,
    strength: tasks.length
  };
}

function habitScheduled(habit, date) {
  const frequency = String(habit?.frequency || "daily").toLowerCase();
  if (frequency === "weekdays") return date.getDay() > 0 && date.getDay() < 6;
  return frequency !== "weekly";
}

function habitInsight(state, now) {
  const habits = list(state?.habits);
  if (!habits.length) {
    return {
      value: "No habits yet",
      detail: "Add one repeatable habit to begin measuring consistency.",
      available: false,
      strength: 0
    };
  }

  const days = Array.from({ length: 7 }, (_, index) => addDays(now, index - 6));
  const totals = habits.reduce((result, habit) => {
    const entries = habit?.entries && typeof habit.entries === "object" ? habit.entries : {};
    const target = Math.max(1, finite(habit?.target, 1));
    const createdAt = asDate(habit?.createdAt);
    const createdKey = dateKey(createdAt);
    const frequency = String(habit?.frequency || "daily").toLowerCase();

    if (frequency === "weekly") {
      const eligible = days.some((day) => !createdKey || dateKey(day) >= createdKey);
      if (!eligible) return result;
      const total = days.reduce((sum, day) => sum + Math.max(0, finite(entries[dateKey(day)], 0)), 0);
      result.expected += 1;
      if (total >= target) result.completed += 1;
      return result;
    }

    days.forEach((day) => {
      if ((createdKey && dateKey(day) < createdKey) || !habitScheduled(habit, day)) return;
      result.expected += 1;
      if (finite(entries[dateKey(day)], 0) >= target) result.completed += 1;
    });
    return result;
  }, { completed: 0, expected: 0 });

  if (!totals.expected) {
    return {
      value: "Not scheduled",
      detail: "There were no scheduled habit check-ins in the last seven days.",
      available: false,
      strength: 0
    };
  }

  return {
    value: `${Math.round((totals.completed / totals.expected) * 100)}%`,
    detail: `${totals.completed} of ${totals.expected} scheduled check-ins reached their target in the last seven days.`,
    available: true,
    strength: totals.expected
  };
}

function healthEntriesFrom(state) {
  const primary = list(state?.healthEntries);
  return primary.length ? primary : list(state?.healthCheckIns);
}

function healthDate(entry) {
  return dateKey(entry?.date ?? entry?.dateKey ?? entry?.recordedAt ?? entry?.createdAt);
}

function energyInsight(state) {
  const energyByDate = new Map();
  healthEntriesFrom(state).forEach((entry) => {
    const key = healthDate(entry);
    const energy = finite(entry?.energy);
    if (key && energy !== null && energy >= 1 && energy <= 5) energyByDate.set(key, energy);
  });

  const observations = sessionsFrom(state).flatMap((session) => {
    const key = dateKey(sessionStart(session));
    const rating = sessionRating(session);
    const energy = energyByDate.get(key);
    return key && rating !== null && energy !== undefined ? [{ energy, rating }] : [];
  });
  const higher = observations.filter((item) => item.energy >= 4).map((item) => item.rating);
  const lower = observations.filter((item) => item.energy < 4).map((item) => item.rating);

  if (higher.length < 2 || lower.length < 2) {
    return {
      value: "Not enough paired data",
      detail: `${observations.length} focus ${observations.length === 1 ? "session matches" : "sessions match"} a same-day energy check-in; at least two in each group are needed.`,
      available: false,
      strength: observations.length
    };
  }

  const highAverage = average(higher);
  const lowAverage = average(lower);
  const difference = highAverage - lowAverage;
  const direction = Math.abs(difference) < 0.25
    ? "Focus ratings were similar"
    : difference > 0
      ? `Focus ratings were ${difference.toFixed(1)} points higher`
      : `Focus ratings were ${Math.abs(difference).toFixed(1)} points lower`;

  return {
    value: `${highAverage.toFixed(1)} vs ${lowAverage.toFixed(1)}`,
    detail: `${direction} on higher-energy days (${higher.length} vs ${lower.length} sessions). This is an observed association, not evidence of causation.`,
    available: true,
    strength: observations.length
  };
}

function reflectionPrompt(task, habit, bestTime) {
  if (task.value.endsWith("%") && Number.parseInt(task.value, 10) < 50) {
    return "Which unfinished commitments still matter, and which should you remove or defer next week?";
  }
  if (habit.value.endsWith("%") && Number.parseInt(habit.value, 10) < 60) {
    return "What made your habits easier or harder to keep, and what is one adjustment for next week?";
  }
  if (!["Still learning", "Not enough data"].includes(bestTime.value)) {
    return `What helped you focus around ${bestTime.value}, and how could you protect that time next week?`;
  }
  return "What gave you momentum this week, what drained it, and what will you change next week?";
}

function renderHeadline(insight) {
  return `
    <section class="insight-headline" aria-labelledby="insight-headline-title">
      <p class="eyebrow">Headline insight</p>
      <h2 id="insight-headline-title">${escapeHtml(insight.title)}</h2>
      <strong>${escapeHtml(insight.value)}</strong>
      <p>${escapeHtml(insight.detail)}</p>
    </section>
  `;
}

function renderSupporting(insights) {
  if (!insights.length) return "";
  return `
    <section class="insight-support" aria-labelledby="insight-support-title">
      <header class="section-heading">
        <h2 id="insight-support-title">Supporting patterns</h2>
        <p>Useful context backed by the information recorded so far.</p>
      </header>
      <div class="insight-summary-grid">
        ${insights.map((insight) => `
          <article class="insight-summary">
            <h3>${escapeHtml(insight.title)}</h3>
            <strong>${escapeHtml(insight.value)}</strong>
            <p>${escapeHtml(insight.detail)}</p>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function formatMinutes(value) {
  const minutes = Math.max(0, Math.round(finite(value, 0)));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatMoney(amountMinor, currency, locale) {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(finite(amountMinor, 0) / 100);
  } catch {
    return `${currency} ${(finite(amountMinor, 0) / 100).toFixed(2)}`;
  }
}

function deltaLabel(current, previous, suffix = "") {
  const difference = finite(current, 0) - finite(previous, 0);
  if (!difference) return "No change from last week";
  return `${difference > 0 ? "+" : ""}${Math.round(difference)}${suffix} from last week`;
}

function weeklyMetric(title, value, detail) {
  return `
    <article class="insight-summary">
      <h3>${escapeHtml(title)}</h3>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(detail)}</p>
    </article>
  `;
}

function renderFinanceReview(finance, previous, ctx) {
  if (!finance?.entries) return "";
  const values = finance.currencies.map((item) => (
    formatMoney(item.balanceMinor, item.currency, ctx?.locale)
  ));
  return weeklyMetric(
    "Recorded cash flow",
    values.join(" · "),
    finance.mixedCurrencies
      ? `${finance.entries} entries; currencies remain separate and are not converted.`
      : `${finance.entries} entries, compared with ${previous?.entries || 0} last week.`
  );
}

function renderWeeklyReview(snapshot, ctx) {
  const current = snapshot.current;
  const previous = snapshot.previous;
  const encodedSnapshot = encodeURIComponent(JSON.stringify(snapshot));
  const habitValue = current.habits.rate === null ? "No scheduled habits" : `${current.habits.rate}%`;
  const metrics = [
    weeklyMetric(
      "Completed tasks",
      String(current.tasks.completed),
      deltaLabel(current.tasks.completed, previous.tasks.completed)
    ),
    weeklyMetric(
      "Focus time",
      formatMinutes(current.focus.minutes),
      `${current.focus.sessions} sessions; ${deltaLabel(current.focus.minutes, previous.focus.minutes, "m")}.`
    ),
    weeklyMetric(
      "Habit consistency",
      habitValue,
      current.habits.expected
        ? `${current.habits.completed} of ${current.habits.expected} scheduled targets reached.`
        : "No habit targets were scheduled in the observed period."
    ),
    weeklyMetric(
      "Goal milestones",
      String(current.milestones.completed),
      deltaLabel(current.milestones.completed, previous.milestones.completed)
    )
  ];
  if (current.nutrition?.entries) {
    metrics.push(weeklyMetric(
      "Nutrition records",
      String(current.nutrition.entries),
      `${current.nutrition.calories} kcal and ${current.nutrition.proteinGrams}g protein recorded.`
    ));
  }
  if (current.exercise?.sessions) {
    metrics.push(weeklyMetric(
      "Exercise",
      formatMinutes(current.exercise.minutes),
      `${current.exercise.sessions} recorded ${current.exercise.sessions === 1 ? "session" : "sessions"}.`
    ));
  }
  if (current.learning?.sessions) {
    metrics.push(weeklyMetric(
      "Learning",
      formatMinutes(current.learning.minutes),
      `${current.learning.sessions} recorded ${current.learning.sessions === 1 ? "session" : "sessions"}.`
    ));
  }
  const finance = renderFinanceReview(current.finance, previous.finance, ctx);
  if (finance) metrics.push(finance);
  const ai = ctx?.weeklyReviewAi || {};
  const aiMarkup = ai.status === "loading"
    ? '<p role="status">Generating a read-only review from this snapshot...</p>'
    : ai.status === "error"
      ? `<p role="alert">${escapeHtml(ai.error || "The AI review could not be generated.")}</p>`
      : ai.status === "ready" && ai.result?.message
        ? `<section class="weekly-ai-review" aria-labelledby="weekly-ai-review-title"><h3 id="weekly-ai-review-title">AI narrative</h3><p>${escapeHtml(ai.result.message)}</p></section>`
        : "";

  return `
    <section
      id="insights-panel-weekly"
      role="tabpanel"
      aria-labelledby="insights-tab-weekly"
      data-insights-panel="weekly"
      hidden
    >
      <section class="card insight-callout" aria-labelledby="weekly-review-title">
        <header class="card__header">
          <div>
            <p class="eyebrow">${escapeHtml(current.range.start)} to ${escapeHtml(current.range.end)}</p>
            <h2 class="card__title" id="weekly-review-title">Weekly review</h2>
            <p class="card__description">Deterministic totals from records dated through ${escapeHtml(current.range.observationEnd)}.</p>
          </div>
          <button
            class="button button--primary"
            type="button"
            data-action="generate-weekly-review"
            data-weekly-review-snapshot="${escapeHtml(encodedSnapshot)}"
          >Generate AI review</button>
        </header>
        <div class="card__body stack">
          <div class="insight-summary-grid">${metrics.join("")}</div>
          <section aria-labelledby="weekly-coverage-title">
            <h3 id="weekly-coverage-title">Data coverage: ${escapeHtml(snapshot.dataCoverage.level)}</h3>
            <p>${snapshot.dataCoverage.score}% coverage across ${snapshot.dataCoverage.observedDays} of ${snapshot.dataCoverage.elapsedDays} elapsed days and ${snapshot.dataCoverage.availableDomains.length} recorded areas.</p>
          </section>
          <details>
            <summary>Review limitations</summary>
            <ul>${snapshot.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </details>
          ${aiMarkup}
        </div>
      </section>
    </section>
  `;
}

export function render(state = {}, ctx = {}) {
  const model = ctx?.model && typeof ctx.model === "object" ? ctx.model : {};
  const now = nowFrom(ctx);
  const focus = focusInsight(state, model);
  const bestTime = bestTimeInsight(state, model, ctx);
  const task = taskInsight(state);
  const habit = habitInsight(state, now);
  const energy = energyInsight(state);
  const prompt = reflectionPrompt(task, habit, bestTime);
  const candidates = [
    { title: "Focus score", ...focus },
    { title: "Best focus time", ...bestTime },
    { title: "Energy and focus", ...energy },
    { title: "Task completion", ...task },
    { title: "Habit consistency", ...habit }
  ];
  const available = candidates.filter((insight) => insight.available);
  const headline = available[0] || null;
  const supporting = available.filter((insight) => insight !== headline).slice(0, 3);
  const weeklySnapshot = buildWeeklyReviewSnapshot(state, { now });

  return `
    <main class="page insights-page" data-page="insights" aria-labelledby="insights-title">
      <header class="page-header">
        <div class="page-header__content">
          <p class="eyebrow">Observed patterns</p>
          <h1 class="page-header__title" id="insights-title">Insights</h1>
          <p class="page-header__description">Plain-language summaries of the information you have recorded.</p>
        </div>
      </header>

      <div class="tab-list" role="tablist" aria-label="Insights views">
        <button class="tab is-active" id="insights-tab-overview" type="button" role="tab" aria-controls="insights-panel-overview" aria-selected="true" tabindex="0" data-action="switch-insights-view" data-view="overview">Overview</button>
        <button class="tab" id="insights-tab-weekly" type="button" role="tab" aria-controls="insights-panel-weekly" aria-selected="false" tabindex="-1" data-action="switch-insights-view" data-view="weekly">Weekly review</button>
      </div>

      <section id="insights-panel-overview" role="tabpanel" aria-labelledby="insights-tab-overview" data-insights-panel="overview">
        ${headline
          ? `${renderHeadline(headline)}${renderSupporting(supporting)}`
          : `<section class="insights-empty empty-state"><p>Record a few focus sessions, tasks, or habits to reveal meaningful patterns.</p></section>`}

        <section class="card insight-callout" aria-labelledby="reflection-title">
          <header class="card__header">
            <div>
              <p class="eyebrow">This week</p>
              <h2 class="card__title" id="reflection-title">Reflection prompt</h2>
            </div>
          </header>
          <div class="card__body stack">
            <blockquote>
              <p>${escapeHtml(prompt)}</p>
            </blockquote>
            <div>
              <button class="button button--primary" type="button" data-action="open-editor" data-kind="reflection">Write reflection</button>
            </div>
          </div>
        </section>
      </section>

      ${renderWeeklyReview(weeklySnapshot, ctx)}

      <p class="disclaimer">Insights describe recorded patterns only. They do not establish causes or provide medical advice.</p>
    </main>
  `;
}

export function bind(root, actions = {}) {
  if (!root?.addEventListener) return;
  const previous = bindings.get(root);
  if (previous) {
    root.removeEventListener("click", previous.click);
    root.removeEventListener("keydown", previous.keydown);
  }

  const switchView = (selected, focus = false) => {
    const view = selected?.dataset?.view;
    if (!["overview", "weekly"].includes(view)) return;
    const tabs = [...(root.querySelectorAll?.('[role="tab"][data-view]') || [])];
    const panels = [...(root.querySelectorAll?.("[data-insights-panel]") || [])];
    tabs.forEach((tab) => {
      const active = tab.dataset.view === view;
      tab.setAttribute("aria-selected", String(active));
      tab.classList.toggle("is-active", active);
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.insightsPanel !== view;
    });
    if (focus) selected.focus?.({ preventScroll: true });
  };

  const onClick = (event) => {
    const control = event.target?.closest?.("[data-action]");
    if (!control || !root.contains(control) || control.disabled) return;
    event.preventDefault();
    if (control.dataset.action === "open-editor") {
      actions.openEditor?.(control.dataset.kind || "reflection", control.dataset.id || "");
    } else if (control.dataset.action === "switch-insights-view") {
      switchView(control);
    } else if (control.dataset.action === "generate-weekly-review") {
      try {
        const snapshot = JSON.parse(decodeURIComponent(control.dataset.weeklyReviewSnapshot || ""));
        actions.generateWeeklyReview?.(snapshot);
      } catch {
        // Ignore malformed DOM data rather than sending an incomplete AI review.
      }
    }
  };

  const onKeydown = (event) => {
    const selected = event.target?.closest?.('[role="tab"][data-view]');
    if (!selected || !root.contains(selected)) return;
    const tabs = [...(root.querySelectorAll?.('[role="tab"][data-view]') || [])];
    const index = tabs.indexOf(selected);
    if (index < 0) return;
    const nextIndex = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1
    }[event.key];
    if (nextIndex === undefined) return;
    event.preventDefault();
    switchView(tabs[nextIndex], true);
  };

  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown);
  bindings.set(root, { click: onClick, keydown: onKeydown });
}
