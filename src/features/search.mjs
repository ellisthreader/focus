import { icon } from "../ui/icons.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function searchable(value) {
  return clean(value).toLowerCase();
}

function recordResult(type, page, item, title, detail = "", view = "") {
  return {
    id: `${type}:${item.id || title}`,
    type,
    page,
    itemId: item.id || "",
    title: clean(title),
    detail: clean(detail),
    view
  };
}

export function buildSearchResults(state, query) {
  const q = searchable(query);
  const commands = [
    ["today", "Go to Today"],
    ["calendar", "Open Calendar"],
    ["tasks", "Open Tasks"],
    ["focus", "Open Focus"],
    ["health", "Open Health"],
    ["progress", "Open Progress"],
    ["finance", "Open Finance"],
    ["performance", "Open PC Performance"],
    ["timeline", "Open Timeline"],
    ["work", "Open Work"],
    ["insights", "Open Insights"],
    ["settings", "Open Settings"]
  ].map(([page, title]) => ({ id: `command:${page}`, type: "command", page, title, detail: "Navigation" }));

  const results = [
    ...commands,
    ...(state.tasks || []).map((item) => recordResult("task", "tasks", item, item.title, `${item.priority || "medium"} priority`)),
    ...(state.reminders || []).map((item) => recordResult("reminder", "tasks", item, item.title, item.dueAt)),
    ...(state.events || []).map((item) => recordResult("event", "calendar", item, item.title, item.start)),
    ...(state.workItems || []).map((item) => recordResult("work", "work", item, item.title, `${item.project || ""} ${item.summary || ""}`)),
    ...(state.habits || []).map((item) => recordResult("habit", "progress", item, item.name, `${item.frequency || ""} ${item.unit || ""}`)),
    ...(state.personalGoals || []).filter((item) => !item.deletedAt).map((item) => (
      recordResult("goal", "progress", item, item.title, `${item.area || "Goal"} · ${item.status || "active"}`, "goals")
    )),
    ...(state.goalMilestones || []).filter((item) => !item.deletedAt).map((item) => (
      recordResult("milestone", "progress", item, item.title, item.targetDate || "Goal milestone", "goals")
    )),
    ...(state.dailyRoutineItems || []).filter((item) => !item.deletedAt).map((item) => (
      recordResult("routine", "today", item, item.title, `${item.period || "routine"} routine`)
    )),
    ...(state.nutritionEntries || []).filter((item) => !item.deletedAt).map((item) => (
      recordResult("nutrition", "health", item, item.name, `${item.mealType || "meal"} · ${item.confidence || "manual"}`, "nutrition")
    )),
    ...(state.workoutSessions || []).filter((item) => !item.deletedAt).map((item) => (
      recordResult("workout", "health", item, item.name || item.activity, `${item.durationMinutes || 0} minutes`, "exercise")
    )),
    ...(state.financeEntries || []).filter((item) => !item.deletedAt).map((item) => (
      recordResult("finance", "finance", item, item.label || "Transaction", item.category || item.kind)
    )),
    ...(state.learningItems || []).filter((item) => !item.deletedAt).map((item) => (
      recordResult("learning", "progress", item, item.title, `${item.kind || "learning"} · ${item.status || "active"}`, "learning")
    )),
    ...(state.journalEntries || []).map((item) => recordResult("journal", "timeline", item, item.title, item.body))
  ];

  if (!q) {
    const navigation = results.filter((item) => item.type === "command");
    const records = results.filter((item) => item.type !== "command").slice(0, 8);
    return [...navigation, ...records];
  }
  return results
    .map((item) => {
      const title = searchable(item.title);
      const detail = searchable(item.detail);
      const score = title === q ? 100 : title.startsWith(q) ? 70 : title.includes(q) ? 50 : detail.includes(q) ? 20 : 0;
      return { ...item, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 40);
}

function resultGroup(title, id, items) {
  if (!items.length) return "";
  return `
    <section class="search-group" role="group" aria-labelledby="${id}">
      <h3 class="search-group__title" id="${id}">${title}</h3>
      <div class="search-group__items">
        ${items.map((item) => `
          <button class="search-result" type="button" role="option" aria-selected="false" tabindex="-1" data-search-result data-page="${item.page}" data-view="${item.view || ""}" data-type="${item.type}" data-id="${item.itemId}">
            ${icon(iconFor(item.type))}
            <span class="row-content"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail || item.type)}</span></span>
            ${icon("chevron", 16)}
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

export function renderSearchOverlay(state, ctx = {}) {
  const query = ctx.query || "";
  const results = buildSearchResults(state, query);
  const navigation = results.filter((item) => item.type === "command");
  const records = results.filter((item) => item.type !== "command");
  return `
    <div class="search-overlay" data-action="close-search">
      <section class="search-dialog" role="dialog" aria-modal="true" aria-labelledby="search-title" data-search-dialog>
        <h2 id="search-title" class="sr-only">Search Focus</h2>
        <div class="search-input-row">
          ${icon("search")}
          <input id="global-search-input" type="search" value="${escapeHtml(query)}" placeholder="Search or jump to..." autocomplete="off" aria-controls="search-results" aria-label="Search Focus">
          <button class="icon-button" type="button" data-action="close-search" aria-label="Close search">${icon("close")}</button>
        </div>
        <div id="search-results" class="search-results" role="listbox">
          ${results.length
            ? `${resultGroup("Navigation", "search-navigation-title", navigation)}${resultGroup("Records", "search-records-title", records)}`
            : '<div class="empty-state">No matching items.</div>'}
        </div>
      </section>
    </div>
  `;
}

export function bindSearchOverlay(root, actions) {
  const input = root?.querySelector("#global-search-input");
  root?.querySelectorAll('[data-action="close-search"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      if (event.currentTarget.classList.contains("search-overlay") && event.target !== event.currentTarget) return;
      actions.closeSearch?.();
    });
  });
  root?.querySelector("[data-search-dialog]")?.addEventListener("click", (event) => event.stopPropagation());
  input?.addEventListener("input", () => actions.setSearchQuery?.(input.value));
  input?.addEventListener("keydown", (event) => {
    const options = [...root.querySelectorAll("[data-search-result]")];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      options[event.key === "ArrowDown" ? 0 : options.length - 1]?.focus();
    }
  });
  root?.querySelectorAll("[data-search-result]").forEach((button) => {
    button.addEventListener("click", () => {
      if (typeof actions.openSearchResult === "function") {
        actions.openSearchResult({
          page: button.dataset.page,
          view: button.dataset.view,
          type: button.dataset.type,
          id: button.dataset.id
        });
      } else {
        actions.navigate?.(button.dataset.page);
      }
      actions.closeSearch?.();
    });
    button.addEventListener("keydown", (event) => {
      const options = [...root.querySelectorAll("[data-search-result]")];
      const index = options.indexOf(button);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        options[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        options[event.key === "Home" ? 0 : options.length - 1]?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        input?.focus();
      }
    });
    button.addEventListener("focus", () => {
      root.querySelectorAll("[data-search-result]").forEach((option) => {
        const active = option === button;
        option.classList.toggle("active", active);
        option.setAttribute("aria-selected", String(active));
      });
    });
    button.addEventListener("blur", () => {
      button.classList.remove("active");
      button.setAttribute("aria-selected", "false");
    });
  });
  window.setTimeout(() => input?.focus({ preventScroll: true }), 0);
}

function iconFor(type) {
  return {
    command: "spark",
    task: "check",
    reminder: "bell",
    event: "calendar",
    work: "briefcase",
    habit: "trend",
    improvement: "trend",
    journal: "timeline",
    goal: "trend",
    milestone: "trend",
    routine: "home",
    nutrition: "food",
    workout: "activity",
    finance: "wallet",
    learning: "book"
  }[type] || "search";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
