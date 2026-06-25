import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultState, normalizeState } from "../src/core/schema.mjs";
import { reduceAppState } from "../src/core/reducer.mjs";
import { personalizationReadiness } from "../src/core/personalization.mjs";
import { projectAssistantContext } from "../src/core/privacy.mjs";
import * as onboarding from "../src/features/onboarding.mjs";

const NOW = Date.UTC(2026, 5, 8, 12);

test("onboarding renders the baseline and explicit AI permissions", () => {
  const html = onboarding.render(createDefaultState(NOW));

  assert.match(html, /Set up Focus around your life/);
  assert.match(html, /name="primaryGoal"/);
  assert.match(html, /name="workStart"/);
  assert.match(html, /name="aiProfile"/);
  assert.match(html, /Raw medical records remain excluded/);
});

test("existing users are not forced through first-run onboarding", () => {
  const state = normalizeState({
    schemaVersion: 4,
    tasks: [{ id: "task-1", title: "Existing task" }]
  }, NOW);

  assert.equal(state.onboarding.completed, true);
});

test("onboarding lifecycle and habit edits persist through the reducer", () => {
  let state = createDefaultState(NOW);
  state = reduceAppState(state, {
    type: "onboarding/complete",
    payload: { now: NOW }
  });
  assert.equal(state.onboarding.completed, true);

  state = reduceAppState(state, {
    type: "habit/add",
    payload: { name: "Walk", target: 1, now: NOW }
  });
  state = reduceAppState(state, {
    type: "habit/update",
    payload: {
      id: state.habits[0].id,
      patch: { name: "Walk outside", target: 2, unit: "times", frequency: "daily" },
      now: NOW + 1
    }
  });
  assert.equal(state.habits[0].name, "Walk outside");
  assert.equal(state.habits[0].target, 2);
});

test("profile context reaches only an opted-in assistant provider", () => {
  const state = normalizeState({
    schemaVersion: 4,
    profile: {
      name: "Ellis",
      bio: "Prefers concise plans",
      primaryGoal: "Ship Focus",
      workStart: "09:00",
      workEnd: "17:00"
    },
    settings: {
      privacy: {
        assistant: {
          local: { profile: true },
          cloud: { profile: false }
        }
      }
    },
    personalGoals: [{
      id: "goal-1",
      title: "Ship Focus",
      status: "active",
      progress: 40,
      target: 100,
      unit: "%"
    }],
    habits: [{ id: "habit-1", name: "Plan tomorrow", target: 1, unit: "times", frequency: "daily" }]
  }, NOW);

  const local = projectAssistantContext(state, { provider: "local", currentDate: "2026-06-08" });
  const cloud = projectAssistantContext(state, { provider: "cloud", currentDate: "2026-06-08" });

  assert.equal(local.profile.name, "Ellis");
  assert.equal(local.profile.primaryGoal, "Ship Focus");
  assert.equal(local.profile.goals[0].progress, 40);
  assert.equal("profile" in cloud, false);
});

test("readiness reports the remaining data areas without inspecting private notes", () => {
  const state = createDefaultState(NOW);
  const empty = personalizationReadiness(state);
  assert.equal(empty.percent, 0);

  state.profile.name = "Ellis";
  state.profile.primaryGoal = "Build a useful app";
  state.tasks.push({ id: "task-1", title: "Review onboarding", completed: false });
  const partial = personalizationReadiness(state);
  assert.ok(partial.percent > 0);
  assert.ok(partial.percent < 100);
});
