export const SCHEMA_VERSION = 4;

const THEMES = new Set(["light", "dark", "system"]);
const TIMER_STATUSES = new Set(["idle", "running", "paused", "complete"]);
const TASK_STATUSES = new Set(["inbox", "planned", "inProgress", "completed", "cancelled"]);
const PRIORITIES = new Set(["low", "medium", "high"]);
const HEALTH_VIEWS = new Set(["checkin", "recovery", "nutrition", "exercise", "medical"]);
const PROGRESS_VIEWS = new Set(["habits", "goals", "learning"]);
const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack", "other"]);
const CONFIDENCE_LEVELS = new Set(["verified", "estimated", "ai_estimate", "manual"]);
const WELLNESS_KINDS = new Set(["medication", "supplement"]);
const FINANCE_KINDS = new Set(["expense", "income", "refund"]);
const FINANCE_GOAL_KINDS = new Set(["saving", "debt"]);
const LEARNING_KINDS = new Set(["book", "course", "skill", "article", "other"]);
const LEARNING_STATUSES = new Set(["planned", "active", "completed", "paused"]);
const GOAL_STATUSES = new Set(["planned", "active", "paused", "completed", "archived"]);
const GOAL_PRIORITIES = new Set(["low", "medium", "high"]);
const GOAL_PROGRESS_MODES = new Set(["manual", "milestones"]);
const MILESTONE_STATUSES = new Set(["pending", "completed", "skipped"]);
const MEDICAL_APPOINTMENT_STATUSES = new Set(["scheduled", "completed", "cancelled"]);
const MEDICAL_RECORD_KINDS = new Set(["visit", "test", "diagnosis", "procedure", "vaccination", "document", "other"]);
const ROUTINE_PERIODS = new Set(["morning", "evening"]);
const ROUTINE_LOG_STATUSES = new Set(["pending", "completed", "skipped"]);
const TODAY_MODES = new Set(["auto", "morning", "day", "evening"]);
const INSIGHTS_VIEWS = new Set(["overview", "weekly"]);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
let idSequence = 0;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function copyRecord(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !["__proto__", "constructor", "prototype"].includes(key))
  );
}

function clock(value) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isFinite(date.getTime()) ? date.getTime() : Date.now();
}

