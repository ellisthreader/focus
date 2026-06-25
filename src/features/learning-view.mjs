import { addDays, dateKey, parseDateKey, startOfWeek } from "../core/date.mjs";

const bindings = new WeakMap();
const ITEM_STATUSES = [
  ["active", "Active"],
  ["paused", "Paused"],
  ["completed", "Completed"]
];

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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function currentDate(ctx) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean(ctx?.todayKey))) {
    try {
      return parseDateKey(ctx.todayKey);
    } catch {
      // Fall through to the supplied clock.
    }
  }
  const value = typeof ctx?.now === "function" ? ctx.now() : ctx?.now;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function recordDate(value) {
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateKey(date) : "";
}

function weekBounds(today) {
  const start = startOfWeek(today, 1);
  return {
    start: dateKey(start),
    end: dateKey(addDays(start, 6))
  };
}

function inWeek(value, bounds) {
  const key = recordDate(value);
  return key >= bounds.start && key <= bounds.end;
}

function focusMinutes(session) {
  const activeMs = finite(session?.activeMs);
  const durationMs = finite(session?.durationMs);
  return (activeMs || durationMs) / 60000;
}

function duplicateKey(itemId, date, minutes) {
  return `${clean(itemId)}|${recordDate(date)}|${Math.round(finite(minutes))}`;
}

export function calculateWeeklyMinutes(state = {}, ctx = {}) {
  const bounds = weekBounds(currentDate(ctx));
  const logs = list(state.learningLogs).filter((log) => inWeek(log.date, bounds));
  const linkedSessions = list(state.sessions)
    .filter((session) => clean(session.learningItemId) && inWeek(session.startedAt, bounds));
  const representedIds = new Set();
  const representedSignatures = new Map();

  for (const log of logs) {
    for (const id of [log.focusSessionId, log.sessionId, log.sourceSessionId]) {
      if (clean(id)) representedIds.add(clean(id));
    }
    const key = duplicateKey(log.learningItemId, log.date, log.durationMinutes);
    representedSignatures.set(key, (representedSignatures.get(key) || 0) + 1);
  }

  let minutes = logs.reduce((sum, log) => sum + finite(log.durationMinutes), 0);
  for (const session of linkedSessions) {
    if (representedIds.has(clean(session.id))) continue;
    const sessionMinutes = focusMinutes(session);
    const key = duplicateKey(session.learningItemId, session.startedAt, sessionMinutes);
    const duplicates = representedSignatures.get(key) || 0;
    if (duplicates > 0) {
      representedSignatures.set(key, duplicates - 1);
      continue;
    }
    minutes += sessionMinutes;
  }
  return Math.round(minutes);
}

