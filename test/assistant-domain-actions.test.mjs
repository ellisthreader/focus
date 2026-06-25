import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import {
  AssistantActionValidationError,
  assistantActionToReducerActions,
  normalizeAssistantAction,
  previewAssistantAction,
  summarizeAssistantAction
} from "../src/core/assistant-actions.mjs";

const require = createRequire(import.meta.url);
const { parseAssistantPlan, requestAssistantPlan } = require("../assistant-service.cjs");
const { requestLocalAssistantPlan } = require("../local-assistant-service.cjs");

function action(name, argumentsValue) {
  return { version: 1, name, arguments: argumentsValue };
}

function jsonResponse(value) {
  return {
    ok: true,
    status: 200,
    async json() {
      return value;
    }
  };
}

test("meal actions enforce provenance and convert to nutrition reducer payloads", () => {
  const meal = action("log_meal", {
    date: "2026-06-08",
    meal_type: "lunch",
    name: "Chicken curry",
    serving_amount: 1,
    serving_unit: "meal",
    calories: 720,
    protein_grams: 42,
    carbs_grams: 78,
    fat_grams: 24,
    fiber_grams: 7,
    source_type: "ai_estimate",
    confidence: "ai_estimate",
    assumptions: "One restaurant-sized serving.",
    notes: "With rice"
  });

  assert.deepEqual(assistantActionToReducerActions(meal), [{
    type: "nutrition/add",
    payload: {
      date: "2026-06-08",
      mealType: "lunch",
      name: "Chicken curry",
      servingAmount: 1,
      servingUnit: "meal",
      calories: 720,
      proteinGrams: 42,
      carbsGrams: 78,
      fatGrams: 24,
      fiberGrams: 7,
      sourceType: "ai_estimate",
      confidence: "ai_estimate",
      assumptions: "One restaurant-sized serving.",
      notes: "With rice"
    }
  }]);
  assert.match(summarizeAssistantAction(meal), /720 kcal.*ai_estimate/);
  assert.equal(previewAssistantAction(meal).items[0].type, "nutrition/add");

  assert.throws(
    () => normalizeAssistantAction(action("log_meal", {
      ...meal.arguments,
      confidence: "verified"
    })),
    /verified meals require/
  );
  assert.throws(
    () => normalizeAssistantAction(action("log_meal", {
      ...meal.arguments,
      assumptions: ""
    })),
    /required for AI-estimated/
  );
});

test("body and workout actions require paired units and convert to metric", () => {
  const body = assistantActionToReducerActions(action("log_body_measurement", {
    date: "2026-06-08",
    recorded_at: "2026-06-08T08:30:00+01:00",
    weight: 180,
    weight_unit: "lb",
    body_fat_percent: 18.5,
    waist: 32,
    waist_unit: "in",
    resting_heart_rate: 58
  }));
  const workout = assistantActionToReducerActions(action("log_workout", {
    date: "2026-06-08",
    name: "Morning run",
    type: "cardio",
    duration_minutes: 30,
    distance: 3.1,
    distance_unit: "mi",
    effort: 4,
    exercises: [{
      name: "Treadmill",
      distance: 3.1,
      distance_unit: "mi",
      duration_minutes: 30
    }]
  }));

  assert.deepEqual(body, [{
    type: "bodyMeasurement/add",
    payload: {
      date: "2026-06-08",
      recordedAt: "2026-06-08T07:30:00.000Z",
      weightKg: 81.647,
      bodyFatPercent: 18.5,
      waistCm: 81.28,
      restingHeartRate: 58,
      notes: ""
    }
  }]);
  assert.equal(workout[0].type, "workout/add");
  assert.equal(workout[0].payload.distanceKm, 4.989);
  assert.equal(workout[0].payload.exercises[0].distanceKm, 4.989);
  assert.throws(
    () => normalizeAssistantAction(action("log_body_measurement", {
      date: "2026-06-08",
      weight: 80
    })),
    /supplied with weight/
  );
  assert.throws(
    () => normalizeAssistantAction(action("log_workout", {
      date: "2026-06-08",
      name: "Run",
      type: "cardio",
      distance: 5
    })),
    /supplied with distance/
  );
});