function timestamp(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

function number(value, fallback, min = -Infinity, max = Infinity) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function integer(value, fallback, min = -Infinity, max = Infinity) {
  return Math.round(number(value, fallback, min, max));
}

function nullableNumber(value, min = -Infinity, max = Infinity) {
  if (value === null || value === undefined || value === "") return null;
  return number(value, null, min, max);
}

function nullableInteger(value, min = -Infinity, max = Infinity) {
  const parsed = nullableNumber(value, min, max);
  return parsed === null ? null : Math.round(parsed);
}

function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function oneOf(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function dateKey(value, fallback = "") {
  const result = text(value);
  return DATE_KEY.test(result) ? result : fallback;
}

function dateTime(value, fallback = "") {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
}

function stringList(value, limit = 50) {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter(Boolean).slice(0, limit)
    : [];
}

function flexibleStringList(value, limit = 50) {
  if (Array.isArray(value)) return stringList(value, limit);
  return text(value).split(/[\n,]+/).map((item) => text(item)).filter(Boolean).slice(0, limit);
}

function recordList(value, normalizer) {
  return Array.isArray(value) ? value.map(normalizer).filter(Boolean) : [];
}

function normalizeProfile(value) {
  const source = copyRecord(value);
  return {
    ...source,
    name: text(source.name),
    email: text(source.email),
    avatar: text(source.avatar),
    bio: text(source.bio),
    primaryGoal: text(source.primaryGoal),
    fitnessGoal: text(source.fitnessGoal),
    nutritionGoal: text(source.nutritionGoal),
    learningGoal: text(source.learningGoal),
    workStart: timeOfDay(source.workStart, ""),
    workEnd: timeOfDay(source.workEnd, ""),
    wakeTime: timeOfDay(source.wakeTime, ""),
    sleepTime: timeOfDay(source.sleepTime, ""),
    timeZone: text(source.timeZone)
  };
}

function normalizeSettings(value) {
  const source = copyRecord(value);
  return {
    ...source,
    dailyGoalMinutes: integer(source.dailyGoalMinutes, 360, 0, 1440),
    blockGoalMinutes: integer(source.blockGoalMinutes, 50, 10, 180),
    weeklyGoalHours: number(source.weeklyGoalHours, 30, 0, 168),
    shortBreakMinutes: integer(source.shortBreakMinutes, 10, 1, 60),
    longBreakMinutes: integer(source.longBreakMinutes, 25, 1, 120),
    blocksBeforeLongBreak: integer(source.blocksBeforeLongBreak, 4, 1, 12),
    pcPerformance: normalizePerformanceSettings(source.pcPerformance),
    nutritionGoals: normalizeNutritionGoals(source.nutritionGoals),
    financeCurrency: text(source.financeCurrency, "USD").toUpperCase().slice(0, 3) || "USD",
    financeGoals: normalizeFinanceSettingsGoals(source.financeGoals),
    learningTargetMinutes: nullableInteger(source.learningTargetMinutes, 0, 10080),
    dailyDashboard: normalizeDailyDashboard(source.dailyDashboard),
    weeklyReview: normalizeWeeklyReview(source.weeklyReview),
    privacy: normalizePrivacySettings(source.privacy)
  };
}

function timeOfDay(value, fallback) {
  const result = text(value);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(result) ? result : fallback;
}

function normalizeDailyDashboard(value) {
  const source = copyRecord(value);
  const morningStart = timeOfDay(source.morningStart, "05:00");
  const dayStart = timeOfDay(source.dayStart, "12:00");
  const eveningStart = timeOfDay(source.eveningStart, "18:00");
  const toMinutes = (clockValue) => {
    const [hours, minutes] = clockValue.split(":").map(Number);
    return (hours * 60) + minutes;
  };
  const ordered = toMinutes(morningStart) < toMinutes(dayStart)
    && toMinutes(dayStart) < toMinutes(eveningStart);
  return {
    ...source,
    enabled: source.enabled !== false,
    mode: oneOf(source.mode === "today" ? "day" : source.mode, TODAY_MODES, "auto"),
    morningStart: ordered ? morningStart : "05:00",
    dayStart: ordered ? dayStart : "12:00",
    eveningStart: ordered ? eveningStart : "18:00",
    showRoutineCard: source.showRoutineCard !== false,
    notificationsEnabled: Boolean(source.notificationsEnabled),
    updatedAt: timestamp(source.updatedAt)
  };
}

function normalizeWeeklyReview(value) {
  const source = copyRecord(value);
  return {
    ...source,
    enabled: source.enabled !== false,
    reviewDay: integer(source.reviewDay, 0, 0, 6),
    includeGoals: source.includeGoals !== false,
    includeProductivity: source.includeProductivity !== false,
    includeWellbeing: Boolean(source.includeWellbeing),
    includeFinance: Boolean(source.includeFinance),
    includeLearning: source.includeLearning !== false,
    updatedAt: timestamp(source.updatedAt)
  };
}

function normalizeNutritionGoals(value) {
  const source = copyRecord(value);
  return {
    ...source,
    calories: nullableInteger(source.calories, 0),
    proteinGrams: nullableNumber(source.proteinGrams, 0),
    carbsGrams: nullableNumber(source.carbsGrams, 0),
    fatGrams: nullableNumber(source.fatGrams, 0),
    fiberGrams: nullableNumber(source.fiberGrams, 0),
    waterMl: nullableInteger(source.waterMl, 0)
  };
}

function normalizeFinanceSettingsGoals(value) {
  const source = copyRecord(value);
  return {
    ...source,
    monthlySpendingMinor: nullableInteger(source.monthlySpendingMinor, 0),
    monthlySavingMinor: nullableInteger(source.monthlySavingMinor, 0)
  };
}

function normalizeDomainFlags(value, domains) {
  const source = copyRecord(value);
  return Object.fromEntries(domains.map((domain) => [domain, Boolean(source[domain])]));
}

function normalizePrivacySettings(value) {
  const source = copyRecord(value);
  const assistant = copyRecord(source.assistant);
  const manualExport = copyRecord(source.manualExport);
  return {
    ...source,
    browserStorage: normalizeDomainFlags(source.browserStorage, ["wellbeing", "finance", "learningNotes", "medical"]),
    optionalSync: normalizeDomainFlags(source.optionalSync, ["wellbeing", "finance", "learningNotes", "medical"]),
    assistant: {
      ...assistant,
      local: normalizeDomainFlags(assistant.local, ["profile", "nutrition", "recovery", "exercise", "finance", "learning"]),
      cloud: normalizeDomainFlags(assistant.cloud, ["profile", "nutrition", "recovery", "exercise", "finance", "learning"])
    },
    manualExport: {
      ...normalizeDomainFlags(manualExport, ["wellbeing", "finance", "learningNotes", "medical"]),
      includeSensitiveDomains: Boolean(manualExport.includeSensitiveDomains)
    }
  };
}

function normalizePerformanceSettings(value) {
  const source = copyRecord(value);
  return {
    enabled: source.enabled !== false,
    notificationsEnabled: source.notificationsEnabled !== false,
    cpuThreshold: number(source.cpuThreshold, 95, 50, 100),
    temperatureThreshold: number(source.temperatureThreshold, 90, 50, 120),
    memoryThreshold: number(source.memoryThreshold, 95, 50, 100),
    diskThreshold: number(source.diskThreshold, 95, 50, 100),
    sustainedSamples: integer(source.sustainedSamples, 3, 1, 12),
    cooldownMinutes: integer(source.cooldownMinutes, 15, 1, 1440)
  };
}

function normalizeTask(value, now) {
  if (!isRecord(value)) return null;
  const source = copyRecord(value);
  const title = text(source.title ?? source.text);
  if (!title) return null;
  const completed = Boolean(source.completed || source.status === "completed");
  return {
    ...source,
    id: text(source.id) || createId("task"),
    title,
    notes: text(source.notes),
    completed,
    status: oneOf(source.status, TASK_STATUSES, completed ? "completed" : "inbox"),
    priority: oneOf(source.priority, PRIORITIES, "medium"),
    dueDate: text(source.dueDate ?? source.dueAt),
    projectId: text(source.projectId),
    tags: stringList(source.tags),
    createdAt: timestamp(source.createdAt, now),
    completedAt: completed ? timestamp(source.completedAt, now) : null
  };
}

function normalizeReminder(value, now) {
  if (!isRecord(value)) return null;
  const source = copyRecord(value);
  const title = text(source.title ?? source.text);
  if (!title) return null;
  return {
    ...source,
    id: text(source.id) || createId("reminder"),
    title,
    dueAt: dateTime(source.dueAt ?? source.remindAt),
    completed: Boolean(source.completed || source.completedAt),
    kind: text(source.kind, "personal") || "personal",
    createdAt: timestamp(source.createdAt, now)
  };
}

function normalizeEvent(value) {
  if (!isRecord(value)) return null;
  const source = copyRecord(value);
  const title = text(source.title);
  const start = dateTime(source.start ?? source.startAt ?? source.startsAt);
  if (!title || !start) return null;
  return {
    ...source,
    id: text(source.id) || createId("event"),
    title,
    start,
    end: dateTime(source.end ?? source.endAt ?? source.endsAt, start),
    category: text(source.category, "personal") || "personal",
    location: text(source.location),
    notes: text(source.notes),
    allDay: Boolean(source.allDay)
  };
}

function normalizeHabit(value, now) {
  if (!isRecord(value)) return null;
  const source = copyRecord(value);
  const name = text(source.name ?? source.title);
  if (!name) return null;
  const entries = isRecord(source.entries)
    ? Object.fromEntries(Object.entries(source.entries)
      .filter(([key]) => DATE_KEY.test(key))
      .map(([key, entry]) => [key, number(entry, 0, 0)]))
    : {};
  return {
    ...source,
    id: text(source.id) || createId("habit"),
    name,
    target: number(source.target, 1, 1),
    unit: text(source.unit, "times") || "times",
    frequency: text(source.frequency, "daily") || "daily",
    color: text(source.color, "green") || "green",
    entries,
    createdAt: timestamp(source.createdAt, now)
  };
}

function normalizeHealthEntry(value, now) {
  if (!isRecord(value)) return null;
  const source = copyRecord(value);
  const date = dateKey(source.date);
  if (!date) return null;
  return {
    ...source,
    id: text(source.id) || createId("health"),
    date,
    sleepHours: nullableNumber(source.sleepHours, 0, 24),
    energy: nullableNumber(source.energy, 1, 5),
    mood: nullableNumber(source.mood, 1, 5),
    waterGlasses: nullableNumber(source.waterGlasses, 0),
    steps: nullableInteger(source.steps, 0),
    movementMinutes: nullableInteger(source.movementMinutes, 0, 1440),
    weightKg: nullableNumber(source.weightKg, 0),
    bodyFatPercent: nullableNumber(source.bodyFatPercent, 0, 100),
    waistCm: nullableNumber(source.waistCm, 0),
    restingHeartRate: nullableInteger(source.restingHeartRate, 0),
    sleepQuality: nullableInteger(source.sleepQuality, 1, 5),
    stress: nullableInteger(source.stress, 1, 5),
    soreness: nullableInteger(source.soreness, 1, 5),
    recoveryNote: text(source.recoveryNote),
    symptoms: text(source.symptoms),
    note: text(source.note),
    updatedAt: timestamp(source.updatedAt, now)
  };
}

function normalizeBaseRecord(value, now, prefix) {
  if (!isRecord(value)) return null;
  const source = copyRecord(value);
  return {
    source,
    base: {
      ...source,
      id: text(source.id) || createId(prefix),
      createdAt: timestamp(source.createdAt, now),
      updatedAt: timestamp(source.updatedAt, timestamp(source.createdAt, now)),
      deletedAt: timestamp(source.deletedAt)
    }
  };
}

function normalizeNutritionEntry(value, now) {
  const record = normalizeBaseRecord(value, now, "nutrition");
  if (!record) return null;
  const { source, base } = record;
  const date = dateKey(source.date);
  const name = text(source.name);
  if ((!date || !name) && base.deletedAt === null) return null;
  return {
    ...base,
    date,
    mealType: oneOf(source.mealType, MEAL_TYPES, "other"),
    name,
    servingAmount: nullableNumber(source.servingAmount, 0),
    servingUnit: text(source.servingUnit),
    calories: nullableNumber(source.calories, 0),
    proteinGrams: nullableNumber(source.proteinGrams, 0),
    carbsGrams: nullableNumber(source.carbsGrams, 0),
    fatGrams: nullableNumber(source.fatGrams, 0),
    fiberGrams: nullableNumber(source.fiberGrams, 0),
    sourceType: text(source.sourceType, "manual") || "manual",
    sourceId: text(source.sourceId),
    sourceLabel: text(source.sourceLabel),
    sourceUrl: text(source.sourceUrl),
    confidence: oneOf(source.confidence, CONFIDENCE_LEVELS, "manual"),
    assumptions: text(source.assumptions),
    notes: text(source.notes)
  };
}

function normalizeBodyMeasurement(value, now) {
  const record = normalizeBaseRecord(value, now, "body");
  if (!record) return null;
  const { source, base } = record;
  const date = dateKey(source.date);
  if (!date && base.deletedAt === null) return null;
  return {
    ...base,
    date,
    weightKg: nullableNumber(source.weightKg, 0),
    bodyFatPercent: nullableNumber(source.bodyFatPercent, 0, 100),
    waistCm: nullableNumber(source.waistCm, 0),
    restingHeartRate: nullableInteger(source.restingHeartRate, 0),
    notes: text(source.notes)
  };
}

function normalizeWellnessRoutine(value, now) {
  const record = normalizeBaseRecord(value, now, "wellness-routine");
  if (!record) return null;
  const { source, base } = record;
  const name = text(source.name);
  if (!name && base.deletedAt === null) return null;
  return {
    ...base,
    name,
    kind: oneOf(source.kind, WELLNESS_KINDS, "supplement"),
    dose: text(source.dose),
    scheduleTime: text(source.scheduleTime),
    instructions: text(source.instructions),
    active: source.active !== false
  };
}

function normalizeWellnessLog(value, now) {
  const record = normalizeBaseRecord(value, now, "wellness-log");
  if (!record) return null;
  const { source, base } = record;
  const routineId = text(source.routineId);
  const date = dateKey(source.date);
  if ((!routineId || !date) && base.deletedAt === null) return null;
  return {
    ...base,
    routineId,
    date,
    taken: Boolean(source.taken),
    takenAt: timestamp(source.takenAt),
    note: text(source.note)
  };
}

function normalizeExercise(value) {
  if (!isRecord(value)) return null;
  const source = copyRecord(value);
  const name = text(source.name);
  if (!name) return null;
  return {
    ...source,
    name,
    sets: nullableInteger(source.sets, 0),
    reps: nullableInteger(source.reps, 0),
    weightKg: nullableNumber(source.weightKg, 0),
    distanceKm: nullableNumber(source.distanceKm, 0),
    durationMinutes: nullableNumber(source.durationMinutes, 0)
  };
}

function normalizeWorkoutSession(value, now) {
  const record = normalizeBaseRecord(value, now, "workout");
  if (!record) return null;
  const { source, base } = record;
  const date = dateKey(source.date);
  const name = text(source.name);
  if ((!date || !name) && base.deletedAt === null) return null;
  return {
    ...base,
    date,
    name,
    type: text(source.type, "other") || "other",
    durationMinutes: nullableNumber(source.durationMinutes, 0),
    distanceKm: nullableNumber(source.distanceKm, 0),
    caloriesBurned: nullableNumber(source.caloriesBurned, 0),
    effort: nullableInteger(source.effort, 1, 5),
    exercises: recordList(source.exercises, normalizeExercise),
    notes: text(source.notes)
  };
}

function normalizeTrainingPlan(value, now) {
  const record = normalizeBaseRecord(value, now, "training-plan");
  if (!record) return null;
  const { source, base } = record;
  const name = text(source.name);
  if (!name && base.deletedAt === null) return null;
  return {
    ...base,
    name,
    goal: text(source.goal),
    weeklyTarget: nullableInteger(source.weeklyTarget, 0),
    active: source.active !== false
  };
}

function money(value) {
  return integer(value, 0, 0, Number.MAX_SAFE_INTEGER);
}

function normalizeFinanceEntry(value, now) {
  const record = normalizeBaseRecord(value, now, "finance");
  if (!record) return null;
  const { source, base } = record;
  const date = dateKey(source.date);
  const label = text(source.label);
  if ((!date || !label) && base.deletedAt === null) return null;
  return {
    ...base,
    date,
    label,
    amountMinor: money(source.amountMinor),
    kind: oneOf(source.kind, FINANCE_KINDS, "expense"),
    currency: text(source.currency, "USD").toUpperCase().slice(0, 3) || "USD",
    category: text(source.category),
    account: text(source.account),
    notes: text(source.notes),
    excluded: Boolean(source.excluded)
  };
}

function normalizeFinanceBudget(value, now) {
  const record = normalizeBaseRecord(value, now, "finance-budget");
  if (!record) return null;
  const { source, base } = record;
  const category = text(source.category);
  if (!category && base.deletedAt === null) return null;
  return {
    ...base,
    category,
    monthlyLimitMinor: money(source.monthlyLimitMinor),
    active: source.active !== false
  };
}

function normalizeFinanceRecurring(value, now) {
  const record = normalizeBaseRecord(value, now, "finance-recurring");
  if (!record) return null;
  const { source, base } = record;
  const name = text(source.name);
  if (!name && base.deletedAt === null) return null;
  return {
    ...base,
    name,
    amountMinor: money(source.amountMinor),
    kind: oneOf(source.kind, FINANCE_KINDS, "expense"),
    currency: text(source.currency, "USD").toUpperCase().slice(0, 3) || "USD",
    category: text(source.category),
    frequency: text(source.frequency, "monthly") || "monthly",
    nextDueDate: dateKey(source.nextDueDate),
    active: source.active !== false
  };
}

function normalizeFinanceGoal(value, now) {
  const record = normalizeBaseRecord(value, now, "finance-goal");
  if (!record) return null;
  const { source, base } = record;
  const name = text(source.name);
  if (!name && base.deletedAt === null) return null;
  return {
    ...base,
    name,
    kind: oneOf(source.kind, FINANCE_GOAL_KINDS, "saving"),
    targetAmountMinor: money(source.targetAmountMinor),
    currentAmountMinor: money(source.currentAmountMinor),
    targetDate: dateKey(source.targetDate),
    active: source.active !== false
  };
}

function normalizeLearningItem(value, now) {
  const record = normalizeBaseRecord(value, now, "learning-item");
  if (!record) return null;
  const { source, base } = record;
  const title = text(source.title);
  if (!title && base.deletedAt === null) return null;
  return {
    ...base,
    title,
    kind: oneOf(source.kind, LEARNING_KINDS, "other"),
    status: oneOf(source.status, LEARNING_STATUSES, "planned"),
    progress: nullableNumber(source.progress, 0),
    target: nullableNumber(source.target, 0),
    unit: text(source.unit),
    linkedType: text(source.linkedType),
    linkedId: text(source.linkedId),
    source: text(source.source),
    notes: text(source.notes)
  };
}

function normalizeLearningLog(value, now) {
  const record = normalizeBaseRecord(value, now, "learning-log");
  if (!record) return null;
  const { source, base } = record;
  const date = dateKey(source.date);
  const title = text(source.title);
  if ((!date || !title) && base.deletedAt === null) return null;
  return {
    ...base,
    date,
    learningItemId: text(source.learningItemId),
    title,
    durationMinutes: nullableInteger(source.durationMinutes, 0, 1440),
    note: text(source.note)
  };
}

function normalizeLearningNote(value, now) {
  const record = normalizeBaseRecord(value, now, "learning-note");
  if (!record) return null;
  const { source, base } = record;
  const title = text(source.title);
  if (!title && base.deletedAt === null) return null;
  return {
    ...base,
    learningItemId: text(source.learningItemId),
    title,
    body: text(source.body),
    reviewedAt: timestamp(source.reviewedAt),
    nextReviewDate: dateKey(source.nextReviewDate),
    reviewIntervalDays: nullableInteger(source.reviewIntervalDays, 1, 365)
  };
}

function normalizeQuizReview(value, now) {
  const record = normalizeBaseRecord(value, now, "quiz-review");
  if (!record) return null;
  const { source, base } = record;
  const questionId = text(source.questionId) || text(base.id);
  if (!questionId && base.deletedAt === null) return null;
  return {
    ...base,
    id: text(base.id) || questionId,
    questionId,
    topic: text(source.topic),
    ease: number(source.ease, 2.5, 1.3, 3.2),
    intervalDays: integer(source.intervalDays, 0, 0, 365),
    reps: integer(source.reps, 0, 0, 1000000),
    lapses: integer(source.lapses, 0, 0, 1000000),
    dueDate: dateKey(source.dueDate),
    lastRating: integer(source.lastRating, 0, 0, 4),
    lastReviewedAt: timestamp(source.lastReviewedAt),
    seen: integer(source.seen, 0, 0, 1000000),
    correct: integer(source.correct, 0, 0, 1000000)
  };
}

function normalizeQuizDayTally(value) {
  if (!isRecord(value)) return null;
  return {
    reviewed: integer(value.reviewed, 0, 0, 1000000),
    correct: integer(value.correct, 0, 0, 1000000),
    seconds: integer(value.seconds, 0, 0, 100000000)
  };
}

function normalizeWorkItem(value, now) {
  if (!isRecord(value)) return null;
  const source = copyRecord(value);
  const title = text(source.title);
  if (!title) return null;
  return {
    ...source,
    id: text(source.id) || createId("work"),
    title,
    project: text(source.project, "Personal") || "Personal",
    summary: text(source.summary ?? source.notes),
    updatedAt: timestamp(source.updatedAt, now),
    status: text(source.status, "active") || "active",
    link: text(source.link),
    tags: stringList(source.tags)
  };
}

function normalizeImprovement(value, now) {
  if (!isRecord(value)) return null;
  const source = copyRecord(value);
  const title = text(source.title);
  if (!title) return null;
  return {
    ...source,
    id: text(source.id) || createId("improvement"),
    title,
    area: text(source.area, "Personal") || "Personal",
    baseline: number(source.baseline, 0),
    target: number(source.target, 100, 1),
    progress: number(source.progress, 0),
    metric: text(source.metric, "%") || "%",
    status: text(source.status, "active") || "active",
    createdAt: timestamp(source.createdAt, now),
    updatedAt: timestamp(source.updatedAt, now)
  };
}

function normalizePersonalGoal(value, now) {
  const record = normalizeBaseRecord(value, now, "goal");
  if (!record) return null;
  const { source, base } = record;
  const title = text(source.title);
  if (!title && base.deletedAt === null) return null;
  return {
    ...base,
    title,
    description: text(source.description),
    area: text(source.area, "Personal") || "Personal",
    status: oneOf(source.status === "done" ? "completed" : source.status, GOAL_STATUSES, "active"),
    priority: oneOf(source.priority, GOAL_PRIORITIES, "medium"),
    startDate: dateKey(source.startDate),
    targetDate: dateKey(source.targetDate),
    progressMode: oneOf(source.progressMode, GOAL_PROGRESS_MODES, "manual"),
    current: nullableNumber(source.current, 0),
    target: nullableNumber(source.target, 0),
    unit: text(source.unit),
    completedAt: timestamp(source.completedAt)
  };
}

function improvementToGoal(value) {
  const source = copyRecord(value);
  return {
    ...source,
    current: source.current ?? source.progress ?? source.baseline ?? 0,
    unit: source.unit ?? source.metric ?? "%",
    status: source.status === "done" ? "completed" : source.status,
    progressMode: "manual"
  };
}

function normalizeGoalMilestone(value, now) {
  const record = normalizeBaseRecord(value, now, "goal-milestone");
  if (!record) return null;
  const { source, base } = record;
  const title = text(source.title);
  const goalId = text(source.goalId);
  if ((!title || !goalId) && base.deletedAt === null) return null;
  const completed = Boolean(source.completed || source.status === "completed" || source.completedAt);
  return {
    ...base,
    goalId,
    title,
    status: oneOf(source.status, MILESTONE_STATUSES, completed ? "completed" : "pending"),
    targetDate: dateKey(source.targetDate),
    order: integer(source.order, 0, 0),
    weight: number(source.weight, 1, 0),
    completedAt: completed ? timestamp(source.completedAt, now) : null
  };
}

function normalizeMedicalAppointment(value, now) {
  const record = normalizeBaseRecord(value, now, "medical-appointment");
  if (!record) return null;
  const { source, base } = record;
  const title = text(source.title);
  if (!title && base.deletedAt === null) return null;
  return {
    ...base,
    title,
    provider: text(source.provider),
    location: text(source.location),
    start: dateTime(source.start),
    end: dateTime(source.end),
    status: oneOf(source.status, MEDICAL_APPOINTMENT_STATUSES, "scheduled"),
    reason: text(source.reason),
    notes: text(source.notes),
    followUpDate: dateKey(source.followUpDate)
  };
}

function normalizeMedicalRecord(value, now) {
  const record = normalizeBaseRecord(value, now, "medical-record");
  if (!record) return null;
  const { source, base } = record;
  const title = text(source.title);
  const date = dateKey(source.date);
  if ((!title || !date) && base.deletedAt === null) return null;
  return {
    ...base,
    date,
    kind: oneOf(source.kind, MEDICAL_RECORD_KINDS, "other"),
    title,
    provider: text(source.provider),
    summary: text(source.summary),
    referenceLabel: text(source.referenceLabel ?? source.documentLabel)
  };
}

function normalizeEmergencyProfile(value, now) {
  const record = normalizeBaseRecord(value, now, "emergency-profile");
  if (!record) return null;
  const { source, base } = record;
  return {
    ...base,
    id: "emergency-profile",
    bloodType: text(source.bloodType),
    allergies: flexibleStringList(source.allergies),
    conditions: flexibleStringList(source.conditions),
    medications: flexibleStringList(source.medications),
    emergencyContactName: text(source.emergencyContactName),
    emergencyContactPhone: text(source.emergencyContactPhone),
    notes: text(source.notes),
    emergencyContacts: recordList(source.emergencyContacts, (contact) => {
      if (!isRecord(contact)) return null;
      const item = copyRecord(contact);
      const name = text(item.name);
      if (!name) return null;
      return { ...item, name, relationship: text(item.relationship), phone: text(item.phone) };
    })
  };
}

function normalizeDailyRoutineItem(value, now) {
  const record = normalizeBaseRecord(value, now, "daily-routine");
  if (!record) return null;
  const { source, base } = record;
  const title = text(source.title);
  if (!title && base.deletedAt === null) return null;
  return {
    ...base,
    title,
    period: oneOf(source.period, ROUTINE_PERIODS, "morning"),
    order: integer(source.order, 0, 0),
    active: source.active !== false,
    actionPage: text(source.actionPage ?? source.targetPage),
    actionView: text(source.actionView ?? source.targetView)
  };
}

function normalizeDailyRoutineLog(value, now) {
  const record = normalizeBaseRecord(value, now, "daily-routine-log");
  if (!record) return null;
  const { source, base } = record;
  const routineItemId = text(source.routineItemId);
  const date = dateKey(source.date);
  if ((!routineItemId || !date) && base.deletedAt === null) return null;
  const completed = Boolean(source.completed || source.status === "completed" || source.completedAt);
  const deterministicId = routineItemId && date
    ? `daily-routine-log:${encodeURIComponent(routineItemId)}:${date}`
    : base.id;
  return {
    ...base,
    id: deterministicId,
    routineItemId,
    date,
    status: oneOf(source.status, ROUTINE_LOG_STATUSES, completed ? "completed" : "pending"),
    completedAt: completed ? timestamp(source.completedAt, now) : null,
    note: text(source.note)
  };
}

function normalizeJournalEntry(value, now) {
  if (!isRecord(value)) return null;
  const source = copyRecord(value);
  const body = text(source.body ?? source.note);
  if (!body) return null;
  return {
    ...source,
    id: text(source.id) || createId("journal"),
    date: dateKey(source.date, new Date(now).toISOString().slice(0, 10)),
    title: text(source.title, "Daily note") || "Daily note",
    body,
    mood: source.mood === null || source.mood === undefined ? null : number(source.mood, null, 1, 5),
    createdAt: timestamp(source.createdAt, now)
  };
}

function normalizeTimelineEntry(value, now) {
  if (!isRecord(value)) return null;
  const source = copyRecord(value);
  const title = text(source.title);
  if (!title) return null;
  return {
    ...source,
    id: text(source.id) || createId("timeline"),
    type: text(source.type, "note") || "note",
    title,
    detail: text(source.detail),
    occurredAt: timestamp(source.occurredAt, now),
    entityId: source.entityId === null ? null : text(source.entityId) || null,
    entityType: text(source.entityType),
    privacyDomain: text(source.privacyDomain)
  };
}

function normalizeSession(value) {
  if (!isRecord(value)) return null;
  const source = copyRecord(value);
  const startedAt = timestamp(source.startedAt);
  if (startedAt === null) return null;
  const endedAt = timestamp(source.endedAt, startedAt);
  const durationMs = number(source.durationMs, Math.max(0, endedAt - startedAt), 0);
  return {
    ...source,
    id: text(source.id) || createId("session"),
    title: text(source.title, "Untitled focus block") || "Untitled focus block",
    project: text(source.project, "General") || "General",
    tags: stringList(source.tags, 20),
    startedAt,
    endedAt,
    durationMs,
    activeMs: number(source.activeMs, 0, 0),
    pausedMs: number(source.pausedMs, 0, 0),
    pauseCount: integer(source.pauseCount, 0, 0),
    focusRating: number(source.focusRating, 4, 1, 5),
    energy: number(source.energy, 4, 1, 5),
    goalMinutes: integer(source.goalMinutes, 50, 10, 180)
  };
}

function createIdleTimer() {
  return {
    id: null,
    status: "idle",
    mode: "focus",
    breakType: null,
    title: "",
    project: "",
    tags: [],
    startedAt: null,
    lastResumedAt: null,
    activeMs: 0,
    pausedMs: 0,
    pauseStartedAt: null,
    pauseCount: 0,
    focusRating: 4,
    energy: 4,
    goalMinutes: 50,
    completedAt: null
  };
}

function normalizeTimer(value, now) {
  if (!isRecord(value)) return createIdleTimer();
  const source = copyRecord(value);
  const mode = source.mode === "break" ? "break" : "focus";
  const status = oneOf(source.status, TIMER_STATUSES, "idle");
  return {
    ...createIdleTimer(),
    ...source,
    id: source.id === null ? null : text(source.id) || null,
    status,
    mode,
    breakType: mode === "break" ? text(source.breakType, "short") || "short" : null,
    title: text(source.title),
    project: text(source.project),
    tags: stringList(source.tags, 20),
    startedAt: timestamp(source.startedAt),
    lastResumedAt: status === "running" ? timestamp(source.lastResumedAt, now) : timestamp(source.lastResumedAt),
    activeMs: number(source.activeMs, 0, 0),
    pausedMs: number(source.pausedMs, 0, 0),
    pauseStartedAt: timestamp(source.pauseStartedAt),
    pauseCount: integer(source.pauseCount, 0, 0),
    focusRating: number(source.focusRating, 4, 1, 5),
    energy: number(source.energy, 4, 1, 5),
    goalMinutes: integer(source.goalMinutes, 50, 1, 180),
    completedAt: timestamp(source.completedAt)
  };
}

function normalizeDailyMap(value, valueNormalizer) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => DATE_KEY.test(key))
      .map(([key, entry]) => [key, valueNormalizer(entry)])
      .filter(([, entry]) => entry !== null)
  );
}

