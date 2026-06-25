#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const screenshotsDir = path.join(root, "docs", "screenshots");
const indexUrl = pathToFileUrl(path.join(root, "index.html"));
const storageKey = "focus-pattern-tracker:v2";
const legacyStorageKey = "focus-pattern-tracker:v1";
const cloudKey = "focus-pattern-tracker:mysql-sync:v1";
const chrome = findChrome();

if (!chrome) {
  console.error("Google Chrome or Chromium is required to capture screenshots.");
  process.exit(1);
}

fs.mkdirSync(screenshotsDir, { recursive: true });

const variants = [
  {
    name: "dashboard-dark",
    width: 1440,
    height: 960,
    state: createPortfolioState({ theme: "dark", activePage: "today" })
  },
  {
    name: "goals-light",
    width: 1280,
    height: 900,
    state: createPortfolioState({ theme: "light", activePage: "progress" })
  },
  {
    name: "performance-light",
    width: 1280,
    height: 900,
    state: createPortfolioState({ theme: "light", activePage: "performance" })
  },
  {
    name: "settings-light",
    width: 1280,
    height: 900,
    state: createPortfolioState({ theme: "light", activePage: "settings" })
  },
  {
    name: "nutrition-light",
    width: 1280,
    height: 960,
    state: createPortfolioState({ theme: "light", activePage: "health", healthView: "nutrition" })
  },
  {
    name: "finance-light",
    width: 1280,
    height: 960,
    state: createPortfolioState({ theme: "light", activePage: "finance" })
  },
  {
    name: "learning-light",
    width: 1280,
    height: 960,
    state: createPortfolioState({ theme: "light", activePage: "progress", progressView: "learning" })
  },
  {
    name: "dashboard-narrow",
    width: 760,
    height: 900,
    state: createPortfolioState({ theme: "light", activePage: "today" })
  }
];