test("sleep validates RFC3339 ranges and converts elapsed time", () => {
  const sleep = action("log_sleep", {
    date: "2026-06-08",
    started_at: "2026-06-07T23:15:00+01:00",
    ended_at: "2026-06-08T07:45:00+01:00",
    duration_hours: 8.5,
    sleep_quality: 4,
    notes: "Woke once"
  });

  assert.deepEqual(assistantActionToReducerActions(sleep), [{
    type: "health/save",
    payload: {
      date: "2026-06-08",
      sleepStartedAt: "2026-06-07T22:15:00.000Z",
      sleepEndedAt: "2026-06-08T06:45:00.000Z",
      sleepHours: 8.5,
      sleepQuality: 4,
      recoveryNote: "Woke once"
    }
  }]);
  assert.throws(
    () => normalizeAssistantAction(action("log_sleep", {
      ...sleep.arguments,
      started_at: "2026-06-07 23:15",
      ended_at: "2026-06-08 07:45"
    })),
    /RFC 3339/
  );
  assert.throws(
    () => normalizeAssistantAction(action("log_sleep", {
      ...sleep.arguments,
      duration_hours: 7
    })),
    /does not match/
  );
});

test("finance decimal strings and study durations convert to canonical actions", () => {
  const finance = action("log_finance_transaction", {
    date: "2026-06-08",
    label: "Train ticket",
    amount: "12.50",
    kind: "expense",
    currency: "GBP",
    category: "Travel"
  });
  const study = action("log_study_session", {
    date: "2026-06-08",
    title: "Spanish",
    duration_minutes: 45,
    learning_item_id: "spanish-a2",
    note: "Past tense"
  });

  assert.equal(
    assistantActionToReducerActions(finance)[0].payload.amountMinor,
    1250
  );
  assert.deepEqual(assistantActionToReducerActions(study), [{
    type: "learningLog/add",
    payload: {
      date: "2026-06-08",
      title: "Spanish",
      durationMinutes: 45,
      learningItemId: "spanish-a2",
      note: "Past tense"
    }
  }]);
  for (const amount of ["12.345", "-12.50", "£12.50", "0"]) {
    assert.throws(
      () => normalizeAssistantAction(action("log_finance_transaction", {
        ...finance.arguments,
        amount
      })),
      AssistantActionValidationError
    );
  }
});

test("domain actions strictly reject unknown fields and out-of-range numbers", () => {
  assert.throws(
    () => normalizeAssistantAction(action("log_study_session", {
      date: "2026-06-08",
      title: "Spanish",
      duration_minutes: 45,
      invented: true
    })),
    /unknown field "invented"/
  );
  assert.throws(
    () => normalizeAssistantAction(action("log_body_measurement", {
      date: "2026-02-29",
      weight: 80,
      weight_unit: "kg"
    })),
    /invalid calendar date/
  );
  assert.throws(
    () => normalizeAssistantAction(action("log_study_session", {
      date: "2026-06-08",
      title: "Spanish",
      duration_minutes: 1441
    })),
    /1 to 1440/
  );
});

test("provider parser validates exact domain schemas", () => {
  const parsed = parseAssistantPlan({
    message: "I prepared the transaction.",
    actions: [{
      version: 1,
      name: "log_finance_transaction",
      arguments: {
        date: "2026-06-08",
        label: "Train ticket",
        amount: "12.50",
        kind: "expense",
        currency: "GBP",
        category: null,
        account: null,
        notes: null
      }
    }]
  });

  assert.equal(parsed.actions[0].arguments.amount, "12.50");
  assert.equal("account" in parsed.actions[0].arguments, false);
  const focus = parseAssistantPlan({
    message: "I prepared the focus session.",
    actions: [{
      version: 1,
      name: "log_focus_session",
      arguments: {
        date: "2026-06-08",
        title: "Vibe coding",
        duration_minutes: 90,
        project: "Focus",
        tags: ["coding"],
        started_at: null,
        ended_at: null,
        focus_rating: 5,
        energy: 4,
        note: null
      }
    }]
  });
  assert.equal(focus.actions[0].name, "log_focus_session");
  assert.equal(focus.actions[0].arguments.duration_minutes, 90);
  assert.throws(
    () => parseAssistantPlan({
      message: "Invalid",
      actions: [{
        ...parsed.actions[0],
        arguments: { ...parsed.actions[0].arguments, secret: "no" }
      }]
    }),
    /unsupported fields/
  );
});

