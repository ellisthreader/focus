"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_ASSISTANT_MODEL = "gpt-5.4-mini";
const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PRIORITIES = new Set(["low", "medium", "high"]);
const CATEGORIES = new Set(["personal", "work", "health", "focus"]);
const CALENDAR_MATCH_PROPERTIES = Object.freeze({
  match_title: { type: "string" },
  start_date: { type: ["string", "null"] },
  end_date: { type: ["string", "null"] },
  start_time: { type: ["string", "null"] },
  end_time: { type: ["string", "null"] },
  weekdays: {
    anyOf: [
      { type: "null" },
      {
        type: "array",
        minItems: 1,
        maxItems: 7,
        items: { type: "integer", minimum: 0, maximum: 6 }
      }
    ]
  }
});
const CALENDAR_MATCH_KEYS = Object.freeze(Object.keys(CALENDAR_MATCH_PROPERTIES));

const DETAILED_ASSISTANT_PLAN_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["message", "actions"],
  properties: {
    message: { type: "string" },
    actions: {
      type: "array",
      maxItems: 32,
      items: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["version", "name", "arguments"],
            properties: {
              version: { type: "integer", const: 1 },
              name: { type: "string", const: "create_calendar_schedule" },
              arguments: {
                type: "object",
                additionalProperties: false,
                required: [
                  "title", "start_date", "end_date", "start_time", "end_time",
                  "weekdays", "category", "location", "notes"
                ],
                properties: {
                  title: { type: "string" },
                  start_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                  end_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                  start_time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
                  end_time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
                  weekdays: {
                    anyOf: [
                      { type: "null" },
                      {
                        type: "array",
                        minItems: 1,
                        maxItems: 7,
                        items: { type: "integer", minimum: 0, maximum: 6 }
                      }
                    ]
                  },
                  category: { type: "string", enum: [...CATEGORIES] },
                  location: { type: "string" },
                  notes: { type: "string" }
                }
              }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["version", "name", "arguments"],
            properties: {
              version: { type: "integer", const: 1 },
              name: { type: "string", const: "update_calendar_events" },
              arguments: {
                type: "object",
                additionalProperties: false,
                required: [...CALENDAR_MATCH_KEYS, "new_title"],
                properties: {
                  ...CALENDAR_MATCH_PROPERTIES,
                  new_title: { type: "string" }
                }
              }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["version", "name", "arguments"],
            properties: {
              version: { type: "integer", const: 1 },
              name: { type: "string", const: "update_tasks" },
              arguments: {
                type: "object",
                additionalProperties: false,
                required: ["match_title", "new_title", "notes", "due_date", "priority", "project_id"],
                properties: {
                  match_title: { type: "string" },
                  new_title: { type: ["string", "null"] },
                  notes: { type: ["string", "null"] },
                  due_date: { type: ["string", "null"] },
                  priority: {
                    anyOf: [
                      { type: "null" },
                      { type: "string", enum: [...PRIORITIES] }
                    ]
                  },
                  project_id: { type: ["string", "null"] }
                }
              }
            }
          },
          ...["delete_tasks", "complete_tasks"].map((name) => ({
            type: "object",
            additionalProperties: false,
            required: ["version", "name", "arguments"],
            properties: {
              version: { type: "integer", const: 1 },
              name: { type: "string", const: name },
              arguments: {
                type: "object",
                additionalProperties: false,
                required: ["match_title"],
                properties: { match_title: { type: "string" } }
              }
            }
          })),
          {
            type: "object",
            additionalProperties: false,
            required: ["version", "name", "arguments"],
            properties: {
              version: { type: "integer", const: 1 },
              name: { type: "string", const: "delete_calendar_events" },
              arguments: {
                type: "object",
                additionalProperties: false,
                required: [...CALENDAR_MATCH_KEYS],
                properties: CALENDAR_MATCH_PROPERTIES
              }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["version", "name", "arguments"],
            properties: {
              version: { type: "integer", const: 1 },
              name: { type: "string", const: "create_task" },
              arguments: {
                type: "object",
                additionalProperties: false,
                required: ["title", "notes", "due_date", "priority", "project_id"],
                properties: {
                  title: { type: "string" },
                  notes: { type: "string" },
                  due_date: { type: ["string", "null"] },
                  priority: {
                    anyOf: [
                      { type: "null" },
                      { type: "string", enum: [...PRIORITIES] }
                    ]
                  },
                  project_id: { type: "string" }
                }
              }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["version", "name", "arguments"],
            properties: {
              version: { type: "integer", const: 1 },
              name: { type: "string", const: "create_reminder" },
              arguments: {
                type: "object",
                additionalProperties: false,
                required: ["title", "due_at", "kind"],
                properties: {
                  title: { type: "string" },
                  due_at: { type: "string" },
                  kind: { type: "string", enum: ["personal", "work", "health"] }
                }
              }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["version", "name", "arguments"],
            properties: {
              version: { type: "integer", const: 1 },
              name: { type: "string", const: "update_reminders" },
              arguments: {
                type: "object",
                additionalProperties: false,
                required: ["match_title", "new_title", "due_at", "kind"],
                properties: {
                  match_title: { type: "string" },
                  new_title: { type: ["string", "null"] },
                  due_at: { type: ["string", "null"] },
                  kind: { type: ["string", "null"] }
                }
              }
            }
          },
          ...["delete_reminders", "complete_reminders"].map((name) => ({
            type: "object",
            additionalProperties: false,
            required: ["version", "name", "arguments"],
            properties: {
              version: { type: "integer", const: 1 },
              name: { type: "string", const: name },
              arguments: {
                type: "object",
                additionalProperties: false,
                required: ["match_title"],
                properties: { match_title: { type: "string" } }
              }
            }
          })),
          ...[
            ["log_meal", {
              date: { type: "string" },
              meal_type: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack", "other"] },
              name: { type: "string" },
              serving_amount: { type: ["number", "null"] },
              serving_unit: { type: ["string", "null"] },
              calories: { type: ["number", "null"] },
              protein_grams: { type: ["number", "null"] },
              carbs_grams: { type: ["number", "null"] },
              fat_grams: { type: ["number", "null"] },
              fiber_grams: { type: ["number", "null"] },
              source_type: { type: "string" },
              source_id: { type: ["string", "null"] },
              source_label: { type: ["string", "null"] },
              source_url: { type: ["string", "null"] },
              confidence: { type: "string", enum: ["verified", "ai_estimate"] },
              assumptions: { type: ["string", "null"] },
              notes: { type: ["string", "null"] }
            }],
            ["log_body_measurement", {
              date: { type: "string" },
              recorded_at: { type: ["string", "null"] },
              weight: { type: ["number", "null"] },
              weight_unit: { type: ["string", "null"], enum: ["kg", "lb", null] },
              body_fat_percent: { type: ["number", "null"] },
              waist: { type: ["number", "null"] },
              waist_unit: { type: ["string", "null"], enum: ["cm", "in", null] },
              resting_heart_rate: { type: ["integer", "null"] },
              notes: { type: ["string", "null"] }
            }],
            ["log_sleep", {
              date: { type: "string" },
              started_at: { type: ["string", "null"] },
              ended_at: { type: ["string", "null"] },
              duration_hours: { type: ["number", "null"] },
              sleep_quality: { type: ["integer", "null"] },
              notes: { type: ["string", "null"] }
            }],
            ["log_workout", {
              date: { type: "string" },
              name: { type: "string" },
              type: { type: "string", enum: ["strength", "cardio", "mobility", "sport", "other"] },
              duration_minutes: { type: ["number", "null"] },
              distance: { type: ["number", "null"] },
              distance_unit: { type: ["string", "null"], enum: ["km", "mi", null] },
              calories_burned: { type: ["number", "null"] },
              effort: { type: ["integer", "null"] },
              exercises: {
                type: "array",
                maxItems: 100,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "name", "sets", "reps", "weight", "weight_unit", "distance",
                    "distance_unit", "duration_minutes"
                  ],
                  properties: {
                    name: { type: "string" },
                    sets: { type: ["integer", "null"] },
                    reps: { type: ["integer", "null"] },
                    weight: { type: ["number", "null"] },
                    weight_unit: { type: ["string", "null"], enum: ["kg", "lb", null] },
                    distance: { type: ["number", "null"] },
                    distance_unit: { type: ["string", "null"], enum: ["km", "mi", null] },
                    duration_minutes: { type: ["number", "null"] }
                  }
                }
              },
              notes: { type: ["string", "null"] }
            }],
            ["log_finance_transaction", {
              date: { type: "string" },
              label: { type: "string" },
              amount: { type: "string", pattern: "^(?:0|[1-9]\\d{0,11})(?:\\.\\d{1,2})?$" },
              kind: { type: "string", enum: ["expense", "income", "refund"] },
              currency: { type: "string", pattern: "^[A-Z]{3}$" },
              category: { type: ["string", "null"] },
              account: { type: ["string", "null"] },
              notes: { type: ["string", "null"] }
            }],
            ["log_study_session", {
              date: { type: "string" },
              title: { type: "string" },
              duration_minutes: { type: "integer" },
              learning_item_id: { type: ["string", "null"] },
              note: { type: ["string", "null"] }
            }],
            ["log_focus_session", {
              date: { type: "string" },
              title: { type: "string" },
              duration_minutes: { type: "integer" },
              project: { type: ["string", "null"] },
              tags: { type: "array", maxItems: 20, items: { type: "string" } },
              started_at: { type: ["string", "null"] },
              ended_at: { type: ["string", "null"] },
              focus_rating: { type: ["integer", "null"] },
              energy: { type: ["integer", "null"] },
              note: { type: ["string", "null"] }
            }]
          ].map(([name, properties]) => ({
            type: "object",
            additionalProperties: false,
            required: ["version", "name", "arguments"],
            properties: {
              version: { type: "integer", const: 1 },
              name: { type: "string", const: name },
              arguments: {
                type: "object",
                additionalProperties: false,
                required: Object.keys(properties),
                properties
              }
            }
          }))
        ]
      }
    }
  }
});