function formatMinutes(value) {
  const minutes = Math.max(0, Math.round(finite(value)));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function formatDate(value, ctx) {
  const key = recordDate(value);
  if (!key) return "Date not recorded";
  return new Intl.DateTimeFormat(ctx?.locale, {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(parseDateKey(key));
}

function itemTitle(items, id) {
  return items.find((item) => item.id === id)?.title || "";
}

function progressLabel(item) {
  const progress = finite(item?.progress);
  const target = finite(item?.target);
  const unit = clean(item?.unit);
  if (!progress && !target) return "";
  return target
    ? `${progress} of ${target}${unit ? ` ${unit}` : ""}`
    : `${progress}${unit ? ` ${unit}` : ""}`;
}

function renderStatusButtons(item) {
  return ITEM_STATUSES.map(([status, label]) => `
    <button
      class="button button--ghost button--sm"
      type="button"
      data-action="learning/status"
      data-status="${status}"
      aria-pressed="${clean(item.status) === status}"
    >${label}</button>
  `).join("");
}

function renderItem(item) {
  const details = [clean(item.kind), progressLabel(item), clean(item.source)].filter(Boolean);
  return `
    <li class="list-row" data-learning-item-id="${escapeHtml(item.id)}">
      <span class="row-content">
        <strong>${escapeHtml(item.title || "Untitled learning item")}</strong>
        ${details.length ? `<span>${escapeHtml(details.join(" · "))}</span>` : ""}
        ${item.notes ? `<span>${escapeHtml(item.notes)}</span>` : ""}
        <span>${renderStatusButtons(item)}</span>
      </span>
      <button class="button button--ghost button--sm" type="button" data-action="learning/edit-item">Edit</button>
    </li>
  `;
}

function renderRecentSessions(logs, items, ctx) {
  const recent = [...logs]
    .sort((left, right) => clean(right.date).localeCompare(clean(left.date))
      || finite(right.createdAt) - finite(left.createdAt))
    .slice(0, 6);
  if (!recent.length) return '<p class="empty-state">No study sessions logged yet.</p>';
  return `
    <ol class="item-list">
      ${recent.map((log) => {
        const linkedTitle = itemTitle(items, log.learningItemId);
        return `
          <li class="list-row" data-learning-log-id="${escapeHtml(log.id)}">
            <time class="badge" datetime="${escapeHtml(log.date)}">${escapeHtml(formatDate(log.date, ctx))}</time>
            <span class="row-content">
              <strong>${escapeHtml(log.title || linkedTitle || "Study")}</strong>
              <span>${escapeHtml(formatMinutes(log.durationMinutes))}${linkedTitle ? ` · ${escapeHtml(linkedTitle)}` : ""}</span>
              ${log.note ? `<span>${escapeHtml(log.note)}</span>` : ""}
            </span>
            <button class="button button--ghost button--sm" type="button" data-action="learning/delete-log">Delete</button>
          </li>
        `;
      }).join("")}
    </ol>
  `;
}

function renderDueReviews(notes, items, today, ctx) {
  const due = notes
    .filter((note) => note.nextReviewDate && note.nextReviewDate <= today)
    .sort((left, right) => clean(left.nextReviewDate).localeCompare(clean(right.nextReviewDate)));
  if (!due.length) return '<p class="empty-state">No reviews are due.</p>';
  return `
    <ul class="item-list">
      ${due.map((note) => `
        <li class="list-row" data-learning-note-id="${escapeHtml(note.id)}">
          <time class="badge" datetime="${escapeHtml(note.nextReviewDate)}">${escapeHtml(formatDate(note.nextReviewDate, ctx))}</time>
          <span class="row-content">
            <strong>${escapeHtml(note.title || "Untitled note")}</strong>
            ${itemTitle(items, note.learningItemId) ? `<span>${escapeHtml(itemTitle(items, note.learningItemId))}</span>` : ""}
          </span>
          <button
            class="button button--secondary button--sm"
            type="button"
            data-action="learning/complete-review"
            data-interval="${Math.max(1, Math.min(365, Math.round(finite(note.reviewIntervalDays) || 1)))}"
            data-today="${escapeHtml(today)}"
          >Complete review</button>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderNotes(notes, items) {
  return `
    <details class="card learning-notes">
      <summary>Notes${notes.length ? ` (${notes.length})` : ""}</summary>
      <div class="card__body">
        <div class="toolbar-row">
          <p class="muted">Quiz prompts open in the assistant and are not saved automatically.</p>
          <button class="button button--secondary button--sm" type="button" data-action="learning/add-note">Add note</button>
        </div>
        ${notes.length ? `
          <ul class="item-list">
            ${notes.map((note) => `
              <li class="list-row" data-learning-note-id="${escapeHtml(note.id)}">
                <span class="row-content">
                  <strong>${escapeHtml(note.title || "Untitled note")}</strong>
                  ${itemTitle(items, note.learningItemId) ? `<span>${escapeHtml(itemTitle(items, note.learningItemId))}</span>` : ""}
                  ${note.body ? `<span>${escapeHtml(note.body)}</span>` : '<span>No note text yet.</span>'}
                </span>
                <button
                  class="button button--ghost button--sm"
                  type="button"
                  data-action="learning/generate-quiz"
                  data-note-text="${escapeHtml(note.body)}"
                  ${clean(note.body) ? "" : "disabled"}
                >Generate quiz</button>
              </li>
            `).join("")}
          </ul>
        ` : '<p class="empty-state">No learning notes yet.</p>'}
      </div>
    </details>
  `;
}

function targetMinutes(state) {
  const settings = state?.settings || {};
  return finite(settings?.learning?.weeklyTargetMinutes
    ?? settings?.learning?.targetMinutes
    ?? settings.learningTargetMinutes);
}

export function render(state = {}, ctx = {}) {
  const items = list(state.learningItems);
  const logs = list(state.learningLogs);
  const notes = list(state.learningNotes);
  const active = items.filter((item) => clean(item.status) === "active");
  const other = items.filter((item) => clean(item.status) !== "active");
  const today = dateKey(currentDate(ctx));
  const weeklyMinutes = calculateWeeklyMinutes(state, ctx);
  const target = targetMinutes(state);

  return `
    <section class="progress-subview learning-view" data-progress-view="learning" aria-labelledby="learning-title">
      <header class="health-subview__header">
        <div>
          <p class="eyebrow">This week</p>
          <h2 id="learning-title">Learning</h2>
          <p class="muted">${escapeHtml(formatMinutes(weeklyMinutes))}${target ? ` of ${escapeHtml(formatMinutes(target))} target` : ""} · ${active.length} active ${active.length === 1 ? "item" : "items"}</p>
        </div>
        <div>
          <button class="button button--secondary" type="button" data-action="learning/add-item">Add item</button>
          <button class="button button--primary" type="button" data-action="learning/log-study">Log study</button>
        </div>
      </header>

      <div class="page-grid">
        <section class="card" aria-labelledby="learning-active-title">
          <header class="card__header">
            <div>
              <h3 class="card__title" id="learning-active-title">Active items</h3>
              <p class="card__description">Material currently in progress.</p>
            </div>
          </header>
          <div class="card__body">
            ${active.length ? `<ul class="item-list">${active.map(renderItem).join("")}</ul>` : '<p class="empty-state">No active learning items.</p>'}
          </div>
        </section>

        <section class="card" aria-labelledby="learning-reviews-title">
          <header class="card__header">
            <div>
              <h3 class="card__title" id="learning-reviews-title">Due reviews</h3>
              <p class="card__description">Notes scheduled for recall.</p>
            </div>
          </header>
          <div class="card__body">${renderDueReviews(notes, items, today, ctx)}</div>
        </section>
      </div>

      <section class="card" aria-labelledby="learning-sessions-title">
        <header class="card__header">
          <div>
            <h3 class="card__title" id="learning-sessions-title">Recent sessions</h3>
            <p class="card__description">Manually recorded study sessions.</p>
          </div>
        </header>
        <div class="card__body">${renderRecentSessions(logs, items, ctx)}</div>
      </section>

      ${other.length ? `
        <details class="card learning-other-items">
          <summary>Planned, paused, and completed material (${other.length})</summary>
          <div class="card__body"><ul class="item-list">${other.map(renderItem).join("")}</ul></div>
        </details>
      ` : ""}
      ${renderNotes(notes, items)}
    </section>
  `;
}

function ownerId(control, selector, key) {
  return clean(control.closest?.(selector)?.dataset?.[key]);
}

export function bind(root, actions = {}) {
  if (!root?.addEventListener) return;
  if (typeof root.querySelectorAll === "function" && typeof root.querySelector !== "function") return;
  const scope = root.matches?.('[data-progress-view="learning"]')
    ? root
    : root.querySelector?.('[data-progress-view="learning"]');
  if (typeof root.querySelector === "function" && !scope) return;
  const target = scope || root;
  const previous = bindings.get(root);
  if (previous) previous.target.removeEventListener("click", previous.click);

  const click = (event) => {
    const control = event.target?.closest?.("[data-action]");
    if (!control || !target.contains(control) || control.disabled) return;
    const action = control.dataset.action;
    const itemId = ownerId(control, "[data-learning-item-id]", "learningItemId");
    const logId = ownerId(control, "[data-learning-log-id]", "learningLogId");
    const noteId = ownerId(control, "[data-learning-note-id]", "learningNoteId");

    if (action === "learning/add-item") {
      actions.openEditor?.("learningItem");
    } else if (action === "learning/edit-item" && itemId) {
      actions.openEditor?.("learningItem", itemId);
    } else if (action === "learning/status" && itemId && clean(control.dataset.status)) {
      actions.dispatch?.({
        type: "learningItem/update",
        payload: { id: itemId, patch: { status: clean(control.dataset.status) } }
      });
    } else if (action === "learning/log-study") {
      actions.openEditor?.("learningLog");
    } else if (action === "learning/delete-log" && logId) {
      actions.dispatch?.({ type: "learningLog/delete", payload: { id: logId } });
    } else if (action === "learning/add-note") {
      actions.openEditor?.("learningNote");
    } else if (action === "learning/complete-review" && noteId) {
      const interval = Math.max(1, Math.min(365, Math.round(finite(control.dataset.interval) || 1)));
      const nextInterval = Math.min(365, interval * 2);
      const today = /^\d{4}-\d{2}-\d{2}$/.test(clean(control.dataset.today))
        ? parseDateKey(control.dataset.today)
        : currentDate();
      actions.dispatch?.({
        type: "learningNote/update",
        payload: {
          id: noteId,
          patch: {
            reviewedAt: Date.now(),
            reviewIntervalDays: nextInterval,
            nextReviewDate: dateKey(addDays(today, nextInterval))
          }
        }
      });
    } else if (action === "learning/generate-quiz" && clean(control.dataset.noteText)) {
      actions.openAssistantWithPrompt?.(
        `Generate a concise recall quiz from this learning note. Do not save the quiz automatically.\n\n${clean(control.dataset.noteText)}`
      );
    }
  };

  target.addEventListener("click", click);
  bindings.set(root, { click, target });
}