test("cloud responses cannot claim verified meal provenance absent from the prompt", async () => {
  const plan = await requestAssistantPlan({
    apiKey: "sk-test",
    prompt: "Log lunch today: one chicken curry with rice.",
    currentDate: "2026-06-08",
    fetchImpl: async () => jsonResponse({
      output_text: JSON.stringify({
        message: "I prepared the meal.",
        actions: [{
          version: 1,
          name: "log_meal",
          arguments: {
            date: "2026-06-08",
            meal_type: "lunch",
            name: "Chicken curry with rice",
            serving_amount: 1,
            serving_unit: "meal",
            calories: 700,
            protein_grams: 35,
            carbs_grams: 80,
            fat_grams: 20,
            fiber_grams: 6,
            source_type: "usda",
            source_id: "invented-123",
            source_label: "USDA",
            source_url: "https://example.test/invented",
            confidence: "verified",
            assumptions: null,
            notes: null
          }
        }]
      })
    })
  });

  assert.equal(plan.actions[0].arguments.source_type, "ai_estimate");
  assert.equal(plan.actions[0].arguments.confidence, "ai_estimate");
  assert.equal("source_url" in plan.actions[0].arguments, false);
});

test("cloud assistant uses resolved dataset nutrition without calling the model", async () => {
  const request = "I ate 4 eggs and 2 slices of toast with butter";
  const resolution = {
    name: "4 eggs and 2 slices of toast and butter",
    servingAmount: 1,
    servingUnit: "meal",
    calories: 534.78,
    proteinGrams: 30.37,
    carbsGrams: 27.58,
    fatGrams: 51.05,
    fiberGrams: 1.51,
    sourceType: "usda",
    sourceId: "usda:101+usda:102+usda:103",
    sourceLabel: "USDA FoodData Central",
    sourceUrl: "https://fdc.nal.usda.gov/food-details/101/nutrients",
    confidence: "verified",
    assumptions: "Scaled from dataset servings.",
    components: []
  };
  const plan = await requestAssistantPlan({
    apiKey: "sk-test",
    currentRequest: request,
    currentDate: "2026-06-08",
    prompt: [
      "Context:",
      JSON.stringify({
        resolved_nutrition: resolution,
        current_request: request
      })
    ].join("\n"),
    fetchImpl: async () => {
      throw new Error("Resolved meal logging should not call OpenAI.");
    }
  });

  assert.equal(plan.actions[0].arguments.confidence, "verified");
  assert.equal(plan.actions[0].arguments.calories, 534.78);
  assert.equal(plan.actions[0].arguments.source_id, resolution.sourceId);
});

test("local grounding removes invented finance fields and downgrades unsourced meals", async () => {
  const financePlan = await requestLocalAssistantPlan({
    prompt: "Log this expense today: I paid £12.50 for Train ticket.",
    currentRequest: "Log this expense today: I paid £12.50 for Train ticket.",
    currentDate: "2026-06-08",
    fetchImpl: async () => jsonResponse({
      response: JSON.stringify({
        message: "I prepared the transaction.",
        actions: [{
          version: 1,
          name: "log_finance_transaction",
          arguments: {
            date: "2026-06-08",
            label: "Train ticket",
            amount: "12.50",
            kind: "expense",
            currency: "GBP",
            category: "Travel",
            account: "Current account",
            notes: null
          }
        }]
      })
    })
  });
  const mealPlan = await requestLocalAssistantPlan({
    prompt: "Log lunch today: one chicken curry with rice.",
    currentRequest: "Log lunch today: one chicken curry with rice.",
    currentDate: "2026-06-08",
    fetchImpl: async () => jsonResponse({
      response: JSON.stringify({
        message: "I prepared the meal.",
        actions: [{
          version: 1,
          name: "log_meal",
          arguments: {
            date: "2026-06-08",
            meal_type: "lunch",
            name: "Chicken curry with rice",
            serving_amount: 1,
            serving_unit: "meal",
            calories: 700,
            protein_grams: 35,
            carbs_grams: 80,
            fat_grams: 20,
            fiber_grams: 6,
            source_type: "usda",
            source_id: "invented-123",
            source_label: "USDA",
            source_url: "https://example.test/invented",
            confidence: "verified",
            assumptions: null,
            notes: null
          }
        }]
      })
    })
  });

  assert.deepEqual(financePlan.actions[0].arguments, {
    date: "2026-06-08",
    label: "Train ticket",
    amount: "12.50",
    kind: "expense",
    currency: "GBP"
  });
  assert.equal(mealPlan.actions[0].arguments.source_type, "ai_estimate");
  assert.equal(mealPlan.actions[0].arguments.confidence, "ai_estimate");
  assert.equal("source_id" in mealPlan.actions[0].arguments, false);
  assert.match(mealPlan.actions[0].arguments.assumptions, /Estimated/);
});
