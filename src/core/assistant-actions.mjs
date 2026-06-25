export const ASSISTANT_ACTION_VERSION = 1;
export const MAX_CALENDAR_EVENTS = 2000;
export const ASSISTANT_ACTION_NAMES = Object.freeze([
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
]);

const ACTION_NAMES = new Set(ASSISTANT_ACTION_NAMES);
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const PRIORITIES = new Set(["low", "medium", "high"]);
const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack", "other"]);
const MEAL_CONFIDENCE = new Set(["verified", "ai_estimate"]);
const WEIGHT_UNITS = new Set(["kg", "lb"]);
const LENGTH_UNITS = new Set(["cm", "in"]);
const WORKOUT_TYPES = new Set(["strength", "cardio", "mobility", "sport", "other"]);
const FINANCE_KINDS = new Set(["expense", "income", "refund"]);
const TOP_LEVEL_KEYS = new Set(["version", "name", "arguments"]);
const ARGUMENT_KEYS = Object.freeze({
  create_calendar_schedule: new Set([
    "title", "start_date", "end_date", "start_time", "end_time", "weekdays",
    "category", "location", "notes"
  ]),
  update_calendar_events: new Set([
    "match_title", "start_date", "end_date", "start_time", "end_time", "weekdays",
    "new_title"
  ]),
  delete_calendar_events: new Set([
    "match_title", "start_date", "end_date", "start_time", "end_time", "weekdays"
  ]),
  create_task: new Set(["title", "notes", "due_date", "priority", "project_id"]),
  update_tasks: new Set(["match_title", "new_title", "notes", "due_date", "priority", "project_id"]),
  delete_tasks: new Set(["match_title"]),
  complete_tasks: new Set(["match_title"]),
  create_reminder: new Set(["title", "due_at", "kind"]),
  update_reminders: new Set(["match_title", "new_title", "due_at", "kind"]),
  delete_reminders: new Set(["match_title"]),
  complete_reminders: new Set(["match_title"]),
  log_meal: new Set([
    "date", "meal_type", "name", "serving_amount", "serving_unit", "calories",
    "protein_grams", "carbs_grams", "fat_grams", "fiber_grams", "source_type",
    "source_id", "source_label", "source_url", "confidence", "assumptions", "notes"
  ]),
  log_body_measurement: new Set([
    "date", "recorded_at", "weight", "weight_unit", "body_fat_percent", "waist",
    "waist_unit", "resting_heart_rate", "notes"
  ]),
  log_sleep: new Set([
    "date", "started_at", "ended_at", "duration_hours", "sleep_quality", "notes"
  ]),
  log_workout: new Set([
    "date", "name", "type", "duration_minutes", "distance", "distance_unit",
    "calories_burned", "effort", "exercises", "notes"
  ]),
  log_finance_transaction: new Set([
    "date", "label", "amount", "kind", "currency", "category", "account", "notes"
  ]),
  log_study_session: new Set([
    "date", "title", "duration_minutes", "learning_item_id", "note"
  ]),
  log_focus_session: new Set([
    "date", "title", "duration_minutes", "project", "tags", "started_at", "ended_at",
    "focus_rating", "energy", "note"
  ])
});

export class AssistantActionValidationError extends TypeError {
  constructor(message, path = "action") {
    super(`${path}: ${message}`);
    this.name = "AssistantActionValidationError";
    this.path = path;
  }
}

function assertRecord(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AssistantActionValidationError("must be an object", path);
  }
}

function assertOnlyKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new AssistantActionValidationError(`unknown field "${key}"`, path);
    }
  }
}

function requiredText(value, path, maxLength = 180) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AssistantActionValidationError("must be a non-empty string", path);
  }
  const result = value.trim();
  if (result.length > maxLength) {
    throw new AssistantActionValidationError(`must be at most ${maxLength} characters`, path);
  }
  return result;
}

function optionalText(value, path, maxLength) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new AssistantActionValidationError("must be a string", path);
  }
  const result = value.trim();
  if (result.length > maxLength) {
    throw new AssistantActionValidationError(`must be at most ${maxLength} characters`, path);
  }
  return result || undefined;
}

function parseDate(value, path) {
  if (typeof value !== "string") {
    throw new AssistantActionValidationError("must use YYYY-MM-DD", path);
  }
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    throw new AssistantActionValidationError("must use YYYY-MM-DD", path);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    year < 1000
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    throw new AssistantActionValidationError("contains an invalid calendar date", path);
  }
  return { value, year, month, day };
}

function parseTime(value, path) {
  if (typeof value !== "string") {
    throw new AssistantActionValidationError("must use local HH:MM", path);
  }
  const match = TIME_PATTERN.exec(value);
  if (!match) {
    throw new AssistantActionValidationError("must use local HH:MM", path);
  }
  return { value, hour: Number(match[1]), minute: Number(match[2]) };
}

function localDate(date, time) {
  return new Date(date.year, date.month - 1, date.day, time.hour, time.minute, 0, 0);
}

function normalizeWeekdays(value, path) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new AssistantActionValidationError("must be a non-empty array", path);
  }
  const unique = new Set();
  for (const weekday of value) {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new AssistantActionValidationError(
        "must contain integers from 0 (Sunday) to 6 (Saturday)",
        path
      );
    }
    if (unique.has(weekday)) {
      throw new AssistantActionValidationError("must not contain duplicate weekdays", path);
    }
    unique.add(weekday);
  }
  return [...unique].sort((left, right) => left - right);
}

