import { addDays, dateKey, parseDateKey, startOfWeek } from "./date.mjs";

const COMPLETE_STATUSES = new Set(["complete", "completed", "done", "archived"]);
const CANCELLED_STATUSES = new Set(["cancelled", "canceled"]);
const OPTIONAL_DOMAINS = ["nutrition", "exercise", "finance", "learning"];

function list(value) {
  return Array.isArray(value) ? value.filter((item) => item && !item.deletedAt) : [];
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function validDate(value) {
  const input = typeof value === "function" ? value() : value;
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  return Number.isFinite(date.getTime()) ? date : null;
}

function recordDateKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = validDate(value);
  return date ? dateKey(date) : "";
}

function inRange(key, range) {
  return Boolean(key && key >= range.start && key <= range.observationEnd);
}

function rangeFor(start, observationEnd) {
  return {
    start: dateKey(start),
    end: dateKey(addDays(start, 6)),
    observationEnd: dateKey(observationEnd)
  };
}

function taskMetrics(state, range, observedDays) {
  const tasks = list(state?.tasks).filter((task) => (
    !CANCELLED_STATUSES.has(String(task.status || "").toLowerCase())
  ));
  const completed = tasks.filter((task) => {
    const complete = Boolean(task.completed)
      || COMPLETE_STATUSES.has(String(task.status || "").toLowerCase());
    return complete && inRange(recordDateKey(task.completedAt), range);
  });
  const created = tasks.filter((task) => inRange(recordDateKey(task.createdAt), range));
  [...completed, ...created].forEach((task) => {
    const key = recordDateKey(task.completedAt || task.createdAt);
    if (key) observedDays.add(key);
  });
  return { completed: completed.length, created: created.length };
}

function focusMetrics(state, range, observedDays) {
  const sessions = list(state?.focus?.sessions).length
    ? list(state.focus.sessions)
    : list(state?.sessions);
  const matching = sessions.filter((session) => (
    inRange(recordDateKey(session.startedAt ?? session.start ?? session.createdAt), range)
  ));
  let minutes = matching.reduce((total, session) => (
    total + Math.max(0, finite(session.activeMs ?? session.durationMs) / 60_000)
  ), 0);

  const manual = state?.manualDailyMinutes && typeof state.manualDailyMinutes === "object"
    ? state.manualDailyMinutes
    : state?.focus?.manualDailyMinutes;
  Object.entries(manual || {}).forEach(([key, value]) => {
    if (!inRange(key, range)) return;
    const manualMinutes = Math.max(0, finite(value));
    minutes += manualMinutes;
    if (manualMinutes > 0) observedDays.add(key);
  });
  matching.forEach((session) => {
    const key = recordDateKey(session.startedAt ?? session.start ?? session.createdAt);
    if (key) observedDays.add(key);
  });

  return { sessions: matching.length, minutes: Math.round(minutes) };
}

function habitScheduled(habit, date) {
  const frequency = String(habit?.frequency || "daily").toLowerCase();
  if (frequency === "weekdays") return date.getDay() > 0 && date.getDay() < 6;
  return frequency !== "weekly";
}

function habitMetrics(state, range, observedDays) {
  const days = [];
  for (let cursor = parseDateKey(range.start); dateKey(cursor) <= range.observationEnd; cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }

  const totals = list(state?.habits).reduce((result, habit) => {
    const entries = habit?.entries && typeof habit.entries === "object" ? habit.entries : {};
    const target = Math.max(1, finite(habit.target, 1));
    const created = recordDateKey(habit.createdAt);
    const frequency = String(habit.frequency || "daily").toLowerCase();

    if (frequency === "weekly") {
      const eligible = days.some((day) => !created || dateKey(day) >= created);
      if (!eligible) return result;
      const total = days.reduce((sum, day) => {
        const key = dateKey(day);
        const value = Math.max(0, finite(entries[key]));
        if (value > 0) observedDays.add(key);
        return sum + value;
      }, 0);
      result.expected += 1;
      if (total >= target) result.completed += 1;
      return result;
    }

    days.forEach((day) => {
      const key = dateKey(day);
      if ((created && key < created) || !habitScheduled(habit, day)) return;
      const value = Math.max(0, finite(entries[key]));
      result.expected += 1;
      if (value > 0) observedDays.add(key);
      if (value >= target) result.completed += 1;
    });
    return result;
  }, { completed: 0, expected: 0 });

  return {
    ...totals,
    rate: totals.expected ? Math.round((totals.completed / totals.expected) * 100) : null
  };
}

function milestoneMetrics(state, range, observedDays) {
  const completed = list(state?.goalMilestones).filter((milestone) => {
    const status = String(milestone.status || "").toLowerCase();
    const isComplete = Boolean(milestone.completedAt) || COMPLETE_STATUSES.has(status);
    return isComplete && inRange(recordDateKey(milestone.completedAt ?? milestone.updatedAt), range);
  });
  completed.forEach((milestone) => observedDays.add(recordDateKey(milestone.completedAt ?? milestone.updatedAt)));
  return { completed: completed.length };
}

function nutritionMetrics(state, range, observedDays) {
  const entries = list(state?.nutritionEntries).filter((entry) => inRange(recordDateKey(entry.date), range));
  entries.forEach((entry) => observedDays.add(recordDateKey(entry.date)));
  return {
    entries: entries.length,
    calories: Math.round(entries.reduce((total, entry) => total + Math.max(0, finite(entry.calories)), 0)),
    proteinGrams: Math.round(entries.reduce((total, entry) => total + Math.max(0, finite(entry.proteinGrams)), 0))
  };
}

