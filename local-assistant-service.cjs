"use strict";

const {
  ASSISTANT_PLAN_SCHEMA,
  AssistantServiceError,
  parseAssistantPlan
} = require("./assistant-service.cjs");

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "qwen3:4b-instruct";
const DEFAULT_LOCAL_MODEL = DEFAULT_OLLAMA_MODEL;
const DEFAULT_STATUS_TIMEOUT_MS = 3000;
const DEFAULT_GENERATION_TIMEOUT_MS = 120000;
const DEFAULT_PULL_TIMEOUT_MS = 600000;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

class LocalAssistantError extends AssistantServiceError {
  constructor(code, message, status) {
    super(code, message, status);
    this.name = "LocalAssistantError";
  }
}

function fail(code, message, status) {
  throw new LocalAssistantError(code, message, status);
}

function cleanText(value, field, maxLength) {
  if (typeof value !== "string") fail("INVALID_ARGUMENT", `${field} must be text.`);
  const result = value.replace(/\u0000/g, "").trim();
  if (!result) fail("INVALID_ARGUMENT", `${field} is required.`);
  if (result.length > maxLength) fail("INVALID_ARGUMENT", `${field} is too long.`);
  return result;
}

function normalizeBaseUrl(value = DEFAULT_OLLAMA_BASE_URL) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    fail("INVALID_ARGUMENT", "Ollama base URL is invalid.");
  }
  if (!["http:", "https:"].includes(url.protocol)
    || !LOOPBACK_HOSTS.has(url.hostname)
    || url.username
    || url.password
    || url.search
    || url.hash) {
    fail("INVALID_ARGUMENT", "Ollama base URL must use a loopback HTTP address.");
  }
  return url.toString().replace(/\/+$/, "");
}

function normalizeModel(value = DEFAULT_OLLAMA_MODEL) {
  const model = cleanText(value, "Ollama model", 200);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(model)) {
    fail("INVALID_ARGUMENT", "Ollama model name is invalid.");
  }
  if (/(^|[:/_-])cloud($|[:/_-])/i.test(model)) {
    fail("INVALID_ARGUMENT", "Cloud-backed models cannot be used with the local AI provider.");
  }
  return model;
}

function normalizeTimeout(value, fallback) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > 1800000) {
    fail("INVALID_ARGUMENT", "Ollama timeout must be between 1 and 1800000 milliseconds.");
  }
  return value;
}

function endpointUrl(baseUrl, endpoint) {
  return `${normalizeBaseUrl(baseUrl)}${endpoint}`;
}