function normalizeCalendarArguments(args) {
  const title = requiredText(args.title, "action.arguments.title");
  const startDate = parseDate(args.start_date, "action.arguments.start_date");
  const endDate = parseDate(args.end_date, "action.arguments.end_date");
  const startTime = parseTime(args.start_time, "action.arguments.start_time");
  const endTime = parseTime(args.end_time, "action.arguments.end_time");
  const weekdays = normalizeWeekdays(args.weekdays, "action.arguments.weekdays");
  const startMinutes = startTime.hour * 60 + startTime.minute;
  const endMinutes = endTime.hour * 60 + endTime.minute;

  if (localDate(endDate, endTime) < localDate(startDate, startTime)) {
    throw new AssistantActionValidationError(
      "must not be before start_date",
      "action.arguments.end_date"
    );
  }
  if (endMinutes <= startMinutes) {
    throw new AssistantActionValidationError(
      "must be after start_time",
      "action.arguments.end_time"
    );
  }
  if (!weekdays && startDate.value !== endDate.value) {
    throw new AssistantActionValidationError(
      "is required when start_date and end_date differ",
      "action.arguments.weekdays"
    );
  }

  return {
    title,
    start_date: startDate.value,
    end_date: endDate.value,
    start_time: startTime.value,
    end_time: endTime.value,
    ...(weekdays ? { weekdays } : {}),
    ...optionalFields(args, {
      category: 80,
      location: 240,
      notes: 2000
    })
  };
}

function normalizeCalendarMatchArguments(args, includeNewTitle) {
  const startDate = args.start_date === undefined
    ? undefined
    : parseDate(args.start_date, "action.arguments.start_date").value;
  const endDate = args.end_date === undefined
    ? undefined
    : parseDate(args.end_date, "action.arguments.end_date").value;
  if (startDate && endDate && endDate < startDate) {
    throw new AssistantActionValidationError(
      "must not be before start_date",
      "action.arguments.end_date"
    );
  }
  const startTime = args.start_time === undefined
    ? undefined
    : parseTime(args.start_time, "action.arguments.start_time").value;
  const endTime = args.end_time === undefined
    ? undefined
    : parseTime(args.end_time, "action.arguments.end_time").value;
  const weekdays = normalizeWeekdays(args.weekdays, "action.arguments.weekdays");
  return {
    match_title: requiredText(args.match_title, "action.arguments.match_title"),
    ...(startDate ? { start_date: startDate } : {}),
    ...(endDate ? { end_date: endDate } : {}),
    ...(startTime ? { start_time: startTime } : {}),
    ...(endTime ? { end_time: endTime } : {}),
    ...(weekdays ? { weekdays } : {}),
    ...(includeNewTitle
      ? { new_title: requiredText(args.new_title, "action.arguments.new_title") }
      : {})
  };
}

function optionalFields(source, limits) {
  return Object.fromEntries(
    Object.entries(limits)
      .map(([key, limit]) => [key, optionalText(source[key], `action.arguments.${key}`, limit)])
      .filter(([, value]) => value !== undefined)
  );
}

function normalizeTaskArguments(args) {
  if (args.priority !== undefined && !PRIORITIES.has(args.priority)) {
    throw new AssistantActionValidationError(
      'must be "low", "medium", or "high"',
      "action.arguments.priority"
    );
  }
  if (args.due_date !== undefined) {
    parseDate(args.due_date, "action.arguments.due_date");
  }
  return {
    title: requiredText(args.title, "action.arguments.title"),
    ...optionalFields(args, { notes: 2000, project_id: 180 }),
    ...(args.due_date ? { due_date: args.due_date } : {}),
    ...(args.priority ? { priority: args.priority } : {})
  };
}

function nullableText(value, path, maxLength) {
  if (value === null || value === undefined || value === "") return undefined;
  return optionalText(value, path, maxLength);
}

function optionalNumber(value, path, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AssistantActionValidationError("must be a finite number", path);
  }
  if (integer && !Number.isInteger(value)) {
    throw new AssistantActionValidationError("must be an integer", path);
  }
  if (value < min || value > max) {
    throw new AssistantActionValidationError(`must be from ${min} to ${max}`, path);
  }
  return value;
}

function requiredNumber(value, path, bounds) {
  const result = optionalNumber(value, path, bounds);
  if (result === undefined) {
    throw new AssistantActionValidationError("is required", path);
  }
  return result;
}

function optionalDate(value, path) {
  return value === undefined || value === null || value === ""
    ? undefined
    : parseDate(value, path).value;
}

function parseRfc3339(value, path) {
  if (typeof value !== "string" || !RFC3339_PATTERN.test(value)) {
    throw new AssistantActionValidationError(
      "must be an RFC 3339 date-time with a timezone",
      path
    );
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new AssistantActionValidationError("contains an invalid date-time", path);
  }
  return date.toISOString();
}

function pairedNumberAndUnit(args, valueKey, unitKey, units, bounds, path) {
  const value = optionalNumber(args[valueKey], `${path}.${valueKey}`, bounds);
  const unit = args[unitKey];
  if ((value === undefined) !== (unit === undefined || unit === null || unit === "")) {
    throw new AssistantActionValidationError(
      `must be supplied with ${valueKey}`,
      `${path}.${unitKey}`
    );
  }
  if (value === undefined) return undefined;
  if (!units.has(unit)) {
    throw new AssistantActionValidationError(
      `must be one of ${[...units].join(", ")}`,
      `${path}.${unitKey}`
    );
  }
  return { value, unit };
}

function roundMetric(value) {
  return Math.round(value * 1000) / 1000;
}

function weightKg(measurement) {
  return roundMetric(measurement.unit === "lb" ? measurement.value * 0.45359237 : measurement.value);
}

function lengthCm(measurement) {
  return roundMetric(measurement.unit === "in" ? measurement.value * 2.54 : measurement.value);
}

