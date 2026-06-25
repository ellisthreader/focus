import test from "node:test";
import assert from "node:assert/strict";
import {
  bindSearchOverlay,
  buildSearchResults,
  renderSearchOverlay
} from "../src/features/search.mjs";
import { bindEditor, renderEditor } from "../src/ui/editor.mjs";

function eventTarget() {
  const listeners = {};
  return {
    listeners,
    dataset: {},
    attributes: {},
    classList: {
      values: new Set(),
      toggle(name, active) {
        if (active) this.values.add(name);
        else this.values.delete(name);
      },
      remove(name) {
        this.values.delete(name);
      },
      contains(name) {
        return this.values.has(name);
      }
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    focus() {
      this.focused = true;
    }
  };
}

test("search groups navigation and records without a static active result", () => {
  const state = {
    tasks: [{ id: "task-1", title: "Prepare review", priority: "high" }],
    events: [{ id: "event-1", title: "Review meeting", start: "2026-06-09T09:00:00.000Z" }]
  };
  const html = renderSearchOverlay(state, { query: "" });

  assert.match(html, /id="search-navigation-title">Navigation/);
  assert.match(html, /id="search-records-title">Records/);
  assert.match(html, /role="option" aria-selected="false" tabindex="-1"/);
  assert.doesNotMatch(html, /search-result active/);
  assert.match(html, /Prepare review/);
});

test("blank search includes every navigation destination and recent records", () => {
  const results = buildSearchResults({
    tasks: [{ id: "task-1", title: "Recent task" }]
  }, "");

  assert.equal(results.filter((item) => item.type === "command").length, 12);
  assert.ok(results.some((item) => item.id === "task:task-1"));
});

test("search selection styling follows actual focus", () => {
  const input = eventTarget();
  const dialog = eventTarget();
  const first = eventTarget();
  const second = eventTarget();
  first.dataset = { page: "tasks" };
  second.dataset = { page: "calendar" };
  const options = [first, second];
  const root = {
    querySelector(selector) {
      if (selector === "#global-search-input") return input;
      if (selector === "[data-search-dialog]") return dialog;
      return null;
    },
    querySelectorAll(selector) {
      return selector === "[data-search-result]" ? options : [];
    }
  };
  const originalWindow = globalThis.window;
  globalThis.window = { setTimeout(callback) { callback(); } };
  try {
    bindSearchOverlay(root, {});
    first.listeners.focus();
    assert.equal(first.attributes["aria-selected"], "true");
    assert.equal(first.classList.contains("active"), true);
    assert.equal(second.attributes["aria-selected"], "false");

    first.listeners.blur();
    assert.equal(first.attributes["aria-selected"], "false");
    assert.equal(first.classList.contains("active"), false);

    input.listeners.keydown({ key: "ArrowDown", preventDefault() {} });
    assert.equal(first.focused, true);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("editor renders a compact consistent structure and clear actions", () => {
  const html = renderEditor({}, { kind: "task" }, { todayKey: "2026-06-08" });

  assert.match(html, /class="modal-card editor-card editor-card--task"/);
  assert.match(html, /aria-describedby="editor-description"/);
  assert.match(html, /class="editor-form__body stack"/);
  assert.match(html, /class="field editor-field" for="editor-field-title"/);
  assert.match(html, /class="button button--ghost ghost"[^>]*>Cancel/);
  assert.match(html, /class="button button--primary primary"[^>]*>Add task/);
});

test("editor applies workout prefills without treating them as existing records", () => {
  const html = renderEditor({}, {
    kind: "workout",
    prefill: {
      name: "Arms day",
      type: "strength",
      notes: "Planned session:\nEZ-bar curl: 3 x 8-12"
    }
  }, { todayKey: "2026-06-08" });

  assert.match(html, /<h2 id="editor-title">Add workout<\/h2>/);
  assert.match(html, /name="name"[^>]*value="Arms day"/);
  assert.match(html, /value="strength" selected/);
  assert.match(html, /Planned session:\nEZ-bar curl: 3 x 8-12/);
  assert.match(html, />Add workout<\/button>/);
});

test("editor keeps dispatch contracts and supports Escape", () => {
  const dialog = eventTarget();
  const form = eventTarget();
  const firstInput = eventTarget();
  form.dataset = { kind: "task", id: "" };
  const root = {
    querySelectorAll() {
      return [];
    },
    querySelector(selector) {
      if (selector === "[data-editor-dialog]") return dialog;
      if (selector === "[data-editor-form]") return form;
      if (selector.startsWith("[data-editor-form] input")) return firstInput;
      return null;
    }
  };
  const calls = [];
  const originalWindow = globalThis.window;
  const OriginalFormData = globalThis.FormData;
  globalThis.window = { setTimeout(callback) { callback(); } };
  globalThis.FormData = class {
    entries() {
      return [["title", "Ship clean editor"], ["dueDate", "2026-06-08"], ["priority", "high"]];
    }
  };
  try {
    bindEditor(root, {
      dispatch(action) {
        calls.push(action);
      },
      closeEditor() {
        calls.push("close");
      }
    });

    form.listeners.submit({ preventDefault() {}, currentTarget: form });
    assert.deepEqual(calls[0], {
      type: "task/add",
      payload: {
        title: "Ship clean editor",
        dueDate: "2026-06-08",
        priority: "high"
      }
    });
    assert.equal(calls[1], "close");
    assert.equal(firstInput.focused, true);

    dialog.listeners.keydown({ key: "Escape", preventDefault() {} });
    assert.equal(calls[2], "close");
  } finally {
    globalThis.window = originalWindow;
    globalThis.FormData = OriginalFormData;
  }
});

test("finance editor converts decimal strings to exact minor units", () => {
  const form = eventTarget();
  form.dataset = { kind: "financeEntry", id: "" };
  const root = {
    querySelectorAll() {
      return [];
    },
    querySelector(selector) {
      if (selector === "[data-editor-form]") return form;
      return null;
    }
  };
  const calls = [];
  const originalWindow = globalThis.window;
  const OriginalFormData = globalThis.FormData;
  globalThis.window = { setTimeout() {} };
  globalThis.FormData = class {
    entries() {
      return [
        ["label", "Lunch"],
        ["date", "2026-06-08"],
        ["kind", "expense"],
        ["amount", "10.29"],
        ["currency", "GBP"]
      ];
    }
  };

  try {
    bindEditor(root, {
      dispatch(action) {
        calls.push(action);
      },
      closeEditor() {}
    });
    form.listeners.submit({ preventDefault() {}, currentTarget: form });
    assert.equal(calls[0].payload.amountMinor, 1029);
  } finally {
    globalThis.window = originalWindow;
    globalThis.FormData = OriginalFormData;
  }
});
