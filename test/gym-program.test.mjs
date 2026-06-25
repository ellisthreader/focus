import test from "node:test";
import assert from "node:assert/strict";
import {
  GYM_PROGRAM,
  GYM_PROGRAM_KEY,
  gymMuscleCoverage,
  trainingPlanRecord
} from "../src/features/gym-program.mjs";

test("balanced gym program preserves the requested four day themes", () => {
  assert.deepEqual(
    GYM_PROGRAM.days.map((day) => day.name),
    ["Arms day", "Chest day", "Shoulder day", "Leg day"]
  );
  assert.equal(GYM_PROGRAM.weeklyTarget, 4);
});

test("balanced gym program trains every major muscle at least twice weekly", () => {
  const coverage = new Map(
    gymMuscleCoverage().map((item) => [item.muscle, item])
  );
  const majorMuscles = [
    "Back", "Biceps", "Calves", "Chest", "Core",
    "Glutes", "Hamstrings", "Quads", "Shoulders", "Triceps"
  ];

  for (const muscle of majorMuscles) {
    assert.ok(coverage.has(muscle), `${muscle} should be included`);
    assert.ok(
      coverage.get(muscle).weeklyExposures >= 2,
      `${muscle} should be trained on at least two days`
    );
  }
});

test("gym plan record retains its template identity", () => {
  assert.deepEqual(trainingPlanRecord(), {
    name: GYM_PROGRAM.name,
    goal: GYM_PROGRAM.goal,
    weeklyTarget: 4,
    templateKey: GYM_PROGRAM_KEY,
    active: true
  });
});
