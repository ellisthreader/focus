import test from "node:test";
import assert from "node:assert/strict";
import {
  bind,
  render,
  selectGoalMilestones,
  selectGoalProgress,
  selectGoals
} from "../src/features/goals-view.mjs";

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

function control(dataset, owner = {}, pressed = "false") {
  return {
    dataset,
    disabled: false,
    closest(selector) {
      if (selector === "[data-action]") return this;
      if (selector === "[data-personal-goal-id]" && owner.goalId) {
        return { dataset: { personalGoalId: owner.goalId } };
      }
      if (selector === "[data-goal-milestone-id]" && owner.milestoneId) {
        return { dataset: { goalMilestoneId: owner.milestoneId } };
      }
      return null;
    },
    getAttribute(name) {
      return name === "aria-pressed" ? pressed : null;
    }
  };
}

test("manual progress is deterministic, clamped, and completion takes precedence", () => {
  assert.deepEqual(selectGoalProgress({
    current: 30,
    target: 80,
    unit: "km",
    progressMode: "manual"
  }), {
    mode: "manual",
    current: 30,
    target: 80,
    percent: 38,
    label: "30 of 80 km"
  });

  assert.equal(selectGoalProgress({ current: 120, target: 100 }).percent, 100);
  assert.equal(selectGoalProgress({ current: 5, target: 0 }).percent, 0);
  assert.equal(selectGoalProgress({
    current: 1,
    target: 100,
    status: "completed"
  }).percent, 100);
  assert.equal(selectGoalProgress({ manualProgress: 42 }).percent, 42);
});

test("milestone progress counts completed records and filters tombstones", () => {
  const milestones = [
    { id: "m-1", goalId: "g-1", status: "completed", weight: 2 },
    { id: "m-2", goalId: "g-1", status: "active", weight: 1 },
    { id: "m-3", goalId: "g-1", completed: true, weight: 0 },
    { id: "m-deleted", goalId: "g-1", completed: true, weight: 20, deletedAt: 1 }
  ];
  const progress = selectGoalProgress({ progressMode: "milestones" }, milestones);

  assert.deepEqual(progress, {
    mode: "milestones",
    current: 2,
    target: 3,
    percent: 67,
    label: "2 of 3 milestones"
  });
  assert.equal(selectGoalProgress({ progressMode: "milestones" }, []).percent, 0);
});

test("selectors return only owned milestones in deterministic display order", () => {
  const state = {
    personalGoals: [
      { id: "g-paused", title: "Paused", status: "paused", priority: 10 },
      { id: "g-active", title: "Active", status: "active", priority: 1 },
      { id: "g-done", title: "Done", status: "completed" },
      { id: "g-deleted", title: "Deleted", deletedAt: 1 }
    ],
    goalMilestones: [
      { id: "m-b", goalId: "g-active", title: "Second", order: 2 },
      { id: "m-a", goalId: "g-active", title: "First", order: 1 },
      { id: "m-other", goalId: "g-paused", title: "Other", order: 0 }
    ]
  };

  assert.deepEqual(
    selectGoalMilestones(state, "g-active").map((item) => item.id),
    ["m-a", "m-b"]
  );
  assert.deepEqual(
    selectGoals(state).map((item) => item.goal.id),
    ["g-active", "g-paused", "g-done"]
  );
});

test("renders clean accessible goal cards, milestones, escaped content, and completed disclosure", () => {
  const html = render({
    personalGoals: [
      {
        id: "g-1",
        title: "Run <10k>",
        description: "Build & recover",
        area: "Fitness",
        status: "active",
        progressMode: "milestones",
        targetDate: "2026-09-01"
      },
      {
        id: "g-2",
        title: "Finished",
        status: "completed",
        current: 1,
        target: 4
      }
    ],
    goalMilestones: [
      { id: "m-1", goalId: "g-1", title: "First 5k", status: "completed" },
      { id: "m-2", goalId: "g-1", title: "Race day", targetDate: "2026-09-01" }
    ]
  }, { locale: "en-GB" });

  assert.match(html, /data-goals-view/);
  assert.doesNotMatch(html, /<main|data-page=/);
  assert.match(html, /Run &lt;10k&gt;/);
  assert.match(html, /Build &amp; recover/);
  assert.match(html, /1 of 2 milestones/);
  assert.match(html, /aria-label="Run &lt;10k&gt;: 50% complete"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /Completed goals \(1\)/);
  assert.match(html, /data-action="goal\/add-milestone"/);
  assert.match(html, /data-action="goal\/delete-milestone"/);
});

test("bind opens editors and dispatches goal and milestone lifecycle actions", () => {
  const root = rootHarness();
  const opened = [];
  const dispatched = [];
  const originalNow = Date.now;
  Date.now = () => 123456;

  try {
    bind(root, {
      openEditor(...args) {
        opened.push(args);
      },
      dispatch(action) {
        dispatched.push(action);
      }
    });

    const click = root.listeners.get("click");
    click({ target: control({ action: "goal/add" }) });
    click({ target: control({ action: "goal/edit" }, { goalId: "g-1" }) });
    click({ target: control({ action: "goal/add-milestone" }, { goalId: "g-1" }) });
    click({ target: control({ action: "goal/edit-milestone" }, { milestoneId: "m-1" }) });
    click({ target: control({ action: "goal/toggle-complete" }, { goalId: "g-1" }) });
    click({ target: control({ action: "goal/toggle-complete" }, { goalId: "g-2" }, "true") });
    click({ target: control({ action: "goal/toggle-milestone" }, { milestoneId: "m-1" }) });
    click({ target: control({ action: "goal/toggle-milestone" }, { milestoneId: "m-2" }, "true") });
    click({ target: control({ action: "goal/delete-milestone" }, { milestoneId: "m-3" }) });
    click({ target: control({ action: "goal/delete" }, { goalId: "g-3" }) });

    assert.deepEqual(opened, [
      ["personalGoal"],
      ["personalGoal", "g-1"],
      ["goalMilestone", "", { parentId: "g-1" }],
      ["goalMilestone", "m-1"]
    ]);
    assert.deepEqual(dispatched, [
      {
        type: "goal/setStatus",
        payload: { id: "g-1", status: "completed" }
      },
      {
        type: "goal/setStatus",
        payload: { id: "g-2", status: "active" }
      },
      {
        type: "goalMilestone/complete",
        payload: { id: "m-1", completed: true }
      },
      {
        type: "goalMilestone/complete",
        payload: { id: "m-2", completed: false }
      },
      { type: "goalMilestone/delete", payload: { id: "m-3" } },
      { type: "personalGoal/delete", payload: { id: "g-3" } }
    ]);
  } finally {
    Date.now = originalNow;
  }
});