const ASSISTANT_ACTION_NAMES = [
  "create_calendar_schedule",
  "update_calendar_events",
  "delete_calendar_events",
  "create_task",
  "update_tasks",
  "delete_tasks",
  "complete_tasks",
  "create_reminder",
  "update_reminders",
  "delete_reminders",
  "complete_reminders",
  "log_meal",
  "log_body_measurement",
  "log_sleep",
  "log_workout",
  "log_finance_transaction",
  "log_study_session",
  "log_focus_session"
];

const ASSISTANT_PLAN_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["message", "actions"],
  properties: {
    message: { type: "string" },
    actions: {
      type: "array",
      maxItems: 32,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["version", "name", "arguments"],
        properties: {
          version: { type: "integer", const: 1 },
          name: { type: "string", enum: ASSISTANT_ACTION_NAMES },
          arguments: { type: "object" }
        }
      }
    }
  }
});

class AssistantServiceError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "AssistantServiceError";
    this.code = code;
    if (Number.isInteger(status)) this.status = status;
  }
}

function fail(code, message, status) {
  throw new AssistantServiceError(code, message, status);
}

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === [...expected].sort()[index]);
}

function cleanText(value, field, maxLength, allowEmpty = false) {
  if (typeof value !== "string") fail("INVALID_PLAN", `Assistant ${field} must be text.`);
  const result = value.replace(/\u0000/g, "").trim();
  if (!allowEmpty && !result) fail("INVALID_PLAN", `Assistant ${field} is required.`);
  if (result.length > maxLength) fail("INVALID_PLAN", `Assistant ${field} is too long.`);
  return result;
}

function validDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function cleanDate(value, field, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !validDate(value)) {
    fail("INVALID_PLAN", `Assistant ${field} must be a valid YYYY-MM-DD date.`);
  }
  return value;
}

