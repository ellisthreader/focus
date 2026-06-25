import { parseDateKey } from "../core/date.mjs";

const bindings = new WeakMap();
const COMPLETE_STATUSES = new Set(["complete", "completed", "done"]);
const ACTIVE_STATUSES = new Set(["active", "in-progress", "in_progress"]);

function list(value) {
  return Array.isArray(value) ? value.filter((item) => item && !item.deletedAt) : [];
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

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedStatus(record, fallback = "active") {
  const status = clean(record?.status).toLowerCase();
  if (COMPLETE_STATUSES.has(status) || record?.completed === true || record?.completedAt) {
    return "completed";
  }
  if (status === "paused") return "paused";
  if (status === "planned") return "planned";
  return ACTIVE_STATUSES.has(status) ? "active" : fallback;
}

function progressMode(goal) {
  const mode = clean(goal?.progressMode).toLowerCase();
  return ["milestone", "milestones", "linked"].includes(mode) ? "milestones" : "manual";
}

function priorityRank(value) {
  return { high: 3, medium: 2, low: 1 }[clean(value).toLowerCase()] || 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value, locale) {
  const key = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(parseDateKey(key));
  } catch {
    return "";
  }
}

export function selectGoalMilestones(state = {}, goalId = "") {
  const id = clean(goalId);
  return list(state.goalMilestones)
    .filter((milestone) => clean(milestone.goalId) === id)
    .sort((left, right) => {
      const orderDifference = finite(left.order, Number.MAX_SAFE_INTEGER)
        - finite(right.order, Number.MAX_SAFE_INTEGER);
      if (orderDifference) return orderDifference;
      const dateDifference = clean(left.targetDate).localeCompare(clean(right.targetDate));
      if (dateDifference) return dateDifference;
      return clean(left.id).localeCompare(clean(right.id));
    });
}

export function selectGoalProgress(goal = {}, milestones = []) {
  const complete = normalizedStatus(goal) === "completed";
  const mode = progressMode(goal);

  if (mode === "milestones") {
    const records = list(milestones);
    const completedCount = records.filter(
      (milestone) => normalizedStatus(milestone, "active") === "completed"
    ).length;
    const percent = complete
      ? 100
      : records.length
        ? Math.round((completedCount / records.length) * 100)
        : 0;

    return {
      mode,
      current: completedCount,
      target: records.length,
      percent,
      label: records.length
        ? `${completedCount} of ${records.length} milestones`
        : "No milestones yet"
    };
  }

  const directPercent = Number(goal.manualProgress);
  const hasDirectPercent = Number.isFinite(directPercent);
  const target = hasDirectPercent ? 100 : Math.max(0, finite(goal.target, 100));
  const current = hasDirectPercent
    ? clamp(directPercent, 0, 100)
    : Math.max(0, finite(goal.current ?? goal.progress));
  const percent = complete
    ? 100
    : target > 0
      ? Math.round(clamp((current / target) * 100, 0, 100))
      : 0;
  const unit = clean(goal.unit ?? goal.metric);

  return {
    mode,
    current,
    target,
    percent,
    label: target > 0
      ? `${formatNumber(current)} of ${formatNumber(target)}${unit ? ` ${unit}` : ""}`
      : "Set a target to track progress"
  };
}

export function selectGoals(state = {}) {
  return list(state.personalGoals)
    .map((goal) => {
      const milestones = selectGoalMilestones(state, goal.id);
      return {
        goal,
        milestones,
        progress: selectGoalProgress(goal, milestones),
        status: normalizedStatus(goal)
      };
    })
    .sort((left, right) => {
      const statusOrder = { active: 0, planned: 1, paused: 2, completed: 3 };
      const statusDifference = (statusOrder[left.status] ?? 1) - (statusOrder[right.status] ?? 1);
      if (statusDifference) return statusDifference;
      const priorityDifference = priorityRank(right.goal.priority) - priorityRank(left.goal.priority);
      if (priorityDifference) return priorityDifference;
      const dateDifference = clean(left.goal.targetDate).localeCompare(clean(right.goal.targetDate));
      if (dateDifference) return dateDifference;
      return clean(left.goal.title).localeCompare(clean(right.goal.title));
    });
}

function renderMilestone(milestone, locale) {
  const completed = normalizedStatus(milestone, "active") === "completed";
  const due = formatDate(milestone.targetDate, locale);
  const title = clean(milestone.title) || "Untitled milestone";

  return `
    <li class="list-row" data-goal-milestone-id="${escapeHtml(milestone.id)}">
      <button
        class="icon-button"
        type="button"
        data-action="goal/toggle-milestone"
        aria-pressed="${completed}"
        aria-label="${escapeHtml(`${completed ? "Reopen" : "Complete"} milestone: ${title}`)}"
      >${completed ? "&#10003;" : "&#9675;"}</button>
      <span class="row-content">
        <strong>${escapeHtml(title)}</strong>
        ${due ? `<span>Due ${escapeHtml(due)}</span>` : ""}
      </span>
      <div class="toolbar-row">
        <button class="button button--ghost button--sm" type="button" data-action="goal/edit-milestone">Edit</button>
        <button
          class="button button--ghost button--sm"
          type="button"
          data-action="goal/delete-milestone"
          aria-label="${escapeHtml(`Delete milestone: ${title}`)}"
        >Delete</button>
      </div>
    </li>
  `;
}