for (const variant of variants) {
  const wrapperPath = path.join(os.tmpdir(), `focus-pattern-tracker-${variant.name}.html`);
  const screenshotPath = path.join(screenshotsDir, `${variant.name}.png`);
  fs.writeFileSync(wrapperPath, previewHtml(variant.state), "utf8");

  const result = spawnSync(chrome, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    "--force-device-scale-factor=1",
    `--window-size=${variant.width},${variant.height}`,
    "--virtual-time-budget=3500",
    `--screenshot=${screenshotPath}`,
    pathToFileUrl(wrapperPath)
  ], {
    stdio: "inherit"
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`Screenshots written to ${path.relative(root, screenshotsDir)}.`);

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function previewHtml(state) {
  return `<!doctype html>
<meta charset="utf-8">
<script>
  localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(state))});
  localStorage.removeItem(${JSON.stringify(legacyStorageKey)});
  localStorage.removeItem(${JSON.stringify(cloudKey)});
  location.replace(${JSON.stringify(indexUrl + "?portfolio-preview=1")});
</script>`;
}

function createPortfolioState({
  theme,
  activePage = "today",
  healthView = "checkin",
  progressView = "habits"
}) {
  const now = Date.now();
  const todayKey = dateKey(now);
  const sessions = [
    session(now, -5, 9, 15, 50, 47, "Review onboarding flow", "Portfolio CRM", ["design", "ux"], 5, 4, 1),
    session(now, -4, 10, 30, 45, 43, "Refactor scoring model", "Focus Tracker", ["javascript", "tests"], 5, 5, 0),
    session(now, -3, 14, 0, 30, 19, "Inbox cleanup", "Operations", ["admin"], 2, 2, 5),
    session(now, -2, 8, 45, 50, 48, "Ship MySQL sync", "Focus Tracker", ["electron", "mysql"], 5, 4, 1),
    session(now, -1, 11, 10, 55, 51, "Write project README", "Focus Tracker", ["docs"], 4, 4, 1),
    session(now, 0, 9, 0, 50, 46, "Polish employer screenshots", "Focus Tracker", ["portfolio"], 5, 4, 1),
    session(now, 0, 13, 15, 35, 28, "Bug triage", "Client Tools", ["qa"], 3, 3, 3)
  ];

  return {
    schemaVersion: 3,
    theme,
    profile: { name: "Ellis" },
    settings: {
      theme,
      dailyGoalMinutes: 360,
      blockGoalMinutes: 50,
      weeklyGoalHours: 30,
      financeCurrency: "GBP",
      learningTargetMinutes: 180,
      nutritionGoals: {
        enabled: true,
        calories: 2200,
        proteinGrams: 140,
        carbsGrams: 240,
        fatGrams: 75,
        fiberGrams: 30
      },
      shortBreakMinutes: 10,
      longBreakMinutes: 25,
      blocksBeforeLongBreak: 4
    },
    sessions,
    timer: {
      id: "portfolio-live-timer",
      status: "running",
      mode: "focus",
      breakType: null,
      title: "Prepare technical interview story",
      project: "Career",
      tags: ["portfolio", "interview"],
      startedAt: now - 33 * 60000,
      lastResumedAt: now,
      activeMs: 33 * 60000,
      pausedMs: 0,
      pauseStartedAt: null,
      pauseCount: 0,
      focusRating: 4,
      energy: 4,
      goalMinutes: 50,
      completedAt: null
    },
    manualDailyMinutes: {
      [todayKey]: 20
    },
    manualDailyUpdatedAt: {
      [todayKey]: now
    },
    tasks: [
      task("Prepare architecture walkthrough", false, now - 3 * 3600000, "high", todayKey),
      task("Capture final dashboard screenshots", false, now - 2 * 3600000, "medium", todayKey),
      task("Run tests before publishing", true, now - 5 * 3600000, "medium", todayKey, now - 90 * 60000)
    ],
    reminders: [
      { id: "reminder-review", title: "Review release checklist", dueAt: new Date(now + 2 * 3600000).toISOString(), completed: false, kind: "work", createdAt: now }
    ],
    events: [
      { id: "event-review", title: "Portfolio review", start: new Date(now + 75 * 60000).toISOString(), end: new Date(now + 135 * 60000).toISOString(), category: "work", location: "Desktop" }
    ],
    habits: [
      { id: "habit-walk", name: "Walk outside", target: 1, unit: "times", frequency: "daily", entries: { [todayKey]: 1 }, createdAt: now - 6 * 86400000 }
    ],
    healthEntries: [
      { id: "health-today", date: todayKey, sleepHours: 7.5, energy: 4, mood: 4, waterGlasses: 4, movementMinutes: 30, note: "Steady day", updatedAt: now }
    ],
    nutritionEntries: [
      { id: "meal-breakfast", date: todayKey, mealType: "breakfast", name: "Greek yoghurt, oats and berries", servingAmount: 1, servingUnit: "bowl", calories: 430, proteinGrams: 28, carbsGrams: 54, fatGrams: 12, fiberGrams: 9, sourceType: "manual", confidence: "manual", createdAt: now - 5 * 3600000 },
      { id: "meal-lunch", date: todayKey, mealType: "lunch", name: "Chicken rice bowl", servingAmount: 1, servingUnit: "meal", calories: 690, proteinGrams: 48, carbsGrams: 78, fatGrams: 19, fiberGrams: 8, sourceType: "usda", sourceLabel: "USDA FoodData Central", confidence: "verified", createdAt: now - 2 * 3600000 }
    ],
    workoutSessions: [
      { id: "workout-upper", date: todayKey, name: "Upper body", type: "strength", durationMinutes: 52, effort: 4, exercises: [{ name: "Bench press", sets: 3, reps: 8, weightKg: 72.5 }], createdAt: now }
    ],
    trainingPlans: [
      { id: "plan-strength", name: "Three-day strength", goal: "Build consistency", weeklyTarget: 3, active: true, createdAt: now - 5 * 86400000 }
    ],
    financeEntries: [
      { id: "finance-income", date: todayKey, label: "Salary", amountMinor: 280000, kind: "income", currency: "GBP", category: "Income", createdAt: now - 4 * 86400000 },
      { id: "finance-food", date: todayKey, label: "Groceries", amountMinor: 6240, kind: "expense", currency: "GBP", category: "Food", createdAt: now - 3600000 }
    ],
    financeBudgets: [
      { id: "budget-food", category: "Food", monthlyLimitMinor: 28000, active: true, createdAt: now }
    ],
    financeRecurring: [
      { id: "recurring-internet", name: "Internet", amountMinor: 3200, kind: "expense", currency: "GBP", category: "Bills", frequency: "monthly", nextDueDate: todayKey, active: true, createdAt: now }
    ],
    financeGoals: [
      { id: "goal-emergency", name: "Emergency fund", kind: "saving", targetAmountMinor: 300000, currentAmountMinor: 125000, active: true, createdAt: now }
    ],
    learningItems: [
      { id: "learning-spanish", title: "Conversational Spanish", kind: "skill", status: "active", progress: 14, target: 40, unit: "lessons", source: "Language course", createdAt: now }
    ],
    learningLogs: [
      { id: "learning-log", date: todayKey, learningItemId: "learning-spanish", title: "Travel phrases", durationMinutes: 35, note: "Practised recall without notes.", createdAt: now }
    ],
    learningNotes: [
      { id: "learning-note", learningItemId: "learning-spanish", title: "Past tense endings", body: "Regular preterite endings and two example verbs.", nextReviewDate: todayKey, reviewIntervalDays: 4, createdAt: now }
    ],
    workItems: [
      { id: "work-focus", title: "Focus personal OS", project: "Focus", summary: "Integrated the new local-first dashboard and feature modules.", updatedAt: now - 30 * 60000, status: "active", tags: ["electron", "productivity"] },
      { id: "work-docs", title: "Release documentation", project: "Focus", summary: "Documented migration and verification gates.", updatedAt: now - 2 * 3600000, status: "active", tags: ["docs"] }
    ],
    improvements: [
      { id: "improvement-sleep", title: "Consistent sleep", area: "Health", target: 7, progress: 5, metric: "days", status: "active", createdAt: now - 7 * 86400000, updatedAt: now }
    ],
    journalEntries: [],
    timeline: [],
    ui: {
      activePage,
      selectedDate: todayKey,
      taskFilter: "today",
      timelineFilter: "all",
      healthView,
      progressView,
      financeView: "budgets",
      searchOpen: false
    }
  };
}

function session(baseMs, dayOffset, hour, minute, durationMinutes, activeMinutes, title, project, tags, focusRating, energy, pauseCount) {
  const started = new Date(baseMs + dayOffset * 86400000);
  started.setHours(hour, minute, 0, 0);
  const startedAt = started.getTime();
  const durationMs = durationMinutes * 60000;
  const activeMs = activeMinutes * 60000;

  return {
    id: `session-${dayOffset}-${hour}-${minute}`,
    title,
    project,
    tags,
    startedAt,
    endedAt: startedAt + durationMs,
    durationMs,
    activeMs,
    pausedMs: Math.max(0, durationMs - activeMs),
    pauseCount,
    focusRating,
    energy,
    goalMinutes: durationMinutes
  };
}

function task(title, completed, createdAt, priority, dueDate, completedAt = null) {
  return {
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    completed,
    status: completed ? "completed" : "planned",
    priority,
    dueDate,
    createdAt,
    completedAt
  };
}

function dateKey(ms) {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function pathToFileUrl(filePath) {
  return "file://" + path.resolve(filePath).split(path.sep).map(encodeURIComponent).join("/");
}
