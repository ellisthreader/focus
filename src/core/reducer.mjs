import { createReview, gradeReview } from "./spaced-repetition.mjs";

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function payload(action) {
  return action && typeof action.payload === "object" && action.payload !== null
    ? action.payload
    : action || {};
}

function id(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function has(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(parsed)))
    : 0;
}

function appendTimeline(state, entry) {
  state.timeline = Array.isArray(state.timeline) ? state.timeline : [];
  state.timeline.unshift({
    id: id("timeline"),
    type: entry.type || "note",
    title: entry.title || "Updated",
    detail: entry.detail || "",
    occurredAt: entry.occurredAt || Date.now(),
    entityId: entry.entityId || null,
    entityType: entry.entityType || "",
    privacyDomain: entry.privacyDomain || ""
  });
  state.timeline = state.timeline.slice(0, 1000);
}

function mergeRecord(current, patch) {
  const result = { ...(current || {}) };
  for (const [key, value] of Object.entries(patch || {})) {
    result[key] = value && typeof value === "object" && !Array.isArray(value)
      ? mergeRecord(result[key], value)
      : value;
  }
  return result;
}

function routineLogId(routineItemId, date) {
  return `daily-routine-log:${encodeURIComponent(text(routineItemId))}:${text(date)}`;
}

function updateById(items, itemId, updater) {
  return (Array.isArray(items) ? items : []).map((item) => (
    item.id === itemId ? updater({ ...item }) : item
  ));
}

function addDomainRecord(state, collection, prefix, data, now, transform = (value) => value) {
  const source = data.record || data.item || data;
  const { now: ignoredNow, ...fields } = source;
  const record = transform({
    ...fields,
    id: text(source.id) || id(prefix),
    createdAt: Number(source.createdAt) || now,
    updatedAt: Number(source.updatedAt) || now,
    deletedAt: null
  });
  state[collection] = Array.isArray(state[collection]) ? state[collection] : [];
  state[collection].unshift(record);
  return record;
}

function updateDomainRecord(state, collection, data, now, transform = (value) => value) {
  const patch = data.patch || data;
  const { id: ignoredId, now: ignoredNow, ...fields } = patch;
  state[collection] = updateById(state[collection], data.id, (item) => transform({
    ...item,
    ...fields,
    id: item.id,
    createdAt: item.createdAt,
    updatedAt: now,
    deletedAt: null
  }));
}

function tombstoneDomainRecord(state, collection, data, now) {
  state[collection] = updateById(state[collection], data.id, (item) => ({
    ...item,
    updatedAt: now,
    deletedAt: now
  }));
}

function applyQuizGrade(state, { questionId, topic, rating, todayKey, now }) {
  state.quizReviews = Array.isArray(state.quizReviews) ? state.quizReviews : [];
  const existing = state.quizReviews.find((item) => (
    item && !item.deletedAt && (item.questionId === questionId || item.id === questionId)
  ));
  const graded = gradeReview(existing || createReview(questionId, topic), rating, todayKey, now);
  if (existing) {
    updateDomainRecord(state, "quizReviews", { id: existing.id, patch: graded }, now);
  } else {
    addDomainRecord(state, "quizReviews", "quiz-review", { ...graded, id: questionId }, now);
  }
  state.quizDaily = state.quizDaily && typeof state.quizDaily === "object" ? state.quizDaily : {};
  const day = state.quizDaily[todayKey] || { reviewed: 0, correct: 0, seconds: 0 };
  state.quizDaily[todayKey] = {
    ...day,
    reviewed: (Number(day.reviewed) || 0) + 1,
    correct: (Number(day.correct) || 0) + (rating >= 3 ? 1 : 0)
  };
}

// Active time between two card answers, capped so walking away doesn't inflate
// the study-time total.
const MAX_CARD_SECONDS = 180;

function financeAmounts(record) {
  const result = { ...record };
  for (const key of ["amountMinor", "monthlyLimitMinor", "targetAmountMinor", "currentAmountMinor"]) {
    if (has(result, key)) result[key] = money(result[key]);
  }
  return result;
}