function normalizeQuizSession(value) {
  if (!isRecord(value)) return null;
  const order = Array.isArray(value.order)
    ? value.order.map((item) => text(item)).filter(Boolean).slice(0, 80)
    : [];
  if (!order.length) return null;
  const results = Array.isArray(value.results)
    ? value.results
        .filter(isRecord)
        .map((item) => ({
          questionId: text(item.questionId),
          rating: integer(item.rating, 0, 0, 5)
        }))
        .filter((item) => item.questionId)
        .slice(0, 80)
    : [];
  return {
    source: text(value.source) || "deck",
    deck: text(value.deck),
    label: text(value.label),
    order,
    index: integer(value.index, 0, 0, order.length),
    startedAt: timestamp(value.startedAt),
    lastAnswerAt: timestamp(value.lastAnswerAt),
    finishedAt: timestamp(value.finishedAt),
    results
  };
}

function normalizeUi(value, now) {
  const source = copyRecord(value);
  return {
    ...source,
    activePage: text(source.activePage, "today") || "today",
    selectedDate: dateKey(source.selectedDate, new Date(now).toISOString().slice(0, 10)),
    taskFilter: text(source.taskFilter, "today") || "today",
    timelineFilter: text(source.timelineFilter, "all") || "all",
    healthView: oneOf(source.healthView, HEALTH_VIEWS, "checkin"),
    progressView: oneOf(source.progressView, PROGRESS_VIEWS, "habits"),
    quizDeck: text(source.quizDeck),
    quizSession: normalizeQuizSession(source.quizSession),
    financeView: text(source.financeView, "overview") || "overview",
    insightsView: oneOf(source.insightsView, INSIGHTS_VIEWS, "overview"),
    todayMode: oneOf(source.todayMode === "today" ? "day" : source.todayMode, TODAY_MODES, "auto"),
    searchOpen: Boolean(source.searchOpen)
  };
}

