import test from "node:test";
import assert from "node:assert/strict";
import {
  bind,
  calculateWeeklyMinutes,
  render
} from "../src/features/learning-view.mjs";

const ctx = {
  todayKey: "2026-06-08",
  now: new Date(2026, 5, 8, 12),
  locale: "en-GB"
};

function rootHarness() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    contains() {
      return true;
    }
  };
}

function control(dataset, owner = {}) {
  return {
    dataset,
    disabled: false,
    closest(selector) {
      if (selector === "[data-action]") return this;
      if (selector === "[data-learning-item-id]" && owner.itemId) {
        return { dataset: { learningItemId: owner.itemId } };
      }
      if (selector === "[data-learning-log-id]" && owner.logId) {
        return { dataset: { learningLogId: owner.logId } };
      }
      if (selector === "[data-learning-note-id]" && owner.noteId) {
        return { dataset: { learningNoteId: owner.noteId } };
      }
      return null;
    }
  };
}

test("calculates weekly study minutes without unlinked or duplicate focus time", () => {
  const state = {
    learningLogs: [
      {
        id: "log-1",
        date: "2026-06-08",
        learningItemId: "item-1",
        durationMinutes: 30
      },
      {
        id: "log-old",
        date: "2026-06-07",
        learningItemId: "item-1",
        durationMinutes: 90
      }
    ],
    sessions: [
      {
        id: "focus-duplicate",
        learningItemId: "item-1",
        startedAt: new Date(2026, 5, 8, 9).getTime(),
        activeMs: 30 * 60000
      },
      {
        id: "focus-linked",
        learningItemId: "item-1",
        startedAt: new Date(2026, 5, 9, 9).getTime(),
        activeMs: 25 * 60000
      },
      {
        id: "focus-unlinked",
        startedAt: new Date(2026, 5, 10, 9).getTime(),
        activeMs: 50 * 60000
      }
    ]
  };

  assert.equal(calculateWeeklyMinutes(state, ctx), 55);
});

test("renders the embeddable learning summary, active items, reviews, sessions, and notes", () => {
  const html = render({
    settings: { learning: { weeklyTargetMinutes: 120 } },
    learningItems: [
      { id: "item-1", title: "<JavaScript>", kind: "course", status: "active", progress: 3, target: 10, unit: "modules" },
      { id: "item-2", title: "Finished book", kind: "book", status: "completed" }
    ],
    learningLogs: [{
      id: "log-1",
      date: "2026-06-08",
      learningItemId: "item-1",
      title: "Promises",
      durationMinutes: 45
    }],
    learningNotes: [{
      id: "note-1",
      learningItemId: "item-1",
      title: "Event loop",
      body: "Tasks run before the next render.",
      nextReviewDate: "2026-06-08",
      reviewIntervalDays: 4
    }]
  }, ctx);

  assert.match(html, /progress-subview learning-view/);
  assert.doesNotMatch(html, /<main|data-page=/);
  assert.match(html, /45 min of 2 hr target · 1 active item/);
  assert.match(html, /&lt;JavaScript&gt;/);
  assert.match(html, /3 of 10 modules/);
  assert.match(html, /Promises/);
  assert.match(html, /Complete review/);
  assert.match(html, /<details class="card learning-notes">/);
  assert.match(html, /Generate quiz/);
  assert.match(html, /Planned, paused, and completed material \(1\)/);
});

test("bind handles item, log, review, and transient quiz actions", () => {
  const root = rootHarness();
  const opened = [];
  const dispatched = [];
  const prompts = [];
  const originalNow = Date.now;
  Date.now = () => Date.UTC(2026, 5, 8, 12);

  try {
    bind(root, {
      openEditor(kind, id) {
        opened.push([kind, id]);
      },
      dispatch(action) {
        dispatched.push(action);
      },
      openAssistantWithPrompt(prompt) {
        prompts.push(prompt);
      }
    });

    const click = root.listeners.get("click");
    click({ target: control({ action: "learning/add-item" }) });
    click({ target: control({ action: "learning/edit-item" }, { itemId: "item-1" }) });
    click({ target: control({ action: "learning/status", status: "paused" }, { itemId: "item-1" }) });
    click({ target: control({ action: "learning/log-study" }) });
    click({ target: control({ action: "learning/delete-log" }, { logId: "log-1" }) });
    click({
      target: control(
        { action: "learning/complete-review", interval: "4", today: "2026-06-08" },
        { noteId: "note-1" }
      )
    });
    click({
      target: control(
        { action: "learning/generate-quiz", noteText: "Remember this." },
        { noteId: "note-1" }
      )
    });

    assert.deepEqual(opened, [
      ["learningItem", undefined],
      ["learningItem", "item-1"],
      ["learningLog", undefined]
    ]);
    assert.deepEqual(dispatched, [
      {
        type: "learningItem/update",
        payload: { id: "item-1", patch: { status: "paused" } }
      },
      {
        type: "learningLog/delete",
        payload: { id: "log-1" }
      },
      {
        type: "learningNote/update",
        payload: {
          id: "note-1",
          patch: {
            reviewedAt: Date.UTC(2026, 5, 8, 12),
            reviewIntervalDays: 8,
            nextReviewDate: "2026-06-16"
          }
        }
      }
    ]);
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /Remember this\./);
    assert.equal(dispatched.some((action) => /quiz/i.test(action.type)), false);
  } finally {
    Date.now = originalNow;
  }
});