function cleanDateTime(value, field) {
  if (typeof value !== "string" || !DATE_TIME_PATTERN.test(value)) {
    fail("INVALID_PLAN", `Assistant ${field} must include a timezone.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail("INVALID_PLAN", `Assistant ${field} is invalid.`);
  return { value, timestamp };
}

function cleanTime(value, field) {
  if (typeof value !== "string" || !TIME_PATTERN.test(value)) {
    fail("INVALID_PLAN", `Assistant ${field} must use local HH:MM time.`);
  }
  return value;
}

function cleanNumber(value, field, min, max, options = {}) {
  if (value === null && options.nullable) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("INVALID_PLAN", `Assistant ${field} must be a finite number.`);
  }
  if (options.integer && !Number.isInteger(value)) {
    fail("INVALID_PLAN", `Assistant ${field} must be an integer.`);
  }
  if (value < min || value > max) {
    fail("INVALID_PLAN", `Assistant ${field} is outside the allowed range.`);
  }
  return value;
}

function cleanNullableText(value, field, maxLength) {
  return value === null ? null : cleanText(value, field, maxLength, true);
}

function validatePair(args, valueKey, unitKey, units, field, min, max) {
  const value = cleanNumber(args[valueKey], `${field} value`, min, max, { nullable: true });
  const unit = args[unitKey];
  if ((value === null) !== (unit === null)) {
    fail("INVALID_PLAN", `Assistant ${field} value and unit must be supplied together.`);
  }
  if (unit !== null && !units.includes(unit)) {
    fail("INVALID_PLAN", `Assistant ${field} unit is invalid.`);
  }
  return value === null ? null : { value, unit };
}

function optionalNormalized(target, key, value) {
  if (value !== null && value !== "") target[key] = value;
}

function validateMealAction(args) {
  const keys = [
    "date", "meal_type", "name", "serving_amount", "serving_unit", "calories",
    "protein_grams", "carbs_grams", "fat_grams", "fiber_grams", "source_type",
    "source_id", "source_label", "source_url", "confidence", "assumptions", "notes"
  ];
  if (!exactKeys(args, keys)) fail("INVALID_PLAN", "Meal action has unsupported fields.");
  if (!["breakfast", "lunch", "dinner", "snack", "other"].includes(args.meal_type)) {
    fail("INVALID_PLAN", "Meal type is invalid.");
  }
  const serving = validatePair(
    args,
    "serving_amount",
    "serving_unit",
    ["g", "ml", "oz", "cup", "tbsp", "tsp", "piece", "serving", "meal"],
    "meal serving",
    0.001,
    100000
  );
  const normalized = {
    date: cleanDate(args.date, "meal date"),
    meal_type: args.meal_type,
    name: cleanText(args.name, "meal name", 240),
    source_type: cleanText(args.source_type, "meal source type", 80),
    confidence: args.confidence
  };
  if (!["verified", "ai_estimate"].includes(args.confidence)) {
    fail("INVALID_PLAN", "Meal confidence is invalid.");
  }
  if (serving) {
    normalized.serving_amount = serving.value;
    normalized.serving_unit = serving.unit;
  }
  for (const [key, max] of Object.entries({
    calories: 20000,
    protein_grams: 5000,
    carbs_grams: 5000,
    fat_grams: 5000,
    fiber_grams: 1000
  })) {
    optionalNormalized(
      normalized,
      key,
      cleanNumber(args[key], `meal ${key}`, 0, max, { nullable: true })
    );
  }
  const sourceId = cleanNullableText(args.source_id, "meal source id", 240);
  const sourceLabel = cleanNullableText(args.source_label, "meal source label", 240);
  const sourceUrl = cleanNullableText(args.source_url, "meal source URL", 1000);
  const assumptions = cleanNullableText(args.assumptions, "meal assumptions", 1000);
  if (args.confidence === "verified") {
    if (normalized.source_type === "ai_estimate" || !sourceId || !sourceLabel || !sourceUrl) {
      fail("INVALID_PLAN", "Verified meal nutrition requires complete source metadata.");
    }
    try {
      const url = new URL(sourceUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocol");
    } catch {
      fail("INVALID_PLAN", "Meal source URL is invalid.");
    }
  } else if (normalized.source_type !== "ai_estimate" || !assumptions) {
    fail("INVALID_PLAN", "AI-estimated meal nutrition requires ai_estimate provenance and assumptions.");
  }
  optionalNormalized(normalized, "source_id", sourceId);
  optionalNormalized(normalized, "source_label", sourceLabel);
  optionalNormalized(normalized, "source_url", sourceUrl);
  optionalNormalized(normalized, "assumptions", assumptions);
  optionalNormalized(normalized, "notes", cleanNullableText(args.notes, "meal notes", 2000));
  return normalized;
}

function validateBodyMeasurementAction(args) {
  const keys = [
    "date", "recorded_at", "weight", "weight_unit", "body_fat_percent", "waist",
    "waist_unit", "resting_heart_rate", "notes"
  ];
  if (!exactKeys(args, keys)) fail("INVALID_PLAN", "Body measurement action has unsupported fields.");
  const weight = validatePair(args, "weight", "weight_unit", ["kg", "lb"], "body weight", 0.1, 2205);
  const waist = validatePair(args, "waist", "waist_unit", ["cm", "in"], "waist", 0.1, 500);
  const bodyFat = cleanNumber(
    args.body_fat_percent, "body fat percent", 0, 100, { nullable: true }
  );
  const heartRate = cleanNumber(
    args.resting_heart_rate, "resting heart rate", 20, 300, { nullable: true, integer: true }
  );
  if (!weight && !waist && bodyFat === null && heartRate === null) {
    fail("INVALID_PLAN", "Body measurement action has no measurements.");
  }
  const normalized = { date: cleanDate(args.date, "body measurement date") };
  if (args.recorded_at !== null) {
    normalized.recorded_at = cleanDateTime(args.recorded_at, "body measurement time").value;
  }
  if (weight) {
    normalized.weight = weight.value;
    normalized.weight_unit = weight.unit;
  }
  optionalNormalized(normalized, "body_fat_percent", bodyFat);
  if (waist) {
    normalized.waist = waist.value;
    normalized.waist_unit = waist.unit;
  }
  optionalNormalized(normalized, "resting_heart_rate", heartRate);
  optionalNormalized(normalized, "notes", cleanNullableText(args.notes, "body measurement notes", 1000));
  return normalized;
}

function validateSleepAction(args) {
  const keys = ["date", "started_at", "ended_at", "duration_hours", "sleep_quality", "notes"];
  if (!exactKeys(args, keys)) fail("INVALID_PLAN", "Sleep action has unsupported fields.");
  if ((args.started_at === null) !== (args.ended_at === null)) {
    fail("INVALID_PLAN", "Sleep start and end times must be supplied together.");
  }
  const normalized = { date: cleanDate(args.date, "sleep date") };
  let duration = cleanNumber(args.duration_hours, "sleep duration", 0, 24, { nullable: true });
  if (args.started_at !== null) {
    const start = cleanDateTime(args.started_at, "sleep start time");
    const end = cleanDateTime(args.ended_at, "sleep end time");
    const elapsed = (end.timestamp - start.timestamp) / 3600000;
    if (elapsed < 0 || elapsed > 24) fail("INVALID_PLAN", "Sleep time range is invalid.");
    const calculated = Math.round(elapsed * 100) / 100;
    if (duration !== null && Math.abs(duration - calculated) > 0.05) {
      fail("INVALID_PLAN", "Sleep duration does not match its time range.");
    }
    normalized.started_at = start.value;
    normalized.ended_at = end.value;
    duration = calculated;
  }
  const quality = cleanNumber(
    args.sleep_quality, "sleep quality", 1, 5, { nullable: true, integer: true }
  );
  if (duration === null && quality === null) fail("INVALID_PLAN", "Sleep action has no observation.");
  optionalNormalized(normalized, "duration_hours", duration);
  optionalNormalized(normalized, "sleep_quality", quality);
  optionalNormalized(normalized, "notes", cleanNullableText(args.notes, "sleep notes", 1000));
  return normalized;
}

function validateExercise(exercise, index) {
  const keys = [
    "name", "sets", "reps", "weight", "weight_unit", "distance", "distance_unit",
    "duration_minutes"
  ];
  if (!exactKeys(exercise, keys)) fail("INVALID_PLAN", "Workout exercise has unsupported fields.");
  const weight = validatePair(
    exercise, "weight", "weight_unit", ["kg", "lb"], `exercise ${index + 1} weight`, 0, 2205
  );
  const distance = validatePair(
    exercise, "distance", "distance_unit", ["km", "mi"], `exercise ${index + 1} distance`, 0, 1000
  );
  const normalized = { name: cleanText(exercise.name, "exercise name", 180) };
  optionalNormalized(normalized, "sets", cleanNumber(
    exercise.sets, "exercise sets", 0, 1000, { nullable: true, integer: true }
  ));
  optionalNormalized(normalized, "reps", cleanNumber(
    exercise.reps, "exercise reps", 0, 100000, { nullable: true, integer: true }
  ));
  if (weight) {
    normalized.weight = weight.value;
    normalized.weight_unit = weight.unit;
  }
  if (distance) {
    normalized.distance = distance.value;
    normalized.distance_unit = distance.unit;
  }
  optionalNormalized(normalized, "duration_minutes", cleanNumber(
    exercise.duration_minutes, "exercise duration", 0, 1440, { nullable: true }
  ));
  return normalized;
}

function validateWorkoutAction(args) {
  const keys = [
    "date", "name", "type", "duration_minutes", "distance", "distance_unit",
    "calories_burned", "effort", "exercises", "notes"
  ];
  if (!exactKeys(args, keys)) fail("INVALID_PLAN", "Workout action has unsupported fields.");
  if (!["strength", "cardio", "mobility", "sport", "other"].includes(args.type)) {
    fail("INVALID_PLAN", "Workout type is invalid.");
  }
  if (!Array.isArray(args.exercises) || args.exercises.length > 100) {
    fail("INVALID_PLAN", "Workout exercises are invalid.");
  }
  const distance = validatePair(
    args, "distance", "distance_unit", ["km", "mi"], "workout distance", 0, 1000
  );
  const normalized = {
    date: cleanDate(args.date, "workout date"),
    name: cleanText(args.name, "workout name", 180),
    type: args.type,
    exercises: args.exercises.map(validateExercise)
  };
  optionalNormalized(normalized, "duration_minutes", cleanNumber(
    args.duration_minutes, "workout duration", 0, 1440, { nullable: true }
  ));
  if (distance) {
    normalized.distance = distance.value;
    normalized.distance_unit = distance.unit;
  }
  optionalNormalized(normalized, "calories_burned", cleanNumber(
    args.calories_burned, "workout calories", 0, 20000, { nullable: true }
  ));
  optionalNormalized(normalized, "effort", cleanNumber(
    args.effort, "workout effort", 1, 5, { nullable: true, integer: true }
  ));
  optionalNormalized(normalized, "notes", cleanNullableText(args.notes, "workout notes", 2000));
  return normalized;
}

function validateFinanceAction(args) {
  const keys = ["date", "label", "amount", "kind", "currency", "category", "account", "notes"];
  if (!exactKeys(args, keys)) fail("INVALID_PLAN", "Finance action has unsupported fields.");
  if (typeof args.amount !== "string"
    || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(args.amount)
    || Number(args.amount) <= 0) {
    fail("INVALID_PLAN", "Finance amount must be a positive decimal string.");
  }
  if (!["expense", "income", "refund"].includes(args.kind)) {
    fail("INVALID_PLAN", "Finance transaction kind is invalid.");
  }
  if (typeof args.currency !== "string" || !/^[A-Z]{3}$/.test(args.currency)) {
    fail("INVALID_PLAN", "Finance currency is invalid.");
  }
  const normalized = {
    date: cleanDate(args.date, "finance date"),
    label: cleanText(args.label, "finance label", 180),
    amount: args.amount,
    kind: args.kind,
    currency: args.currency
  };
  optionalNormalized(normalized, "category", cleanNullableText(args.category, "finance category", 120));
  optionalNormalized(normalized, "account", cleanNullableText(args.account, "finance account", 120));
  optionalNormalized(normalized, "notes", cleanNullableText(args.notes, "finance notes", 2000));
  return normalized;
}

function validateStudyAction(args) {
  const keys = ["date", "title", "duration_minutes", "learning_item_id", "note"];
  if (!exactKeys(args, keys)) fail("INVALID_PLAN", "Study action has unsupported fields.");
  const normalized = {
    date: cleanDate(args.date, "study date"),
    title: cleanText(args.title, "study title", 240),
    duration_minutes: cleanNumber(
      args.duration_minutes, "study duration", 1, 1440, { integer: true }
    )
  };
  optionalNormalized(
    normalized,
    "learning_item_id",
    cleanNullableText(args.learning_item_id, "learning item id", 180)
  );
  optionalNormalized(normalized, "note", cleanNullableText(args.note, "study note", 4000));
  return normalized;
}

function validateFocusAction(args) {
  const keys = [
    "date", "title", "duration_minutes", "project", "tags", "started_at", "ended_at",
    "focus_rating", "energy", "note"
  ];
  if (!exactKeys(args, keys)) fail("INVALID_PLAN", "Focus action has unsupported fields.");
  const startedAt = cleanNullableText(args.started_at, "focus start time", 40);
  const endedAt = cleanNullableText(args.ended_at, "focus end time", 40);
  if ((startedAt === null) !== (endedAt === null)) {
    fail("INVALID_PLAN", "Focus start and end times must be supplied together.");
  }
  const normalized = {
    date: cleanDate(args.date, "focus date"),
    title: cleanText(args.title, "focus title", 240),
    duration_minutes: cleanNumber(
      args.duration_minutes, "focus duration", 1, 1440, { integer: true }
    )
  };
  optionalNormalized(normalized, "project", cleanNullableText(args.project, "focus project", 180));
  if (!Array.isArray(args.tags) || args.tags.length > 20) {
    fail("INVALID_PLAN", "Focus tags must be an array of at most 20 items.");
  }
  normalized.tags = args.tags.map((tag) => cleanText(tag, "focus tag", 80));
  if (startedAt) {
    const start = cleanDateTime(startedAt, "focus start time").value;
    const end = cleanDateTime(endedAt, "focus end time").value;
    if (new Date(end) <= new Date(start)) fail("INVALID_PLAN", "Focus end time must be after start time.");
    normalized.started_at = start;
    normalized.ended_at = end;
  }
  optionalNormalized(
    normalized,
    "focus_rating",
    cleanNumber(args.focus_rating, "focus rating", 1, 5, { nullable: true, integer: true })
  );
  optionalNormalized(
    normalized,
    "energy",
    cleanNumber(args.energy, "focus energy", 1, 5, { nullable: true, integer: true })
  );
  optionalNormalized(normalized, "note", cleanNullableText(args.note, "focus note", 2000));
  return normalized;
}

function optionalArgument(target, key, value) {
  if (value !== null && value !== "") target[key] = value;
}

function validateCalendarMatch(args, includeNewTitle) {
  const keys = includeNewTitle
    ? [...CALENDAR_MATCH_KEYS, "new_title"]
    : [...CALENDAR_MATCH_KEYS];
  if (!exactKeys(args, keys)) fail("INVALID_PLAN", "Calendar mutation has unsupported fields.");
  const normalized = {
    match_title: cleanText(args.match_title, "calendar match title", 180)
  };
  const startDate = args.start_date === null
    ? null
    : cleanDate(args.start_date, "calendar match start date");
  const endDate = args.end_date === null
    ? null
    : cleanDate(args.end_date, "calendar match end date");
  if (startDate && endDate && endDate < startDate) {
    fail("INVALID_PLAN", "Calendar match cannot end before it starts.");
  }
  const startTime = args.start_time === null
    ? null
    : cleanTime(args.start_time, "calendar match start time");
  const endTime = args.end_time === null
    ? null
    : cleanTime(args.end_time, "calendar match end time");
  if (args.weekdays !== null && (!Array.isArray(args.weekdays) || args.weekdays.length === 0)) {
    fail("INVALID_PLAN", "Calendar match weekdays are invalid.");
  }
  const weekdays = args.weekdays === null ? null : [...new Set(args.weekdays)];
  if (weekdays && (
    weekdays.length !== args.weekdays.length
    || weekdays.length > 7
    || weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  )) {
    fail("INVALID_PLAN", "Calendar match weekdays are invalid.");
  }
  optionalArgument(normalized, "start_date", startDate);
  optionalArgument(normalized, "end_date", endDate);
  optionalArgument(normalized, "start_time", startTime);
  optionalArgument(normalized, "end_time", endTime);
  optionalArgument(normalized, "weekdays", weekdays);
  if (includeNewTitle) {
    normalized.new_title = cleanText(args.new_title, "new calendar title", 180);
  }
  return normalized;
}

function validateAction(action) {
  if (!exactKeys(action, ["version", "name", "arguments"])
    || action.version !== 1
    || typeof action.name !== "string"
    || !isRecord(action.arguments)) {
    fail("INVALID_PLAN", "Assistant action is invalid.");
  }
  const args = action.arguments;

  if (action.name === "create_calendar_schedule") {
    const keys = [
      "title", "start_date", "end_date", "start_time", "end_time",
      "weekdays", "category", "location", "notes"
    ];
    if (!exactKeys(args, keys)) fail("INVALID_PLAN", "Calendar action has unsupported fields.");
    const startDate = cleanDate(args.start_date, "calendar start date");
    const endDate = cleanDate(args.end_date, "calendar end date");
    const startTime = cleanTime(args.start_time, "calendar start time");
    const endTime = cleanTime(args.end_time, "calendar end time");
    if (endDate < startDate) fail("INVALID_PLAN", "Calendar action cannot end before it starts.");
    if (endTime <= startTime) fail("INVALID_PLAN", "Calendar action must end after it starts.");
    if (!CATEGORIES.has(args.category)) fail("INVALID_PLAN", "Calendar category is invalid.");
    if (args.weekdays !== null && (!Array.isArray(args.weekdays) || args.weekdays.length === 0)) {
      fail("INVALID_PLAN", "Calendar weekdays are invalid.");
    }
    const weekdays = args.weekdays === null ? null : [...new Set(args.weekdays)];
    if (weekdays && (
      weekdays.length !== args.weekdays.length
      || weekdays.length > 7
      || weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
    )) {
      fail("INVALID_PLAN", "Calendar weekdays are invalid.");
    }
    if (startDate !== endDate && !weekdays) {
      fail("INVALID_PLAN", "A calendar date range requires weekdays.");
    }
    const normalized = {
      title: cleanText(args.title, "calendar title", 180),
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime
    };
    optionalArgument(normalized, "weekdays", weekdays);
    optionalArgument(normalized, "category", args.category);
    optionalArgument(normalized, "location", cleanText(args.location, "calendar location", 240, true));
    optionalArgument(normalized, "notes", cleanText(args.notes, "calendar notes", 2000, true));
    return {
      version: 1,
      name: action.name,
      arguments: normalized
    };
  }

  if (action.name === "update_calendar_events") {
    return {
      version: 1,
      name: action.name,
      arguments: validateCalendarMatch(args, true)
    };
  }

  if (action.name === "delete_calendar_events") {
    return {
      version: 1,
      name: action.name,
      arguments: validateCalendarMatch(args, false)
    };
  }

  if (action.name === "create_task") {
    if (!exactKeys(args, ["title", "notes", "due_date", "priority", "project_id"])) {
      fail("INVALID_PLAN", "Task action has unsupported fields.");
    }
    if (args.priority !== null && !PRIORITIES.has(args.priority)) {
      fail("INVALID_PLAN", "Task priority is invalid.");
    }
    const normalized = {
      title: cleanText(args.title, "task title", 180)
    };
    optionalArgument(normalized, "notes", cleanText(args.notes, "task notes", 2000, true));
    optionalArgument(normalized, "due_date", cleanDate(args.due_date, "task due date", true));
    optionalArgument(normalized, "priority", args.priority);
    optionalArgument(normalized, "project_id", cleanText(args.project_id, "task project", 180, true));
    return {
      version: 1,
      name: action.name,
      arguments: normalized
    };
  }

  if (action.name === "update_tasks") {
    const keys = ["match_title", "new_title", "notes", "due_date", "priority", "project_id"];
    if (!exactKeys(args, keys)) fail("INVALID_PLAN", "Task update has unsupported fields.");
    if (args.priority !== null && !PRIORITIES.has(args.priority)) {
      fail("INVALID_PLAN", "Task priority is invalid.");
    }
    const normalized = {
      match_title: cleanText(args.match_title, "task match title", 180)
    };
    optionalArgument(normalized, "new_title", args.new_title === null
      ? null
      : cleanText(args.new_title, "new task title", 180));
    optionalArgument(normalized, "notes", args.notes === null
      ? null
      : cleanText(args.notes, "task notes", 2000, true));
    optionalArgument(normalized, "due_date", cleanDate(args.due_date, "task due date", true));
    optionalArgument(normalized, "priority", args.priority);
    optionalArgument(normalized, "project_id", args.project_id === null
      ? null
      : cleanText(args.project_id, "task project", 180, true));
    if (Object.keys(normalized).length === 1) fail("INVALID_PLAN", "Task update has no changes.");
    return { version: 1, name: action.name, arguments: normalized };
  }

  if (action.name === "delete_tasks" || action.name === "complete_tasks") {
    if (!exactKeys(args, ["match_title"])) fail("INVALID_PLAN", "Task match has unsupported fields.");
    return {
      version: 1,
      name: action.name,
      arguments: { match_title: cleanText(args.match_title, "task match title", 180) }
    };
  }

  if (action.name === "create_reminder") {
    if (!exactKeys(args, ["title", "due_at", "kind"])) {
      fail("INVALID_PLAN", "Reminder action has unsupported fields.");
    }
    if (!["personal", "work", "health"].includes(args.kind)) {
      fail("INVALID_PLAN", "Reminder kind is invalid.");
    }
    return {
      version: 1,
      name: action.name,
      arguments: {
        title: cleanText(args.title, "reminder title", 180),
        due_at: cleanDateTime(args.due_at, "reminder time").value,
        kind: args.kind
      }
    };
  }

  if (action.name === "update_reminders") {
    if (!exactKeys(args, ["match_title", "new_title", "due_at", "kind"])) {
      fail("INVALID_PLAN", "Reminder update has unsupported fields.");
    }
    const normalized = {
      match_title: cleanText(args.match_title, "reminder match title", 180)
    };
    optionalArgument(normalized, "new_title", args.new_title === null
      ? null
      : cleanText(args.new_title, "new reminder title", 180));
    optionalArgument(normalized, "due_at", args.due_at === null
      ? null
      : cleanDateTime(args.due_at, "reminder time").value);
    optionalArgument(normalized, "kind", args.kind === null
      ? null
      : cleanText(args.kind, "reminder kind", 80));
    if (Object.keys(normalized).length === 1) fail("INVALID_PLAN", "Reminder update has no changes.");
    return { version: 1, name: action.name, arguments: normalized };
  }

  if (action.name === "delete_reminders" || action.name === "complete_reminders") {
    if (!exactKeys(args, ["match_title"])) fail("INVALID_PLAN", "Reminder match has unsupported fields.");
    return {
      version: 1,
      name: action.name,
      arguments: { match_title: cleanText(args.match_title, "reminder match title", 180) }
    };
  }

  const domainValidators = {
    log_meal: validateMealAction,
    log_body_measurement: validateBodyMeasurementAction,
    log_sleep: validateSleepAction,
    log_workout: validateWorkoutAction,
    log_finance_transaction: validateFinanceAction,
    log_study_session: validateStudyAction,
    log_focus_session: validateFocusAction
  };
  if (domainValidators[action.name]) {
    return {
      version: 1,
      name: action.name,
      arguments: domainValidators[action.name](args)
    };
  }

  fail("INVALID_PLAN", "Assistant action type is not allowed.");
}

function parseAssistantPlan(value) {
  let parsed = value;
  if (typeof value === "string") {
    let text = value.trim();
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) text = fenced[1];
    try {
      parsed = JSON.parse(text);
    } catch {
      fail("INVALID_PLAN", "Assistant returned invalid JSON.");
    }
  }

  if (!exactKeys(parsed, ["message", "actions"])) {
    fail("INVALID_PLAN", "Assistant plan has unsupported fields.");
  }
  if (!Array.isArray(parsed.actions) || parsed.actions.length > 32) {
    fail("INVALID_PLAN", "Assistant actions are invalid.");
  }
  return {
    message: cleanText(parsed.message, "message", 2000),
    actions: parsed.actions.map(validateAction)
  };
}

function groundMealProvenance(plan, prompt) {
  const source = String(prompt || "").toLocaleLowerCase();
  return {
    ...plan,
    actions: plan.actions.map((action) => {
      if (action.name !== "log_meal" || action.arguments.confidence !== "verified") {
        return action;
      }
      const args = action.arguments;
      const grounded = ["source_id", "source_label", "source_url"].every((key) => (
        typeof args[key] === "string"
        && args[key]
        && source.includes(args[key].toLocaleLowerCase())
      ));
      if (grounded) return action;
      return {
        ...action,
        arguments: {
          ...args,
          source_type: "ai_estimate",
          confidence: "ai_estimate",
          assumptions: args.assumptions || "Estimated from the described meal and serving.",
          source_id: undefined,
          source_label: undefined,
          source_url: undefined
        }
      };
    }).map((action) => ({
      ...action,
      arguments: Object.fromEntries(
        Object.entries(action.arguments).filter(([, value]) => value !== undefined)
      )
    }))
  };
}

function extractResponseText(response) {
  if (!isRecord(response)) fail("INVALID_RESPONSE", "OpenAI returned an invalid response.");
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  const parts = [];
  for (const item of Array.isArray(response.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "refusal") fail("MODEL_REFUSAL", "The assistant could not complete that request.");
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  if (!parts.length) fail("INVALID_RESPONSE", "OpenAI returned no assistant plan.");
  return parts.join("");
}

function storageAdapter(options, operation) {
  const storage = options.safeStorage;
  const callback = options[operation];
  if (typeof callback === "function") return callback;
  if (!storage) fail("CREDENTIAL_STORAGE_UNAVAILABLE", "Secure credential storage is unavailable.");
  let available = true;
  try {
    available = typeof storage.isEncryptionAvailable !== "function"
      || storage.isEncryptionAvailable();
  } catch {
    fail("CREDENTIAL_STORAGE_UNAVAILABLE", "Secure credential storage is unavailable.");
  }
  if (!available) {
    fail("CREDENTIAL_STORAGE_UNAVAILABLE", "Secure credential storage is unavailable.");
  }
  const method = operation === "encrypt" ? "encryptString" : "decryptString";
  if (typeof storage[method] !== "function") {
    fail("CREDENTIAL_STORAGE_UNAVAILABLE", "Secure credential storage is unavailable.");
  }
  return operation === "encrypt"
    ? (secret) => storage.encryptString(secret)
    : (ciphertext) => storage.decryptString(ciphertext);
}

function ciphertextBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  fail("CREDENTIAL_STORAGE_FAILED", "Secure credential storage failed.");
}

async function writeCredentialConfig(options = {}) {
  const filePath = options.filePath;
  const apiKey = typeof options.apiKey === "string" ? options.apiKey.trim() : "";
  if (!filePath || typeof filePath !== "string") fail("INVALID_ARGUMENT", "Credential path is required.");
  if (!apiKey) fail("INVALID_ARGUMENT", "An API key is required.");
  const encrypt = storageAdapter(options, "encrypt");
  let encrypted;
  try {
    encrypted = ciphertextBuffer(await encrypt(apiKey));
  } catch (error) {
    if (error instanceof AssistantServiceError) throw error;
    fail("CREDENTIAL_STORAGE_FAILED", "Secure credential storage failed.");
  }
  const io = options.fsPromises || fs.promises;
  const document = JSON.stringify({
    version: 1,
    protected: true,
    ciphertext: encrypted.toString("base64")
  });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await io.mkdir(path.dirname(filePath), { recursive: true });
    await io.writeFile(tempPath, document, { encoding: "utf8", mode: 0o600 });
    await io.rename(tempPath, filePath);
    if (typeof io.chmod === "function") await io.chmod(filePath, 0o600);
  } catch {
    try {
      await io.unlink(tempPath);
    } catch {}
    fail("CREDENTIAL_WRITE_FAILED", "Could not save the OpenAI credential.");
  }
  return { configured: true, protected: true };
}

async function readCredentialConfig(options = {}) {
  if (!options.filePath || typeof options.filePath !== "string") {
    fail("INVALID_ARGUMENT", "Credential path is required.");
  }
  let document;
  try {
    document = JSON.parse(await (options.fsPromises || fs.promises).readFile(options.filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { configured: false, protected: false };
    fail("CREDENTIAL_READ_FAILED", "Could not read the OpenAI credential.");
  }
  const valid = exactKeys(document, ["version", "protected", "ciphertext"])
    && document.version === 1
    && document.protected === true
    && typeof document.ciphertext === "string"
    && document.ciphertext.length > 0;
  if (!valid) fail("CREDENTIAL_READ_FAILED", "The OpenAI credential file is invalid.");
  return { configured: true, protected: true };
}

async function loadApiKey(options) {
  if (typeof options.getApiKey === "function") {
    try {
      const value = await options.getApiKey();
      if (typeof value === "string" && value.trim()) return value.trim();
    } catch {
      fail("CREDENTIAL_READ_FAILED", "Could not read the OpenAI credential.");
    }
  }
  if (typeof options.apiKey === "string" && options.apiKey.trim()) return options.apiKey.trim();
  if (!options.credentialFilePath) fail("MISSING_CREDENTIAL", "OpenAI is not configured.");

  let document;
  try {
    document = JSON.parse(await (options.fsPromises || fs.promises).readFile(
      options.credentialFilePath,
      "utf8"
    ));
  } catch {
    fail("CREDENTIAL_READ_FAILED", "Could not read the OpenAI credential.");
  }
  if (!isRecord(document) || typeof document.ciphertext !== "string") {
    fail("CREDENTIAL_READ_FAILED", "The OpenAI credential file is invalid.");
  }
  const decrypt = storageAdapter(options, "decrypt");
  try {
    const secret = await decrypt(Buffer.from(document.ciphertext, "base64"));
    if (typeof secret !== "string" || !secret.trim()) throw new Error("invalid");
    return secret.trim();
  } catch {
    fail("CREDENTIAL_STORAGE_FAILED", "Could not unlock the OpenAI credential.");
  }
}

function apiUrl(baseUrl, endpoint) {
  return `${String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "")}${endpoint}`;
}

async function fetchJson(fetchImpl, url, init) {
  let response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    fail("NETWORK_ERROR", "OpenAI request could not be completed.");
  }
  if (!response || typeof response.ok !== "boolean") {
    fail("NETWORK_ERROR", "OpenAI request could not be completed.");
  }
  if (!response.ok) {
    fail("OPENAI_ERROR", `OpenAI request failed with status ${response.status || "unknown"}.`, response.status);
  }
  try {
    return await response.json();
  } catch {
    fail("INVALID_RESPONSE", "OpenAI returned an invalid response.");
  }
}

function assistantInstructions(options) {
  const currentDate = cleanText(options.currentDate || new Date().toISOString().slice(0, 10), "current date", 10);
  const timeZone = cleanText(options.timeZone || "UTC", "timezone", 100);
  const currentDateTime = cleanText(options.currentDateTime || new Date().toISOString(), "current date-time", 40);
  return [
    "You are the Focus personal assistant. Convert the user's request into a concise message and zero or more actions.",
    `Today is ${currentDate}. The current timestamp is ${currentDateTime}. The user's timezone is ${timeZone}.`,
    "Calendar schedule dates use YYYY-MM-DD, local times use HH:MM, and weekdays use 0 for Sunday through 6 for Saturday.",
    "Reminder timestamps use RFC 3339 with an explicit timezone offset.",
    "For repeating calendar work, emit one create_calendar_schedule action with a date range and weekdays.",
    "For renaming existing events, emit update_calendar_events. For removing existing events, emit delete_calendar_events.",
    "For task changes use update_tasks, delete_tasks, or complete_tasks. For reminder changes use update_reminders, delete_reminders, or complete_reminders.",
    "Use log_meal, log_body_measurement, log_sleep, log_workout, log_finance_transaction, log_study_session, and log_focus_session only for observations the user explicitly asks to record.",
    "Domain dates use YYYY-MM-DD. Body recorded_at and sleep started_at/ended_at use RFC 3339 with an explicit timezone.",
    "Never invent finance amounts, transaction kinds, dates, currencies, categories, or accounts; ambiguous signs or currencies produce no finance action.",
    "Never invent body values, measurement units, sleep times, sleep duration, workout details, or study duration.",
    "Body weight and waist, workout weight and distance, and meal serving amounts must always include their matching unit.",
    "Finance amount is a positive decimal string without a currency symbol; kind carries whether it is expense, income, or refund.",
    "For meals, preserve supplied nutrition lookup metadata. Use confidence verified only when source_type, source_id, source_label, and source_url came from a supplied lookup match.",
    "When context includes resolved_nutrition, copy its calculated nutrients and provenance exactly into one log_meal action.",
    "Use application_context as the authoritative permission-filtered view of application records. Never claim access to data absent from it.",
    "When meal nutrition is not backed by supplied source metadata, use source_type and confidence ai_estimate and state portion and nutrition assumptions.",
    "A request containing task must use only task actions. A request containing remind or reminder must use only reminder actions unless it explicitly says calendar.",
    "Use pending_proposal from context when the user corrects an unapproved proposal.",
    "Calendar mutation match_title is an exact case-insensitive title match; add only the date, time, and weekday constraints explicitly requested.",
    "Never use create_calendar_schedule for a rename, deletion, correction, replacement, or request containing change, rename, remove, delete, keep, instead, or no.",
    "Never turn a request to delete events into a new schedule. If the requested mutation cannot be expressed safely or the target is unclear, return no actions and explain what detail is needed.",
    "Only emit actions the user explicitly requested. Never invent dates, people, locations, or commitments.",
    "The application will ask the user to approve actions before applying them."
  ].join(" ");
}