function normalizeMealArguments(args) {
  const mealType = args.meal_type ?? "other";
  if (!MEAL_TYPES.has(mealType)) {
    throw new AssistantActionValidationError(
      `must be one of ${[...MEAL_TYPES].join(", ")}`,
      "action.arguments.meal_type"
    );
  }
  const serving = pairedNumberAndUnit(
    args,
    "serving_amount",
    "serving_unit",
    new Set(["g", "ml", "oz", "cup", "tbsp", "tsp", "piece", "serving", "meal"]),
    { min: 0.001, max: 100000 },
    "action.arguments"
  );
  const nutrients = {
    calories: optionalNumber(args.calories, "action.arguments.calories", { min: 0, max: 20000 }),
    protein_grams: optionalNumber(args.protein_grams, "action.arguments.protein_grams", { min: 0, max: 5000 }),
    carbs_grams: optionalNumber(args.carbs_grams, "action.arguments.carbs_grams", { min: 0, max: 5000 }),
    fat_grams: optionalNumber(args.fat_grams, "action.arguments.fat_grams", { min: 0, max: 5000 }),
    fiber_grams: optionalNumber(args.fiber_grams, "action.arguments.fiber_grams", { min: 0, max: 1000 })
  };
  const sourceType = requiredText(args.source_type, "action.arguments.source_type", 80);
  const confidence = args.confidence;
  if (!MEAL_CONFIDENCE.has(confidence)) {
    throw new AssistantActionValidationError(
      'must be "verified" or "ai_estimate"',
      "action.arguments.confidence"
    );
  }
  const sourceId = optionalText(args.source_id, "action.arguments.source_id", 240);
  const sourceLabel = optionalText(args.source_label, "action.arguments.source_label", 240);
  const sourceUrl = optionalText(args.source_url, "action.arguments.source_url", 1000);
  const assumptions = optionalText(args.assumptions, "action.arguments.assumptions", 1000);
  if (confidence === "verified") {
    if (sourceType === "ai_estimate" || !sourceId || !sourceLabel || !sourceUrl) {
      throw new AssistantActionValidationError(
        "verified meals require non-AI source_type, source_id, source_label, and source_url",
        "action.arguments.confidence"
      );
    }
    try {
      const url = new URL(sourceUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocol");
    } catch {
      throw new AssistantActionValidationError("must be an HTTP(S) URL", "action.arguments.source_url");
    }
  } else {
    if (sourceType !== "ai_estimate") {
      throw new AssistantActionValidationError(
        'must be "ai_estimate" when confidence is ai_estimate',
        "action.arguments.source_type"
      );
    }
    if (!assumptions) {
      throw new AssistantActionValidationError(
        "is required for AI-estimated nutrition",
        "action.arguments.assumptions"
      );
    }
  }
  return {
    date: parseDate(args.date, "action.arguments.date").value,
    meal_type: mealType,
    name: requiredText(args.name, "action.arguments.name", 240),
    ...(serving ? { serving_amount: serving.value, serving_unit: serving.unit } : {}),
    ...Object.fromEntries(Object.entries(nutrients).filter(([, value]) => value !== undefined)),
    source_type: sourceType,
    ...(sourceId ? { source_id: sourceId } : {}),
    ...(sourceLabel ? { source_label: sourceLabel } : {}),
    ...(sourceUrl ? { source_url: sourceUrl } : {}),
    confidence,
    ...(assumptions ? { assumptions } : {}),
    ...optionalFields(args, { notes: 2000 })
  };
}

function normalizeBodyMeasurementArguments(args) {
  const weight = pairedNumberAndUnit(
    args, "weight", "weight_unit", WEIGHT_UNITS, { min: 0.1, max: 2205 }, "action.arguments"
  );
  const waist = pairedNumberAndUnit(
    args, "waist", "waist_unit", LENGTH_UNITS, { min: 0.1, max: 500 }, "action.arguments"
  );
  const bodyFatPercent = optionalNumber(
    args.body_fat_percent, "action.arguments.body_fat_percent", { min: 0, max: 100 }
  );
  const restingHeartRate = optionalNumber(
    args.resting_heart_rate, "action.arguments.resting_heart_rate", { min: 20, max: 300, integer: true }
  );
  if (!weight && !waist && bodyFatPercent === undefined && restingHeartRate === undefined) {
    throw new AssistantActionValidationError(
      "must include at least one body measurement",
      "action.arguments"
    );
  }
  const date = parseDate(args.date, "action.arguments.date").value;
  const recordedAt = args.recorded_at === undefined || args.recorded_at === null || args.recorded_at === ""
    ? undefined
    : parseRfc3339(args.recorded_at, "action.arguments.recorded_at");
  if (weight && weightKg(weight) > 1000) {
    throw new AssistantActionValidationError("must convert to at most 1000 kg", "action.arguments.weight");
  }
  if (waist && lengthCm(waist) > 500) {
    throw new AssistantActionValidationError("must convert to at most 500 cm", "action.arguments.waist");
  }
  return {
    date,
    ...(recordedAt ? { recorded_at: recordedAt } : {}),
    ...(weight ? { weight_kg: weightKg(weight) } : {}),
    ...(bodyFatPercent !== undefined ? { body_fat_percent: bodyFatPercent } : {}),
    ...(waist ? { waist_cm: lengthCm(waist) } : {}),
    ...(restingHeartRate !== undefined ? { resting_heart_rate: restingHeartRate } : {}),
    ...optionalFields(args, { notes: 1000 })
  };
}

function normalizeSleepArguments(args) {
  const date = parseDate(args.date, "action.arguments.date").value;
  const startedAt = args.started_at === undefined || args.started_at === null || args.started_at === ""
    ? undefined
    : parseRfc3339(args.started_at, "action.arguments.started_at");
  const endedAt = args.ended_at === undefined || args.ended_at === null || args.ended_at === ""
    ? undefined
    : parseRfc3339(args.ended_at, "action.arguments.ended_at");
  if ((startedAt === undefined) !== (endedAt === undefined)) {
    throw new AssistantActionValidationError(
      "started_at and ended_at must be supplied together",
      "action.arguments"
    );
  }
  let durationHours = optionalNumber(
    args.duration_hours, "action.arguments.duration_hours", { min: 0, max: 24 }
  );
  if (startedAt && endedAt) {
    const elapsed = (Date.parse(endedAt) - Date.parse(startedAt)) / 3600000;
    if (elapsed < 0 || elapsed > 24) {
      throw new AssistantActionValidationError(
        "must be no more than 24 hours after started_at",
        "action.arguments.ended_at"
      );
    }
    const calculated = Math.round(elapsed * 100) / 100;
    if (durationHours !== undefined && Math.abs(durationHours - calculated) > 0.05) {
      throw new AssistantActionValidationError(
        "does not match started_at and ended_at",
        "action.arguments.duration_hours"
      );
    }
    durationHours = calculated;
  }
  const sleepQuality = optionalNumber(
    args.sleep_quality, "action.arguments.sleep_quality", { min: 1, max: 5, integer: true }
  );
  if (durationHours === undefined && sleepQuality === undefined) {
    throw new AssistantActionValidationError(
      "must include duration_hours or sleep_quality",
      "action.arguments"
    );
  }
  return {
    date,
    ...(startedAt ? { started_at: startedAt, ended_at: endedAt } : {}),
    ...(durationHours !== undefined ? { duration_hours: durationHours } : {}),
    ...(sleepQuality !== undefined ? { sleep_quality: sleepQuality } : {}),
    ...optionalFields(args, { notes: 1000 })
  };
}

function normalizeExercise(value, index) {
  const path = `action.arguments.exercises[${index}]`;
  assertRecord(value, path);
  assertOnlyKeys(
    value,
    new Set(["name", "sets", "reps", "weight", "weight_unit", "distance", "distance_unit", "duration_minutes"]),
    path
  );
  const weight = pairedNumberAndUnit(
    value, "weight", "weight_unit", WEIGHT_UNITS, { min: 0, max: 2205 }, path
  );
  const distance = pairedNumberAndUnit(
    value, "distance", "distance_unit", new Set(["km", "mi"]), { min: 0, max: 1000 }, path
  );
  if (weight && weightKg(weight) > 1000) {
    throw new AssistantActionValidationError("must convert to at most 1000 kg", `${path}.weight`);
  }
  if (distance && (distance.unit === "mi" ? distance.value * 1.609344 : distance.value) > 1000) {
    throw new AssistantActionValidationError("must convert to at most 1000 km", `${path}.distance`);
  }
  return {
    name: requiredText(value.name, `${path}.name`, 180),
    ...(optionalNumber(value.sets, `${path}.sets`, { min: 0, max: 1000, integer: true }) !== undefined
      ? { sets: value.sets } : {}),
    ...(optionalNumber(value.reps, `${path}.reps`, { min: 0, max: 100000, integer: true }) !== undefined
      ? { reps: value.reps } : {}),
    ...(weight ? { weightKg: weightKg(weight) } : {}),
    ...(distance ? { distanceKm: roundMetric(distance.unit === "mi" ? distance.value * 1.609344 : distance.value) } : {}),
    ...(optionalNumber(value.duration_minutes, `${path}.duration_minutes`, { min: 0, max: 1440 }) !== undefined
      ? { durationMinutes: value.duration_minutes } : {})
  };
}

function normalizeWorkoutArguments(args) {
  if (!WORKOUT_TYPES.has(args.type)) {
    throw new AssistantActionValidationError(
      `must be one of ${[...WORKOUT_TYPES].join(", ")}`,
      "action.arguments.type"
    );
  }
  const distance = pairedNumberAndUnit(
    args, "distance", "distance_unit", new Set(["km", "mi"]), { min: 0, max: 1000 }, "action.arguments"
  );
  if (distance && (distance.unit === "mi" ? distance.value * 1.609344 : distance.value) > 1000) {
    throw new AssistantActionValidationError(
      "must convert to at most 1000 km",
      "action.arguments.distance"
    );
  }
  if (args.exercises !== undefined && !Array.isArray(args.exercises)) {
    throw new AssistantActionValidationError("must be an array", "action.arguments.exercises");
  }
  if ((args.exercises?.length || 0) > 100) {
    throw new AssistantActionValidationError("must contain at most 100 exercises", "action.arguments.exercises");
  }
  return {
    date: parseDate(args.date, "action.arguments.date").value,
    name: requiredText(args.name, "action.arguments.name", 180),
    type: args.type,
    ...(optionalNumber(args.duration_minutes, "action.arguments.duration_minutes", { min: 0, max: 1440 }) !== undefined
      ? { duration_minutes: args.duration_minutes } : {}),
    ...(distance ? { distance_km: roundMetric(distance.unit === "mi" ? distance.value * 1.609344 : distance.value) } : {}),
    ...(optionalNumber(args.calories_burned, "action.arguments.calories_burned", { min: 0, max: 20000 }) !== undefined
      ? { calories_burned: args.calories_burned } : {}),
    ...(optionalNumber(args.effort, "action.arguments.effort", { min: 1, max: 5, integer: true }) !== undefined
      ? { effort: args.effort } : {}),
    ...(args.exercises ? { exercises: args.exercises.map(normalizeExercise) } : {}),
    ...optionalFields(args, { notes: 2000 })
  };
}

function amountMinor(value, path) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value)) {
    throw new AssistantActionValidationError(
      "must be a positive decimal string with at most 2 decimal places",
      path
    );
  }
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new AssistantActionValidationError("must be greater than zero", path);
  }
  return result;
}