export function reduceAppState(current, action) {
  if (!action || typeof action.type !== "string") return current;
  const next = clone(current);
  const data = payload(action);
  const now = Number(data.now) || Date.now();

  switch (action.type) {
    case "ui/navigate":
      next.ui.activePage = data.page || data.value || "today";
      next.ui.searchOpen = false;
      return next;
    case "ui/selectDate":
      next.ui.selectedDate = data.date || data.value || "";
      return next;
    case "ui/setTaskFilter":
      next.ui.taskFilter = data.filter || data.value || "today";
      return next;
    case "ui/setTimelineFilter":
      next.ui.timelineFilter = data.filter || data.value || "all";
      return next;
    case "ui/setHealthView":
      next.ui.healthView = data.view || data.value || "checkin";
      return next;
    case "ui/setProgressView":
      next.ui.progressView = data.view || data.value || "habits";
      return next;
    case "ui/setQuizDeck":
      next.ui.quizDeck = text(data.deck || data.value);
      return next;
    case "ui/setFinanceView":
      next.ui.financeView = data.view || data.value || "overview";
      return next;
    case "ui/setInsightsView":
      next.ui.insightsView = data.view || data.value || "overview";
      return next;
    case "ui/setTodayMode":
      next.ui.todayMode = data.mode || data.value || "auto";
      return next;
    case "ui/setSearchOpen":
      next.ui.searchOpen = Boolean(data.open ?? data.value);
      return next;
    case "profile/update":
      next.profile = { ...next.profile, ...(data.patch || data) };
      return next;
    case "onboarding/complete":
      next.onboarding = {
        completed: true,
        completedAt: now,
        skippedAt: null,
        version: 1
      };
      return next;
    case "onboarding/skip":
      next.onboarding = {
        ...(next.onboarding || {}),
        completed: false,
        completedAt: null,
        skippedAt: now,
        version: 1
      };
      return next;
    case "settings/update": {
      const patch = { ...(data.patch || (data.key ? { [data.key]: data.value } : data)) };
      for (const key of ["dailyDashboard", "weeklyReview"]) {
        if (patch[key] && typeof patch[key] === "object") {
          patch[key] = { ...patch[key], updatedAt: now };
        }
      }
      next.settings = mergeRecord(next.settings, patch);
      if (patch.theme) next.theme = patch.theme;
      return next;
    }
    case "ui/setTheme":
      next.theme = data.theme || data.value || "light";
      next.settings = { ...next.settings, theme: next.theme };
      return next;
    case "task/add": {
      const title = text(data.title || data.text);
      if (!title) return current;
      const task = {
        id: id("task"),
        title: title.slice(0, 180),
        notes: text(data.notes).slice(0, 2000),
        completed: false,
        priority: ["low", "medium", "high"].includes(data.priority) ? data.priority : "medium",
        dueDate: data.dueDate || data.date || "",
        projectId: data.projectId || "",
        createdAt: now,
        completedAt: null
      };
      next.tasks.unshift(task);
      appendTimeline(next, { type: "task", title: `Added task: ${task.title}`, entityId: task.id, occurredAt: now });
      return next;
    }
    case "task/update":
      next.tasks = updateById(next.tasks, data.id, (task) => ({ ...task, ...(data.patch || data), id: task.id }));
      return next;
    case "task/toggle":
      next.tasks = updateById(next.tasks, data.id, (task) => {
        const completed = data.completed ?? !task.completed;
        if (completed && !task.completed) {
          appendTimeline(next, { type: "task", title: `Completed: ${task.title}`, entityId: task.id, occurredAt: now });
        }
        return { ...task, completed, completedAt: completed ? now : null };
      });
      return next;
    case "task/delete":
      next.tasks = next.tasks.filter((item) => item.id !== data.id);
      return next;
    case "timer/update":
      next.timer = { ...next.timer, ...(data.patch || data) };
      return next;
    case "timer/replace":
      next.timer = data.timer || data.value || next.timer;
      return next;
    case "session/add": {
      const source = data.session || data;
      if (!source || typeof source !== "object") return current;
      const session = {
        ...source,
        id: text(source.id) || id("session")
      };
      next.sessions.push(session);
      appendTimeline(next, {
        type: "focus",
        title: `Focused: ${session.title || "Untitled focus block"}`,
        detail: `${Math.round(Number(session.activeMs || 0) / 60000)} minutes on ${session.project || "General"}`,
        entityId: session.id,
        occurredAt: session.endedAt || now
      });
      return next;
    }
    case "reminder/add": {
      const title = text(data.title || data.text);
      if (!title) return current;
      next.reminders.unshift({
        id: id("reminder"),
        title: title.slice(0, 180),
        dueAt: data.dueAt || data.date || new Date(now).toISOString(),
        completed: false,
        kind: data.kind || "personal",
        createdAt: now
      });
      return next;
    }
    case "reminder/toggle":
      next.reminders = updateById(next.reminders, data.id, (item) => ({ ...item, completed: data.completed ?? !item.completed }));
      return next;
    case "reminder/update":
      next.reminders = updateById(next.reminders, data.id, (item) => ({ ...item, ...(data.patch || data), id: item.id }));
      return next;
    case "reminder/delete":
      next.reminders = next.reminders.filter((item) => item.id !== data.id);
      return next;
    case "event/add": {
      const title = text(data.title);
      if (!title) return current;
      const event = {
        id: id("event"),
        title: title.slice(0, 180),
        start: data.start || data.startAt || new Date(now).toISOString(),
        end: data.end || data.endAt || data.start || new Date(now + 3600000).toISOString(),
        category: data.category || "personal",
        location: text(data.location).slice(0, 240),
        notes: text(data.notes).slice(0, 2000),
        allDay: Boolean(data.allDay)
      };
      next.events.push(event);
      appendTimeline(next, { type: "calendar", title: `Scheduled: ${event.title}`, entityId: event.id, occurredAt: now });
      return next;
    }
    case "event/update":
      next.events = updateById(next.events, data.id, (item) => ({ ...item, ...(data.patch || data), id: item.id }));
      return next;
    case "event/delete":
      next.events = next.events.filter((item) => item.id !== data.id);
      return next;
    case "health/save": {
      const key = data.date || new Date(now).toISOString().slice(0, 10);
      const existing = next.healthEntries.find((item) => item.date === key);
      const numericFields = [
        "sleepHours", "energy", "mood", "waterGlasses", "steps", "movementMinutes",
        "weightKg", "bodyFatPercent", "waistCm", "restingHeartRate", "sleepQuality",
        "stress", "soreness"
      ];
      const { now: ignoredNow, ...healthFields } = data;
      const entry = {
        ...existing,
        ...healthFields,
        id: existing?.id || id("health"),
        date: key,
        updatedAt: now
      };
      for (const field of numericFields) {
        entry[field] = has(data, field)
          ? nullableNumber(data[field])
          : existing?.[field] ?? null;
      }
      for (const field of ["note", "recoveryNote", "symptoms"]) {
        entry[field] = has(data, field)
          ? text(data[field]).slice(0, 2000)
          : text(existing?.[field]).slice(0, 2000);
      }
      next.healthEntries = next.healthEntries.filter((item) => item.date !== key);
      next.healthEntries.push(entry);
      appendTimeline(next, {
        type: "health",
        title: "Saved recovery and body check-in",
        entityId: entry.id,
        entityType: "healthEntry",
        privacyDomain: "wellbeing",
        occurredAt: now
      });
      return next;
    }
    case "health/increment": {
      const key = data.date || new Date(now).toISOString().slice(0, 10);
      const existing = next.healthEntries.find((item) => item.date === key) || { date: key };
      const field = data.field || "waterGlasses";
      return reduceAppState(next, {
        type: "health/save",
        payload: { ...existing, date: key, [field]: Number(existing[field] || 0) + Number(data.delta || 1), now }
      });
    }
    case "habit/add": {
      const name = text(data.name || data.title);
      if (!name) return current;
      next.habits.push({
        id: id("habit"),
        name: name.slice(0, 120),
        target: Math.max(1, Number(data.target) || 1),
        unit: data.unit || "times",
        frequency: data.frequency || "daily",
        color: data.color || "green",
        entries: {},
        createdAt: now
      });
      return next;
    }
    case "habit/update":
      next.habits = updateById(next.habits, data.id, (habit) => ({
        ...habit,
        name: text(data.patch?.name ?? data.name ?? habit.name).slice(0, 120),
        target: Math.max(1, Number(data.patch?.target ?? data.target ?? habit.target) || 1),
        unit: text(data.patch?.unit ?? data.unit ?? habit.unit, "times"),
        frequency: text(data.patch?.frequency ?? data.frequency ?? habit.frequency, "daily"),
        updatedAt: now
      }));
      return next;
    case "habit/check":
      next.habits = updateById(next.habits, data.id, (habit) => {
        const key = data.date || new Date(now).toISOString().slice(0, 10);
        const entries = { ...(habit.entries || {}) };
        entries[key] = Number(data.value ?? (entries[key] ? 0 : 1));
        if (entries[key]) appendTimeline(next, { type: "habit", title: `Checked in: ${habit.name}`, entityId: habit.id, occurredAt: now });
        return { ...habit, entries };
      });
      return next;
    case "habit/delete":
      next.habits = next.habits.filter((item) => item.id !== data.id);
      return next;
    case "improvement/add":
    case "personalGoal/add":
    case "goal/add": {
      const title = text(data.title);
      if (!title) return current;
      addDomainRecord(next, "personalGoals", "goal", {
        ...data,
        title: title.slice(0, 160),
        area: data.area || "Personal",
        current: nullableNumber(data.current ?? data.progress ?? data.baseline) ?? 0,
        target: nullableNumber(data.target) ?? 100,
        unit: data.unit || data.metric || "%",
        progressMode: data.progressMode || "manual",
        status: data.status || "active",
        priority: data.priority || "medium"
      }, now);
      return next;
    }
    case "improvement/update":
    case "personalGoal/update":
    case "goal/update":
      updateDomainRecord(next, "personalGoals", data, now);
      return next;
    case "improvement/delete":
    case "personalGoal/delete":
    case "goal/delete":
      tombstoneDomainRecord(next, "personalGoals", data, now);
      return next;
    case "goal/setStatus":
      updateDomainRecord(next, "personalGoals", {
        id: data.id,
        patch: {
          status: data.status || "active",
          completedAt: data.status === "completed" ? now : null
        }
      }, now);
      return next;
    case "goalMilestone/add":
      addDomainRecord(next, "goalMilestones", "goal-milestone", data, now);
      return next;
    case "goalMilestone/update":
      updateDomainRecord(next, "goalMilestones", data, now);
      return next;
    case "goalMilestone/complete":
      updateDomainRecord(next, "goalMilestones", {
        id: data.id,
        patch: {
          status: data.completed === false ? "pending" : "completed",
          completedAt: data.completed === false ? null : now
        }
      }, now);
      return next;
    case "goalMilestone/delete":
      tombstoneDomainRecord(next, "goalMilestones", data, now);
      return next;
    case "work/add": {
      const title = text(data.title);
      if (!title) return current;
      const item = {
        id: id("work"),
        title: title.slice(0, 180),
        project: text(data.project || "Personal"),
        summary: text(data.summary || data.notes).slice(0, 2000),
        updatedAt: now,
        status: data.status || "active",
        link: text(data.link).slice(0, 500),
        tags: Array.isArray(data.tags) ? data.tags : text(data.tags).split(",").map((tag) => tag.trim()).filter(Boolean)
      };
      next.workItems.unshift(item);
      appendTimeline(next, { type: "work", title: `Updated work: ${item.title}`, entityId: item.id, occurredAt: now });
      return next;
    }
    case "work/update":
      next.workItems = updateById(next.workItems, data.id, (item) => ({ ...item, ...(data.patch || data), id: item.id, updatedAt: now }));
      return next;
    case "work/status":
      next.workItems = updateById(next.workItems, data.id, (item) => ({ ...item, status: data.status || "active", updatedAt: now }));
      return next;
    case "work/delete":
      next.workItems = next.workItems.filter((item) => item.id !== data.id);
      return next;
    case "journal/add": {
      const body = text(data.body || data.note);
      if (!body) return current;
      const entry = {
        id: id("journal"),
        date: data.date || new Date(now).toISOString().slice(0, 10),
        title: text(data.title || "Daily note").slice(0, 160),
        body: body.slice(0, 10000),
        mood: Number(data.mood) || null,
        createdAt: now
      };
      next.journalEntries.unshift(entry);
      appendTimeline(next, { type: "journal", title: entry.title, detail: entry.body.slice(0, 240), entityId: entry.id, occurredAt: now });
      return next;
    }
    case "nutrition/add":
    case "nutritionEntry/add": {
      const entry = addDomainRecord(next, "nutritionEntries", "nutrition", data, now);
      appendTimeline(next, {
        type: "nutrition",
        title: `Logged meal: ${text(entry.name, "Meal")}`,
        detail: entry.calories === null || entry.calories === undefined ? "" : `${Number(entry.calories)} calories`,
        entityId: entry.id,
        entityType: "nutritionEntry",
        privacyDomain: "wellbeing",
        occurredAt: now
      });
      return next;
    }
    case "nutrition/update":
    case "nutritionEntry/update":
      updateDomainRecord(next, "nutritionEntries", data, now);
      return next;
    case "nutrition/delete":
    case "nutritionEntry/delete":
      tombstoneDomainRecord(next, "nutritionEntries", data, now);
      return next;
    case "bodyMeasurement/add": {
      const entry = addDomainRecord(next, "bodyMeasurements", "body", data, now);
      appendTimeline(next, {
        type: "health",
        title: "Saved body measurement",
        entityId: entry.id,
        entityType: "bodyMeasurement",
        privacyDomain: "wellbeing",
        occurredAt: now
      });
      return next;
    }
    case "bodyMeasurement/update":
      updateDomainRecord(next, "bodyMeasurements", data, now);
      return next;
    case "bodyMeasurement/delete":
      tombstoneDomainRecord(next, "bodyMeasurements", data, now);
      return next;
    case "wellnessRoutine/add":
      addDomainRecord(next, "wellnessRoutines", "wellness-routine", data, now);
      return next;
    case "wellnessRoutine/update":
      updateDomainRecord(next, "wellnessRoutines", data, now);
      return next;
    case "wellnessRoutine/delete":
      tombstoneDomainRecord(next, "wellnessRoutines", data, now);
      return next;
    case "wellness/log":
    case "wellnessLog/add":
      addDomainRecord(next, "wellnessLogs", "wellness-log", data, now);
      return next;
    case "wellnessLog/update":
      updateDomainRecord(next, "wellnessLogs", data, now);
      return next;
    case "wellnessLog/delete":
      tombstoneDomainRecord(next, "wellnessLogs", data, now);
      return next;
    case "workout/add":
    case "workoutSession/add": {
      const entry = addDomainRecord(next, "workoutSessions", "workout", data, now);
      appendTimeline(next, {
        type: "exercise",
        title: `Completed workout: ${text(entry.name, "Workout")}`,
        detail: entry.durationMinutes === null || entry.durationMinutes === undefined
          ? ""
          : `${Number(entry.durationMinutes)} minutes`,
        entityId: entry.id,
        entityType: "workoutSession",
        privacyDomain: "wellbeing",
        occurredAt: now
      });
      return next;
    }
    case "workout/update":
    case "workoutSession/update":
      updateDomainRecord(next, "workoutSessions", data, now);
      return next;
    case "workout/delete":
    case "workoutSession/delete":
      tombstoneDomainRecord(next, "workoutSessions", data, now);
      return next;
    case "trainingPlan/add":
      addDomainRecord(next, "trainingPlans", "training-plan", data, now);
      return next;
    case "trainingPlan/update":
      updateDomainRecord(next, "trainingPlans", data, now);
      return next;
    case "trainingPlan/delete":
      tombstoneDomainRecord(next, "trainingPlans", data, now);
      return next;
    case "finance/add":
    case "financeEntry/add": {
      const entry = addDomainRecord(next, "financeEntries", "finance", data, now, financeAmounts);
      appendTimeline(next, {
        type: "finance",
        title: `Recorded ${entry.kind || "finance"} entry: ${text(entry.label, "Transaction")}`,
        detail: `${entry.currency || next.settings.financeCurrency || "USD"} ${money(entry.amountMinor)}`,
        entityId: entry.id,
        entityType: "financeEntry",
        privacyDomain: "finance",
        occurredAt: now
      });
      return next;
    }
    case "finance/update":
    case "financeEntry/update":
      updateDomainRecord(next, "financeEntries", data, now, financeAmounts);
      return next;
    case "finance/delete":
    case "financeEntry/delete":
      tombstoneDomainRecord(next, "financeEntries", data, now);
      return next;
    case "financeBudget/add":
      addDomainRecord(next, "financeBudgets", "finance-budget", data, now, financeAmounts);
      return next;
    case "financeBudget/update":
      updateDomainRecord(next, "financeBudgets", data, now, financeAmounts);
      return next;
    case "financeBudget/delete":
      tombstoneDomainRecord(next, "financeBudgets", data, now);
      return next;
    case "financeRecurring/add":
      addDomainRecord(next, "financeRecurring", "finance-recurring", data, now, financeAmounts);
      return next;
    case "financeRecurring/update":
      updateDomainRecord(next, "financeRecurring", data, now, financeAmounts);
      return next;
    case "financeRecurring/delete":
      tombstoneDomainRecord(next, "financeRecurring", data, now);
      return next;
    case "financeGoal/add":
      addDomainRecord(next, "financeGoals", "finance-goal", data, now, financeAmounts);
      return next;
    case "financeGoal/update":
      updateDomainRecord(next, "financeGoals", data, now, financeAmounts);
      return next;
    case "financeGoal/delete":
      tombstoneDomainRecord(next, "financeGoals", data, now);
      return next;
    case "learningItem/add":
      addDomainRecord(next, "learningItems", "learning-item", data, now);
      return next;
    case "learningItem/update":
      updateDomainRecord(next, "learningItems", data, now);
      return next;
    case "learningItem/delete":
      tombstoneDomainRecord(next, "learningItems", data, now);
      return next;
    case "learningLog/add": {
      const entry = addDomainRecord(next, "learningLogs", "learning-log", data, now);
      appendTimeline(next, {
        type: "learning",
        title: `Completed study session: ${text(entry.title, "Study")}`,
        detail: entry.durationMinutes === null || entry.durationMinutes === undefined
          ? ""
          : `${Number(entry.durationMinutes)} minutes`,
        entityId: entry.id,
        entityType: "learningLog",
        occurredAt: now
      });
      return next;
    }
    case "learningLog/update":
      updateDomainRecord(next, "learningLogs", data, now);
      return next;
    case "learningLog/delete":
      tombstoneDomainRecord(next, "learningLogs", data, now);
      return next;
    case "learningNote/add":
      addDomainRecord(next, "learningNotes", "learning-note", data, now);
      return next;
    case "learningNote/update":
      updateDomainRecord(next, "learningNotes", data, now);
      return next;
    case "learningNote/delete":
      tombstoneDomainRecord(next, "learningNotes", data, now);
      return next;
    case "quizReview/grade": {
      const questionId = text(data.questionId);
      const rating = Math.max(1, Math.min(4, Math.round(Number(data.rating) || 0)));
      if (!questionId || !rating) return current;
      const todayKey = text(data.today) || new Date(now).toISOString().slice(0, 10);
      applyQuizGrade(next, { questionId, topic: text(data.topic), rating, todayKey, now });
      return next;
    }
    case "quiz/reset":
      next.quizReviews = [];
      next.quizDaily = {};
      next.ui.quizSession = null;
      next.ui.quizDeck = "";
      return next;
    case "quiz/start": {
      const order = (Array.isArray(data.order) ? data.order : [])
        .map((value) => text(value))
        .filter(Boolean)
        .slice(0, 80);
      if (!order.length) return current;
      next.ui.quizSession = {
        source: text(data.source) || "deck",
        deck: text(data.deck),
        label: text(data.label),
        order,
        index: 0,
        startedAt: now,
        finishedAt: null,
        results: []
      };
      return next;
    }
    case "quiz/answer": {
      const session = next.ui.quizSession;
      if (!session) return current;
      const questionId = text(data.questionId);
      const rating = Math.max(1, Math.min(5, Math.round(Number(data.rating) || 0)));
      if (!questionId || !rating) return current;
      const todayKey = text(data.today) || new Date(now).toISOString().slice(0, 10);
      const lastAt = Number(session.lastAnswerAt);
      const startAt = Number(session.startedAt);
      const previousAt = Number.isFinite(lastAt) ? lastAt : (Number.isFinite(startAt) ? startAt : now);
      const deltaSeconds = Math.min(MAX_CARD_SECONDS, Math.max(0, Math.round((now - previousAt) / 1000)));
      applyQuizGrade(next, { questionId, topic: text(data.topic), rating, todayKey, now });
      const day = next.quizDaily[todayKey];
      day.seconds = (Number(day.seconds) || 0) + deltaSeconds;
      session.lastAnswerAt = now;
      session.results = Array.isArray(session.results) ? session.results : [];
      session.results.push({ questionId, rating });
      session.index = Math.min(session.order.length, Number(session.index || 0) + 1);
      if (session.index >= session.order.length) session.finishedAt = now;
      return next;
    }
    case "quiz/exit":
      next.ui.quizSession = null;
      next.ui.quizDeck = "";
      return next;
    case "medicalAppointment/add":
      addDomainRecord(next, "medicalAppointments", "medical-appointment", data, now);
      return next;
    case "medicalAppointment/update":
      updateDomainRecord(next, "medicalAppointments", data, now);
      return next;
    case "medicalAppointment/delete":
      tombstoneDomainRecord(next, "medicalAppointments", data, now);
      return next;
    case "medicalRecord/add":
      addDomainRecord(next, "medicalRecords", "medical-record", data, now);
      return next;
    case "medicalRecord/update":
      updateDomainRecord(next, "medicalRecords", data, now);
      return next;
    case "medicalRecord/delete":
      tombstoneDomainRecord(next, "medicalRecords", data, now);
      return next;
    case "emergencyProfile/add":
    case "emergencyProfile/update":
      if (!next.emergencyProfiles.some((item) => item.id === "emergency-profile")) {
        addDomainRecord(next, "emergencyProfiles", "emergency-profile", {
          ...(data.patch || data),
          id: "emergency-profile"
        }, now);
      } else {
        updateDomainRecord(next, "emergencyProfiles", {
          id: "emergency-profile",
          patch: data.patch || data
        }, now);
      }
      return next;
    case "emergencyProfile/delete":
      tombstoneDomainRecord(next, "emergencyProfiles", { id: "emergency-profile" }, now);
      return next;
    case "dailyRoutineItem/add":
      addDomainRecord(next, "dailyRoutineItems", "daily-routine", data, now);
      return next;
    case "dailyRoutineItem/update":
      updateDomainRecord(next, "dailyRoutineItems", data, now);
      return next;
    case "dailyRoutineItem/delete":
      tombstoneDomainRecord(next, "dailyRoutineItems", data, now);
      return next;
    case "dailyRoutineLog/set": {
      const routineItemId = text(data.routineItemId);
      const date = text(data.date || new Date(now).toISOString().slice(0, 10));
      if (!routineItemId || !date) return current;
      const logId = routineLogId(routineItemId, date);
      const patch = {
        routineItemId,
        date,
        status: data.status || (data.completed === false ? "pending" : "completed"),
        completedAt: (data.status || (data.completed === false ? "pending" : "completed")) === "completed"
          ? now
          : null,
        note: text(data.note)
      };
      if (next.dailyRoutineLogs.some((item) => item.id === logId)) {
        updateDomainRecord(next, "dailyRoutineLogs", { id: logId, patch }, now);
      } else {
        addDomainRecord(next, "dailyRoutineLogs", "daily-routine-log", { ...patch, id: logId }, now);
      }
      return next;
    }
    case "dailyRoutineLog/delete":
      tombstoneDomainRecord(next, "dailyRoutineLogs", data, now);
      return next;
    case "data/reset":
      return data.state || current;
    default:
      return current;
  }
}
