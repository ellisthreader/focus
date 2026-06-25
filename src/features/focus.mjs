import { icon } from "../ui/icons.mjs";

export const page = Object.freeze({
  id: "focus",
  label: "Focus",
  icon: "timer"
});

const bindings = new WeakMap();

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

function nowFrom(ctx) {
  const value = typeof ctx?.now === "function" ? ctx.now() : ctx?.now;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timerFrom(state) {
  return state?.focus?.activeTimer || state?.focus?.timer || state?.timer || {};
}

function sessionsFrom(state) {
  const nested = list(state?.focus?.sessions);
  return nested.length ? nested : list(state?.sessions);
}

function activeMs(timer, now) {
  let elapsed = Math.max(0, finite(timer?.activeMs ?? timer?.elapsedMs));
  if (timer?.status === "running") {
    const resumed = finite(timer.lastResumedAt, now.getTime());
    elapsed += Math.max(0, now.getTime() - resumed);
  }
  return elapsed;
}

function goalMs(timer, state) {
  if (finite(timer?.goalMs) > 0) return finite(timer.goalMs);
  const minutes = finite(timer?.goalMinutes, finite(state?.settings?.blockGoalMinutes, 50));
  return Math.max(60000, minutes * 60000);
}

function remainingMs(timer, state, now) {
  if (finite(timer?.remainingMs, -1) >= 0) return finite(timer.remainingMs);
  if (timer?.status === "idle") return goalMs(timer, state);
  return Math.max(0, goalMs(timer, state) - activeMs(timer, now));
}

function sessionActiveMs(session) {
  if (finite(session?.activeMs, -1) >= 0) return finite(session.activeMs);
  if (finite(session?.durationMs, -1) >= 0) return finite(session.durationMs);
  const start = new Date(session?.startedAt || session?.start || 0).getTime();
  const end = new Date(session?.endedAt || session?.completedAt || 0).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
}

function formatClock(milliseconds) {
  const total = Math.max(0, Math.ceil(finite(milliseconds) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDuration(milliseconds) {
  const minutes = Math.max(0, Math.round(finite(milliseconds) / 60000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatSessionTime(value, ctx) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Recently";
  if (typeof ctx?.formatDateTime === "function") {
    try {
      return ctx.formatDateTime(date);
    } catch {
      // Fall through to a local, deterministic formatter.
    }
  }
  return new Intl.DateTimeFormat(ctx?.locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function taskContext(state, timer) {
  const task = list(state?.tasks).find((item) => item?.id && item.id === timer?.taskId);
  const project = timer?.project
    || task?.project
    || list(state?.workItems).find((item) => item?.id === task?.projectId)?.project
    || "";
  return {
    id: timer?.taskId || task?.id || "",
    title: timer?.title || timer?.task || task?.title || "",
    project
  };
}

function summaryActiveMs(state, summary, now, timer) {
  const supplied = [
    summary?.totalActiveMs,
    summary?.activeMs,
    finite(summary?.todayMinutes, -1) >= 0 ? finite(summary.todayMinutes) * 60000 : -1
  ].find((value) => finite(value, -1) >= 0);
  if (supplied !== undefined) return finite(supplied);

  const today = dateKey(now);
  const completed = sessionsFrom(state)
    .filter((session) => dateKey(session?.startedAt || session?.start) === today)
    .reduce((total, session) => total + sessionActiveMs(session), 0);
  const manual = finite(state?.manualDailyMinutes?.[today] ?? state?.focus?.manualDailyMinutes?.[today]) * 60000;
  const current = timer?.mode === "break" || ["idle", "complete"].includes(timer?.status)
    ? 0
    : activeMs(timer, now);
  return completed + manual + current;
}

function recommendations(state, ctx, model, summary) {
  const plan = ctx?.dailyPlan || summary?.dailyPlan || summary?.plan || {};
  const block = finite(
    plan.nextBlockMinutes
      ?? summary?.nextBlockMinutes
      ?? summary?.recommendedBlockMinutes
      ?? model?.suggestedGoalMinutes,
    finite(state?.settings?.blockGoalMinutes, 50)
  );
  const rest = finite(
    plan.nextBreakMinutes
      ?? summary?.nextBreakMinutes
      ?? summary?.recommendedBreakMinutes
      ?? model?.suggestedShortBreakMinutes,
    finite(state?.settings?.shortBreakMinutes, 10)
  );
  return {
    block: Math.max(5, Math.round(block)),
    rest: Math.max(1, Math.round(rest)),
    reason: plan.reason || summary?.recommendationReason || (
      finite(model?.sessionCount) >= 4
        ? "Based on your recent focus rhythm."
        : "A balanced starting point while Focus learns your rhythm."
    )
  };
}

function formatHour(value) {
  const hour = ((Math.round(finite(value)) % 24) + 24) % 24;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:00 ${suffix}`;
}

function hourWindow(items, fallback) {
  const hours = list(items).filter((item) => finite(item?.count, 1) > 0).slice(0, 2);
  return hours.length ? hours.map((item) => formatHour(item.hour)).join(", ") : fallback;
}

function statusLabel(timer) {
  const mode = timer?.mode === "break" ? "Break" : "Focus";
  if (timer?.status === "running") return `${mode} in progress`;
  if (timer?.status === "paused") return `${mode} paused`;
  if (timer?.status === "complete") return `${mode} complete`;
  return "Ready when you are";
}

function renderControls(status, recommendation) {
  const startLabel = status === "paused" ? "Resume" : "Start";
  return `
    <div class="timer-controls" aria-label="Timer controls">
      <button class="button button--primary button--lg" type="button" data-action="start-timer" data-minutes="${recommendation.block}"${["running", "complete"].includes(status) ? " disabled" : ""}>
        ${icon("play")} ${startLabel}
      </button>
      <button class="button button--secondary button--lg" type="button" data-action="pause-timer"${status !== "running" ? " disabled" : ""}>
        ${icon("pause")} Pause
      </button>
      <button class="button button--secondary button--lg" type="button" data-action="finish-timer"${status === "idle" ? " disabled" : ""}>
        ${icon(status === "complete" ? "check" : "stop")} ${status === "complete" ? "Save session" : "Finish"}
      </button>
      <button class="button button--ghost button--lg" type="button" data-action="reset-timer"${status === "idle" ? " disabled" : ""}>
        ${icon("reset")} Reset
      </button>
    </div>
  `;
}

function renderSessions(state, ctx) {
  const sessions = sessionsFrom(state)
    .filter(Boolean)
    .sort((left, right) => finite(right.endedAt || right.startedAt) - finite(left.endedAt || left.startedAt))
    .slice(0, 5);
  if (!sessions.length) {
    return `<div class="empty-state"><p>Your completed focus sessions will appear here.</p></div>`;
  }
  return `
    <ul class="session-list">
      ${sessions.map((session) => `
        <li class="session-row">
          <span class="badge">${escapeHtml(formatDuration(sessionActiveMs(session)))}</span>
          <span class="row-content">
            <strong>${escapeHtml(session.title || "Untitled focus block")}</strong>
            <span>${escapeHtml(session.project || "General")} · ${escapeHtml(formatSessionTime(session.endedAt || session.startedAt, ctx))}</span>
          </span>
          <span class="meta">${escapeHtml(finite(session.focusRating) ? `${finite(session.focusRating)}/5` : "")}</span>
        </li>
      `).join("")}
    </ul>
  `;
}

export function render(state = {}, ctx = {}) {
  const now = nowFrom(ctx);
  const timer = timerFrom(state);
  const status = ["running", "paused", "complete"].includes(timer?.status) ? timer.status : "idle";
  const model = ctx.model || state.focusModel || state.model || {};
  const summary = ctx.summary || state.focusSummary || {};
  const recommendation = recommendations(state, ctx, model, summary);
  const context = taskContext(state, timer);
  const totalGoalMs = goalMs(timer, state);
  const elapsed = Math.min(totalGoalMs, activeMs(timer, now));
  const remaining = remainingMs(timer, state, now);
  const todayActive = summaryActiveMs(state, summary, now, timer);
  const dailyGoal = Math.max(1, finite(state?.settings?.dailyGoalMinutes, 360));
  const goalPercent = Math.min(100, Math.round((todayActive / (dailyGoal * 60000)) * 100));
  const score = Math.max(0, Math.min(100, Math.round(finite(
    summary?.averageFocusScore ?? model?.averageFocusScore
  ))));
  const sessionCount = Math.max(0, Math.round(finite(summary?.sessionCount ?? model?.sessionCount)));
  const streak = Math.max(0, Math.round(finite(model?.streakDays)));
  const timerName = timer?.mode === "break" ? "Break time remaining" : "Focus time remaining";

  return `
    <main class="page page--wide focus-page" data-page="focus" data-timer-status="${escapeHtml(status)}">
      <header class="page-header">
        <div class="page-header__content">
          <p class="eyebrow">Deep work</p>
          <h1 class="page-header__title">Focus</h1>
          <p class="page-header__description">One clear block. Everything else can wait.</p>
        </div>
      </header>

      <section class="card card-accent timer-hero timer-hero--${escapeHtml(status)}" aria-labelledby="focus-timer-title">
        <div class="timer-readout">
          <p class="eyebrow" id="focus-timer-title">${escapeHtml(statusLabel(timer))}</p>
          <output role="timer" aria-live="off" aria-label="${escapeHtml(timerName)}"><strong>${formatClock(remaining)}</strong></output>
          <progress value="${Math.round(elapsed)}" max="${Math.round(totalGoalMs)}" aria-label="${escapeHtml(`${Math.round((elapsed / totalGoalMs) * 100)}% of this block complete`)}"></progress>
          <p class="meta">${escapeHtml(formatDuration(elapsed))} of ${escapeHtml(formatDuration(totalGoalMs))}</p>
        </div>
        <div class="stack">
          <div>
            <p class="eyebrow">${timer?.mode === "break" ? "Recovery block" : "Current intention"}</p>
            <h2>${escapeHtml(context.title || (timer?.mode === "break" ? "Step away and reset" : "What will you move forward?"))}</h2>
            <p class="muted">${escapeHtml(context.project || (context.title ? "No project" : "Choose a task or start with a clear intention."))}</p>
          </div>
          ${context.id ? `
            <div><button class="button button--ghost button--sm" type="button" data-action="open-editor" data-kind="task" data-id="${escapeHtml(context.id)}">Edit linked task</button></div>
          ` : ""}
          ${renderControls(status, recommendation)}
        </div>
      </section>

      <details class="card focus-details"${status === "idle" ? " open" : ""}>
        <summary class="focus-details__summary">
          <span>
            <strong>Session details</strong>
            <small>${goalPercent}% of daily goal · ${recommendation.block} minute next block</small>
          </span>
          <span class="button button--ghost button--sm" aria-hidden="true">View</span>
        </summary>
        <div class="focus-details__content">
          <div class="focus-setup-actions">
            <button class="button button--secondary" type="button" data-action="navigate" data-page="tasks">Choose a task</button>
            <button class="button button--ghost" type="button" data-action="open-editor" data-kind="task">${icon("plus")} New task</button>
          </div>

          <div class="page-grid">
            <div class="stack">
              <section class="focus-detail-section" aria-labelledby="daily-focus-title">
                <header class="card__header">
                  <div>
                    <p class="eyebrow">Today</p>
                    <h2 class="card__title" id="daily-focus-title">Daily focus goal</h2>
                  </div>
                  <strong>${goalPercent}%</strong>
                </header>
                <div class="card__body stack">
                  <progress value="${Math.min(todayActive, dailyGoal * 60000)}" max="${dailyGoal * 60000}" aria-label="${escapeHtml(`${formatDuration(todayActive)} of ${formatDuration(dailyGoal * 60000)} focused today`)}"></progress>
                  <p class="muted">${escapeHtml(formatDuration(todayActive))} focused of a ${escapeHtml(formatDuration(dailyGoal * 60000))} goal.</p>
                </div>
              </section>

              <section class="focus-detail-section" aria-labelledby="recent-sessions-title">
                <header class="card__header">
                  <h2 class="card__title" id="recent-sessions-title">Recent sessions</h2>
                  <button class="button button--ghost button--sm" type="button" data-action="navigate" data-page="timeline">View timeline</button>
                </header>
                <div class="card__body">${renderSessions(state, ctx)}</div>
              </section>
            </div>

            <aside class="stack" aria-label="Focus guidance">
              <section class="focus-detail-section" aria-labelledby="next-block-title">
                <header class="card__header">
                  <div>
                    <p class="eyebrow">Recommended next</p>
                    <h2 class="card__title" id="next-block-title">${recommendation.block} minute focus block</h2>
                  </div>
                  ${icon("spark", 20)}
                </header>
                <div class="card__body">
                  <p>${escapeHtml(recommendation.reason)}</p>
                  <p class="muted">Then take a ${recommendation.rest} minute break.</p>
                </div>
              </section>

              <section class="focus-detail-section" aria-labelledby="fingerprint-title">
                <header class="card__header">
                  <div>
                    <p class="eyebrow">Your patterns</p>
                    <h2 class="card__title" id="fingerprint-title">Focus fingerprint</h2>
                  </div>
                </header>
                <div class="card__body">
                  <dl class="metric-grid">
                    <div class="metric"><span>Focus score</span><strong>${score || "—"}</strong></div>
                    <div class="metric"><span>Sessions learned</span><strong>${sessionCount}</strong></div>
                    <div class="metric"><span>Current streak</span><strong>${streak}d</strong></div>
                    <div class="metric"><span>Best window</span><strong>${escapeHtml(hourWindow(model?.bestHours, "Learning"))}</strong></div>
                  </dl>
                  <p class="muted">Risk window: ${escapeHtml(hourWindow(model?.riskHours, "No clear risk pattern yet"))}.</p>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </details>
    </main>
  `;
}

export function bind(root, actions = {}) {
  if (!root?.addEventListener) return;
  const previous = bindings.get(root);
  if (previous) root.removeEventListener("click", previous);

  const onClick = (event) => {
    const control = event.target?.closest?.("[data-action]");
    if (!control || !root.contains(control) || control.disabled) return;
    const action = control.dataset.action;
    const id = control.dataset.id || undefined;
    event.preventDefault();

    if (action === "start-timer") {
      actions.startTimer?.({ goalMinutes: finite(control.dataset.minutes, undefined) });
    } else if (action === "pause-timer") {
      actions.pauseTimer?.();
    } else if (action === "finish-timer") {
      actions.finishTimer?.();
    } else if (action === "reset-timer") {
      actions.resetTimer?.();
    } else if (action === "open-editor") {
      actions.openEditor?.(control.dataset.kind, id);
    } else if (action === "navigate") {
      actions.navigate?.(control.dataset.page || id);
    }
  };

  root.addEventListener("click", onClick);
  bindings.set(root, onClick);
}