function exerciseMetrics(state, range, observedDays) {
  const sessions = list(state?.workoutSessions).filter((session) => inRange(recordDateKey(session.date), range));
  sessions.forEach((session) => observedDays.add(recordDateKey(session.date)));
  return {
    sessions: sessions.length,
    minutes: Math.round(sessions.reduce((total, session) => (
      total + Math.max(0, finite(session.durationMinutes))
    ), 0))
  };
}

function financeMetrics(state, range, observedDays) {
  const entries = list(state?.financeEntries).filter((entry) => (
    !entry.excluded && inRange(recordDateKey(entry.date), range)
  ));
  const currencies = new Map();
  entries.forEach((entry) => {
    const currency = String(entry.currency || state?.settings?.financeCurrency || "USD").toUpperCase();
    const totals = currencies.get(currency) || {
      currency,
      incomeMinor: 0,
      spendingMinor: 0,
      refundsMinor: 0,
      balanceMinor: 0
    };
    const amount = Math.max(0, Math.round(finite(entry.amountMinor)));
    const kind = String(entry.kind || "expense").toLowerCase();
    if (kind === "income") totals.incomeMinor += amount;
    else if (kind === "refund") totals.refundsMinor += amount;
    else totals.spendingMinor += amount;
    totals.balanceMinor = totals.incomeMinor + totals.refundsMinor - totals.spendingMinor;
    currencies.set(currency, totals);
    observedDays.add(recordDateKey(entry.date));
  });
  return {
    entries: entries.length,
    currencies: [...currencies.values()].sort((left, right) => left.currency.localeCompare(right.currency)),
    mixedCurrencies: currencies.size > 1
  };
}

function learningMetrics(state, range, observedDays) {
  const logs = list(state?.learningLogs).filter((log) => inRange(recordDateKey(log.date), range));
  logs.forEach((log) => observedDays.add(recordDateKey(log.date)));
  return {
    sessions: logs.length,
    minutes: Math.round(logs.reduce((total, log) => (
      total + Math.max(0, finite(log.durationMinutes))
    ), 0))
  };
}

function enabledDomains(options) {
  const requested = options?.domains && typeof options.domains === "object" ? options.domains : {};
  return Object.fromEntries(OPTIONAL_DOMAINS.map((domain) => [domain, requested[domain] !== false]));
}

function buildPeriod(state, range, domains) {
  const observedDays = new Set();
  const period = {
    range,
    tasks: taskMetrics(state, range, observedDays),
    focus: focusMetrics(state, range, observedDays),
    habits: habitMetrics(state, range, observedDays),
    milestones: milestoneMetrics(state, range, observedDays)
  };
  if (domains.nutrition) period.nutrition = nutritionMetrics(state, range, observedDays);
  if (domains.exercise) period.exercise = exerciseMetrics(state, range, observedDays);
  if (domains.finance) period.finance = financeMetrics(state, range, observedDays);
  if (domains.learning) period.learning = learningMetrics(state, range, observedDays);
  period.observedDays = [...observedDays].filter(Boolean).sort();
  return period;
}

function hasDomainData(period, domain) {
  if (domain === "tasks") return period.tasks.completed + period.tasks.created > 0;
  if (domain === "focus") return period.focus.sessions > 0 || period.focus.minutes > 0;
  if (domain === "habits") return period.habits.expected > 0;
  if (domain === "milestones") return period.milestones.completed > 0;
  if (domain === "nutrition") return period.nutrition?.entries > 0;
  if (domain === "exercise") return period.exercise?.sessions > 0;
  if (domain === "finance") return period.finance?.entries > 0;
  if (domain === "learning") return period.learning?.sessions > 0;
  return false;
}

function coverageFor(period) {
  const domains = ["tasks", "focus", "habits", "milestones", ...OPTIONAL_DOMAINS];
  const availableDomains = domains.filter((domain) => hasDomainData(period, domain));
  const elapsedDays = Math.max(
    1,
    Math.round((parseDateKey(period.range.observationEnd) - parseDateKey(period.range.start)) / 86_400_000) + 1
  );
  const dayRatio = Math.min(1, period.observedDays.length / elapsedDays);
  const domainRatio = availableDomains.length / domains.length;
  const score = Math.round(((dayRatio * 0.65) + (domainRatio * 0.35)) * 100);
  return {
    level: score >= 70 ? "high" : score >= 35 ? "medium" : "low",
    score,
    observedDays: period.observedDays.length,
    elapsedDays,
    availableDomains
  };
}

export function buildWeeklyReviewSnapshot(state = {}, options = {}) {
  const now = validDate(options.now) || new Date();
  const currentStart = startOfWeek(now, Number.isInteger(options.firstDay) ? options.firstDay : 1);
  const previousStart = addDays(currentStart, -7);
  const domains = enabledDomains(options);
  const current = buildPeriod(state, rangeFor(currentStart, now), domains);
  const previous = buildPeriod(state, rangeFor(previousStart, addDays(previousStart, 6)), domains);
  const dataCoverage = coverageFor(current);
  const limitations = [
    "This review describes recorded activity only and does not establish causes."
  ];
  if (dataCoverage.level === "low") {
    limitations.push("Data coverage is low; missing records may materially change the summary.");
  }
  if (current.finance?.mixedCurrencies || previous.finance?.mixedCurrencies) {
    limitations.push("Finance totals use separate currencies and are not combined or converted.");
  }
  if (current.range.observationEnd < current.range.end) {
    limitations.push("The current week is still in progress, so comparisons use an incomplete period.");
  }

  return {
    generatedAt: now.toISOString(),
    weekStartsOn: Number.isInteger(options.firstDay) ? options.firstDay : 1,
    current,
    previous,
    dataCoverage,
    limitations
  };
}
