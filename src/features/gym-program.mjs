export const GYM_PROGRAM_KEY = "balanced-four-day-hypertrophy-v1";

export const GYM_PROGRAM = Object.freeze({
  key: GYM_PROGRAM_KEY,
  name: "Balanced four-day growth plan",
  goal: "Train every major muscle across the week while keeping Arms, Chest, Shoulders, and Legs as the main day themes.",
  weeklyTarget: 4,
  guidance: Object.freeze([
    "Use a load that leaves about 1-3 good repetitions in reserve on most working sets.",
    "When every set reaches the top of its rep range with controlled form, add the smallest available weight next time.",
    "Rest about 2-3 minutes after compound lifts and 1-2 minutes after isolation work.",
    "Take at least one rest day after two consecutive sessions where possible."
  ]),
  days: Object.freeze([
    Object.freeze({
      id: "arms",
      name: "Arms day",
      note: "Arms stay primary; pulling work gives your back its first weekly exposure.",
      exercises: Object.freeze([
        exercise("Neutral-grip lat pulldown", 3, "6-10", ["Back"], ["Biceps"]),
        exercise("Chest-supported row", 3, "8-12", ["Back"], ["Biceps", "Shoulders"]),
        exercise("EZ-bar curl", 3, "8-12", ["Biceps"]),
        exercise("Incline dumbbell curl", 2, "10-15", ["Biceps"]),
        exercise("Cable triceps pressdown", 3, "8-12", ["Triceps"]),
        exercise("Overhead cable triceps extension", 2, "10-15", ["Triceps"]),
        exercise("Cable crunch", 3, "10-15", ["Core"])
      ])
    }),
    Object.freeze({
      id: "chest",
      name: "Chest day",
      note: "Chest stays primary; a small lower-body touch improves weekly leg frequency.",
      exercises: Object.freeze([
        exercise("Barbell or machine bench press", 4, "6-10", ["Chest"], ["Triceps", "Shoulders"]),
        exercise("Incline dumbbell press", 3, "8-12", ["Chest"], ["Triceps", "Shoulders"]),
        exercise("Cable or pec-deck fly", 3, "10-15", ["Chest"]),
        exercise("Leg press", 3, "8-12", ["Quads"], ["Glutes"]),
        exercise("Seated or lying leg curl", 3, "10-15", ["Hamstrings"]),
        exercise("Standing calf raise", 4, "8-15", ["Calves"])
      ])
    }),
    Object.freeze({
      id: "shoulders",
      name: "Shoulder day",
      note: "All three delt regions are covered, with a second back exposure.",
      exercises: Object.freeze([
        exercise("Seated overhead press", 3, "6-10", ["Shoulders"], ["Triceps"]),
        exercise("Cable or dumbbell lateral raise", 4, "10-20", ["Shoulders"]),
        exercise("Reverse pec deck", 3, "10-20", ["Shoulders"], ["Back"]),
        exercise("Pull-up or lat pulldown", 3, "6-12", ["Back"], ["Biceps"]),
        exercise("Seated cable row", 3, "8-12", ["Back"], ["Biceps", "Shoulders"]),
        exercise("Dumbbell or machine shrug", 3, "8-15", ["Traps"])
      ])
    }),
    Object.freeze({
      id: "legs",
      name: "Leg day",
      note: "Full lower body, plus a small chest and core touch for balanced frequency.",
      exercises: Object.freeze([
        exercise("Back squat or hack squat", 4, "6-10", ["Quads"], ["Glutes"]),
        exercise("Romanian deadlift", 4, "6-10", ["Hamstrings", "Glutes"], ["Back"]),
        exercise("Bulgarian split squat", 3, "8-12 each leg", ["Quads", "Glutes"]),
        exercise("Seated or lying leg curl", 3, "10-15", ["Hamstrings"]),
        exercise("Seated calf raise", 4, "10-20", ["Calves"]),
        exercise("Machine chest press", 3, "8-12", ["Chest"], ["Triceps", "Shoulders"]),
        exercise("Hanging knee raise", 3, "8-15", ["Core"])
      ])
    })
  ])
});

function exercise(name, sets, reps, primary, secondary = []) {
  return Object.freeze({ name, sets, reps, primary: Object.freeze(primary), secondary: Object.freeze(secondary) });
}

export function gymMuscleCoverage(program = GYM_PROGRAM) {
  const coverage = new Map();
  for (const day of program.days || []) {
    for (const item of day.exercises || []) {
      const add = (muscle, sets, direct) => {
        const current = coverage.get(muscle) || { muscle, stimulatingSets: 0, directSets: 0, days: new Set() };
        current.stimulatingSets += sets;
        if (direct) current.directSets += item.sets;
        current.days.add(day.id);
        coverage.set(muscle, current);
      };
      for (const muscle of item.primary || []) add(muscle, item.sets, true);
      for (const muscle of item.secondary || []) add(muscle, item.sets * 0.5, false);
    }
  }
  return [...coverage.values()]
    .map((item) => ({
      muscle: item.muscle,
      stimulatingSets: Math.round(item.stimulatingSets * 10) / 10,
      directSets: item.directSets,
      weeklyExposures: item.days.size
    }))
    .sort((left, right) => left.muscle.localeCompare(right.muscle));
}

export function trainingPlanRecord(program = GYM_PROGRAM) {
  return {
    name: program.name,
    goal: program.goal,
    weeklyTarget: program.weeklyTarget,
    templateKey: program.key,
    active: true
  };
}
