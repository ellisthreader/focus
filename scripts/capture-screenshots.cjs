#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const screenshotsDir = path.join(root, "docs", "screenshots");
const indexUrl = pathToFileUrl(path.join(root, "index.html"));
const storageKey = "focus-pattern-tracker:v1";
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
    state: createPortfolioState({ theme: "dark", sideTab: "settings" })
  },
  {
    name: "goals-light",
    width: 1280,
    height: 900,
    state: createPortfolioState({ theme: "light", sideTab: "goals" })
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
  localStorage.removeItem(${JSON.stringify(cloudKey)});
  location.replace(${JSON.stringify(indexUrl + "?portfolio-preview=1")});
</script>`;
}

function createPortfolioState({ theme, sideTab }) {
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
    theme,
    sideTab,
    settings: {
      dailyGoalMinutes: 360,
      blockGoalMinutes: 50,
      weeklyGoalHours: 30,
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
    goals: [
      goal("Prepare architecture walkthrough", false, now - 3 * 3600000),
      goal("Capture final dashboard screenshots", false, now - 2 * 3600000),
      goal("Run tests before publishing", true, now - 5 * 3600000, now - 90 * 60000)
    ]
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

function goal(text, completed, createdAt, completedAt = null) {
  return {
    id: text.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    text,
    completed,
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