function normalizeFinanceArguments(args) {
  if (!FINANCE_KINDS.has(args.kind)) {
    throw new AssistantActionValidationError(
      `must be one of ${[...FINANCE_KINDS].join(", ")}`,
      "action.arguments.kind"
    );
  }
  if (typeof args.currency !== "string" || !/^[A-Z]{3}$/.test(args.currency)) {
    throw new AssistantActionValidationError(
      "must be a three-letter uppercase currency code",
      "action.arguments.currency"
    );
  }
  return {
    date: parseDate(args.date, "action.arguments.date").value,
    label: requiredText(args.label, "action.arguments.label", 180),
    amount_minor: amountMinor(args.amount, "action.arguments.amount"),
    kind: args.kind,
    currency: args.currency,
    ...optionalFields(args, { category: 120, account: 120, notes: 2000 })
  };
}

function normalizeStudyArguments(args) {
  return {
    date: parseDate(args.date, "action.arguments.date").value,
    title: requiredText(args.title, "action.arguments.title", 240),
    duration_minutes: requiredNumber(
      args.duration_minutes,
      "action.arguments.duration_minutes",
      { min: 1, max: 1440, integer: true }
    ),
    ...optionalFields(args, { learning_item_id: 180, note: 4000 })
  };
}

function normalizeTaskMatchArguments(args, mode) {
  const normalized = {
    match_title: requiredText(args.match_title, "action.arguments.match_title")
  };
  if (mode !== "update") return normalized;
  if (args.due_date !== undefined && args.due_date !== null && args.due_date !== "") {
    parseDate(args.due_date, "action.arguments.due_date");
    normalized.due_date = args.due_date;
  }
  if (args.priority !== undefined && args.priority !== null) {
    if (!PRIORITIES.has(args.priority)) {
      throw new AssistantActionValidationError(
        'must be "low", "medium", or "high"',
        "action.arguments.priority"
      );
    }
    normalized.priority = args.priority;
  }
  const fields = {
    new_title: nullableText(args.new_title, "action.arguments.new_title", 180),
    notes: nullableText(args.notes, "action.arguments.notes", 2000),
    project_id: nullableText(args.project_id, "action.arguments.project_id", 180)
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) normalized[key] = value;
  }
  if (Object.keys(normalized).length === 1) {
    throw new AssistantActionValidationError(
      "must include at least one task change",
      "action.arguments"
    );
  }
  return normalized;
}