function renderGoalCard(item, ctx) {
  const { goal, milestones, progress, status } = item;
  const title = clean(goal.title) || "Untitled goal";
  const due = formatDate(goal.targetDate, ctx?.locale);
  const statusLabel = status[0].toUpperCase() + status.slice(1);
  const complete = status === "completed";

  return `
    <li class="card goal-card" data-personal-goal-id="${escapeHtml(goal.id)}">
      <header class="card__header">
        <div>
          <p class="eyebrow">${escapeHtml(goal.area || statusLabel)}</p>
          <h3 class="card__title">${escapeHtml(title)}</h3>
          ${goal.description ? `<p class="card__description">${escapeHtml(goal.description)}</p>` : ""}
        </div>
        <span class="badge${complete ? " success" : ""}">${escapeHtml(statusLabel)}</span>
      </header>
      <div class="card__body">
        <div class="goal-progress">
          <div class="section-header">
            <span>${escapeHtml(progress.label)}</span>
            <strong>${progress.percent}%</strong>
          </div>
          <progress
            value="${progress.percent}"
            max="100"
            aria-label="${escapeHtml(`${title}: ${progress.percent}% complete`)}"
          >${progress.percent}%</progress>
          <p class="muted">${progress.mode === "milestones" ? "Progress is calculated from milestones." : "Progress is updated manually."}${due ? ` Target ${escapeHtml(due)}.` : ""}</p>
        </div>

        <div class="toolbar-row" aria-label="${escapeHtml(`${title} actions`)}">
          <button class="button button--secondary button--sm" type="button" data-action="goal/edit">Edit goal</button>
          <button class="button button--ghost button--sm" type="button" data-action="goal/add-milestone">Add milestone</button>
          <button
            class="button button--ghost button--sm"
            type="button"
            data-action="goal/toggle-complete"
            aria-pressed="${complete}"
          >${complete ? "Reopen goal" : "Mark complete"}</button>
          <button
            class="button button--ghost button--sm"
            type="button"
            data-action="goal/delete"
            aria-label="${escapeHtml(`Delete goal: ${title}`)}"
          >Delete</button>
        </div>

        <details class="goal-milestones"${milestones.some((milestone) => normalizedStatus(milestone, "active") !== "completed") ? " open" : ""}>
          <summary>Milestones (${milestones.length})</summary>
          ${milestones.length
            ? `<ul class="item-list">${milestones.map((milestone) => renderMilestone(milestone, ctx?.locale)).join("")}</ul>`
            : '<p class="empty-state">Break this goal into a clear next milestone.</p>'}
        </details>
      </div>
    </li>
  `;
}

export function render(state = {}, ctx = {}) {
  const goals = selectGoals(state);
  const active = goals.filter((item) => item.status !== "completed");
  const completed = goals.filter((item) => item.status === "completed");

  return `
    <section class="progress-subview goals-view" data-goals-view aria-labelledby="personal-goals-title">
      <header class="health-subview__header">
        <div>
          <p class="eyebrow">Outcomes</p>
          <h2 id="personal-goals-title">Goals</h2>
          <p class="muted">${active.length} active &middot; ${completed.length} completed</p>
        </div>
        <button class="button button--primary" type="button" data-action="goal/add">Add goal</button>
      </header>

      ${active.length
        ? `<ul class="page-grid goal-list">${active.map((item) => renderGoalCard(item, ctx)).join("")}</ul>`
        : '<p class="empty-state">No active goals. Add one meaningful outcome and define the next milestone.</p>'}

      ${completed.length ? `
        <details class="card goal-completed">
          <summary>Completed goals (${completed.length})</summary>
          <div class="card__body">
            <ul class="page-grid goal-list">${completed.map((item) => renderGoalCard(item, ctx)).join("")}</ul>
          </div>
        </details>
      ` : ""}
    </section>
  `;
}

function ownerId(control, selector, key) {
  return clean(control.closest?.(selector)?.dataset?.[key]);
}

export function bind(root, actions = {}) {
  if (!root?.addEventListener) return;
  if (typeof root.querySelectorAll === "function" && typeof root.querySelector !== "function") return;
  const scope = root.matches?.("[data-goals-view]")
    ? root
    : root.querySelector?.("[data-goals-view]");
  if (typeof root.querySelector === "function" && !scope) return;
  const target = scope || root;
  const previous = bindings.get(root);
  if (previous) previous.target.removeEventListener("click", previous.click);

  const click = (event) => {
    const control = event.target?.closest?.("[data-action]");
    if (!control || !target.contains(control) || control.disabled) return;
    const action = clean(control.dataset.action);
    const goalId = ownerId(control, "[data-personal-goal-id]", "personalGoalId");
    const milestoneId = ownerId(control, "[data-goal-milestone-id]", "goalMilestoneId");

    if (action === "goal/add") {
      actions.openEditor?.("personalGoal");
    } else if (action === "goal/edit" && goalId) {
      actions.openEditor?.("personalGoal", goalId);
    } else if (action === "goal/delete" && goalId) {
      actions.dispatch?.({ type: "personalGoal/delete", payload: { id: goalId } });
    } else if (action === "goal/toggle-complete" && goalId) {
      const completed = control.getAttribute?.("aria-pressed") === "true";
      actions.dispatch?.({
        type: "goal/setStatus",
        payload: { id: goalId, status: completed ? "active" : "completed" }
      });
    } else if (action === "goal/add-milestone" && goalId) {
      actions.openEditor?.("goalMilestone", "", { parentId: goalId });
    } else if (action === "goal/edit-milestone" && milestoneId) {
      actions.openEditor?.("goalMilestone", milestoneId);
    } else if (action === "goal/delete-milestone" && milestoneId) {
      actions.dispatch?.({ type: "goalMilestone/delete", payload: { id: milestoneId } });
    } else if (action === "goal/toggle-milestone" && milestoneId) {
      const completed = control.getAttribute?.("aria-pressed") === "true";
      actions.dispatch?.({
        type: "goalMilestone/complete",
        payload: { id: milestoneId, completed: !completed }
      });
    }
  };

  target.addEventListener("click", click);
  bindings.set(root, { click, target });
}
