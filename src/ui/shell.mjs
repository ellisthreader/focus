import { icon } from "./icons.mjs";

const primaryPages = ["today", "calendar", "tasks", "focus", "health", "progress", "quiz"];
const secondaryPages = ["finance", "performance", "timeline", "work", "insights"];
const createActions = {
  today: ["task", "Add task"],
  finance: ["financeEntry", "Add transaction"],
  timeline: ["journal", "Add moment"],
  work: ["work", "Add work"]
};

function navItem(page, activePage) {
  return `
    <button class="sidebar__link${page.id === activePage ? " is-active" : ""}" type="button" data-nav="${page.id}" aria-label="${page.label}" title="${page.label}"${page.id === activePage ? ' aria-current="page"' : ""}>
      ${icon(page.icon)}
      <span class="sidebar__label">${page.label}</span>
    </button>
  `;
}

export function renderShell(state, pages, options = {}) {
  const activePage = state.ui?.activePage || "today";
  const current = pages.get(activePage) || pages.get("today");
  const primary = primaryPages.map((id) => pages.get(id)).filter(Boolean);
  const secondary = secondaryPages.map((id) => pages.get(id)).filter(Boolean);
  const activeTheme = state.settings?.theme || state.theme;
  const themeIcon = activeTheme === "dark" ? "sun" : "moon";
  const themeLabel = activeTheme === "dark" ? "Use light theme" : "Use dark theme";
  const createAction = createActions[activePage];
  return `
    <div class="app-shell${options.assistantOpen ? " has-assistant-open" : ""}">
      <header class="titlebar" aria-label="Application">
        <div class="titlebar__drag">
          <span class="titlebar__title">${current?.label || "Focus"} - Focus</span>
          <span class="titlebar__status" data-app-status data-state="${options.appStatusState || "saved"}">${options.appStatus || "Local and private"}</span>
        </div>
        <div class="window-actions">
          <button class="icon-button" type="button" data-window="minimize" aria-label="Minimize window">${icon("minimize", 15)}</button>
          <button class="icon-button" type="button" data-window="maximize" aria-label="Maximize or restore window">${icon("maximize", 14)}</button>
          <button class="icon-button danger" type="button" data-window="close" aria-label="Close window">${icon("close", 16)}</button>
        </div>
      </header>

      <aside class="app-sidebar" aria-label="Primary">
        <div class="sidebar__header">
          <button class="sidebar__link" type="button" data-action="open-search" aria-label="Search" title="Search (Ctrl+K)">${icon("search")}</button>
        </div>
        <nav class="sidebar__nav" aria-label="Primary navigation">
          ${primary.map((page) => navItem(page, activePage)).join("")}
          ${secondary.length ? `
            <details class="sidebar__more"${secondary.some((page) => page.id === activePage) ? " open" : ""}>
              <summary class="sidebar__link" aria-label="More pages" title="More pages">
                ${icon("more")}
                <span class="sidebar__label">More</span>
              </summary>
              <div class="sidebar__more-menu">
                ${secondary.map((page) => navItem(page, activePage)).join("")}
              </div>
            </details>
          ` : ""}
        </nav>
        <div class="sidebar__footer">
          <button class="sidebar__link" type="button" data-action="toggle-theme" aria-label="${themeLabel}" title="${themeLabel}">${icon(themeIcon)}</button>
          ${pages.has("settings") ? navItem(pages.get("settings"), activePage) : ""}
        </div>
      </aside>

      <div class="app-content">
        <div class="top-toolbar" aria-label="Page actions">
          <div class="toolbar__start"></div>
          <div class="toolbar__end">
            <button class="button button--ghost" type="button" data-action="open-search">${icon("search")}<span>Search</span><kbd>Ctrl K</kbd></button>
            <button class="button button--ghost" type="button" data-action="toggle-assistant" aria-expanded="${Boolean(options.assistantOpen)}">${icon("spark")}<span>AI</span></button>
            ${createAction ? `<button class="button button--primary" type="button" data-action="quick-add" data-kind="${createAction[0]}">${icon("plus")}<span>${createAction[1]}</span></button>` : ""}
          </div>
        </div>
        <div class="app-workspace">
          <main id="main-content" class="page-host" tabindex="-1" aria-live="off">
            <div id="page-root"></div>
          </main>
          ${options.assistantOpen ? `
            <button class="assistant-drawer__scrim" type="button" data-action="close-assistant" aria-label="Close Focus AI"></button>
            <div class="assistant-drawer" role="dialog" aria-modal="true" aria-label="Focus AI">
              <button class="assistant-drawer__close icon-button" type="button" data-action="close-assistant" aria-label="Close Focus AI">${icon("close")}</button>
              ${options.assistant || ""}
            </div>
          ` : ""}
        </div>
      </div>
    </div>
  `;
}

export function bindShell(root, actions) {
  root.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => actions.navigate?.(button.dataset.nav));
  });
  root.querySelectorAll('[data-action="open-search"]').forEach((button) => {
    button.addEventListener("click", () => actions.openSearch?.());
  });
  root.querySelector('[data-action="toggle-theme"]')?.addEventListener("click", () => actions.toggleTheme?.());
  root.querySelector('[data-action="quick-add"]')?.addEventListener("click", (event) => actions.openEditor?.(event.currentTarget.dataset.kind || "task"));
  root.querySelector('[data-action="toggle-assistant"]')?.addEventListener("click", () => actions.toggleAssistant?.());
  root.querySelectorAll('[data-action="close-assistant"]').forEach((button) => {
    button.addEventListener("click", () => actions.closeAssistant?.());
  });
  root.querySelector('[data-window="minimize"]')?.addEventListener("click", () => window.focusDesktop?.minimize());
  root.querySelector('[data-window="maximize"]')?.addEventListener("click", () => window.focusDesktop?.maximize());
  root.querySelector('[data-window="close"]')?.addEventListener("click", () => window.focusDesktop?.close());
}