function normalizeReminderArguments(args) {
  if (typeof args.due_at !== "string" || !RFC3339_PATTERN.test(args.due_at)) {
    throw new AssistantActionValidationError(
      "must be an RFC 3339 date-time with a timezone",
      "action.arguments.due_at"
    );
  }
  const dueAt = new Date(args.due_at);
  if (!Number.isFinite(dueAt.getTime())) {
    throw new AssistantActionValidationError(
      "contains an invalid date-time",
      "action.arguments.due_at"
    );
  }
  return {
    title: requiredText(args.title, "action.arguments.title"),
    due_at: dueAt.toISOString(),
    ...optionalFields(args, { kind: 80 })
  };
}

function normalizeReminderMatchArguments(args, mode) {
  const normalized = {
    match_title: requiredText(args.match_title, "action.arguments.match_title")
  };
  if (mode !== "update") return normalized;
  const newTitle = nullableText(args.new_title, "action.arguments.new_title", 180);
  const kind = nullableText(args.kind, "action.arguments.kind", 80);
  if (newTitle) normalized.new_title = newTitle;
  if (kind) normalized.kind = kind;
  if (args.due_at !== undefined && args.due_at !== null && args.due_at !== "") {
    if (typeof args.due_at !== "string" || !RFC3339_PATTERN.test(args.due_at)) {
      throw new AssistantActionValidationError(
        "must be an RFC 3339 date-time with a timezone",
        "action.arguments.due_at"
      );
    }
    const dueAt = new Date(args.due_at);
    if (!Number.isFinite(dueAt.getTime())) {
      throw new AssistantActionValidationError("contains an invalid date-time", "action.arguments.due_at");
    }
    normalized.due_at = dueAt.toISOString();
  }
  if (Object.keys(normalized).length === 1) {
    throw new AssistantActionValidationError(
      "must include at least one reminder change",
      "action.arguments"
    );
  }
  return normalized;
}

function normalizeFocusArguments(args) {
  const date = parseDate(args.date, "action.arguments.date").value;
  const durationMinutes = requiredNumber(
    args.duration_minutes,
    "action.arguments.duration_minutes",
    { min: 1, max: 1440, integer: true }
  );
  const startedAt = args.started_at
    ? parseRfc3339(args.started_at, "action.arguments.started_at")
    : undefined;
  const endedAt = args.ended_at
    ? parseRfc3339(args.ended_at, "action.arguments.ended_at")
    : undefined;
  if ((startedAt === undefined) !== (endedAt === undefined)) {
    throw new AssistantActionValidationError(
      "started_at and ended_at must be supplied together",
      "action.arguments"
    );
  }
  if (startedAt && new Date(endedAt) <= new Date(startedAt)) {
    throw new AssistantActionValidationError("must be after started_at", "action.arguments.ended_at");
  }
  const tags = args.tags === undefined
    ? undefined
    : Array.isArray(args.tags)
      ? args.tags.map((tag, index) => requiredText(tag, `action.arguments.tags[${index}]`, 80))
      : (() => {
        throw new AssistantActionValidationError("must be an array", "action.arguments.tags");
      })();
  if (tags && tags.length > 20) {
    throw new AssistantActionValidationError("must contain at most 20 tags", "action.arguments.tags");
  }
  const focusRating = optionalNumber(
    args.focus_rating,
    "action.arguments.focus_rating",
    { min: 1, max: 5, integer: true }
  );
  const energy = optionalNumber(
    args.energy,
    "action.arguments.energy",
    { min: 1, max: 5, integer: true }
  );
  return {
    date,
    title: requiredText(args.title, "action.arguments.title", 240),
    duration_minutes: durationMinutes,
    ...optionalFields(args, { project: 180, note: 2000 }),
    ...(tags ? { tags: [...new Set(tags)] } : {}),
    ...(startedAt ? { started_at: startedAt, ended_at: endedAt } : {}),
    ...(focusRating !== undefined ? { focus_rating: focusRating } : {}),
    ...(energy !== undefined ? { energy } : {})
  };
}

export function normalizeAssistantAction(action) {
  assertRecord(action, "action");
  assertOnlyKeys(action, TOP_LEVEL_KEYS, "action");
  if (action.version !== ASSISTANT_ACTION_VERSION) {
    throw new AssistantActionValidationError(
      `must equal ${ASSISTANT_ACTION_VERSION}`,
      "action.version"
    );
  }
  if (!ACTION_NAMES.has(action.name)) {
    throw new AssistantActionValidationError("is not a supported action name", "action.name");
  }
  assertRecord(action.arguments, "action.arguments");
  assertOnlyKeys(action.arguments, ARGUMENT_KEYS[action.name], "action.arguments");

  const normalizers = {
    create_calendar_schedule: normalizeCalendarArguments,
    update_calendar_events: (args) => normalizeCalendarMatchArguments(args, true),
    delete_calendar_events: (args) => normalizeCalendarMatchArguments(args, false),
    create_task: normalizeTaskArguments,
    update_tasks: (args) => normalizeTaskMatchArguments(args, "update"),
    delete_tasks: (args) => normalizeTaskMatchArguments(args, "delete"),
    complete_tasks: (args) => normalizeTaskMatchArguments(args, "complete"),
    create_reminder: normalizeReminderArguments,
    update_reminders: (args) => normalizeReminderMatchArguments(args, "update"),
    delete_reminders: (args) => normalizeReminderMatchArguments(args, "delete"),
    complete_reminders: (args) => normalizeReminderMatchArguments(args, "complete"),
    log_meal: normalizeMealArguments,
    log_body_measurement: normalizeBodyMeasurementArguments,
    log_sleep: normalizeSleepArguments,
    log_workout: normalizeWorkoutArguments,
    log_finance_transaction: normalizeFinanceArguments,
    log_study_session: normalizeStudyArguments,
    log_focus_session: normalizeFocusArguments
  };
  return {
    version: ASSISTANT_ACTION_VERSION,
    name: action.name,
    arguments: normalizers[action.name](action.arguments)
  };
}

