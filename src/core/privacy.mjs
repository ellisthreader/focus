const WELLBEING_COLLECTIONS = Object.freeze([
  "nutritionEntries",
  "savedMeals",
  "healthEntries",
  "bodyMeasurements",
  "wellnessRoutines",
  "wellnessLogs",
  "wellnessRoutineLogs",
  "workoutSessions",
  "trainingPlans"
]);

const FINANCE_COLLECTIONS = Object.freeze([
  "financeEntries",
  "financeBudgets",
  "financeRecurring",
  "financeGoals",
  "financeAccounts"
]);

const LEARNING_NOTE_COLLECTIONS = Object.freeze(["learningNotes"]);
const MEDICAL_COLLECTIONS = Object.freeze([
  "medicalAppointments",
  "medicalRecords",
  "emergencyProfiles"
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneState(state) {
  return structuredClone(isRecord(state) ? state : {});
}

function privacySettings(state) {
  return isRecord(state?.settings?.privacy) ? state.settings.privacy : {};
}

function valueAt(source, path) {
  let value = source;
  for (const key of path.split(".")) {
    if (!isRecord(value) || !(key in value)) return undefined;
    value = value[key];
  }
  return value;
}

function enabled(source, paths) {
  for (const path of paths) {
    const value = valueAt(source, path);
    if (typeof value === "boolean") return value;
  }
  return false;
}

function destinationAllowed(privacy, destination, domain) {
  const destinationTitle = destination[0].toUpperCase() + destination.slice(1);
  const domainAliases = domain === "wellbeing"
    ? ["wellbeing", "health"]
    : domain === "learningNotes"
      ? ["learningNotes", "learning"]
      : [domain];
  const aliases = destination === "browser"
    ? ["browser", "browserStorage", "localStorage"]
    : destination === "sync"
      ? ["sync", "optionalSync", "folderSync", "mysqlSync"]
      : ["export", "exports", "manualExport"];

  const paths = domainAliases.flatMap((domainAlias) => {
    const aliasTitle = domainAlias[0].toUpperCase() + domainAlias.slice(1);
    return aliases.flatMap((alias) => [
      `${alias}.${domainAlias}`,
      `${alias}.include${aliasTitle}`,
      `${alias}${aliasTitle}`,
      `include${aliasTitle}In${destinationTitle}`,
      `include${aliasTitle}In${destinationTitle}Storage`
    ]);
  });

  if (destination === "sync") {
    for (const domainAlias of domainAliases) {
      const aliasTitle = domainAlias[0].toUpperCase() + domainAlias.slice(1);
      paths.push(`include${aliasTitle}InOptionalSync`, `sync${aliasTitle}`);
    }
  } else if (destination === "export") {
    for (const domainAlias of domainAliases) {
      const aliasTitle = domainAlias[0].toUpperCase() + domainAlias.slice(1);
      paths.push(`include${aliasTitle}InManualExports`, `export${aliasTitle}`);
    }
  } else {
    for (const domainAlias of domainAliases) {
      const aliasTitle = domainAlias[0].toUpperCase() + domainAlias.slice(1);
      paths.push(`store${aliasTitle}InBrowser`, `mirror${aliasTitle}ToBrowser`);
    }
  }

  return enabled(privacy, paths);
}

function exportAllowed(privacy, domain) {
  if (destinationAllowed(privacy, "export", domain)) return true;
  if (domain === "medical") return false;
  return enabled(privacy, [
    "export.includeSensitiveDomains",
    "exports.includeSensitiveDomains",
    "manualExport.includeSensitiveDomains",
    "includeSensitiveDomainsInExports",
    "exportSensitiveDomains"
  ]);
}

function removeCollections(snapshot, collections) {
  for (const key of collections) delete snapshot[key];
}

function projectCollections(state, allowances) {
  const snapshot = cloneState(state);
  if (!allowances.wellbeing) removeCollections(snapshot, WELLBEING_COLLECTIONS);
  if (!allowances.finance) removeCollections(snapshot, FINANCE_COLLECTIONS);
  if (!allowances.learningNotes) removeCollections(snapshot, LEARNING_NOTE_COLLECTIONS);
  if (!allowances.medical) removeCollections(snapshot, MEDICAL_COLLECTIONS);
  if (Array.isArray(snapshot.timeline)) {
    snapshot.timeline = snapshot.timeline.filter((entry) => {
      if (!entry?.privacyDomain) return true;
      if (entry.privacyDomain === "wellbeing") return allowances.wellbeing;
      if (entry.privacyDomain === "finance") return allowances.finance;
      if (entry.privacyDomain === "learningNotes") return allowances.learningNotes;
      if (entry.privacyDomain === "medical") return allowances.medical;
      return true;
    });
  }
  return snapshot;
}

export function projectBrowserState(state) {
  const privacy = privacySettings(state);
  return projectCollections(state, {
    wellbeing: destinationAllowed(privacy, "browser", "wellbeing"),
    finance: destinationAllowed(privacy, "browser", "finance"),
    learningNotes: destinationAllowed(privacy, "browser", "learningNotes"),
    medical: false
  });
}

export function projectSyncState(state) {
  const privacy = privacySettings(state);
  return projectCollections(state, {
    wellbeing: destinationAllowed(privacy, "sync", "wellbeing"),
    finance: destinationAllowed(privacy, "sync", "finance"),
    learningNotes: destinationAllowed(privacy, "sync", "learningNotes"),
    medical: false
  });
}

export function projectExportState(state) {
  const privacy = privacySettings(state);
  return projectCollections(state, {
    wellbeing: exportAllowed(privacy, "wellbeing"),
    finance: exportAllowed(privacy, "finance"),
    learningNotes: exportAllowed(privacy, "learningNotes"),
    medical: false
  });
}

function assistantAllowed(privacy, provider, domain) {
  const providerTitle = provider === "cloud" ? "Cloud" : "Local";
  const title = domain[0].toUpperCase() + domain.slice(1);
  const providerAliases = provider === "cloud" ? ["cloud", "openai"] : ["local", "localAi"];
  const paths = providerAliases.flatMap((alias) => [
    `assistant.${alias}.${domain}`,
    `assistant.${alias}.allow${title}`,
    `${alias}Ai.${domain}`,
    `${alias}Ai.allow${title}`
  ]);
  paths.push(
    `allow${providerTitle}Ai${title}`,
    `allow${providerTitle}AI${title}`,
    `${provider === "cloud" ? "cloud" : "local"}Ai${title}`
  );
  if (["nutrition", "recovery", "exercise"].includes(domain)) {
    paths.push(
      `assistant.${provider === "cloud" ? "cloud" : "local"}.wellbeing`,
      `assistant.${provider === "cloud" ? "cloud" : "local"}.health`,
      `allow${providerTitle}AiWellbeing`,
      `allow${providerTitle}AiHealth`,
      `${provider === "cloud" ? "cloud" : "local"}AiWellbeing`,
      `${provider === "cloud" ? "cloud" : "local"}AiHealth`
    );
  }
  return enabled(privacy, paths);
}

function latestByDate(records) {
  if (!Array.isArray(records) || records.length === 0) return null;
  return records.reduce((latest, record) => {
    const value = String(record?.date || record?.updatedAt || record?.createdAt || "");
    const latestValue = String(latest?.date || latest?.updatedAt || latest?.createdAt || "");
    return value > latestValue ? record : latest;
  }, records[0]);
}

function sum(records, field) {
  return Array.isArray(records)
    ? records.reduce((total, record) => total + (Number(record?.[field]) || 0), 0)
    : 0;
}

function dateKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function activeRecords(records) {
  return Array.isArray(records) ? records.filter((record) => !record?.deletedAt) : [];
}

function nutritionSummary(state, currentDate) {
  const entries = activeRecords(state?.nutritionEntries);
  const latest = latestByDate(entries);
  const today = entries.filter((entry) => dateKey(entry?.date || entry?.createdAt) === currentDate);
  const goals = isRecord(state?.settings?.nutritionGoals) ? state.settings.nutritionGoals : {};
  return {
    entryCount: entries.length,
    latestDate: latest?.date || null,
    totalCalories: sum(entries, "calories"),
    totalProteinGrams: sum(entries, "proteinGrams"),
    todayEntryCount: today.length,
    todayCalories: sum(today, "calories"),
    todayProteinGrams: sum(today, "proteinGrams"),
    todayCarbsGrams: sum(today, "carbsGrams"),
    todayFatGrams: sum(today, "fatGrams"),
    goals: {
      calories: Number(goals.calories) || null,
      proteinGrams: Number(goals.proteinGrams) || null,
      carbsGrams: Number(goals.carbsGrams) || null,
      fatGrams: Number(goals.fatGrams) || null
    }
  };
}

function recoverySummary(state) {
  const body = activeRecords(state?.bodyMeasurements);
  const health = activeRecords(state?.healthEntries);
  const routines = activeRecords(state?.wellnessRoutines);
  const logs = activeRecords(state?.wellnessLogs);
  return {
    observationCount: body.length + health.length,
    latestObservationDate: latestByDate([...body, ...health])?.date || null,
    latest: (() => {
      const record = latestByDate(health);
      return record ? {
        sleepHours: Number(record.sleepHours) || null,
        sleepQuality: Number(record.sleepQuality) || null,
        energy: Number(record.energy) || null,
        mood: Number(record.mood) || null,
        stress: Number(record.stress) || null,
        soreness: Number(record.soreness) || null
      } : null;
    })(),
    activeRoutineCount: routines.filter((routine) => routine?.active !== false).length,
    activeRoutines: routines
      .filter((routine) => routine?.active !== false)
      .slice(0, 8)
      .map((routine) => ({
        name: String(routine.name || "").slice(0, 80),
        kind: routine.kind || "",
        scheduleTime: routine.scheduleTime || ""
      })),
    completedRoutineLogCount: logs.filter((log) => log?.taken === true).length
  };
}

function exerciseSummary(state) {
  const sessions = activeRecords(state?.workoutSessions);
  const plans = activeRecords(state?.trainingPlans);
  const latest = latestByDate(sessions);
  return {
    sessionCount: sessions.length,
    latestSessionDate: latest?.date || null,
    latestSession: latest ? {
      name: String(latest.name || "Workout").slice(0, 100),
      type: latest.type || "",
      durationMinutes: Number(latest.durationMinutes) || null
    } : null,
    totalDurationMinutes: sum(sessions, "durationMinutes"),
    activePlanCount: plans.filter((plan) => plan?.active !== false).length,
    activePlans: plans
      .filter((plan) => plan?.active !== false)
      .slice(0, 5)
      .map((plan) => ({
        name: String(plan.name || "").slice(0, 100),
        goal: String(plan.goal || "").slice(0, 160),
        weeklyTarget: Number(plan.weeklyTarget) || null
      }))
  };
}

function financeSummary(state) {
  const entries = activeRecords(state?.financeEntries).filter((entry) => !entry?.excluded);
  const budgets = activeRecords(state?.financeBudgets);
  const goals = activeRecords(state?.financeGoals);
  return {
    transactionCount: entries.length,
    incomeMinor: entries
      .filter((entry) => entry?.kind === "income")
      .reduce((total, entry) => total + (Number(entry?.amountMinor) || 0), 0),
    spendingMinor: entries
      .filter((entry) => entry?.kind === "expense")
      .reduce((total, entry) => total + (Number(entry?.amountMinor) || 0), 0),
    activeBudgetCount: budgets.filter((budget) => budget?.active !== false).length,
    activeGoalCount: goals.filter((goal) => goal?.active !== false).length,
    budgets: budgets.filter((budget) => budget?.active !== false).slice(0, 8).map((budget) => ({
      category: String(budget.category || "").slice(0, 80),
      monthlyLimitMinor: Number(budget.monthlyLimitMinor) || 0
    })),
    goals: goals.filter((goal) => goal?.active !== false).slice(0, 5).map((goal) => ({
      name: String(goal.name || "").slice(0, 100),
      kind: goal.kind || "",
      targetAmountMinor: Number(goal.targetAmountMinor) || 0,
      currentAmountMinor: Number(goal.currentAmountMinor) || 0,
      targetDate: goal.targetDate || null
    }))
  };
}

function learningSummary(state) {
  const items = activeRecords(state?.learningItems);
  const logs = activeRecords(state?.learningLogs);
  const notes = activeRecords(state?.learningNotes);
  const nextReviewDate = notes
    .map((note) => note?.nextReviewDate)
    .filter(Boolean)
    .sort()[0] || null;
  return {
    activeItemCount: items.filter((item) => item?.status === "active").length,
    activeItems: items.filter((item) => item?.status === "active").slice(0, 8).map((item) => ({
      title: String(item.title || "").slice(0, 120),
      kind: item.kind || "",
      progress: Number(item.progress) || 0,
      target: Number(item.target) || null,
      unit: item.unit || ""
    })),
    studyMinutes: sum(logs, "durationMinutes"),
    noteCount: notes.length,
    nextReviewDate
  };
}

function profileSummary(state) {
  const profile = isRecord(state?.profile) ? state.profile : {};
  const goals = activeRecords(state?.personalGoals)
    .filter((goal) => !["completed", "archived"].includes(goal?.status))
    .slice(0, 8)
    .map((goal) => ({
      title: String(goal.title || "").slice(0, 160),
      area: String(goal.area || "").slice(0, 60),
      status: goal.status || "active",
      priority: goal.priority || "medium",
      progress: Number(goal.progress ?? goal.current) || 0,
      target: Number(goal.target) || null,
      unit: goal.unit || ""
    }));
  const habits = activeRecords(state?.habits).slice(0, 10).map((habit) => ({
    name: String(habit.name || "").slice(0, 100),
    target: Number(habit.target) || 1,
    unit: habit.unit || "times",
    frequency: habit.frequency || "daily"
  }));
  const routines = activeRecords(state?.dailyRoutineItems)
    .filter((item) => item.active !== false)
    .slice(0, 12)
    .map((item) => ({
      title: String(item.title || "").slice(0, 120),
      period: item.period || ""
    }));
  return {
    name: String(profile.name || "").slice(0, 120),
    context: String(profile.bio || "").slice(0, 600),
    primaryGoal: String(profile.primaryGoal || "").slice(0, 240),
    fitnessGoal: String(profile.fitnessGoal || "").slice(0, 240),
    nutritionGoal: String(profile.nutritionGoal || "").slice(0, 240),
    learningGoal: String(profile.learningGoal || "").slice(0, 240),
    typicalSchedule: {
      wakeTime: profile.wakeTime || "",
      sleepTime: profile.sleepTime || "",
      workStart: profile.workStart || "",
      workEnd: profile.workEnd || "",
      timeZone: profile.timeZone || ""
    },
    goals,
    habits,
    routines
  };
}

function focusSummary(state, currentDate) {
  const sessions = activeRecords(
    Array.isArray(state?.focus?.sessions) && state.focus.sessions.length
      ? state.focus.sessions
      : state?.sessions
  );
  const today = sessions.filter((session) => dateKey(
    session?.date || session?.startedAt || session?.createdAt
  ) === currentDate);
  const sessionMinutes = Math.round(today.reduce((total, session) => (
    total + (Number(session?.activeMs) || Number(session?.durationMinutes) * 60000 || 0)
  ), 0) / 60000);
  const manualMinutes = Number(state?.manualDailyMinutes?.[currentDate]) || 0;
  const goalMinutes = Number(state?.settings?.dailyGoalMinutes) || 0;
  const focusedMinutes = sessionMinutes + manualMinutes;
  return {
    date: currentDate,
    sessionCount: today.length,
    focusedMinutes,
    goalMinutes,
    remainingMinutes: Math.max(0, goalMinutes - focusedMinutes),
    completionPercent: goalMinutes > 0
      ? Math.round((focusedMinutes / goalMinutes) * 100)
      : null
  };
}

export function projectAssistantContext(state, options = {}) {
  const provider = options.provider === "cloud" || options.provider === "openai" ? "cloud" : "local";
  const privacy = privacySettings(state);
  const currentDate = dateKey(options.currentDate || new Date()) || dateKey(new Date());
  const summaries = {
    focus: focusSummary(state, currentDate)
  };
  if (assistantAllowed(privacy, provider, "profile")) summaries.profile = profileSummary(state);
  if (assistantAllowed(privacy, provider, "nutrition")) {
    summaries.nutrition = nutritionSummary(state, currentDate);
  }
  if (assistantAllowed(privacy, provider, "recovery")) summaries.recovery = recoverySummary(state);
  if (assistantAllowed(privacy, provider, "exercise")) summaries.exercise = exerciseSummary(state);
  if (assistantAllowed(privacy, provider, "finance")) summaries.finance = financeSummary(state);
  if (assistantAllowed(privacy, provider, "learning")) summaries.learning = learningSummary(state);
  return summaries;
}

function recentRecords(records, limit, mapRecord) {
  return activeRecords(records)
    .sort((left, right) => String(
      right?.date || right?.updatedAt || right?.createdAt || ""
    ).localeCompare(String(left?.date || left?.updatedAt || left?.createdAt || "")))
    .slice(0, limit)
    .map(mapRecord);
}

export function projectAssistantApplicationContext(state, options = {}) {
  const provider = options.provider === "cloud" || options.provider === "openai" ? "cloud" : "local";
  const privacy = privacySettings(state);
  const currentDate = dateKey(options.currentDate || new Date()) || dateKey(new Date());
  const summaries = projectAssistantContext(state, { provider, currentDate });
  const context = {
    version: 1,
    currentDate,
    capabilities: {
      reads: [
        "calendar", "tasks", "reminders", "focus", "profile", "nutrition",
        "recovery", "exercise", "finance", "learning"
      ],
      writes: [
        "calendar", "tasks", "reminders", "focus", "nutrition",
        "body_measurements", "sleep", "exercise", "finance", "learning"
      ],
      mutationsRequireApproval: true
    },
    calendar: recentRecords(state?.events, 100, (event) => ({
      title: String(event.title || "").slice(0, 180),
      start: event.start || null,
      end: event.end || null,
      category: event.category || "personal",
      location: String(event.location || "").slice(0, 120)
    })),
    tasks: recentRecords(state?.tasks, 100, (task) => ({
      title: String(task.title || "").slice(0, 180),
      dueDate: task.dueDate || null,
      priority: task.priority || "medium",
      projectId: task.projectId || null,
      completed: Boolean(task.completed)
    })),
    reminders: recentRecords(state?.reminders, 80, (reminder) => ({
      title: String(reminder.title || "").slice(0, 180),
      dueAt: reminder.dueAt || null,
      kind: reminder.kind || "personal",
      completed: Boolean(reminder.completed)
    })),
    summaries
  };

  if (assistantAllowed(privacy, provider, "nutrition")) {
    context.nutrition = recentRecords(state?.nutritionEntries, 30, (entry) => ({
      date: dateKey(entry.date || entry.createdAt),
      mealType: entry.mealType || "other",
      name: String(entry.name || "Meal").slice(0, 180),
      calories: Number(entry.calories) || null,
      proteinGrams: Number(entry.proteinGrams) || null,
      carbsGrams: Number(entry.carbsGrams) || null,
      fatGrams: Number(entry.fatGrams) || null,
      fiberGrams: Number(entry.fiberGrams) || null,
      sourceLabel: String(entry.sourceLabel || "").slice(0, 120),
      confidence: entry.confidence || null
    }));
  }
  if (assistantAllowed(privacy, provider, "recovery")) {
    context.recovery = {
      health: recentRecords(state?.healthEntries, 30, (entry) => ({
        date: dateKey(entry.date || entry.createdAt),
        sleepHours: Number(entry.sleepHours) || null,
        sleepQuality: Number(entry.sleepQuality) || null,
        energy: Number(entry.energy) || null,
        mood: Number(entry.mood) || null,
        stress: Number(entry.stress) || null,
        soreness: Number(entry.soreness) || null
      })),
      body: recentRecords(state?.bodyMeasurements, 20, (entry) => ({
        date: dateKey(entry.date || entry.createdAt),
        weightKg: Number(entry.weightKg) || null,
        bodyFatPercent: Number(entry.bodyFatPercent) || null,
        waistCm: Number(entry.waistCm) || null,
        restingHeartRate: Number(entry.restingHeartRate) || null
      }))
    };
  }
  if (assistantAllowed(privacy, provider, "exercise")) {
    context.exercise = recentRecords(state?.workoutSessions, 30, (session) => ({
      date: dateKey(session.date || session.createdAt),
      name: String(session.name || "Workout").slice(0, 180),
      type: session.type || "other",
      durationMinutes: Number(session.durationMinutes) || null,
      distanceKm: Number(session.distanceKm) || null,
      caloriesBurned: Number(session.caloriesBurned) || null,
      effort: Number(session.effort) || null
    }));
  }
  if (assistantAllowed(privacy, provider, "finance")) {
    context.finance = recentRecords(state?.financeEntries, 40, (entry) => ({
      date: dateKey(entry.date || entry.createdAt),
      label: String(entry.label || entry.name || "Transaction").slice(0, 180),
      amountMinor: Number(entry.amountMinor) || 0,
      kind: entry.kind || "expense",
      currency: entry.currency || state?.settings?.financeCurrency || "GBP",
      category: String(entry.category || "").slice(0, 80)
    }));
  }
  if (assistantAllowed(privacy, provider, "learning")) {
    context.learning = {
      items: recentRecords(state?.learningItems, 30, (item) => ({
        title: String(item.title || "").slice(0, 180),
        kind: item.kind || "",
        status: item.status || "active",
        progress: Number(item.progress) || 0,
        target: Number(item.target) || null,
        unit: item.unit || ""
      })),
      logs: recentRecords(state?.learningLogs, 30, (log) => ({
        date: dateKey(log.date || log.createdAt),
        title: String(log.title || "Study").slice(0, 180),
        durationMinutes: Number(log.durationMinutes) || 0,
        learningItemId: log.learningItemId || null
      }))
    };
  }
  return context;
}

export const projectForBrowserStorage = projectBrowserState;
export const projectForSync = projectSyncState;
export const projectForExport = projectExportState;
export const projectForAssistant = projectAssistantContext;
export const projectApplicationContextForAssistant = projectAssistantApplicationContext;
export const projectStateForBrowserStorage = projectBrowserState;
export const projectStateForSync = projectSyncState;
export const projectStateForExport = projectExportState;
export const projectStateForAssistant = projectAssistantContext;
export const projectFolderSyncState = projectSyncState;
export const projectMysqlSyncState = projectSyncState;