function hasExistingPersonalData(source) {
  if (text(source?.profile?.name)) return true;
  return [
    "tasks", "events", "calendarEvents", "habits", "healthEntries",
    "nutritionEntries", "workoutSessions", "financeEntries", "learningItems",
    "personalGoals", "dailyRoutineItems", "sessions"
  ].some((key) => Array.isArray(source?.[key]) && source[key].length > 0);
}

function normalizeOnboarding(value, source, now) {
  const onboarding = copyRecord(value);
  const completed = Boolean(onboarding.completed) || (
    !("completed" in onboarding) && !onboarding.skippedAt && hasExistingPersonalData(source)
  );
  return {
    completed,
    completedAt: completed ? timestamp(onboarding.completedAt, now) : null,
    skippedAt: completed ? null : timestamp(onboarding.skippedAt),
    version: integer(onboarding.version, completed ? 1 : 0, 0, 100)
  };
}

function unwrap(value) {
  if (!isRecord(value)) return {};
  const source = copyRecord(value);
  const hasStateFields = ["schemaVersion", "theme", "sessions", "tasks", "timer"].some((key) => key in source);
  return !hasStateFields && isRecord(source.state) ? copyRecord(source.state) : source;
}

function normalizeDocument(raw, now) {
  const source = unwrap(raw);
  const rawVersion = Number(source.schemaVersion);
  if (Number.isFinite(rawVersion) && rawVersion > SCHEMA_VERSION) {
    throw new RangeError(`Unsupported schema version ${rawVersion}; maximum supported version is ${SCHEMA_VERSION}.`);
  }
  const normalizedTasks = recordList(source.tasks, (item) => normalizeTask(item, now));
  const taskIds = new Set(normalizedTasks.map((task) => task.id));
  const isLegacyDocument = !Number.isFinite(rawVersion) || rawVersion < 4;
  const legacyTasks = recordList(isLegacyDocument ? source.goals : [], (goal) => normalizeTask(goal, now))
    .filter((task) => !taskIds.has(task.id));
  const canonicalGoals = recordList(source.personalGoals, (item) => normalizePersonalGoal(item, now));
  const canonicalGoalIds = new Set(canonicalGoals.map((goal) => goal.id));
  const migratedGoals = recordList(source.improvements, (item) => normalizePersonalGoal(improvementToGoal(item), now))
    .filter((goal) => !canonicalGoalIds.has(goal.id));
  const emergencyProfiles = recordList(source.emergencyProfiles, (item) => normalizeEmergencyProfile(item, now))
    .sort((left, right) => Number(right.deletedAt || right.updatedAt || 0) - Number(left.deletedAt || left.updatedAt || 0))
    .slice(0, 1);

  return {
    schemaVersion: SCHEMA_VERSION,
    theme: oneOf(source.theme, THEMES, "light"),
    profile: normalizeProfile(source.profile),
    settings: normalizeSettings(source.settings),
    tasks: [...normalizedTasks, ...legacyTasks],
    reminders: recordList(source.reminders, (item) => normalizeReminder(item, now)),
    events: recordList(source.events ?? source.calendarEvents, normalizeEvent),
    habits: recordList(source.habits, (item) => normalizeHabit(item, now)),
    healthEntries: recordList(source.healthEntries ?? source.healthCheckIns, (item) => normalizeHealthEntry(item, now)),
    nutritionEntries: recordList(source.nutritionEntries, (item) => normalizeNutritionEntry(item, now)),
    bodyMeasurements: recordList(source.bodyMeasurements, (item) => normalizeBodyMeasurement(item, now)),
    wellnessRoutines: recordList(source.wellnessRoutines, (item) => normalizeWellnessRoutine(item, now)),
    wellnessLogs: recordList(source.wellnessLogs, (item) => normalizeWellnessLog(item, now)),
    workoutSessions: recordList(source.workoutSessions, (item) => normalizeWorkoutSession(item, now)),
    trainingPlans: recordList(source.trainingPlans, (item) => normalizeTrainingPlan(item, now)),
    financeEntries: recordList(source.financeEntries, (item) => normalizeFinanceEntry(item, now)),
    financeBudgets: recordList(source.financeBudgets, (item) => normalizeFinanceBudget(item, now)),
    financeRecurring: recordList(source.financeRecurring, (item) => normalizeFinanceRecurring(item, now)),
    financeGoals: recordList(source.financeGoals, (item) => normalizeFinanceGoal(item, now)),
    learningItems: recordList(source.learningItems, (item) => normalizeLearningItem(item, now)),
    learningLogs: recordList(source.learningLogs, (item) => normalizeLearningLog(item, now)),
    learningNotes: recordList(source.learningNotes, (item) => normalizeLearningNote(item, now)),
    quizReviews: recordList(source.quizReviews, (item) => normalizeQuizReview(item, now)),
    quizDaily: normalizeDailyMap(source.quizDaily, normalizeQuizDayTally),
    workItems: recordList(source.workItems, (item) => normalizeWorkItem(item, now)),
    improvements: [],
    personalGoals: [...canonicalGoals, ...migratedGoals],
    goalMilestones: recordList(source.goalMilestones, (item) => normalizeGoalMilestone(item, now)),
    medicalAppointments: recordList(source.medicalAppointments, (item) => normalizeMedicalAppointment(item, now)),
    medicalRecords: recordList(source.medicalRecords, (item) => normalizeMedicalRecord(item, now)),
    emergencyProfiles,
    dailyRoutineItems: recordList(source.dailyRoutineItems, (item) => normalizeDailyRoutineItem(item, now)),
    dailyRoutineLogs: recordList(source.dailyRoutineLogs, (item) => normalizeDailyRoutineLog(item, now)),
    journalEntries: recordList(source.journalEntries, (item) => normalizeJournalEntry(item, now)),
    timeline: recordList(source.timeline ?? source.timelineEntries, (item) => normalizeTimelineEntry(item, now)),
    sessions: recordList(source.sessions ?? source.focus?.sessions, normalizeSession),
    timer: normalizeTimer(source.timer, now),
    manualDailyMinutes: normalizeDailyMap(
      source.manualDailyMinutes ?? source.focus?.manualDailyMinutes,
      (value) => number(value, 0, 0, 1440)
    ),
    manualDailyUpdatedAt: normalizeDailyMap(
      source.manualDailyUpdatedAt ?? source.focus?.manualDailyUpdatedAt,
      (value) => timestamp(value)
    ),
    onboarding: normalizeOnboarding(source.onboarding, source, now),
    ui: normalizeUi(source.ui, now)
  };
}

export function createId(prefix = "item") {
  idSequence = (idSequence + 1) % Number.MAX_SAFE_INTEGER;
  const safePrefix = text(prefix, "item").replace(/[^a-zA-Z0-9_-]+/g, "-") || "item";
  const time = Date.now().toString(36);
  const sequence = idSequence.toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${safePrefix}-${time}-${sequence}-${random}`;
}

export function createDefaultState(now) {
  const current = clock(now);
  return normalizeDocument({}, current);
}

export function migrateLegacyState(raw, now) {
  return normalizeDocument(raw, clock(now));
}

export function normalizeState(raw, now) {
  return normalizeDocument(raw, clock(now));
}