async function fetchOllamaJson(options) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("INVALID_ARGUMENT", "Fetch is unavailable.");
  const timeoutMs = normalizeTimeout(options.timeoutMs, DEFAULT_STATUS_TIMEOUT_MS);
  const controller = new AbortController();
  let timer;
  let timedOut = false;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error("OLLAMA_TIMEOUT"));
    }, timeoutMs);
  });

  try {
    const operation = (async () => {
      const response = await fetchImpl(options.url, {
        ...options.init,
        signal: controller.signal
      });
      if (!response || typeof response.ok !== "boolean") {
        fail("OLLAMA_UNAVAILABLE", "The local Ollama service could not be reached.");
      }
      if (!response.ok) {
        fail(
          "OLLAMA_ERROR",
          `The local Ollama service failed with status ${response.status || "unknown"}.`,
          response.status
        );
      }
      try {
        return await response.json();
      } catch {
        fail("INVALID_RESPONSE", "The local Ollama service returned invalid JSON.");
      }
    })();
    return await Promise.race([operation, timeout]);
  } catch (error) {
    if (timedOut || error?.name === "AbortError" || error?.message === "OLLAMA_TIMEOUT") {
      fail("OLLAMA_TIMEOUT", "The local Ollama service timed out.");
    }
    if (error instanceof AssistantServiceError) throw error;
    fail("OLLAMA_UNAVAILABLE", "The local Ollama service could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}

async function checkOllamaHealth(options = {}) {
  const response = await fetchOllamaJson({
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    url: endpointUrl(options.baseUrl, "/api/version"),
    init: { method: "GET" }
  });
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    fail("INVALID_RESPONSE", "The local Ollama service returned an invalid health response.");
  }
  return {
    available: true,
    version: typeof response.version === "string" ? response.version : null
  };
}

function modelNames(response) {
  if (!response || typeof response !== "object" || !Array.isArray(response.models)) {
    fail("INVALID_RESPONSE", "The local Ollama service returned an invalid model list.");
  }
  const names = [];
  for (const entry of response.models) {
    if (!entry || typeof entry !== "object") continue;
    const name = typeof entry.name === "string"
      ? entry.name
      : typeof entry.model === "string" ? entry.model : "";
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

async function listOllamaModels(options = {}) {
  const response = await fetchOllamaJson({
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    url: endpointUrl(options.baseUrl, "/api/tags"),
    init: { method: "GET" }
  });
  return modelNames(response);
}

function installedModel(names, model) {
  if (names.includes(model)) return true;
  if (model.includes(":")) return false;
  return names.includes(`${model}:latest`);
}

async function getOllamaStatus(options = {}) {
  const model = normalizeModel(options.model);
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  try {
    const health = await checkOllamaHealth({ ...options, baseUrl });
    const models = await listOllamaModels({ ...options, baseUrl });
    const modelInstalled = installedModel(models, model);
    return {
      provider: "ollama",
      available: true,
      runtimeAvailable: true,
      configured: modelInstalled,
      model,
      modelInstalled,
      version: health.version,
      models,
      error: null
    };
  } catch (error) {
    if (!(error instanceof AssistantServiceError)) throw error;
    return {
      provider: "ollama",
      available: false,
      runtimeAvailable: false,
      configured: false,
      model,
      modelInstalled: false,
      version: null,
      models: [],
      error: { code: error.code, message: error.message }
    };
  }
}

async function getLocalAssistantStatus(options = {}) {
  return getOllamaStatus(options);
}

function assistantInstructions(options) {
  const currentDate = cleanText(
    options.currentDate || new Date().toISOString().slice(0, 10),
    "Current date",
    10
  );
  const timeZone = cleanText(options.timeZone || "UTC", "Timezone", 100);
  const currentDateTime = cleanText(
    options.currentDateTime || new Date().toISOString(),
    "Current date-time",
    40
  );
  return [
    "You are the Focus personal assistant. Return only JSON matching the supplied schema.",
    "Convert the user's request into a concise message and zero or more actions.",
    `Today is ${currentDate}. The current timestamp is ${currentDateTime}. The user's timezone is ${timeZone}.`,
    "Calendar dates use YYYY-MM-DD, local times use HH:MM, and weekdays use 0 for Sunday through 6 for Saturday.",
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
    "When meal nutrition is not backed by supplied source metadata, use source_type and confidence ai_estimate and state portion and nutrition assumptions.",
    "Use application_context as the authoritative permission-filtered view of application records. Never claim access to data absent from it.",
    "A request containing task must use only task actions. A request containing remind or reminder must use only reminder actions unless it explicitly says calendar.",
    "Use pending_proposal from context when the user says change it, no, instead, cancel that, or otherwise corrects an unapproved proposal.",
    "Calendar mutation match_title is an exact case-insensitive title match; add only the date, time, and weekday constraints explicitly requested.",
    "Never use create_calendar_schedule for a rename, deletion, correction, replacement, or request containing change, rename, remove, delete, keep, instead, or no.",
    "Never turn a request to delete events into a new schedule. If the requested mutation cannot be expressed safely or the target is unclear, return no actions and explain what detail is needed.",
    "For create_task, always emit a task action when the user explicitly asks to add or create a task and supplies a title.",
    "Task title contains only the task name; put phrases such as due Friday in due_date, not in title.",
    "For create_reminder, require both a purpose/title and a resolvable date and time. Do not invent missing date or time details.",
    "For a current-year schedule, do not start before today unless the user explicitly asks to include past dates or the whole year.",
    "Use an empty location and empty notes unless the user explicitly supplied those details.",
    "Only emit actions the user explicitly requested. Never invent dates, people, locations, or commitments.",
    "The application asks the user to approve actions before applying them, so do not ask for yes/no confirmation in the message."
  ].join(" ");
}

function explicitlyPresent(prompt, value) {
  const normalizedValue = String(value || "").trim().toLocaleLowerCase();
  return normalizedValue
    && String(prompt || "").toLocaleLowerCase().includes(normalizedValue);
}

function asksForPastDates(prompt) {
  return /\b(whole|entire|full)\s+year\b|\bfrom\s+january\b|\bsince\s+january\b|\binclude\s+(the\s+)?past\b/i
    .test(String(prompt || ""));
}

function parseModelJson(value) {
  let text = String(value || "").trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1];
  try {
    return JSON.parse(text);
  } catch {}

  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (withoutThinking !== text) {
    try {
      return JSON.parse(withoutThinking);
    } catch {}
  }

  for (let start = 0; start < withoutThinking.length; start += 1) {
    if (withoutThinking[start] !== "{" && withoutThinking[start] !== "[") continue;
    const stack = [];
    let quoted = false;
    let escaped = false;
    for (let index = start; index < withoutThinking.length; index += 1) {
      const character = withoutThinking[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === "\"") quoted = false;
        continue;
      }
      if (character === "\"") {
        quoted = true;
        continue;
      }
      if (character === "{" || character === "[") stack.push(character);
      else if (character === "}" || character === "]") {
        const opener = stack.pop();
        if ((opener === "{" && character !== "}") || (opener === "[" && character !== "]")) {
          break;
        }
        if (stack.length === 0) {
          try {
            return JSON.parse(withoutThinking.slice(start, index + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  fail("INVALID_PLAN", "Assistant returned invalid JSON.");
}

function normalizeLocalTime(value) {
  if (typeof value !== "string") return value;
  const match = /^([01]\d|2[0-3]):([0-5]\d):00(?:\.0+)?$/.exec(value);
  return match ? `${match[1]}:${match[2]}` : value;
}

function normalizeModelPlanShape(value, currentRequest = "") {
  const raw = parseModelJson(value);
  const parsed = raw?.plan && typeof raw.plan === "object" && !Array.isArray(raw.plan)
    ? raw.plan
    : raw;
  if (!Array.isArray(parsed?.actions)) return parsed;
  const allowedKeys = {
    create_calendar_schedule: [
      "title", "start_date", "end_date", "start_time", "end_time", "weekdays",
      "category", "location", "notes"
    ],
    update_calendar_events: [
      "match_title", "start_date", "end_date", "start_time", "end_time", "weekdays",
      "new_title"
    ],
    delete_calendar_events: [
      "match_title", "start_date", "end_date", "start_time", "end_time", "weekdays"
    ],
    create_task: ["title", "notes", "due_date", "priority", "project_id"],
    update_tasks: ["match_title", "new_title", "notes", "due_date", "priority", "project_id"],
    delete_tasks: ["match_title"],
    complete_tasks: ["match_title"],
    create_reminder: ["title", "due_at", "kind"],
    update_reminders: ["match_title", "new_title", "due_at", "kind"],
    delete_reminders: ["match_title"],
    complete_reminders: ["match_title"],
    log_meal: [
      "date", "meal_type", "name", "serving_amount", "serving_unit", "calories",
      "protein_grams", "carbs_grams", "fat_grams", "fiber_grams", "source_type",
      "source_id", "source_label", "source_url", "confidence", "assumptions", "notes"
    ],
    log_body_measurement: [
      "date", "recorded_at", "weight", "weight_unit", "body_fat_percent", "waist",
      "waist_unit", "resting_heart_rate", "notes"
    ],
    log_sleep: [
      "date", "started_at", "ended_at", "duration_hours", "sleep_quality", "notes"
    ],
    log_workout: [
      "date", "name", "type", "duration_minutes", "distance", "distance_unit",
      "calories_burned", "effort", "exercises", "notes"
    ],
    log_finance_transaction: [
      "date", "label", "amount", "kind", "currency", "category", "account", "notes"
    ],
    log_study_session: [
      "date", "title", "duration_minutes", "learning_item_id", "note"
    ],
    log_focus_session: [
      "date", "title", "duration_minutes", "project", "tags", "started_at", "ended_at",
      "focus_rating", "energy", "note"
    ]
  };
  return {
    message: typeof parsed.message === "string"
      ? parsed.message
      : typeof parsed.response === "string" ? parsed.response : "I prepared the requested update.",
    actions: parsed.actions.map((action) => {
      if (!action?.arguments || typeof action.arguments !== "object") return action;
      const source = { ...action.arguments };
      source.title ||= source.task_title || source.reminder_title || source.event_title || source.name;
      source.new_title ||= source.new_name;
      source.due_date ||= source.new_due_date;
      source.due_at ||= source.new_due_at || source.new_time;
      source.priority ||= source.new_priority;
      let name = action.name;
      if (/^\s*(?:please\s+)?(?:add|create|put|schedule)\b/i.test(currentRequest)
        && !/\b(task|remind|reminder)\b/i.test(currentRequest)
        && ["update_calendar_events", "delete_calendar_events"].includes(name)) {
        name = "create_calendar_schedule";
        source.title ||= source.new_title || source.match_title;
      }
      if (name === "create_calendar_schedule" && source.date) {
        if (!source.start_date) source.start_date = source.date;
        if (!source.end_date) source.end_date = source.date;
      }
      if (/^(update|delete|complete)_(calendar_events|tasks|reminders)$/.test(name)
        && !source.match_title
        && source.title) {
        source.match_title = source.title;
      }
      if ((name === "create_reminder" || name === "update_reminders")
        && !source.due_at) {
        source.due_at = source.remind_at || source.date_time || source.datetime;
      }
      if ((name === "create_task" || name === "update_tasks")
        && !source.due_date) {
        source.due_date = source.date;
      }
      const keys = allowedKeys[name] || Object.keys(source);
      const args = Object.fromEntries(keys
        .filter((key) => source[key] !== undefined)
        .map((key) => [key, source[key]]));
      for (const key of ["start_time", "end_time"]) {
        if (key in args) args[key] = normalizeLocalTime(args[key]);
      }
      if (name === "create_calendar_schedule") {
        if (!("weekdays" in args)) args.weekdays = null;
        if (!("category" in args)) args.category = "personal";
        if (!("location" in args)) args.location = "";
        if (!("notes" in args)) args.notes = "";
      }
      if (name === "update_calendar_events" || name === "delete_calendar_events") {
        for (const key of ["start_date", "end_date", "start_time", "end_time", "weekdays"]) {
          if (!(key in args)) args[key] = null;
        }
      }
      if (name === "create_task") {
        if (!("notes" in args)) args.notes = "";
        if (!("due_date" in args)) args.due_date = null;
        if (!("priority" in args)) args.priority = null;
        if (!("project_id" in args)) args.project_id = "";
      }
      if (name === "update_tasks") {
        for (const key of ["new_title", "notes", "due_date", "priority", "project_id"]) {
          if (!(key in args)) args[key] = null;
        }
      }
      if (name === "update_reminders") {
        for (const key of ["new_title", "due_at", "kind"]) {
          if (!(key in args)) args[key] = null;
        }
      }
      if (name === "log_meal") {
        args.meal_type ||= "other";
        args.source_type ||= "ai_estimate";
        args.confidence ||= "ai_estimate";
        if (args.confidence === "ai_estimate") {
          args.source_type = "ai_estimate";
          args.assumptions ||= "Estimated from the described meal and serving.";
        }
        for (const key of [
          "serving_amount", "serving_unit", "calories", "protein_grams", "carbs_grams",
          "fat_grams", "fiber_grams", "source_id", "source_label", "source_url",
          "assumptions", "notes"
        ]) {
          if (!(key in args)) args[key] = null;
        }
      }
      if (name === "log_body_measurement") {
        for (const key of [
          "recorded_at", "weight", "weight_unit", "body_fat_percent", "waist",
          "waist_unit", "resting_heart_rate", "notes"
        ]) {
          if (!(key in args)) args[key] = null;
        }
      }
      if (name === "log_sleep") {
        for (const key of ["started_at", "ended_at", "duration_hours", "sleep_quality", "notes"]) {
          if (!(key in args)) args[key] = null;
        }
      }
      if (name === "log_workout") {
        args.type ||= "other";
        args.exercises = Array.isArray(args.exercises)
          ? args.exercises.map((exercise) => {
            const normalizedExercise = { ...exercise };
            for (const key of [
              "sets", "reps", "weight", "weight_unit", "distance", "distance_unit",
              "duration_minutes"
            ]) {
              if (!(key in normalizedExercise)) normalizedExercise[key] = null;
            }
            return normalizedExercise;
          })
          : [];
        for (const key of [
          "duration_minutes", "distance", "distance_unit", "calories_burned", "effort", "notes"
        ]) {
          if (!(key in args)) args[key] = null;
        }
      }
      if (name === "log_finance_transaction") {
        for (const key of ["category", "account", "notes"]) {
          if (!(key in args)) args[key] = null;
        }
      }
      if (name === "log_study_session") {
        for (const key of ["learning_item_id", "note"]) {
          if (!(key in args)) args[key] = null;
        }
      }
      if (name === "log_focus_session") {
        args.tags = Array.isArray(args.tags) ? args.tags : [];
        for (const key of [
          "project", "started_at", "ended_at", "focus_rating", "energy", "note"
        ]) {
          if (!(key in args)) args[key] = null;
        }
      }
      if (name === "create_calendar_schedule"
        && args.start_date === args.end_date) {
        args.weekdays = null;
      }
      return { ...action, name, arguments: args };
    })
  };
}

function requestContext(prompt) {
  const line = String(prompt || "").split("\n").find((entry) => entry.trim().startsWith("{"));
  if (!line) return {};
  try {
    const parsed = JSON.parse(line);
    if (!parsed || typeof parsed !== "object") return {};
    const applicationContext = parsed.application_context;
    if (applicationContext && typeof applicationContext === "object") {
      parsed.existing_tasks ||= Array.isArray(applicationContext.tasks)
        ? applicationContext.tasks.map((task) => ({
          title: task.title,
          due_date: task.dueDate || null,
          priority: task.priority || "medium",
          project_id: task.projectId || null,
          completed: Boolean(task.completed)
        }))
        : [];
      parsed.existing_reminders ||= Array.isArray(applicationContext.reminders)
        ? applicationContext.reminders.map((reminder) => ({
          title: reminder.title,
          due_at: reminder.dueAt || null,
          kind: reminder.kind || "personal",
          completed: Boolean(reminder.completed)
        }))
        : [];
      parsed.permitted_personal_summaries ||= applicationContext.summaries || {};
    }
    return parsed;
  } catch {
    return {};
  }
}

const WEEKDAY_PATTERNS = [
  [0, /\b(sun(?:day)?s?|sund?ays?)\b/i],
  [1, /\b(mon(?:day)?s?|mond?ays?|mondys)\b/i],
  [2, /\b(tue(?:sday)?s?|tues?days?)\b/i],
  [3, /\b(wed(?:nesday)?s?|wednes?days?)\b/i],
  [4, /\b(thu(?:rsday)?s?|thur(?:sday)?s?|thrus(?:day)?s?)\b/i],
  [5, /\b(fri(?:day)?s?|frid?ays?)\b/i],
  [6, /\b(sat(?:urday)?s?|satudays?|satdays?)\b/i]
];

function explicitWeekdays(request) {
  const result = WEEKDAY_PATTERNS
    .filter(([, pattern]) => pattern.test(request))
    .map(([weekday]) => weekday);
  if (/\bweekdays?\b/i.test(request)) return [1, 2, 3, 4, 5];
  if (/\bweekends?\b/i.test(request)) return [0, 6];
  if (/\b(?:mon(?:day)?s?|mond?ays?|mondys)\s+(?:to|through|-)\s+(?:fri(?:day)?s?|frid?ays?)\b/i.test(request)) {
    return [1, 2, 3, 4, 5];
  }
  return result.length ? [...new Set(result)].sort((left, right) => left - right) : null;
}

function clockTime(hour, minute, meridiem) {
  let normalizedHour = Number(hour);
  if (meridiem) {
    normalizedHour %= 12;
    if (meridiem.toLowerCase() === "pm") normalizedHour += 12;
  }
  return `${String(normalizedHour).padStart(2, "0")}:${String(Number(minute || 0)).padStart(2, "0")}`;
}

function explicitTimes(request) {
  const values = [];
  const meridiem = /\b([01]?\d)(?::([0-5]\d))?\s*(am|pm)\b/gi;
  for (const match of request.matchAll(meridiem)) {
    values.push(clockTime(match[1], match[2], match[3]));
  }
  const twentyFourHour = /\b([01]\d|2[0-3]):([0-5]\d)(?!:)\b/g;
  for (const match of request.matchAll(twentyFourHour)) {
    values.push(clockTime(match[1], match[2]));
  }
  return [...new Set(values)];
}

function explicitDurationMinutes(request) {
  let minutes = 0;
  const hours = request.match(/\b(?:(\d+(?:\.\d+)?)|an?|one)\s*(?:hours?|hrs?|hr)\b/i);
  if (hours) {
    const value = hours[1] ? Number(hours[1]) : 1;
    if (Number.isFinite(value)) minutes += Math.round(value * 60);
  }
  const minuteMatch = request.match(/\b(\d+)\s*(?:minutes?|mins?|min)\b/i);
  if (minuteMatch) minutes += Number(minuteMatch[1]);
  if (!hours && !minuteMatch) {
    const compact = request.match(/\b(\d+)\s*h(?:ours?)?\s*(\d+)\s*m(?:in(?:utes?)?)?\b/i);
    if (compact) minutes = Number(compact[1]) * 60 + Number(compact[2]);
  }
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 1440 ? minutes : null;
}

function hasExplicitDate(request) {
  return /\b\d{4}-\d{2}-\d{2}\b|\b(now|today|tomorrow|yesterday|tonight|last night|this morning|next|this)\b|\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i
    .test(request);
}

function relativeDateFromRequest(request, currentDate) {
  const [year, month, day] = String(currentDate).split("-").map(Number);
  const base = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (!Number.isFinite(base.getTime())) return null;
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];
  const explicit = request.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/i
  );
  if (explicit) {
    const explicitYear = Number(explicit[3] || year);
    const explicitMonth = monthNames.indexOf(explicit[2].toLowerCase());
    const explicitDay = Number(explicit[1]);
    const result = new Date(explicitYear, explicitMonth, explicitDay, 12, 0, 0, 0);
    if (result.getFullYear() === explicitYear
      && result.getMonth() === explicitMonth
      && result.getDate() === explicitDay) {
      const pad = (value) => String(value).padStart(2, "0");
      return `${explicitYear}-${pad(explicitMonth + 1)}-${pad(explicitDay)}`;
    }
    return null;
  }
  if (/\btomorrow\b/i.test(request)) base.setDate(base.getDate() + 1);
  else if (/\b(yesterday|last night)\b/i.test(request)) base.setDate(base.getDate() - 1);
  else if (/\b(now|today|this morning|this afternoon|this evening|tonight)\b/i.test(request)) {
    // Keep the current date.
  } else {
    const weekdays = explicitWeekdays(request);
    if (!weekdays || weekdays.length !== 1) return null;
    let offset = (weekdays[0] - base.getDay() + 7) % 7;
    if (/\bnext\b/i.test(request) && offset === 0) offset = 7;
    base.setDate(base.getDate() + offset);
  }
  const pad = (value) => String(value).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}

function pendingTitles(context) {
  const values = [];
  for (const action of Array.isArray(context.pending_proposal) ? context.pending_proposal : []) {
    for (const key of ["title", "match_title", "new_title"]) {
      if (typeof action?.arguments?.[key] === "string") values.push(action.arguments[key]);
    }
  }
  return values;
}

function requestedRenameTitle(request) {
  const callMatch = request.match(
    /\bcall\s+(?:it|them|those|all\s+of\s+them)\s+(?:['"]([^'"]+)['"]|([a-z][a-z0-9 &'-]*?)(?=\s+(?:please|every|on|from|at|for|to)\b|[.!?,]|$))/i
  );
  if (callMatch) return (callMatch[1] || callMatch[2] || "").trim();
  const matches = [...request.matchAll(
    /\b(?:to|called|named)\s+(?:['"]([^'"]+)['"]|([a-z][a-z0-9 &'-]*?)(?=\s+(?:please|every|on|from|at|for|to)\b|[.!?,]|$))/gi
  )];
  const renameIndex = request.search(/\b(?:rename|renmae|re[\s-]+name|change|make)\b/i);
  const match = [...matches].reverse().find((candidate) => (
    renameIndex < 0 || candidate.index > renameIndex
  )) || matches.at(-1);
  return (match?.[1] || match?.[2] || "").trim();
}

function requestsRename(request) {
  return /\b(?:rename|renmae|re[\s-]+name|change|make|call)\b/i.test(request);
}

function requestsBroadRename(request) {
  return requestsRename(request)
    && /\b(?:everything|all(?:\s+(?:of\s+)?(?:it|them|those|events|entries|data|items|appointments))?|every\s+(?:calendar\s+)?(?:event|entry|item|appointment))\b/i.test(request);
}

function pendingCalendarAmendmentPlan(request, context) {
  const pending = Array.isArray(context.pending_proposal)
    ? context.pending_proposal
    : [];
  const calendarActions = pending.filter((action) => (
    action?.name === "create_calendar_schedule"
    || action?.name === "update_calendar_events"
    || action?.name === "delete_calendar_events"
  ));
  if (calendarActions.length === 0) return null;
  const renamed = requestedRenameTitle(request);
  const times = explicitTimes(request);
  const weekdays = explicitWeekdays(request);
  if (!renamed && times.length < 1 && !weekdays) return null;
  const pluralReference = /\b(all|them|those|events)\b/i.test(request);
  if (calendarActions.length > 1 && !pluralReference) {
    return {
      message: "There is more than one pending calendar change. Please say all of them or name the one to edit.",
      actions: []
    };
  }
  return {
    message: "I updated the pending calendar proposal.",
    actions: pending.map((action) => (
      calendarActions.includes(action)
        ? {
          ...action,
          arguments: {
            ...action.arguments,
            ...(renamed && action.name === "create_calendar_schedule" ? { title: renamed } : {}),
            ...(renamed && action.name === "update_calendar_events" ? { new_title: renamed } : {}),
            ...(times[0] ? { start_time: times[0] } : {}),
            ...(times[1] ? { end_time: times[1] } : {}),
            ...(weekdays ? { weekdays } : {})
          }
        }
        : action
    ))
  };
}

function calendarRenamePlan(request, context) {
  if (!requestsRename(request)) return null;
  const patterns = Array.isArray(context.existing_calendar_patterns)
    ? context.existing_calendar_patterns
    : [];
  const renameMatch = request.match(/\b(?:to|called|named)\s+(?:['"]([a-z][^'"]*)['"]|([a-z][a-z0-9 &-]*?)(?=\s+(?:every|on|from|at|for)\b|[.,]|$))/i);
  const renamed = requestedRenameTitle(request);
  if (!renamed || patterns.length === 0) return null;
  const times = explicitTimes(request);
  const weekdays = explicitWeekdays(request);
  if (requestsBroadRename(request)
    && (referencesCalendar(request)
      || /\b(?:events?|entries|items?|appointments?)\b/i.test(request)
      || /\b(?:everything|all\s+of\s+them|all\s+of\s+those|rename\s+them\s+all)\b/i.test(request))) {
    const broadWeekdays = explicitWeekdays(request);
    const selectedPatterns = broadWeekdays
      ? patterns.filter((pattern) => (
        !Array.isArray(pattern.weekdays)
        || broadWeekdays.some((weekday) => pattern.weekdays.includes(weekday))
      ))
      : patterns;
    if (selectedPatterns.length === 0) return null;
    return {
      message: `I prepared the rename of ${selectedPatterns.length} calendar groups to ${renamed}.`,
      actions: selectedPatterns.map((pattern) => ({
        version: 1,
        name: "update_calendar_events",
        arguments: {
          match_title: pattern.title,
          start_time: pattern.start_time,
          end_time: pattern.end_time,
          ...(broadWeekdays ? { weekdays: broadWeekdays } : {}),
          new_title: renamed
        }
      }))
    };
  }
  const sourceText = renameMatch?.index === undefined ? request : request.slice(0, renameMatch.index);
  let matchingPattern = patterns
    .filter((pattern) => typeof pattern?.title === "string")
    .filter((pattern) => sourceText.toLocaleLowerCase().includes(pattern.title.toLocaleLowerCase()))
    .sort((left, right) => right.title.length - left.title.length)[0];
  if (!matchingPattern && weekdays) {
    const requested = [...weekdays].sort((left, right) => left - right);
    const candidates = patterns.filter((pattern) => {
      const patternDays = Array.isArray(pattern.weekdays)
        ? [...pattern.weekdays].sort((left, right) => left - right)
        : [];
      return requested.every((weekday) => patternDays.includes(weekday));
    });
    if (candidates.length === 1) matchingPattern = candidates[0];
  }
  const match = matchingPattern?.title || patterns
    .map((pattern) => pattern?.title)
    .filter((title) => typeof title === "string" && sourceText.toLocaleLowerCase().includes(title.toLocaleLowerCase()))
    .sort((left, right) => right.length - left.length)[0];
  if (!match || match.toLocaleLowerCase() === renamed.toLocaleLowerCase()) return null;
  return {
    message: `I prepared the rename from ${match} to ${renamed}.`,
    actions: [{
      version: 1,
      name: "update_calendar_events",
      arguments: {
        match_title: match,
        ...(times[0] ? { start_time: times[0] } : {}),
        ...(times[1] ? { end_time: times[1] } : {}),
        ...(weekdays ? { weekdays } : {}),
        new_title: renamed
      }
    }]
  };
}

function existingTitle(request, items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => item?.title)
    .filter((title) => typeof title === "string" && request.toLocaleLowerCase().includes(title.toLocaleLowerCase()))
    .sort((left, right) => right.length - left.length)[0] || null;
}

function requestedMutation(request) {
  const match = String(request).match(
    /^\s*(?:(?:please|now)\s+|(?:(?:can|could|would)\s+you\s+)|(?:i\s+want\s+you\s+to\s+))*?(delete|remove|complete|finish|mark|change|edit|update)\b/i
  );
  return match?.[1]?.toLowerCase() || null;
}

function offsetFromDateTime(currentDateTime) {
  return String(currentDateTime || "").match(/(Z|[+-]\d{2}:\d{2})$/)?.[1] || "Z";
}

function timeRequestPatterns(time) {
  const [hourText, minuteText] = String(time || "").split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return [];
  const meridiem = hour >= 12 ? "pm" : "am";
  const twelveHour = hour % 12 || 12;
  return [
    new RegExp(`\\b${twelveHour}(?::${String(minute).padStart(2, "0")})?\\s*${meridiem}\\b`, "i"),
    new RegExp(`\\b${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}\\b`)
  ];
}

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function occurrences(text, pattern) {
  return [...text.matchAll(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`))]
    .map((match) => ({ index: match.index, text: match[0] }));
}

function nearestPatternTime(text, titleIndex, patterns) {
  let nearest = null;
  for (const pattern of patterns) {
    for (const match of occurrences(text, pattern)) {
      const distance = Math.abs(match.index - titleIndex);
      if (distance <= 80 && (!nearest || distance < nearest.distance)) {
        nearest = { distance };
      }
    }
  }
  return nearest;
}

function calendarDeleteListPlan(request, context) {
  if (!/\b(delete|remove)\b/i.test(request)) return null;
  const deletePart = request.split(/\b(?:but\s+keep|except|just\s+keep)\b/i)[0];
  const patterns = Array.isArray(context.existing_calendar_patterns)
    ? context.existing_calendar_patterns
    : [];
  const titles = [...new Set(patterns.map((pattern) => pattern?.title).filter(Boolean))]
    .sort((left, right) => right.length - left.length);
  const weekdays = explicitWeekdays(deletePart);
  const explicitDate = relativeDateFromRequest(deletePart, context.current_date || "");
  const actions = [];
  for (const title of titles) {
    const titleMatches = occurrences(
      deletePart,
      new RegExp(`\\b${regexEscape(title)}\\b`, "i")
    );
    for (const titleMatch of titleMatches) {
      const matchingPatterns = patterns
        .filter((pattern) => pattern.title.toLocaleLowerCase() === title.toLocaleLowerCase())
        .map((pattern) => ({
          pattern,
          nearest: nearestPatternTime(deletePart, titleMatch.index, timeRequestPatterns(pattern.start_time))
        }))
        .filter(({ nearest }) => nearest)
        .sort((left, right) => left.nearest.distance - right.nearest.distance);
      const pattern = matchingPatterns[0]?.pattern;
      if (!pattern) continue;
      actions.push({
        version: 1,
        name: "delete_calendar_events",
        arguments: {
          match_title: pattern.title,
          start_time: pattern.start_time,
          end_time: pattern.end_time,
          ...(weekdays && !explicitDate ? { weekdays } : {}),
          ...(explicitDate ? { start_date: explicitDate, end_date: explicitDate } : {})
        }
      });
    }
  }
  const unique = actions.filter((action, index) => actions.findIndex((candidate) => (
    JSON.stringify(candidate.arguments) === JSON.stringify(action.arguments)
  )) === index);
  return unique.length > 0
    ? { message: `I prepared deletion of ${unique.length} matching calendar groups.`, actions: unique }
    : null;
}

function requestsBulkDeletion(request) {
  if (/^\s*(?:(?:please|now)\s+)?(?:complete|finish|mark|update|edit|rename)\b[\s\S]*\b(?:task|reminder)\b/i.test(request)) {
    return false;
  }
  const deleteVerb = /\b(?:remove|delete|clear|wipe|get\s+rid\s+of)\b/i.test(request);
  if (!deleteVerb) return false;
  return /\b(?:everything|everythin|evrything|evrythi+ng)\b/i.test(request)
    || /\bevery\s+(?:calendar\s+)?(?:event|entry|item|appointment)\b/i.test(request)
    || /\ball\s+(?:(?:the|my|this)\s+)?(?:(?:calendar|agenda)\s+)?(?:data|entries|events|items|appointments)\b/i.test(request)
    || /\ball\s+(?:from|on|in)\s+(?:my\s+)?(?:calendar|agenda)\b/i.test(request)
    || /\b(?:entire|whole)\s+(?:calendar|agenda)\b/i.test(request)
    || /\b(?:calendar|agenda)\s+(?:clean|clear)\b/i.test(request)
    || /\bclear\s+(?:my\s+)?(?:calendar|agenda)\b/i.test(request);
}

function referencesCalendar(request) {
  return /\b(?:calendar|calender|calander|calaender|calandar|calndar|calnder|agenda)\b/i.test(request);
}

function recurringCalendarTitle(request) {
  const workAt = request.match(/\bwork\s+at\s+['"]?([a-z0-9][a-z0-9 &'-]*?)(?=\s+(?:from|at|on|every|each)\b|[.,]|$)/i);
  if (workAt?.[1]) return workAt[1].trim();
  const called = request.match(/\b(?:called|named)\s+['"]?([a-z0-9][a-z0-9 &'-]*?)(?=\s+(?:from|at|on|every|each)\b|[.,]|$)/i);
  if (called?.[1]) return called[1].trim();
  const add = request.match(
    /\b(?:add|schedule|scedule|put)\s+(?:on\s+)?(.+?)(?=\s+(?:every|each|on\s+)?(?:mon|tue|wed|thu|fri|sat|sun|weekday|weekend)|\s+(?:from|at)\b)/i
  );
  return add?.[1]
    ?.replace(/\bthat\s+i\s+have\s+to\b/gi, "")
    .replace(/\s+(?:in|to|on)\s+my\s+(?:calendar|calender|calander|calaender|calandar|calndar|calnder|agenda)$/i, "")
    .trim() || null;
}

function oneOffCalendarTitle(request) {
  const deicticCommand = request.match(/\b(?:add|put|schedule|create)\s+(?:this|it)\b/i);
  let candidate = deicticCommand
    ? request.slice(0, deicticCommand.index)
    : request.match(
      /\b(?:add|put|schedule|create)\s+(.+?)(?=\s+(?:to|in|on)\s+(?:my\s+)?(?:calendar|calender|calander|calaender|calandar|calndar|calnder|agenda)\b|\s+(?:now|today|tomorrow|tonight|at|from)\b|[.,]|$)/i
    )?.[1];
  if (!candidate) return null;
  candidate = candidate
    .replace(/\b(?:[01]?\d(?::[0-5]\d)?\s*(?:am|pm)|(?:[01]\d|2[0-3]):[0-5]\d)\b[\s\S]*$/i, "")
    .replace(/\b(?:right\s+now|now|today|tomorrow|tonight|this\s+(?:morning|afternoon|evening))\b[\s\S]*$/i, "")
    .replace(/^\s*(?:(?:i(?:'m|\s+am)\s+)?(?:going|heading|off)(?:\s+to)?|i\s+have|doing)\s+/i, "")
    .replace(/\s+(?:in|to|on)\s+(?:my\s+)?(?:calendar|calender|calander|calaender|calandar|calndar|calnder|agenda)\s*$/i, "")
    .replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, "")
    .trim();
  if (!candidate || /^(?:this|it)$/i.test(candidate)) return null;
  return candidate[0].toUpperCase() + candidate.slice(1);
}

function deterministicPlan(request, context, currentDate, currentDateTime) {
  context.current_date = currentDate;
  const patterns = Array.isArray(context.existing_calendar_patterns)
    ? context.existing_calendar_patterns
    : [];
  const family = context?.resolved_nutrition || context?.nutrition_resolution_error
    ? "nutrition"
    : requestedFamily(request);
  const durationMinutes = explicitDurationMinutes(request);
  const focusSummary = context?.permitted_personal_summaries?.focus;
  const resolvedNutrition = context?.resolved_nutrition;
  const nutritionResolutionError = context?.nutrition_resolution_error;
  const applicationContext = context?.application_context || {};
  const summaries = applicationContext?.summaries || context?.permitted_personal_summaries || {};
  const readOnlyRequest = /\b(?:what|which|show|list|how many|how much|where|when|do i|have i|did i)\b/i.test(request)
    && !/\b(?:add|create|log|record|track|update|change|rename|delete|remove|complete|mark|schedule|set)\b/i.test(request);
  if (readOnlyRequest && /\btask(?:s)?\b/i.test(request)) {
    const tasks = Array.isArray(applicationContext.tasks)
      ? applicationContext.tasks.filter((task) => !task.completed)
      : Array.isArray(context.existing_tasks) ? context.existing_tasks.filter((task) => !task.completed) : [];
    return {
      message: tasks.length
        ? `You have ${tasks.length} open task${tasks.length === 1 ? "" : "s"}: ${tasks.slice(0, 8).map((task) => task.title).join(", ")}.`
        : "You have no open tasks.",
      actions: []
    };
  }
  if (readOnlyRequest && /\breminder(?:s)?\b/i.test(request)) {
    const reminders = Array.isArray(applicationContext.reminders)
      ? applicationContext.reminders.filter((reminder) => !reminder.completed)
      : Array.isArray(context.existing_reminders)
        ? context.existing_reminders.filter((reminder) => !reminder.completed)
        : [];
    return {
      message: reminders.length
        ? `You have ${reminders.length} active reminder${reminders.length === 1 ? "" : "s"}: ${reminders.slice(0, 8).map((reminder) => reminder.title).join(", ")}.`
        : "You have no active reminders.",
      actions: []
    };
  }
  if (readOnlyRequest && /\b(?:calendar|agenda|events?)\b/i.test(request)) {
    const events = Array.isArray(applicationContext.calendar) ? applicationContext.calendar : [];
    return {
      message: events.length
        ? `Your calendar context contains ${events.length} event${events.length === 1 ? "" : "s"}: ${events.slice(0, 8).map((event) => event.title).join(", ")}.`
        : "There are no calendar events in the available context.",
      actions: []
    };
  }
  if (readOnlyRequest && /\b(?:calories?|protein|carbs?|fat|fiber|fibre|nutrition|macros?|meals?|food)\b/i.test(request)) {
    const nutrition = summaries.nutrition;
    return {
      message: nutrition
        ? `Today you have ${nutrition.todayEntryCount} meal entr${nutrition.todayEntryCount === 1 ? "y" : "ies"} totaling ${nutrition.todayCalories} kcal, ${nutrition.todayProteinGrams}g protein, ${nutrition.todayCarbsGrams}g carbs, and ${nutrition.todayFatGrams}g fat.`
        : "Nutrition data is not enabled for this assistant provider.",
      actions: []
    };
  }
  if (readOnlyRequest && /\b(?:workouts?|exercise|training)\b/i.test(request)) {
    const exercise = summaries.exercise;
    return {
      message: exercise
        ? `You have ${exercise.sessionCount} workout session${exercise.sessionCount === 1 ? "" : "s"} totaling ${exercise.totalDurationMinutes} minutes.`
        : "Exercise data is not enabled for this assistant provider.",
      actions: []
    };
  }
  if (readOnlyRequest && /\b(?:spent|spending|income|earned|finance|transactions?|budget)\b/i.test(request)) {
    const finance = summaries.finance;
    return {
      message: finance
        ? `Your available finance summary has ${finance.transactionCount} transaction${finance.transactionCount === 1 ? "" : "s"}, ${finance.spendingMinor} minor units of spending, and ${finance.incomeMinor} minor units of income.`
        : "Finance data is not enabled for this assistant provider.",
      actions: []
    };
  }
  if (readOnlyRequest && /\b(?:study|studied|learning|course|lesson|reading)\b/i.test(request)) {
    const learning = summaries.learning;
    return {
      message: learning
        ? `You have ${learning.activeItemCount} active learning item${learning.activeItemCount === 1 ? "" : "s"} and ${learning.studyMinutes} logged study minutes.`
        : "Learning data is not enabled for this assistant provider.",
      actions: []
    };
  }
  if (family === "focus"
    && !durationMinutes
    && /\b(?:how\s+(?:far|close)|remaining|left|progress|percent|percentage|100%)\b/i.test(request)
    && focusSummary
    && Number.isFinite(Number(focusSummary.goalMinutes))
    && Number(focusSummary.goalMinutes) > 0) {
    const focused = Math.max(0, Number(focusSummary.focusedMinutes) || 0);
    const goal = Number(focusSummary.goalMinutes);
    const remaining = Math.max(0, goal - focused);
    const percent = Math.round((focused / goal) * 100);
    return {
      message: remaining > 0
        ? `You are ${remaining} minutes away from your daily focus goal (${focused} of ${goal} minutes, ${percent}% complete).`
        : `You have reached your daily focus goal (${focused} of ${goal} minutes, ${percent}% complete).`,
      actions: []
    };
  }
  if (family === "focus" && durationMinutes) {
    const date = relativeDateFromRequest(request, currentDate) || currentDate;
    const title = request.match(
      /\b(?:of|on)\s+(.+?)(?=\s+(?:this\s+(?:morning|afternoon|evening)|today|yesterday|to\s+my\s+focus|in\s+focus)\b|[.!?,]|$)/i
    )?.[1]?.trim()
      || request.match(/\b(?:focus(?:ed)?|worked)\s+(?:on\s+)?(.+?)\s+(?:for\s+)?\d/i)?.[1]?.trim()
      || "Focus session";
    return {
      message: `I prepared a ${durationMinutes}-minute focus session for ${title}.`,
      actions: [{
        version: 1,
        name: "log_focus_session",
        arguments: {
          date,
          title,
          duration_minutes: durationMinutes,
          project: null,
          tags: [],
          started_at: null,
          ended_at: null,
          focus_rating: null,
          energy: null,
          note: null
        }
      }]
    };
  }
  const observationDate = relativeDateFromRequest(request, currentDate) || currentDate;
  if (family === "nutrition"
    && resolvedNutrition?.confidence === "verified"
    && resolvedNutrition.name
    && resolvedNutrition.sourceId
    && resolvedNutrition.sourceLabel
    && resolvedNutrition.sourceUrl) {
    return {
      message: `I matched the foods against ${resolvedNutrition.sourceLabel} and calculated the meal nutrients.`,
      actions: [{
        version: 1,
        name: "log_meal",
        arguments: {
          date: observationDate,
          meal_type: /\bbreakfast\b/i.test(request)
            ? "breakfast"
            : /\blunch\b/i.test(request)
              ? "lunch"
              : /\bdinner|supper|tea\b/i.test(request)
                ? "dinner"
                : /\bsnack\b/i.test(request) ? "snack" : "other",
          name: resolvedNutrition.name,
          serving_amount: resolvedNutrition.servingAmount || 1,
          serving_unit: resolvedNutrition.servingUnit || "meal",
          calories: resolvedNutrition.calories ?? null,
          protein_grams: resolvedNutrition.proteinGrams ?? null,
          carbs_grams: resolvedNutrition.carbsGrams ?? null,
          fat_grams: resolvedNutrition.fatGrams ?? null,
          fiber_grams: resolvedNutrition.fiberGrams ?? null,
          source_type: resolvedNutrition.sourceType,
          source_id: resolvedNutrition.sourceId,
          source_label: resolvedNutrition.sourceLabel,
          source_url: resolvedNutrition.sourceUrl,
          confidence: "verified",
          assumptions: resolvedNutrition.assumptions || null,
          notes: Array.isArray(resolvedNutrition.components)
            ? resolvedNutrition.components.map((component) => (
              `${component.text} matched ${component.matchedName}`
            )).join("; ")
            : null
        }
      }]
    };
  }
  if (family === "nutrition" && nutritionResolutionError) {
    return {
      message: `${nutritionResolutionError} Please give a brand or a clearer quantity so I can calculate verified nutrients.`,
      actions: []
    };
  }
  if (family === "nutrition" && /\b(?:ate|eaten|had|consumed)\b/i.test(request)) {
    const observation = request.match(/\b(?:ate|eaten|had|consumed)\b/i);
    const afterObservation = observation
      ? request.slice(observation.index + observation[0].length).trim()
      : "";
    const descriptionSource = afterObservation || (observation
      ? request.slice(0, observation.index)
      : request);
    const description = descriptionSource
      .replace(/\b(?:butter|buttered)\s+toast\b/gi, "toast with butter")
      .replace(/^\s*(?:(?:can|could|would)\s+(?:u|you)\s+)?(?:please\s+)?(?:add|log|record|track)\s+/i, "")
      .replace(/\b(?:pls|please)\b/gi, "")
      .replace(/\bi(?:['’]?ve|ve)\b/gi, "")
      .replace(/\b(?:today|yesterday|this\s+(?:morning|afternoon|evening))\b/gi, "")
      .replace(/^[\s,:;-]+|[\s.!?]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (description) {
      const mealType = /\bbreakfast\b/i.test(request)
        ? "breakfast"
        : /\blunch\b/i.test(request)
          ? "lunch"
          : /\bdinner|supper|tea\b/i.test(request)
            ? "dinner"
            : /\bsnack\b/i.test(request) ? "snack" : "other";
      return {
        message: `I prepared a food log for ${description}.`,
        actions: [{
          version: 1,
          name: "log_meal",
          arguments: {
            date: observationDate,
            meal_type: mealType,
            name: description,
            serving_amount: null,
            serving_unit: null,
            calories: null,
            protein_grams: null,
            carbs_grams: null,
            fat_grams: null,
            fiber_grams: null,
            source_type: "ai_estimate",
            source_id: null,
            source_label: null,
            source_url: null,
            confidence: "ai_estimate",
            assumptions: "Food quantities are recorded as described; nutrition values were not estimated.",
            notes: null
          }
        }]
      };
    }
  }
  if (family === "study" && durationMinutes) {
    const title = request.match(
      /\b(?:studied|study|learning|reading)\s+(?:for\s+)?(.+?)(?=\s+(?:for\s+)?\d|\s+(?:today|yesterday|this\s+morning)\b|[.!?,]|$)/i
    )?.[1]?.trim()
      || request.match(/\b(?:of|on)\s+(.+?)(?=\s+(?:today|yesterday|this\s+morning)\b|[.!?,]|$)/i)?.[1]?.trim()
      || "Study session";
    return {
      message: `I prepared a ${durationMinutes}-minute study log for ${title}.`,
      actions: [{
        version: 1,
        name: "log_study_session",
        arguments: {
          date: observationDate,
          title,
          duration_minutes: durationMinutes,
          learning_item_id: null,
          note: null
        }
      }]
    };
  }
  if (family === "workout" && durationMinutes) {
    const name = request.match(
      /\b(?:did|completed|logged|recorded)\s+(?:a\s+)?(.+?)(?=\s+(?:for\s+)?\d|\s+(?:today|yesterday|this\s+morning)\b|[.!?,]|$)/i
    )?.[1]?.trim()
      || request.match(/\b(ran|cycled|swam|lifted|walked)\b/i)?.[1]
      || "Workout";
    const type = /\b(run|ran|cycle|cycled|swam|swim|cardio|walked?)\b/i.test(request)
      ? "cardio"
      : /\b(lifted|weights?|strength)\b/i.test(request) ? "strength" : "other";
    return {
      message: `I prepared a ${durationMinutes}-minute workout log for ${name}.`,
      actions: [{
        version: 1,
        name: "log_workout",
        arguments: {
          date: observationDate,
          name,
          type,
          duration_minutes: durationMinutes,
          distance: null,
          distance_unit: null,
          calories_burned: null,
          effort: null,
          exercises: [],
          notes: null
        }
      }]
    };
  }
  if (family === "sleep" && durationMinutes) {
    return {
      message: `I prepared a sleep log for ${durationMinutes / 60} hours.`,
      actions: [{
        version: 1,
        name: "log_sleep",
        arguments: {
          date: observationDate,
          started_at: null,
          ended_at: null,
          duration_hours: durationMinutes / 60,
          sleep_quality: null,
          notes: null
        }
      }]
    };
  }
  if (family === "body") {
    const weight = request.match(/\b(\d+(?:\.\d+)?)\s*(kg|kilograms?|lb|lbs|pounds?)\b/i);
    if (weight) {
      const unit = /^k/i.test(weight[2]) ? "kg" : "lb";
      return {
        message: `I prepared a body-weight log for ${weight[1]} ${unit}.`,
        actions: [{
          version: 1,
          name: "log_body_measurement",
          arguments: {
            date: observationDate,
            recorded_at: null,
            weight: Number(weight[1]),
            weight_unit: unit,
            body_fat_percent: null,
            waist: null,
            waist_unit: null,
            resting_heart_rate: null,
            notes: null
          }
        }]
      };
    }
  }
  if (family === "nutrition") {
    const name = request.match(
      /\b(?:ate|had|log|record)\s+(?:a\s+|an\s+|some\s+)?(.+?)(?=\s+(?:for\s+)?(?:breakfast|lunch|dinner|snack)\b|\s+(?:today|yesterday|this\s+morning)\b|[.!?,]|$)/i
    )?.[1]?.trim();
    if (name) {
      const mealType = request.match(/\b(breakfast|lunch|dinner|snack)\b/i)?.[1]?.toLowerCase() || "other";
      return {
        message: `I prepared a meal log for ${name}.`,
        actions: [{
          version: 1,
          name: "log_meal",
          arguments: {
            date: observationDate,
            meal_type: mealType,
            name,
            serving_amount: null,
            serving_unit: null,
            calories: null,
            protein_grams: null,
            carbs_grams: null,
            fat_grams: null,
            fiber_grams: null,
            source_type: "ai_estimate",
            source_id: null,
            source_label: null,
            source_url: null,
            confidence: "ai_estimate",
            assumptions: "Estimated entry only; no nutrition values were inferred from the meal description.",
            notes: null
          }
        }]
      };
    }
  }
  if (family === "finance") {
    const amount = request.match(/(?:£\s*(\d+(?:\.\d{1,2})?)|\$\s*(\d+(?:\.\d{1,2})?)|\b(\d+(?:\.\d{1,2})?)\s*(GBP|USD|EUR)\b)/i);
    const label = request.match(/\b(?:on|for)\s+(.+?)(?=\s+(?:today|yesterday|this\s+morning)\b|[.!?,]|$)/i)?.[1]?.trim();
    if (amount && label) {
      const value = amount[1] || amount[2] || amount[3];
      const currency = amount[1] ? "GBP" : amount[2] ? "USD" : amount[4].toUpperCase();
      const kind = /\b(earned|income|received)\b/i.test(request)
        ? "income"
        : /\brefund(?:ed)?\b/i.test(request) ? "refund" : "expense";
      return {
        message: `I prepared a ${currency} ${value} ${kind} log for ${label}.`,
        actions: [{
          version: 1,
          name: "log_finance_transaction",
          arguments: {
            date: observationDate,
            label,
            amount: value,
            kind,
            currency,
            category: null,
            account: null,
            notes: null
          }
        }]
      };
    }
  }
  const requestedTimes = explicitTimes(request);
  if (/\b(?:delete|remove)\b/i.test(request)
    && requestedTimes.length === 2
    && requestedTimes[0] >= requestedTimes[1]) {
    return {
      message: "I could not safely match that time range. Please check the start and end times.",
      actions: []
    };
  }
  if (requestsBulkDeletion(request)
    && family !== "task"
    && family !== "reminder"
    && (referencesCalendar(request) || /\b(?:events?|entries|appointments?)\b/i.test(request))
    && !/\b(except|but keep|just keep)\b/i.test(request)
    && patterns.length) {
    const weekdays = explicitWeekdays(request);
    const selectedPatterns = weekdays
      ? patterns.filter((pattern) => (
        !Array.isArray(pattern.weekdays)
        || weekdays.some((weekday) => pattern.weekdays.includes(weekday))
      ))
      : patterns;
    if (selectedPatterns.length === 0) return null;
    return {
      message: `I prepared deletion of all ${selectedPatterns.length} calendar groups.`,
      actions: selectedPatterns.map((pattern) => ({
        version: 1,
        name: "delete_calendar_events",
        arguments: {
          match_title: pattern.title,
          start_time: pattern.start_time,
          end_time: pattern.end_time,
          ...(weekdays ? { weekdays } : {})
        }
      }))
    };
  }
  const pendingAmendment = pendingCalendarAmendmentPlan(request, context);
  if (pendingAmendment) return pendingAmendment;
  const rename = calendarRenamePlan(request, context);
  if (rename) return rename;
  const deleteList = calendarDeleteListPlan(request, context);
  if (deleteList) return deleteList;
  const times = explicitTimes(request);
  const relativeDate = relativeDateFromRequest(request, currentDate);
  const weekdays = explicitWeekdays(request);
  if (/\b(add|create|put|schedule|scedule)\b/i.test(request)
    && weekdays
    && times.length >= 2) {
    const title = recurringCalendarTitle(request);
    const year = String(currentDate).slice(0, 4);
    if (title && /^\d{4}$/.test(year)) {
      return {
        message: `I prepared your recurring ${title} schedule.`,
        actions: [{
          version: 1,
          name: "create_calendar_schedule",
          arguments: {
            title,
            start_date: currentDate,
            end_date: `${year}-12-31`,
            start_time: times[0],
            end_time: times[1],
            weekdays,
            category: /\bwork\b/i.test(request) ? "work" : "personal"
          }
        }]
      };
    }
  }

  if (/\b(add|create|put|schedule|scedule)\b/i.test(request)
    && referencesCalendar(request)
    && relativeDate
    && times.length >= 2) {
    const title = oneOffCalendarTitle(request);
    if (title) {
      return {
        message: `I prepared ${title} for your calendar.`,
        actions: [{
          version: 1,
          name: "create_calendar_schedule",
          arguments: {
            title,
            start_date: relativeDate,
            end_date: relativeDate,
            start_time: times[0],
            end_time: times[1],
            category: "personal"
          }
        }]
      };
    }
  }

  const taskTitle = existingTitle(request, context.existing_tasks);
  const taskMutation = requestedMutation(request);
  const allTasks = /\b(?:all|every)\s+(?:of\s+)?(?:my\s+)?tasks?\b/i.test(request);
  if (allTasks && Array.isArray(context.existing_tasks) && context.existing_tasks.length) {
    const titles = [...new Set(context.existing_tasks.map((task) => task?.title).filter(Boolean))];
    if (taskMutation === "delete" || taskMutation === "remove") {
      return {
        message: `I prepared deletion of all ${titles.length} task groups.`,
        actions: titles.map((title) => ({
          version: 1,
          name: "delete_tasks",
          arguments: { match_title: title }
        }))
      };
    }
    if (taskMutation === "complete" || taskMutation === "finish" || taskMutation === "mark") {
      return {
        message: `I prepared completion of all ${titles.length} task groups.`,
        actions: titles.map((title) => ({
          version: 1,
          name: "complete_tasks",
          arguments: { match_title: title }
        }))
      };
    }
    const priority = request.match(/\b(low|medium|high)\s+priority\b/i)?.[1]?.toLowerCase();
    if (priority && (taskMutation === "change" || taskMutation === "edit" || taskMutation === "update")) {
      return {
        message: `I prepared the priority change for all ${titles.length} task groups.`,
        actions: titles.map((title) => ({
          version: 1,
          name: "update_tasks",
          arguments: { match_title: title, priority }
        }))
      };
    }
  }
  if (!taskTitle && /\b(?:add|create)\b[\s\S]*\b(?:task|tsk)\b/i.test(request)) {
    const title = request.match(/\b(?:called|named)\s+['"]?(.+?)['"]?(?:[.!?]|$)/i)?.[1]
      || request.match(/\b(?:task|tsk)\s+['"]?(.+?)['"]?(?:[.!?]|$)/i)?.[1];
    if (title?.trim()) {
      return {
        message: `I prepared the task ${title.trim()}.`,
        actions: [{
          version: 1,
          name: "create_task",
          arguments: { title: title.trim(), priority: "medium" }
        }]
      };
    }
  }
  if (taskTitle && /\btask\b/i.test(request)) {
    const mutation = taskMutation;
    if (mutation === "delete" || mutation === "remove") {
      return {
        message: `I prepared deletion of the task ${taskTitle}.`,
        actions: [{ version: 1, name: "delete_tasks", arguments: { match_title: taskTitle } }]
      };
    }
    if (mutation === "complete" || mutation === "finish" || mutation === "mark") {
      return {
        message: `I prepared completion of the task ${taskTitle}.`,
        actions: [{ version: 1, name: "complete_tasks", arguments: { match_title: taskTitle } }]
      };
    }
    if (mutation === "change" || mutation === "edit" || mutation === "update" || requestsRename(request)) {
      const priority = request.match(/\b(low|medium|high)\s+priority\b/i)?.[1]?.toLowerCase();
      const renamed = requestsRename(request) ? requestedRenameTitle(request) : null;
      const args = {
        match_title: taskTitle,
        ...(renamed ? { new_title: renamed } : {}),
        ...(relativeDate && /\bdue\b/i.test(request) ? { due_date: relativeDate } : {}),
        ...(priority ? { priority } : {})
      };
      if (Object.keys(args).length > 1) {
        return {
          message: `I prepared the requested changes to ${taskTitle}.`,
          actions: [{ version: 1, name: "update_tasks", arguments: args }]
        };
      }
    }
  }

  const reminderTitle = existingTitle(request, context.existing_reminders);
  const reminderMutation = requestedMutation(request);
  const allReminders = /\b(?:all|every)\s+(?:of\s+)?(?:my\s+)?reminders?\b/i.test(request);
  if (allReminders && Array.isArray(context.existing_reminders) && context.existing_reminders.length) {
    const titles = [...new Set(context.existing_reminders.map((reminder) => reminder?.title).filter(Boolean))];
    if (reminderMutation === "delete" || reminderMutation === "remove") {
      return {
        message: `I prepared deletion of all ${titles.length} reminder groups.`,
        actions: titles.map((title) => ({
          version: 1,
          name: "delete_reminders",
          arguments: { match_title: title }
        }))
      };
    }
    if (reminderMutation === "complete" || reminderMutation === "finish" || reminderMutation === "mark") {
      return {
        message: `I prepared completion of all ${titles.length} reminder groups.`,
        actions: titles.map((title) => ({
          version: 1,
          name: "complete_reminders",
          arguments: { match_title: title }
        }))
      };
    }
    if ((reminderMutation === "change" || reminderMutation === "edit" || reminderMutation === "update")
      && relativeDate && times[0]) {
      return {
        message: `I prepared the time change for all ${titles.length} reminder groups.`,
        actions: titles.map((title) => ({
          version: 1,
          name: "update_reminders",
          arguments: {
            match_title: title,
            due_at: `${relativeDate}T${times[0]}:00${offsetFromDateTime(currentDateTime)}`
          }
        }))
      };
    }
  }
  if (reminderTitle && /\b(remind|reminder)\b/i.test(request)) {
    const mutation = reminderMutation;
    if (mutation === "delete" || mutation === "remove") {
      return {
        message: `I prepared deletion of the reminder ${reminderTitle}.`,
        actions: [{ version: 1, name: "delete_reminders", arguments: { match_title: reminderTitle } }]
      };
    }
    if (mutation === "complete" || mutation === "finish" || mutation === "mark") {
      return {
        message: `I prepared completion of the reminder ${reminderTitle}.`,
        actions: [{ version: 1, name: "complete_reminders", arguments: { match_title: reminderTitle } }]
      };
    }
    if (requestsRename(request)) {
      const renamed = requestedRenameTitle(request);
      if (renamed) {
        return {
          message: `I prepared the rename from ${reminderTitle} to ${renamed}.`,
          actions: [{
            version: 1,
            name: "update_reminders",
            arguments: { match_title: reminderTitle, new_title: renamed }
          }]
        };
      }
    }
    if ((mutation === "change" || mutation === "edit" || mutation === "update")
      && relativeDate && times[0]) {
      const renamed = requestsRename(request) ? requestedRenameTitle(request) : null;
      return {
        message: `I prepared the requested changes to ${reminderTitle}.`,
        actions: [{
          version: 1,
          name: "update_reminders",
          arguments: {
            match_title: reminderTitle,
            ...(renamed ? { new_title: renamed } : {}),
            due_at: `${relativeDate}T${times[0]}:00${offsetFromDateTime(currentDateTime)}`
          }
        }]
      };
    }
  }

  if (/\bremind me\b/i.test(request) && relativeDate && times[0]) {
    const title = request.match(/\bto\s+(.+?)(?:[.!?]|$)/i)?.[1]?.trim();
    if (title) {
      return {
        message: `I prepared a reminder to ${title}.`,
        actions: [{
          version: 1,
          name: "create_reminder",
          arguments: {
            title,
            due_at: `${relativeDate}T${times[0]}:00${offsetFromDateTime(currentDateTime)}`,
            kind: /\b(for work|work reminder)\b/i.test(request) ? "work" : "personal"
          }
        }]
      };
    }
  }
  return null;
}

function titleIsGrounded(title, request, context) {
  if (typeof title !== "string" || !title.trim()) return false;
  const normalized = title.trim().toLocaleLowerCase();
  if (request.toLocaleLowerCase().includes(normalized)) return true;
  return pendingTitles(context).some((value) => value.trim().toLocaleLowerCase() === normalized);
}

function actionFamily(name) {
  if (name.includes("reminder")) return "reminder";
  if (name.includes("task")) return "task";
  if (name.includes("calendar")) return "calendar";
  if (name === "log_meal") return "nutrition";
  if (name === "log_body_measurement") return "body";
  if (name === "log_sleep") return "sleep";
  if (name === "log_workout") return "workout";
  if (name === "log_finance_transaction") return "finance";
  if (name === "log_study_session") return "study";
  if (name === "log_focus_session") return "focus";
  return "unknown";
}

function requestedFamily(request) {
  if (/\b(remind|reminder)\b/i.test(request)) return "reminder";
  if (/\btask\b/i.test(request)) return "task";
  if (/\b(?:focus|focused|focus session|deep work|vibe coding)\b/i.test(request)) return "focus";
  if ((/\b(?:ate|eaten|had|consumed)\b/i.test(request)
      && /\b(?:breakfast|lunch|dinner|snack|food|eggs?|bacon|toast|bread|butter|meal)\b/i.test(request))
    || /\b(?:log|record|track)\b[\s\S]*\b(meal|food|breakfast|lunch|dinner|snack|calories?|protein|carbs?|fat|fiber|fibre|eggs?|bacon|toast|bread|butter)\b/i.test(request)
    || /\badd\b[\s\S]*\b(food|meal|calories?|protein|carbs?|fat|fiber|fibre|eggs?|bacon|toast|bread|butter)\b/i.test(request)) {
    return "nutrition";
  }
  if (/\b(?:calories?|protein|carbs?|fat|fiber|fibre|nutrition|macros?|meals?|food)\b/i.test(request)) {
    return "nutrition";
  }
  if (/\b(?:i weigh|weighed|weight is)\b|\b(?:log|record|track)\b[\s\S]*\b(weight|body fat|waist|resting heart rate)\b/i.test(request)) {
    return "body";
  }
  if (/\bslept\b|\b(?:log|record|track)\b[\s\S]*\b(sleep|bedtime|wake time)\b/i.test(request)) {
    return "sleep";
  }
  if (/\b(trained|ran|cycled|swam|lifted|walked)\b|\b(?:did|completed|log|record|track)\b[\s\S]*\b(workout|exercise|training|run|cycle|swim|walk)\b/i.test(request)) {
    return "workout";
  }
  if (/\b(spent|paid|bought|purchase|expense|income|earned|received|refund|transaction)\b/i.test(request)) {
    return "finance";
  }
  if (/\b(?:finance|budget|spending)\b/i.test(request)) return "finance";
  if (/\bstudied\b|\b(?:log|record|track)\b[\s\S]*\b(study|learning|course|lesson|reading)\b/i.test(request)) {
    return "study";
  }
  if (/\b(?:study|learning|course|lesson|reading)\b/i.test(request)) return "study";
  return null;
}

function numericValueIsGrounded(request, value) {
  if (value === undefined || value === null) return true;
  const candidates = new Set([String(value)]);
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    candidates.add(String(numeric));
    candidates.add(numeric.toFixed(2));
  }
  return [...candidates].some((candidate) => {
    const text = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\d])${text}(?!\\d)`).test(String(request || ""));
  });
}

function measurementUnitIsGrounded(request, unit) {
  const patterns = {
    kg: /\b(kg|kgs|kilogram|kilograms)\b/i,
    lb: /\b(lb|lbs|pound|pounds)\b/i,
    cm: /\b(cm|centimeter|centimeters|centimetre|centimetres)\b/i,
    in: /\b(in|inch|inches)\b/i,
    km: /\b(km|kilometer|kilometers|kilometre|kilometres)\b/i,
    mi: /\b(mi|mile|miles)\b/i
  };
  return Boolean(patterns[unit]?.test(request));
}

function currencyIsGrounded(prompt, currency) {
  const source = String(prompt || "");
  if (new RegExp(`\\b${regexEscape(currency)}\\b`, "i").test(source)) return true;
  const symbols = { USD: "$", GBP: "£", EUR: "€", JPY: "¥" };
  return symbols[currency] ? source.includes(symbols[currency]) : false;
}

function financeKindIsGrounded(request, kind) {
  const patterns = {
    expense: /\b(spent|paid|bought|purchase|expense|cost)\b/i,
    income: /\b(income|earned|received|salary|wage|paid me)\b/i,
    refund: /\b(refund|reimbursed|cashback)\b/i
  };
  return Boolean(patterns[kind]?.test(request));
}

function verifiedMealSourceIsGrounded(action, prompt) {
  const args = action.arguments;
  return args.confidence === "verified"
    && args.source_type !== "ai_estimate"
    && ["source_id", "source_label", "source_url"].every((key) => (
      typeof args[key] === "string"
      && args[key]
      && explicitlyPresent(prompt, args[key])
    ));
}

function groundDomainAction(action, request, prompt, dateWasExplicit, times) {
  const args = { ...action.arguments };
  if (!dateWasExplicit) return null;
  if (action.name === "log_meal") {
    if (args.confidence === "verified" && !verifiedMealSourceIsGrounded(action, prompt)) {
      args.source_type = "ai_estimate";
      args.confidence = "ai_estimate";
      delete args.source_id;
      delete args.source_label;
      delete args.source_url;
      args.assumptions ||= "Estimated from the described meal and serving.";
    }
    return { ...action, arguments: args };
  }
  if (action.name === "log_body_measurement") {
    if (args.recorded_at && times.length === 0 && !explicitlyPresent(prompt, args.recorded_at)) {
      delete args.recorded_at;
    }
    for (const [valueKey, unitKey] of [["weight", "weight_unit"], ["waist", "waist_unit"]]) {
      if (!numericValueIsGrounded(request, args[valueKey])
        || (args[unitKey] && !measurementUnitIsGrounded(request, args[unitKey]))) {
        delete args[valueKey];
        delete args[unitKey];
      }
    }
    for (const key of ["body_fat_percent", "resting_heart_rate"]) {
      if (!numericValueIsGrounded(request, args[key])) delete args[key];
    }
    if (["weight", "waist", "body_fat_percent", "resting_heart_rate"].every((key) => args[key] === undefined)) {
      return null;
    }
    if (args.notes && !explicitlyPresent(request, args.notes)) delete args.notes;
    return { ...action, arguments: args };
  }
  if (action.name === "log_sleep") {
    if ((args.started_at || args.ended_at) && times.length < 2
      && ![args.started_at, args.ended_at].every((value) => explicitlyPresent(prompt, value))) {
      delete args.started_at;
      delete args.ended_at;
    }
    if (!numericValueIsGrounded(request, args.duration_hours)) delete args.duration_hours;
    if (!numericValueIsGrounded(request, args.sleep_quality)) delete args.sleep_quality;
    if (args.duration_hours === undefined && args.sleep_quality === undefined) return null;
    if (args.notes && !explicitlyPresent(request, args.notes)) delete args.notes;
    return { ...action, arguments: args };
  }
  if (action.name === "log_workout") {
    for (const key of ["duration_minutes", "distance", "calories_burned", "effort"]) {
      if (!numericValueIsGrounded(request, args[key])) {
        delete args[key];
        if (key === "distance") delete args.distance_unit;
      }
    }
    if (args.distance_unit && !measurementUnitIsGrounded(request, args.distance_unit)) {
      delete args.distance;
      delete args.distance_unit;
    }
    args.exercises = (args.exercises || []).filter((exercise) => (
      explicitlyPresent(request, exercise.name)
    )).map((exercise) => {
      const grounded = { ...exercise };
      for (const key of ["sets", "reps", "weight", "distance", "duration_minutes"]) {
        if (!numericValueIsGrounded(request, grounded[key])) {
          delete grounded[key];
          if (key === "weight") delete grounded.weight_unit;
          if (key === "distance") delete grounded.distance_unit;
        }
      }
      if (grounded.weight_unit && !measurementUnitIsGrounded(request, grounded.weight_unit)) {
        delete grounded.weight;
        delete grounded.weight_unit;
      }
      if (grounded.distance_unit && !measurementUnitIsGrounded(request, grounded.distance_unit)) {
        delete grounded.distance;
        delete grounded.distance_unit;
      }
      return grounded;
    });
    if (args.notes && !explicitlyPresent(request, args.notes)) delete args.notes;
    return { ...action, arguments: args };
  }
  if (action.name === "log_finance_transaction") {
    if (!numericValueIsGrounded(request, args.amount)
      || !financeKindIsGrounded(request, args.kind)
      || !currencyIsGrounded(prompt, args.currency)
      || !explicitlyPresent(request, args.label)) {
      return null;
    }
    for (const key of ["category", "account", "notes"]) {
      if (args[key] && !explicitlyPresent(request, args[key])) delete args[key];
    }
    return { ...action, arguments: args };
  }
  if (action.name === "log_study_session") {
    if (!numericValueIsGrounded(request, args.duration_minutes)
      || !explicitlyPresent(request, args.title)) {
      return null;
    }
    if (args.learning_item_id && !explicitlyPresent(prompt, args.learning_item_id)) {
      delete args.learning_item_id;
    }
    if (args.note && !explicitlyPresent(request, args.note)) delete args.note;
    return { ...action, arguments: args };
  }
  return action;
}

function groundLocalPlan(plan, currentRequest, fullPrompt, currentDate) {
  const request = String(currentRequest || "");
  const context = requestContext(fullPrompt);
  if (/\b(never mind|nevermind|cancel that|do not apply|don't apply)\b/i.test(request)) {
    return { message: "Cancelled. No changes were proposed.", actions: [] };
  }
  if (requestsBulkDeletion(request)
    && referencesCalendar(request)
    && /\b(except|but keep|just keep)\b/i.test(request)) {
    return {
      message: "I need the exact titles to delete. Broad delete requests with exceptions are not applied automatically.",
      actions: []
    };
  }
  const family = requestedFamily(request);
  const weekdays = explicitWeekdays(request);
  const times = explicitTimes(request);
  const dateWasExplicit = hasExplicitDate(request);
  const relativeDate = relativeDateFromRequest(request, currentDate);
  const mutation = /\b(change|rename|edit|update|delete|remove|complete|finish|mark)\b/i.test(request);
  const actions = plan.actions.flatMap((action) => {
    if (family && actionFamily(action.name) !== family) return [];
    if (actionFamily(action.name) !== "unknown"
      && ["nutrition", "body", "sleep", "workout", "finance", "study", "focus"].includes(actionFamily(action.name))) {
      const grounded = groundDomainAction(
        action,
        request,
        fullPrompt,
        dateWasExplicit,
        times
      );
      return grounded ? [grounded] : [];
    }
    const args = { ...action.arguments };
    if (action.name === "update_calendar_events" || action.name === "delete_calendar_events") {
      if (!titleIsGrounded(args.match_title, request, context)) return [];
      if (action.name === "update_calendar_events"
        && !titleIsGrounded(args.new_title, request, context)) return [];
      if (!dateWasExplicit) {
        delete args.start_date;
        delete args.end_date;
      }
      if (weekdays) args.weekdays = weekdays;
      else if (!/\b(same|those|them|it|rest)\b/i.test(request)) delete args.weekdays;
      if (times.length >= 2) {
        [args.start_time, args.end_time] = times;
      } else if (times.length === 1) {
        if (/\b(end|ending|ends)\b/i.test(request)) args.end_time = times[0];
        else args.start_time = times[0];
      } else if (!/\b(same|those|them|it)\b/i.test(request)) {
        delete args.start_time;
        delete args.end_time;
      }
    }
    if (/^(update|delete|complete)_(tasks|reminders)$/.test(action.name)
      && !titleIsGrounded(args.match_title, request, context)) return [];
    if ((action.name === "create_task" || action.name === "update_tasks")
      && relativeDate
      && /\bdue\b/i.test(request)) {
      args.due_date = relativeDate;
    }
    if (action.name === "create_calendar_schedule" && relativeDate
      && !/\b(rest|entire|whole|through|until|every)\b/i.test(request)) {
      args.start_date = relativeDate;
      args.end_date = relativeDate;
      delete args.weekdays;
    }
    if ((action.name === "create_reminder" || action.name === "update_reminders")
      && relativeDate
      && typeof args.due_at === "string") {
      args.due_at = `${relativeDate}${args.due_at.slice(10)}`;
    }
    if (mutation && action.name.startsWith("create_")
      && !Array.isArray(context.pending_proposal)) return [];
    return [{ ...action, arguments: args }];
  });
  if (actions.length === 0 && plan.actions.length > 0) {
    return {
      message: "I could not safely match that request to the existing data. Please name the item and the exact change.",
      actions: []
    };
  }
  return { ...plan, actions };
}

function removeInventedOptionalFields(plan, prompt, currentDate) {
  return {
    ...plan,
    actions: plan.actions.map((action) => {
      if (action.name !== "create_calendar_schedule") return action;
      const args = { ...action.arguments };
      if (!asksForPastDates(prompt)
        && args.start_date < currentDate
        && args.end_date >= currentDate) {
        args.start_date = currentDate;
      }
      if (args.location && !explicitlyPresent(prompt, args.location)) delete args.location;
      if (args.notes && !explicitlyPresent(prompt, args.notes)) delete args.notes;
      return { ...action, arguments: args };
    })
  };
}

async function requestLocalAssistantPlan(options = {}) {
  const prompt = cleanText(options.prompt, "Assistant request", 12000);
  const currentRequest = options.currentRequest
    ? cleanText(options.currentRequest, "Current assistant request", 4000)
    : prompt;
  if (/\b(never mind|nevermind|cancel that|do not apply|don't apply)\b/i.test(currentRequest)) {
    return { message: "Cancelled. No changes were proposed.", actions: [] };
  }
  if (requestsBulkDeletion(currentRequest)
    && referencesCalendar(currentRequest)
    && /\b(except|but keep|just keep)\b/i.test(currentRequest)) {
    return {
      message: "I need the exact titles to delete. Broad delete requests with exceptions are not applied automatically.",
      actions: []
    };
  }
  if (requestsBroadRename(currentRequest)
    && /\b(except|but keep|just keep)\b/i.test(currentRequest)) {
    return {
      message: "I need the exact titles to rename. Broad rename requests with exceptions are not applied automatically.",
      actions: []
    };
  }
  const context = requestContext(prompt);
  const deterministic = deterministicPlan(
    currentRequest,
    context,
    options.currentDate || new Date().toISOString().slice(0, 10),
    options.currentDateTime || new Date().toISOString()
  );
  if (deterministic) {
    return removeInventedOptionalFields(
      parseAssistantPlan({
        message: deterministic.message,
        actions: deterministic.actions.map((action) => {
          const normalized = normalizeModelPlanShape(JSON.stringify({
            message: deterministic.message,
            actions: [action]
          }), currentRequest);
          return normalized.actions[0];
        })
      }),
      currentRequest,
      options.currentDate || new Date().toISOString().slice(0, 10)
    );
  }
  const model = normalizeModel(options.model);
  const response = await fetchOllamaJson({
    fetchImpl: options.fetchImpl,
    timeoutMs: normalizeTimeout(options.timeoutMs, DEFAULT_GENERATION_TIMEOUT_MS),
    url: endpointUrl(options.baseUrl, "/api/generate"),
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        system: assistantInstructions(options),
        prompt,
        stream: false,
        think: false,
        format: ASSISTANT_PLAN_SCHEMA,
        keep_alive: options.keepAlive || "5m",
        options: {
          temperature: 0,
          seed: 0,
          top_k: 1,
          top_p: 1,
          num_ctx: 4096
        }
      })
    }
  });
  if (!response || typeof response !== "object" || typeof response.response !== "string") {
    fail("INVALID_RESPONSE", "The local Ollama service returned no assistant plan.");
  }
  const currentDate = options.currentDate || new Date().toISOString().slice(0, 10);
  const normalized = parseAssistantPlan(normalizeModelPlanShape(response.response, currentRequest));
  const withFallback = normalized;
  const grounded = groundLocalPlan(withFallback, currentRequest, prompt, currentDate);
  return removeInventedOptionalFields(grounded, currentRequest, currentDate);
}

async function pullLocalModel(options = {}) {
  const model = normalizeModel(options.model);
  const response = await fetchOllamaJson({
    fetchImpl: options.fetchImpl,
    timeoutMs: normalizeTimeout(options.timeoutMs, DEFAULT_PULL_TIMEOUT_MS),
    url: endpointUrl(options.baseUrl, "/api/pull"),
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, stream: false })
    }
  });
  if (!response || typeof response !== "object" || typeof response.status !== "string") {
    fail("INVALID_RESPONSE", "The local Ollama service returned an invalid model pull response.");
  }
  return {
    model,
    installed: response.status.toLowerCase() === "success",
    status: response.status
  };
}

module.exports = {
  DEFAULT_LOCAL_MODEL,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  LocalAssistantError,
  checkOllamaHealth,
  getLocalAssistantStatus,
  getOllamaStatus,
  listOllamaModels,
  pullLocalModel,
  requestLocalAssistantPlan
};
