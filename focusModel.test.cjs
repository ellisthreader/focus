const test = require("node:test");
const assert = require("node:assert/strict");

const FocusModel = require("./focusModel.js");

function localIso(year, month, day, hour, minute) {
  return new Date(year, month - 1, day, hour, minute || 0, 0, 0).toISOString();
}

function session(overrides) {
  return {
    id: "s1",
    title: "Build feature",
    project: "Desktop",
    startedAt: localIso(2026, 5, 18, 9),
    endedAt: localIso(2026, 5, 18, 9, 50),
    durationMs: 50 * 60 * 1000,
    activeMs: 46 * 60 * 1000,
    pausedMs: 4 * 60 * 1000,
    pauseCount: 1,
    focusRating: 4,
    energy: 4,
    goalMinutes: 50,
    tags: ["coding"],
    ...overrides
  };
}

test("empty model returns smoothed UI-ready defaults", () => {
  const model = FocusModel.createEmptyModel();

  assert.equal(model.hours.length, 24);
  assert.equal(model.days.length, 7);
  assert.equal(model.averageFocusScore, 55);
  assert.equal(model.suggestedGoalMinutes, 45);
  assert.equal(model.suggestedShortBreakMinutes, 10);
  assert.equal(model.suggestedLongBreakMinutes, 25);
  assert.equal(model.breakPolicy.source, "research-default");
  assert.equal(model.streakDays, 0);
  assert.equal(model.sessionCount, 0);
  assert.ok(model.bestHours.length > 0);
  assert.ok(model.bestDays.length > 0);
  assert.deepEqual(model.riskHours, []);
  assert.match(model.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("scoreSession rewards active time and penalizes pauses", () => {
  const strong = FocusModel.scoreSession(session());
  const fragmented = FocusModel.scoreSession(session({
    activeMs: 25 * 60 * 1000,
    pausedMs: 25 * 60 * 1000,
    pauseCount: 6,
    focusRating: 2,
    energy: 2
  }));

  assert.ok(strong.score > fragmented.score);
  assert.ok(strong.score >= 75);
  assert.equal(strong.activeRatio, 0.92);
  assert.equal(fragmented.activeRatio, 0.5);
  assert.ok(fragmented.pausePenalty > strong.pausePenalty);
});

test("summarizeToday totals only sessions from the provided day", () => {
  const nowMs = new Date(2026, 4, 18, 15).getTime();
  const sessions = [
    session({ id: "today-a", startedAt: localIso(2026, 5, 18, 9), project: "Desktop" }),
    session({
      id: "today-b",
      startedAt: localIso(2026, 5, 18, 13),
      endedAt: localIso(2026, 5, 18, 13, 30),
      durationMs: 30 * 60 * 1000,
      activeMs: 30 * 60 * 1000,
      project: "Desktop"
    }),
    session({ id: "yesterday", startedAt: localIso(2026, 5, 17, 10), project: "Ops" })
  ];

  const summary = FocusModel.summarizeToday(sessions, nowMs);

  assert.equal(summary.sessionCount, 2);
  assert.equal(summary.totalDurationMs, 80 * 60 * 1000);
  assert.equal(summary.totalActiveMs, 76 * 60 * 1000);
  assert.equal(summary.topProject, "Desktop");
  assert.equal(summary.formattedActive, "1h 16m");
  assert.ok(summary.averageFocusScore > 70);
});

test("buildModel aggregates by hour and day with risk and best buckets", () => {
  const sessions = [
    session({ id: "good-9", startedAt: localIso(2026, 5, 18, 9), goalMinutes: 50 }),
    session({ id: "good-10", startedAt: localIso(2026, 5, 19, 10), goalMinutes: 45 }),
    session({
      id: "risk-15",
      startedAt: localIso(2026, 5, 18, 15),
      activeMs: 15 * 60 * 1000,
      pausedMs: 35 * 60 * 1000,
      pauseCount: 8,
      focusRating: 1,
      energy: 1,
      goalMinutes: 30
    })
  ];

  const model = FocusModel.buildModel(sessions);

  assert.equal(model.sessionCount, 3);
  assert.ok(model.averageFocusScore > 50);
  assert.ok(model.bestHours.some((item) => item.hour === 9 || item.hour === 10));
  assert.ok(model.bestDays.some((item) => item.count > 0));
  assert.ok(model.riskHours.some((item) => item.hour === 15));
  assert.equal(model.suggestedGoalMinutes, 40);
  assert.ok(model.suggestedShortBreakMinutes >= 5);
  assert.ok(model.suggestedLongBreakMinutes >= 15);
});

test("prediction chooses the next strong focus window", () => {
  const model = FocusModel.buildModel([
    session({ id: "best", startedAt: localIso(2026, 5, 18, 9) }),
    session({
      id: "weak",
      startedAt: localIso(2026, 5, 18, 14),
      activeMs: 20 * 60 * 1000,
      pausedMs: 30 * 60 * 1000,
      pauseCount: 7,
      focusRating: 1,
      energy: 2
    })
  ]);

  const prediction = FocusModel.predictNextFocusWindow(model, new Date(2026, 4, 18, 8, 10));
  const expectedStart = new Date(2026, 4, 18, 9).toISOString();

  assert.equal(prediction.hour, 9);
  assert.equal(prediction.dayName, "Monday");
  assert.ok(prediction.score >= 60);
  assert.equal(prediction.startAt, expectedStart);
  assert.ok(prediction.confidence > 0);
});

test("recommendBlockLength adapts to recent focus quality", () => {
  const model = FocusModel.buildModel([session({ goalMinutes: 50 })]);
  const long = FocusModel.recommendBlockLength(model, [session({ durationMs: 50 * 60 * 1000, activeMs: 49 * 60 * 1000 })]);
  const short = FocusModel.recommendBlockLength(model, [session({
    durationMs: 50 * 60 * 1000,
    activeMs: 15 * 60 * 1000,
    pauseCount: 8,
    focusRating: 1,
    energy: 1
  })]);

  assert.ok(long > short);
  assert.equal(FocusModel.formatDuration(90 * 60 * 1000), "1h 30m");
});

test("recommendBreakLength returns researched defaults and long recovery", () => {
  const model = FocusModel.buildModel([session({ goalMinutes: 50 })]);
  const shortBreak = FocusModel.recommendBreakLength(model, [session()], { shortBreakMinutes: 10 });
  const longBreak = FocusModel.recommendBreakLength(model, [session()], { longBreakMinutes: 25, forceLongBreak: true });

  assert.equal(shortBreak.type, "short");
  assert.ok(shortBreak.minutes >= 5);
  assert.ok(shortBreak.minutes <= 20);
  assert.equal(longBreak.type, "long");
  assert.ok(longBreak.minutes >= 25);
});
