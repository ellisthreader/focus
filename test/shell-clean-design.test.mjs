import test from "node:test";
import assert from "node:assert/strict";
import { renderShell } from "../src/ui/shell.mjs";

const pageDefinitions = [
  ["today", "Today", "home"],
  ["calendar", "Calendar", "calendar"],
  ["tasks", "Tasks", "check"],
  ["focus", "Focus", "timer"],
  ["health", "Health", "heart"],
  ["progress", "Progress", "trend"],
  ["performance", "PC Performance", "monitor"],
  ["timeline", "Timeline", "timeline"],
  ["work", "Work", "briefcase"],
  ["insights", "Insights", "spark"],
  ["settings", "Settings", "settings"]
];

function pages() {
  return new Map(pageDefinitions.map(([id, label, icon]) => [id, { id, label, icon }]));
}

test("shell keeps core tabs visible and places secondary destinations under More", () => {
  const html = renderShell({
    ui: { activePage: "today" },
    settings: { theme: "light" }
  }, pages());

  assert.match(html, /data-nav="today"/);
  assert.match(html, /data-nav="progress"/);
  assert.match(html, /class="sidebar__more"/);
  assert.match(html, /data-nav="performance"/);
  assert.match(html, /data-nav="timeline"/);
  assert.match(html, /data-nav="work"/);
  assert.match(html, /data-nav="insights"/);
});

test("shell exposes one contextual create action and keeps AI closed by default", () => {
  const closed = renderShell({
    ui: { activePage: "today" },
    settings: { theme: "light" }
  }, pages());
  assert.match(closed, /data-action="quick-add" data-kind="task"/);
  assert.match(closed, /data-action="toggle-assistant" aria-expanded="false"/);
  assert.doesNotMatch(closed, /class="assistant-drawer"/);

  const open = renderShell({
    ui: { activePage: "performance" },
    settings: { theme: "dark" }
  }, pages(), { assistantOpen: true, assistant: "<section>Assistant</section>" });
  assert.match(open, /class="app-shell has-assistant-open"/);
  assert.match(open, /class="sidebar__more" open/);
  assert.match(open, /data-action="toggle-assistant" aria-expanded="true"/);
  assert.match(open, /class="assistant-drawer"/);
});