function promptContext(prompt) {
  const line = String(prompt || "").split("\n").find((entry) => entry.trim().startsWith("{"));
  if (!line) return {};
  try {
    const parsed = JSON.parse(line);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function resolvedNutritionPlan(options, prompt) {
  const context = promptContext(prompt);
  const resolved = context.resolved_nutrition;
  const nutritionError = typeof context.nutrition_resolution_error === "string"
    ? context.nutrition_resolution_error.trim()
    : "";
  if (!resolved && nutritionError
    && /\b(?:ate|eaten|had|consumed|meal|food|eggs?|bacon|toast|bread|butter)\b/i.test(
      String(options.currentRequest || "")
    )) {
    return {
      message: `${nutritionError} Please give a brand or a clearer quantity so I can calculate verified nutrients.`,
      actions: []
    };
  }
  if (!isRecord(resolved)
    || resolved.confidence !== "verified"
    || !resolved.name
    || !resolved.sourceId
    || !resolved.sourceLabel
    || !resolved.sourceUrl) {
    return null;
  }
  const request = String(options.currentRequest || "");
  const mealType = /\bbreakfast\b/i.test(request)
    ? "breakfast"
    : /\blunch\b/i.test(request)
      ? "lunch"
      : /\bdinner|supper|tea\b/i.test(request)
        ? "dinner"
        : /\bsnack\b/i.test(request) ? "snack" : "other";
  return parseAssistantPlan({
    message: `I matched the foods against ${resolved.sourceLabel} and calculated the meal nutrients.`,
    actions: [{
      version: 1,
      name: "log_meal",
      arguments: {
        date: options.currentDate || new Date().toISOString().slice(0, 10),
        meal_type: mealType,
        name: resolved.name,
        serving_amount: resolved.servingAmount || 1,
        serving_unit: resolved.servingUnit || "meal",
        calories: resolved.calories ?? null,
        protein_grams: resolved.proteinGrams ?? null,
        carbs_grams: resolved.carbsGrams ?? null,
        fat_grams: resolved.fatGrams ?? null,
        fiber_grams: resolved.fiberGrams ?? null,
        source_type: resolved.sourceType,
        source_id: resolved.sourceId,
        source_label: resolved.sourceLabel,
        source_url: resolved.sourceUrl,
        confidence: "verified",
        assumptions: resolved.assumptions || null,
        notes: Array.isArray(resolved.components)
          ? resolved.components.map((component) => (
            `${component.text} matched ${component.matchedName}`
          )).join("; ")
          : null
      }
    }]
  });
}

async function requestAssistantPlan(options = {}) {
  const prompt = cleanText(options.prompt, "request", 12000);
  const resolvedPlan = resolvedNutritionPlan(options, prompt);
  if (resolvedPlan) return resolvedPlan;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("INVALID_ARGUMENT", "Fetch is unavailable.");
  const apiKey = await loadApiKey(options);
  const body = {
    model: options.model || DEFAULT_ASSISTANT_MODEL,
    instructions: assistantInstructions(options),
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "focus_assistant_plan",
        strict: true,
        schema: DETAILED_ASSISTANT_PLAN_SCHEMA
      }
    },
    max_output_tokens: 2400,
    store: false
  };
  const response = await fetchJson(fetchImpl, apiUrl(options.baseUrl, "/v1/responses"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const plan = groundMealProvenance(
    parseAssistantPlan(extractResponseText(response)),
    prompt
  );
  if (JSON.stringify(plan).includes(apiKey)) {
    fail("INVALID_RESPONSE", "OpenAI returned an unsafe response.");
  }
  return plan;
}

function audioBlob(audio, mimeType) {
  if (audio instanceof Blob) return audio;
  if (audio instanceof ArrayBuffer) return new Blob([audio], { type: mimeType });
  if (ArrayBuffer.isView(audio)) {
    return new Blob([audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength)], {
      type: mimeType
    });
  }
  fail("INVALID_ARGUMENT", "Audio must be a Blob, ArrayBuffer, or typed array.");
}

function safeFilename(value) {
  const result = String(value || "recording.webm")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return result || "recording.webm";
}

async function transcribeAudio(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("INVALID_ARGUMENT", "Fetch is unavailable.");
  const apiKey = await loadApiKey(options);
  const form = new FormData();
  form.append("file", audioBlob(options.audio, options.mimeType || "audio/webm"), safeFilename(options.filename));
  form.append("model", TRANSCRIPTION_MODEL);
  if (options.language) form.append("language", cleanText(options.language, "language", 20));
  if (options.prompt) form.append("prompt", cleanText(options.prompt, "transcription prompt", 1000));

  const response = await fetchJson(fetchImpl, apiUrl(options.baseUrl, "/v1/audio/transcriptions"), {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form
  });
  if (!isRecord(response) || typeof response.text !== "string") {
    fail("INVALID_RESPONSE", "OpenAI returned an invalid transcription.");
  }
  const text = cleanText(response.text, "transcription", 100000);
  if (text.includes(apiKey)) fail("INVALID_RESPONSE", "OpenAI returned an unsafe transcription.");
  return text;
}

module.exports = {
  ASSISTANT_PLAN_SCHEMA: DETAILED_ASSISTANT_PLAN_SCHEMA,
  AssistantServiceError,
  extractResponseText,
  parseAssistantPlan,
  readCredentialConfig,
  requestAssistantPlan,
  transcribeAudio,
  writeCredentialConfig
};