export function validateAssistantAction(action) {
  normalizeAssistantAction(action);
  return true;
}

export function expandCalendarSchedule(action, options = {}) {
  const normalized = normalizeAssistantAction(action);
  if (normalized.name !== "create_calendar_schedule") {
    throw new AssistantActionValidationError(
      "must be create_calendar_schedule",
      "action.name"
    );
  }
  assertRecord(options, "options");
  assertOnlyKeys(options, new Set(["maxEvents"]), "options");
  const maxEvents = options.maxEvents ?? MAX_CALENDAR_EVENTS;
  if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > MAX_CALENDAR_EVENTS) {
    throw new AssistantActionValidationError(
      `must be an integer from 1 to ${MAX_CALENDAR_EVENTS}`,
      "options.maxEvents"
    );
  }

  const args = normalized.arguments;
  const startDate = parseDate(args.start_date, "action.arguments.start_date");
  const endDate = parseDate(args.end_date, "action.arguments.end_date");
  const startTime = parseTime(args.start_time, "action.arguments.start_time");
  const endTime = parseTime(args.end_time, "action.arguments.end_time");
  const allowedDays = args.weekdays ? new Set(args.weekdays) : null;
  const cursor = localDate(startDate, { hour: 12, minute: 0 });
  const finalDay = localDate(endDate, { hour: 12, minute: 0 });
  const events = [];

  while (cursor <= finalDay) {
    if (!allowedDays || allowedDays.has(cursor.getDay())) {
      const date = {
        year: cursor.getFullYear(),
        month: cursor.getMonth() + 1,
        day: cursor.getDate()
      };
      events.push({
        title: args.title,
        start: localDate(date, startTime).toISOString(),
        end: localDate(date, endTime).toISOString(),
        category: args.category || "personal",
        location: args.location || "",
        notes: args.notes || "",
        allDay: false
      });
      if (events.length > maxEvents) {
        throw new AssistantActionValidationError(
          `would create more than ${maxEvents} events`,
          "action.arguments"
        );
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (events.length === 0) {
    throw new AssistantActionValidationError(
      "does not include any selected weekdays",
      "action.arguments.weekdays"
    );
  }
  return events;
}

function localEventParts(event) {
  const start = new Date(event?.start);
  const end = new Date(event?.end);
  if (!event?.id || !event?.title || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return null;
  }
  const pad = (value) => String(value).padStart(2, "0");
  return {
    event,
    date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
    weekday: start.getDay()
  };
}

function matchingCalendarEvents(action, options = {}) {
  const events = Array.isArray(options.events) ? options.events : [];
  const args = action.arguments;
  const title = args.match_title.toLocaleLowerCase();
  const matches = events.map(localEventParts).filter(Boolean).filter((entry) => (
    entry.event.title.trim().toLocaleLowerCase() === title
    && (!args.start_date || entry.date >= args.start_date)
    && (!args.end_date || entry.date <= args.end_date)
    && (!args.start_time || entry.startTime === args.start_time)
    && (!args.end_time || entry.endTime === args.end_time)
    && (!args.weekdays || args.weekdays.includes(entry.weekday))
  ));
  if (matches.length === 0) {
    throw new AssistantActionValidationError(
      "does not match any existing calendar events",
      "action.arguments"
    );
  }
  if (matches.length > MAX_CALENDAR_EVENTS) {
    throw new AssistantActionValidationError(
      `matches more than ${MAX_CALENDAR_EVENTS} events`,
      "action.arguments"
    );
  }
  return matches.map(({ event }) => event);
}

function matchingByTitle(items, title, entityName) {
  const normalizedTitle = title.trim().toLocaleLowerCase();
  const matches = (Array.isArray(items) ? items : []).filter((item) => (
    item?.id
    && typeof item?.title === "string"
    && item.title.trim().toLocaleLowerCase() === normalizedTitle
  ));
  if (matches.length === 0) {
    throw new AssistantActionValidationError(
      `does not match any existing ${entityName}`,
      "action.arguments.match_title"
    );
  }
  if (matches.length > MAX_CALENDAR_EVENTS) {
    throw new AssistantActionValidationError(
      `matches more than ${MAX_CALENDAR_EVENTS} ${entityName}`,
      "action.arguments.match_title"
    );
  }
  return matches;
}

export function assistantActionToReducerActions(action, options = {}) {
  const normalized = normalizeAssistantAction(action);
  const args = normalized.arguments;
  if (normalized.name === "create_calendar_schedule") {
    const expansionOptions = options.maxEvents === undefined
      ? {}
      : { maxEvents: options.maxEvents };
    return expandCalendarSchedule(normalized, expansionOptions).map((payload) => ({
      type: "event/add",
      payload
    }));
  }
  if (normalized.name === "update_calendar_events") {
    return matchingCalendarEvents(normalized, options).map((event) => ({
      type: "event/update",
      payload: { id: event.id, patch: { title: args.new_title } }
    }));
  }
  if (normalized.name === "delete_calendar_events") {
    return matchingCalendarEvents(normalized, options).map((event) => ({
      type: "event/delete",
      payload: { id: event.id, title: event.title, start: event.start, end: event.end }
    }));
  }
  if (normalized.name === "create_task") {
    return [{
      type: "task/add",
      payload: {
        title: args.title,
        notes: args.notes || "",
        dueDate: args.due_date || "",
        priority: args.priority || "medium",
        projectId: args.project_id || ""
      }
    }];
  }
  if (normalized.name === "update_tasks") {
    const patch = {
      ...(args.new_title ? { title: args.new_title } : {}),
      ...(args.notes ? { notes: args.notes } : {}),
      ...(args.due_date ? { dueDate: args.due_date } : {}),
      ...(args.priority ? { priority: args.priority } : {}),
      ...(args.project_id ? { projectId: args.project_id } : {})
    };
    return matchingByTitle(options.tasks, args.match_title, "tasks").map((task) => ({
      type: "task/update",
      payload: { id: task.id, patch }
    }));
  }
  if (normalized.name === "delete_tasks") {
    return matchingByTitle(options.tasks, args.match_title, "tasks").map((task) => ({
      type: "task/delete",
      payload: { id: task.id, title: task.title }
    }));
  }
  if (normalized.name === "complete_tasks") {
    return matchingByTitle(options.tasks, args.match_title, "tasks").map((task) => ({
      type: "task/toggle",
      payload: { id: task.id, title: task.title, completed: true }
    }));
  }
  if (normalized.name === "create_reminder") return [{
    type: "reminder/add",
    payload: {
      title: args.title,
      dueAt: args.due_at,
      kind: args.kind || "personal"
    }
  }];
  if (normalized.name === "log_meal") return [{
    type: "nutrition/add",
    payload: {
      date: args.date,
      mealType: args.meal_type,
      name: args.name,
      ...(args.serving_amount !== undefined ? {
        servingAmount: args.serving_amount,
        servingUnit: args.serving_unit
      } : {}),
      ...(args.calories !== undefined ? { calories: args.calories } : {}),
      ...(args.protein_grams !== undefined ? { proteinGrams: args.protein_grams } : {}),
      ...(args.carbs_grams !== undefined ? { carbsGrams: args.carbs_grams } : {}),
      ...(args.fat_grams !== undefined ? { fatGrams: args.fat_grams } : {}),
      ...(args.fiber_grams !== undefined ? { fiberGrams: args.fiber_grams } : {}),
      sourceType: args.source_type,
      ...(args.source_id ? { sourceId: args.source_id } : {}),
      ...(args.source_label ? { sourceLabel: args.source_label } : {}),
      ...(args.source_url ? { sourceUrl: args.source_url } : {}),
      confidence: args.confidence,
      assumptions: args.assumptions || "",
      notes: args.notes || ""
    }
  }];
  if (normalized.name === "log_body_measurement") return [{
    type: "bodyMeasurement/add",
    payload: {
      date: args.date,
      ...(args.recorded_at ? { recordedAt: args.recorded_at } : {}),
      ...(args.weight_kg !== undefined ? { weightKg: args.weight_kg } : {}),
      ...(args.body_fat_percent !== undefined ? { bodyFatPercent: args.body_fat_percent } : {}),
      ...(args.waist_cm !== undefined ? { waistCm: args.waist_cm } : {}),
      ...(args.resting_heart_rate !== undefined ? { restingHeartRate: args.resting_heart_rate } : {}),
      notes: args.notes || ""
    }
  }];
  if (normalized.name === "log_sleep") return [{
    type: "health/save",
    payload: {
      date: args.date,
      ...(args.started_at ? { sleepStartedAt: args.started_at, sleepEndedAt: args.ended_at } : {}),
      ...(args.duration_hours !== undefined ? { sleepHours: args.duration_hours } : {}),
      ...(args.sleep_quality !== undefined ? { sleepQuality: args.sleep_quality } : {}),
      ...(args.notes ? { recoveryNote: args.notes } : {})
    }
  }];
  if (normalized.name === "log_workout") return [{
    type: "workout/add",
    payload: {
      date: args.date,
      name: args.name,
      type: args.type,
      ...(args.duration_minutes !== undefined ? { durationMinutes: args.duration_minutes } : {}),
      ...(args.distance_km !== undefined ? { distanceKm: args.distance_km } : {}),
      ...(args.calories_burned !== undefined ? { caloriesBurned: args.calories_burned } : {}),
      ...(args.effort !== undefined ? { effort: args.effort } : {}),
      exercises: args.exercises || [],
      notes: args.notes || ""
    }
  }];
  if (normalized.name === "log_finance_transaction") return [{
    type: "financeEntry/add",
    payload: {
      date: args.date,
      label: args.label,
      amountMinor: args.amount_minor,
      kind: args.kind,
      currency: args.currency,
      category: args.category || "",
      account: args.account || "",
      notes: args.notes || ""
    }
  }];
  if (normalized.name === "log_study_session") return [{
    type: "learningLog/add",
    payload: {
      date: args.date,
      title: args.title,
      durationMinutes: args.duration_minutes,
      learningItemId: args.learning_item_id || "",
      note: args.note || ""
    }
  }];
  if (normalized.name === "log_focus_session") {
    const date = parseDate(args.date, "action.arguments.date");
    const defaultEnd = localDate(date, { hour: 12, minute: 0 }).getTime();
    const endedAt = args.ended_at ? new Date(args.ended_at).getTime() : defaultEnd;
    const startedAt = args.started_at
      ? new Date(args.started_at).getTime()
      : endedAt - args.duration_minutes * 60000;
    return [{
      type: "session/add",
      payload: {
        session: {
          title: args.title,
          project: args.project || "General",
          tags: args.tags || [],
          startedAt,
          endedAt,
          durationMs: Math.max(0, endedAt - startedAt),
          activeMs: args.duration_minutes * 60000,
          pausedMs: Math.max(0, endedAt - startedAt - args.duration_minutes * 60000),
          pauseCount: 0,
          focusRating: args.focus_rating || 4,
          energy: args.energy || 4,
          goalMinutes: Math.max(10, Math.min(180, args.duration_minutes)),
          note: args.note || ""
        }
      }
    }];
  }
  if (normalized.name === "update_reminders") {
    const patch = {
      ...(args.new_title ? { title: args.new_title } : {}),
      ...(args.due_at ? { dueAt: args.due_at } : {}),
      ...(args.kind ? { kind: args.kind } : {})
    };
    return matchingByTitle(options.reminders, args.match_title, "reminders").map((reminder) => ({
      type: "reminder/update",
      payload: { id: reminder.id, patch }
    }));
  }
  if (normalized.name === "delete_reminders") {
    return matchingByTitle(options.reminders, args.match_title, "reminders").map((reminder) => ({
      type: "reminder/delete",
      payload: { id: reminder.id, title: reminder.title }
    }));
  }
  return matchingByTitle(options.reminders, args.match_title, "reminders").map((reminder) => ({
    type: "reminder/toggle",
    payload: { id: reminder.id, title: reminder.title, completed: true }
  }));
}

export function approvedAssistantActionToReducerActions(approval, options = {}) {
  assertRecord(approval, "approval");
  assertOnlyKeys(approval, new Set(["approved", "action"]), "approval");
  if (approval.approved !== true) {
    throw new AssistantActionValidationError("must be true before application", "approval.approved");
  }
  return assistantActionToReducerActions(approval.action, options);
}

export function summarizeAssistantAction(action, options = {}) {
  const normalized = normalizeAssistantAction(action);
  const args = normalized.arguments;
  if (normalized.name === "create_calendar_schedule") {
    const count = expandCalendarSchedule(normalized).length;
    const frequency = args.weekdays ? `${count} calendar events` : "1 calendar event";
    return `${frequency}: ${args.title}, ${args.start_date} to ${args.end_date}, ${args.start_time}-${args.end_time}`;
  }
  if (normalized.name === "update_calendar_events") {
    const count = matchingCalendarEvents(normalized, options).length;
    return `Rename ${count} calendar ${count === 1 ? "event" : "events"} from ${args.match_title} to ${args.new_title}`;
  }
  if (normalized.name === "delete_calendar_events") {
    const count = matchingCalendarEvents(normalized, options).length;
    return `Delete ${count} calendar ${count === 1 ? "event" : "events"} named ${args.match_title}`;
  }
  if (normalized.name === "create_task") {
    return `Task: ${args.title}${args.due_date ? `, due ${args.due_date}` : ""}`;
  }
  if (normalized.name === "update_tasks") {
    const count = matchingByTitle(options.tasks, args.match_title, "tasks").length;
    return `Update ${count} ${count === 1 ? "task" : "tasks"} named ${args.match_title}`;
  }
  if (normalized.name === "delete_tasks" || normalized.name === "complete_tasks") {
    const count = matchingByTitle(options.tasks, args.match_title, "tasks").length;
    return `${normalized.name === "delete_tasks" ? "Delete" : "Complete"} ${count} ${count === 1 ? "task" : "tasks"} named ${args.match_title}`;
  }
  if (normalized.name === "create_reminder") return `Reminder: ${args.title}, ${args.due_at}`;
  if (normalized.name === "log_meal") {
    const nutrition = [
      args.calories === undefined ? "" : `${args.calories} kcal`,
      args.protein_grams === undefined ? "" : `${args.protein_grams}g protein`,
      args.carbs_grams === undefined ? "" : `${args.carbs_grams}g carbs`,
      args.fat_grams === undefined ? "" : `${args.fat_grams}g fat`,
      args.fiber_grams === undefined ? "" : `${args.fiber_grams}g fiber`
    ].filter(Boolean);
    return `Meal: ${args.name}${nutrition.length ? `, ${nutrition.join(", ")}` : ""} (${args.confidence})`;
  }
  if (normalized.name === "log_body_measurement") {
    const fields = [
      args.weight_kg !== undefined ? `${args.weight_kg} kg` : "",
      args.body_fat_percent !== undefined ? `${args.body_fat_percent}% body fat` : "",
      args.waist_cm !== undefined ? `${args.waist_cm} cm waist` : "",
      args.resting_heart_rate !== undefined ? `${args.resting_heart_rate} bpm` : ""
    ].filter(Boolean);
    return `Body measurement: ${fields.join(", ")} on ${args.date}`;
  }
  if (normalized.name === "log_sleep") {
    const detail = args.duration_hours !== undefined
      ? `${args.duration_hours} hours`
      : `quality ${args.sleep_quality}/5`;
    return `Sleep: ${detail} on ${args.date}`;
  }
  if (normalized.name === "log_workout") {
    return `Workout: ${args.name}${args.duration_minutes !== undefined ? `, ${args.duration_minutes} minutes` : ""}`;
  }
  if (normalized.name === "log_finance_transaction") {
    return `${args.kind[0].toUpperCase()}${args.kind.slice(1)}: ${args.currency} ${(args.amount_minor / 100).toFixed(2)} for ${args.label}`;
  }
  if (normalized.name === "log_study_session") {
    return `Study: ${args.title}, ${args.duration_minutes} minutes`;
  }
  if (normalized.name === "log_focus_session") {
    return `Focus: ${args.title}, ${args.duration_minutes} minutes`;
  }
  const reminders = matchingByTitle(options.reminders, args.match_title, "reminders");
  const verb = normalized.name === "update_reminders"
    ? "Update"
    : normalized.name === "delete_reminders" ? "Delete" : "Complete";
  return `${verb} ${reminders.length} ${reminders.length === 1 ? "reminder" : "reminders"} named ${args.match_title}`;
}

export function previewAssistantAction(action, options = {}) {
  assertRecord(options, "options");
  assertOnlyKeys(options, new Set(["limit", "events", "tasks", "reminders"]), "options");
  const limit = options.limit ?? 5;
  if (!Number.isInteger(limit) || limit < 0 || limit > 50) {
    throw new AssistantActionValidationError("must be an integer from 0 to 50", "options.limit");
  }
  const normalized = normalizeAssistantAction(action);
  const stateOptions = {
    events: options.events,
    tasks: options.tasks,
    reminders: options.reminders
  };
  const reducerActions = assistantActionToReducerActions(normalized, stateOptions);
  return {
    action: normalized,
    summary: summarizeAssistantAction(normalized, stateOptions),
    count: reducerActions.length,
    items: reducerActions.slice(0, limit).map(({ type, payload }) => ({ type, payload })),
    truncated: reducerActions.length > limit
  };
}

export const toReducerActions = assistantActionToReducerActions;
export const applyApprovedAction = approvedAssistantActionToReducerActions;
