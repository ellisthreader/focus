export const page = {
  id: "work",
  label: "Work",
  icon: "briefcase"
};

const bindings = new WeakMap();
const finishedStatuses = new Set(["archived", "cancelled", "complete", "completed", "done", "shipped"]);
const statusChoices = [
  ["active", "Active"],
  ["paused", "Paused"],
  ["done", "Done"]
];

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

function clean(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeStatus(value) {
  return clean(value, "active").toLowerCase().replace(/[\s_-]+/g, "");
}

function statusLabel(value) {
  const labels = {
    active: "Active",
    blocked: "Blocked",
    complete: "Done",
    completed: "Done",
    done: "Done",
    idea: "Idea",
    inprogress: "In progress",
    paused: "Paused",
    shipped: "Shipped",
    waiting: "Waiting"
  };
  return labels[normalizeStatus(value)] || clean(value, "Active");
}

function isActive(item) {
  return !finishedStatuses.has(normalizeStatus(item?.status));
}

function asDate(value, fallback = null) {
  const input = typeof value === "function" ? value() : value;
  if (input === null || input === undefined || input === "") return fallback;
  if (input instanceof Date) {
    return Number.isFinite(input.getTime()) ? new Date(input.getTime()) : fallback;
  }

  const numeric = Number(input);
  const date = Number.isFinite(numeric) && String(input).trim() !== ""
    ? new Date(numeric)
    : new Date(input);
  return Number.isFinite(date.getTime()) ? date : fallback;
}

function timestamp(item) {
  return asDate(item?.updatedAt ?? item?.lastUpdatedAt ?? item?.createdAt)?.getTime() ?? 0;
}

function currentDate(ctx) {
  return asDate(ctx?.now, new Date()) || new Date();
}

function formatDateTime(value, ctx) {
  const date = asDate(value);
  if (!date) return "No update time";
  if (typeof ctx?.formatDateTime === "function") {
    try {
      return ctx.formatDateTime(date);
    } catch {
      // Fall through to the local formatter.
    }
  }
  return new Intl.DateTimeFormat(ctx?.locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatRelative(value, now, ctx) {
  const date = asDate(value);
  if (!date) return "No update time";
  if (typeof ctx?.formatRelativeTime === "function") {
    try {
      const label = ctx.formatRelativeTime(date);
      if (label) return label;
    } catch {
      // Fall through to the built-in relative label.
    }
  }

  const minutes = Math.round((now.getTime() - date.getTime()) / 60000);
  if (Math.abs(minutes) < 1) return "Updated now";
  if (minutes > 0 && minutes < 60) return `Updated ${minutes} min ago`;
  if (minutes < 0 && minutes > -60) return `Updates in ${Math.abs(minutes)} min`;

  const hours = Math.round(minutes / 60);
  if (hours > 0 && hours < 24) return `Updated ${hours} hr ago`;
  if (hours < 0 && hours > -24) return `Updates in ${Math.abs(hours)} hr`;

  const days = Math.round(hours / 24);
  if (days === 1) return "Updated yesterday";
  if (days > 1 && days < 7) return `Updated ${days} days ago`;
  return `Updated ${formatDateTime(date, ctx)}`;
}

function tagsFrom(item) {
  if (Array.isArray(item?.tags)) return item.tags.map((tag) => clean(tag)).filter(Boolean);
  return clean(item?.tags)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function summaryOf(item) {
  return clean(item?.summary ?? item?.notes ?? item?.description);
}

function sortRecent(items) {
  return [...items].sort((left, right) => timestamp(right) - timestamp(left));
}

function groupProjects(items) {
  const projects = new Map();
  for (const item of items) {
    const name = clean(item?.project, "Personal");
    const existing = projects.get(name) || {
      name,
      count: 0,
      activeCount: 0,
      updatedAt: 0
    };
    existing.count += 1;
    existing.activeCount += isActive(item) ? 1 : 0;
    existing.updatedAt = Math.max(existing.updatedAt, timestamp(item));
    projects.set(name, existing);
  }
  return [...projects.values()]
    .sort((left, right) => right.activeCount - left.activeCount || right.updatedAt - left.updatedAt)
    .slice(0, 5);
}

function renderStatusButtons(item) {
  const current = finishedStatuses.has(normalizeStatus(item?.status))
    ? "done"
    : normalizeStatus(item?.status) === "paused"
      ? "paused"
      : "active";
  return statusChoices.map(([status, label]) => `
    <button
      class="button button--ghost button--sm"
      type="button"
      data-action="work/status"
      data-status="${status}"
      aria-pressed="${current === normalizeStatus(status)}"
    >${label}</button>
  `).join("");
}

function renderTags(tags) {
  if (!tags.length) return "";
  return `
    <ul class="tag-list" aria-label="Tags">
      ${tags.slice(0, 6).map((tag) => `<li class="tag">${escapeHtml(tag)}</li>`).join("")}
    </ul>
  `;
}

function renderWorkCard(item, now, ctx) {
  const id = escapeHtml(item?.id);
  const title = escapeHtml(clean(item?.title, "Untitled work"));
  const project = escapeHtml(clean(item?.project, "Personal"));
  const summary = summaryOf(item);
  const updatedAt = item?.updatedAt ?? item?.lastUpdatedAt ?? item?.createdAt;
  const updatedDate = asDate(updatedAt);
  const tags = tagsFrom(item);

  return `
    <article class="work-card" data-work-id="${id}">
      <header class="work-card__header">
        <div>
          <p class="eyebrow">${project}</p>
          <h3>${title}</h3>
        </div>
        <span class="badge work-status" data-status="${escapeHtml(normalizeStatus(item?.status))}">
          ${escapeHtml(statusLabel(item?.status))}
        </span>
      </header>
      <p class="work-card__summary">${escapeHtml(summary || "No notes yet. Add one clear next thought when you touch this again.")}</p>
      <footer class="work-card__footer">
        <time datetime="${updatedDate ? updatedDate.toISOString() : ""}" title="${escapeHtml(formatDateTime(updatedAt, ctx))}">
          ${escapeHtml(formatRelative(updatedAt, now, ctx))}
        </time>
        ${renderTags(tags)}
      </footer>
      <div class="work-card__actions" aria-label="Actions for ${title}">
        <div class="button-group" aria-label="Quick status">
          ${renderStatusButtons(item)}
        </div>
        <button class="button button--secondary button--sm" type="button" data-action="work/edit">Update</button>
        <button class="button button--ghost button--sm" type="button" data-action="work/delete">Delete</button>
      </div>
    </article>
  `;
}

function renderWorkItems(items, now, ctx) {
  if (!items.length) {
    return `
      <div class="empty-state">
        <p>No work recorded yet. Add the project or idea that is taking your attention.</p>
        <button class="button button--secondary button--sm" type="button" data-action="work/add">Add work</button>
      </div>
    `;
  }

  return `
    <div class="work-card-list">
      ${items.map((item) => renderWorkCard(item, now, ctx)).join("")}
    </div>
  `;
}

function renderProjects(projects, ctx) {
  if (!projects.length) return '<p class="empty-state">Projects will appear here as you add work.</p>';
  return `
    <ul class="item-list">
      ${projects.map((project) => `
        <li class="list-row">
          <span class="badge">${project.activeCount} active</span>
          <span class="row-content">
            <strong>${escapeHtml(project.name)}</strong>
            <span>${project.count} ${project.count === 1 ? "item" : "items"} · last updated ${escapeHtml(project.updatedAt ? formatDateTime(project.updatedAt, ctx) : "not recorded")}</span>
          </span>
        </li>
      `).join("")}
    </ul>
  `;
}

export function render(state = {}, ctx = {}) {
  const items = sortRecent(list(state?.workItems));
  const now = currentDate(ctx);
  const activeItems = items.filter(isActive);
  const finishedItems = items.filter((item) => !isActive(item));
  const orderedItems = [...activeItems, ...finishedItems];
  const projects = groupProjects(items);
  const activeCount = activeItems.length;

  return `
    <main class="page work-page" data-page="work" aria-labelledby="work-title">
      <header class="page-header">
        <div class="page-header__content">
          <p class="eyebrow">${activeCount} active</p>
          <h1 class="page-header__title" id="work-title">Work</h1>
          <p class="page-header__description">A calm record of recent personal projects, notes, and what needs attention next.</p>
        </div>
      </header>

      <section class="card work-page__items" aria-labelledby="work-items-title">
        <header class="card__header">
          <div>
            <h2 class="card__title" id="work-items-title">Work items</h2>
            <p class="card__description">${items.length} total · active work first, then completed work</p>
          </div>
        </header>
        <div class="card__body">
          ${renderWorkItems(orderedItems, now, ctx)}
        </div>
      </section>

      ${projects.length ? `
        <details class="work-projects">
          <summary>Project overview</summary>
          <div class="work-projects__body">
            <p class="muted">An aggregate view of your work, without repeating individual records.</p>
            ${renderProjects(projects, ctx)}
          </div>
        </details>
      ` : ""}
    </main>
  `;
}

export function bind(root, actions = {}) {
  if (!root?.addEventListener) return;
  const previous = bindings.get(root);
  if (previous) {
    root.removeEventListener("click", previous.click);
  }

  const click = (event) => {
    const control = event.target?.closest?.("[data-action]");
    if (!control || !root.contains(control) || control.disabled) return;

    const action = control.dataset.action;
    const workId = control.closest("[data-work-id]")?.dataset.workId;

    if (action === "work/add") {
      actions.openEditor?.("work");
    } else if (action === "work/edit" && workId) {
      actions.openEditor?.("work", workId);
    } else if (action === "work/status" && workId) {
      actions.dispatch?.({
        type: "work/status",
        payload: { id: workId, status: control.dataset.status || "active" }
      });
    } else if (action === "work/delete" && workId) {
      actions.dispatch?.({ type: "work/delete", payload: { id: workId } });
    }
  };

  root.addEventListener("click", click);
  bindings.set(root, { click });
}
