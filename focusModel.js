(function (root, factory) {
  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.FocusModel = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var HOUR_COUNT = 24;
  var DAY_COUNT = 7;
  var DAY_MS = 24 * 60 * 60 * 1000;
  var HOUR_MS = 60 * 60 * 1000;
  var MINUTE_MS = 60 * 1000;
  var DEFAULT_SCORE = 55;
  var DEFAULT_GOAL_MINUTES = 50;
  var DEFAULT_SHORT_BREAK_MINUTES = 10;
  var DEFAULT_LONG_BREAK_MINUTES = 25;
  var MIN_FOCUS_BLOCK_MINUTES = 25;
  var MAX_FOCUS_BLOCK_MINUTES = 90;

  var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
      return min;
    }

    return Math.min(max, Math.max(min, value));
  }

  function asNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function round(value, places) {
    var factor = Math.pow(10, places || 0);
    return Math.round(value * factor) / factor;
  }

  function roundToFive(value) {
    return Math.round(value / 5) * 5;
  }

  function ceilToFive(value) {
    return Math.ceil(value / 5) * 5;
  }

  function getSessionStart(session) {
    var startedAt = session && session.startedAt;
    var date = new Date(startedAt);

    return Number.isFinite(date.getTime()) ? date : null;
  }

  function getSessionDurationMs(session) {
    var explicitDuration = session && session.durationMs;
    if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
      return explicitDuration;
    }

    var started = session ? new Date(session.startedAt).getTime() : NaN;
    var ended = session ? new Date(session.endedAt).getTime() : NaN;
    if (Number.isFinite(started) && Number.isFinite(ended) && ended > started) {
      return ended - started;
    }

    return 0;
  }

  function getSessionActiveMs(session, durationMs) {
    var activeMs = session && session.activeMs;
    if (Number.isFinite(activeMs) && activeMs >= 0) {
      return Math.min(activeMs, durationMs || activeMs);
    }

    var pausedMs = session && session.pausedMs;
    if (Number.isFinite(pausedMs) && pausedMs >= 0 && durationMs > 0) {
      return Math.max(0, durationMs - pausedMs);
    }

    return durationMs;
  }

  function average(values, fallback) {
    var total = 0;
    var count = 0;

    values.forEach(function (value) {
      if (Number.isFinite(value)) {
        total += value;
        count += 1;
      }
    });

    return count > 0 ? total / count : fallback;
  }

  function scoreSession(session) {
    var durationMs = getSessionDurationMs(session);
    var activeMs = getSessionActiveMs(session, durationMs);
    var activeRatio = durationMs > 0 ? activeMs / durationMs : 0;
    var pauseCount = asNumber(session && session.pauseCount, 0);
    var rating = asNumber(session && session.focusRating, 3);
    var energy = asNumber(session && session.energy, 3);
    var goalMinutes = asNumber(session && session.goalMinutes, DEFAULT_GOAL_MINUTES);
    var durationMinutes = durationMs / MINUTE_MS;

    var activeScore = clamp(activeRatio * 100, 0, 100);
    var durationTarget = clamp(goalMinutes, 20, 120);
    var durationScore = durationMinutes <= 0
      ? 0
      : clamp(100 - Math.abs(durationMinutes - durationTarget) * 1.35, 20, 100);
    var pauseScore = clamp(100 - pauseCount * 10 - Math.max(0, 0.8 - activeRatio) * 35, 0, 100);
    var ratingScore = clamp((rating / 5) * 100, 0, 100);
    var energyScore = clamp((energy / 5) * 100, 0, 100);

    var score = activeScore * 0.35
      + durationScore * 0.2
      + pauseScore * 0.2
      + ratingScore * 0.15
      + energyScore * 0.1;

    return {
      score: Math.round(clamp(score, 0, 100)),
      activeRatio: round(clamp(activeRatio, 0, 1), 3),
      durationMinutes: Math.round(durationMinutes),
      pausePenalty: Math.round(100 - pauseScore),
      ratingScore: Math.round(ratingScore),
      energyScore: Math.round(energyScore)
    };
  }

  function createEmptyModel() {
    var hours = [];
    var days = [];
    var now = Date.now();
    var hour;
    var day;

    for (hour = 0; hour < HOUR_COUNT; hour += 1) {
      hours.push({
        hour: hour,
        score: DEFAULT_SCORE,
        count: 0,
        averageActiveRatio: 0.75,
        averageDurationMinutes: DEFAULT_GOAL_MINUTES
      });
    }

    for (day = 0; day < DAY_COUNT; day += 1) {
      days.push({
        day: day,
        name: DAY_NAMES[day],
        score: DEFAULT_SCORE,
        count: 0
      });
    }

    return {
      hours: hours,
      days: days,
      bestHours: hours.slice(9, 12),
      bestDays: days.slice(1, 6),
      averageFocusScore: DEFAULT_SCORE,
      streakDays: 0,
      suggestedGoalMinutes: DEFAULT_GOAL_MINUTES,
      suggestedShortBreakMinutes: DEFAULT_SHORT_BREAK_MINUTES,
      suggestedLongBreakMinutes: DEFAULT_LONG_BREAK_MINUTES,
      breakPolicy: {
        shortBreakMinutes: DEFAULT_SHORT_BREAK_MINUTES,
        longBreakMinutes: DEFAULT_LONG_BREAK_MINUTES,
        blocksBeforeLongBreak: 4,
        source: "research-default"
      },
      riskHours: [],
      generatedAt: new Date(now).toISOString(),
      sessionCount: 0
    };
  }

  function makeBucket(index, baseScore) {
    return {
      index: index,
      scoreTotal: baseScore * 2,
      count: 2,
      realCount: 0,
      activeTotal: 0,
      durationTotal: 0
    };
  }

  function calculateStreakDays(sessions) {
    var daysWithFocus = {};
    var today = new Date();
    var cursor;
    var streak = 0;

    sessions.forEach(function (session) {
      var started = getSessionStart(session);
      if (!started || scoreSession(session).score < 60) {
        return;
      }

      daysWithFocus[started.toDateString()] = true;
    });

    cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    while (daysWithFocus[cursor.toDateString()]) {
      streak += 1;
      cursor = new Date(cursor.getTime() - DAY_MS);
    }

    return streak;
  }

  function buildModel(sessions, settings) {
    var model = createEmptyModel();
    var source = Array.isArray(sessions) ? sessions : [];
    var options = settings || {};
    var defaultGoal = asNumber(options.defaultGoalMinutes, DEFAULT_GOAL_MINUTES);
    var hourBuckets = [];
    var dayBuckets = [];
    var scores = [];
    var goalMinutes = [];
    var hour;
    var day;

    for (hour = 0; hour < HOUR_COUNT; hour += 1) {
      hourBuckets.push(makeBucket(hour, DEFAULT_SCORE));
    }

    for (day = 0; day < DAY_COUNT; day += 1) {
      dayBuckets.push(makeBucket(day, DEFAULT_SCORE));
    }

    source.forEach(function (session) {
      var started = getSessionStart(session);
      var scoring;
      var hourBucket;
      var dayBucket;

      if (!started) {
        return;
      }

      scoring = scoreSession(session);
      scores.push(scoring.score);
      goalMinutes.push(asNumber(session.goalMinutes, defaultGoal));

      hourBucket = hourBuckets[started.getHours()];
      hourBucket.scoreTotal += scoring.score;
      hourBucket.count += 1;
      hourBucket.realCount += 1;
      hourBucket.activeTotal += scoring.activeRatio;
      hourBucket.durationTotal += scoring.durationMinutes;

      dayBucket = dayBuckets[started.getDay()];
      dayBucket.scoreTotal += scoring.score;
      dayBucket.count += 1;
      dayBucket.realCount += 1;
    });

    model.hours = hourBuckets.map(function (bucket) {
      return {
        hour: bucket.index,
        score: Math.round(bucket.scoreTotal / bucket.count),
        count: bucket.realCount,
        averageActiveRatio: round(bucket.realCount > 0 ? bucket.activeTotal / bucket.realCount : 0.75, 3),
        averageDurationMinutes: Math.round(bucket.realCount > 0 ? bucket.durationTotal / bucket.realCount : defaultGoal)
      };
    });

    model.days = dayBuckets.map(function (bucket) {
      return {
        day: bucket.index,
        name: DAY_NAMES[bucket.index],
        score: Math.round(bucket.scoreTotal / bucket.count),
        count: bucket.realCount
      };
    });

    model.bestHours = model.hours
      .slice()
      .sort(function (a, b) {
        return b.score - a.score || b.count - a.count || a.hour - b.hour;
      })
      .slice(0, 3);

    model.bestDays = model.days
      .slice()
      .sort(function (a, b) {
        return b.score - a.score || b.count - a.count || a.day - b.day;
      })
      .slice(0, 3);

    model.riskHours = model.hours
      .filter(function (item) {
        return item.count > 0 && item.score < 50;
      })
      .sort(function (a, b) {
        return a.score - b.score || b.count - a.count;
      })
      .slice(0, 3);

    model.averageFocusScore = Math.round(average(scores, DEFAULT_SCORE));
    model.streakDays = calculateStreakDays(source);
    model.suggestedGoalMinutes = roundToFive(clamp(average(goalMinutes, defaultGoal), MIN_FOCUS_BLOCK_MINUTES, MAX_FOCUS_BLOCK_MINUTES));
    model.suggestedShortBreakMinutes = suggestShortBreakMinutes(model.suggestedGoalMinutes, model.averageFocusScore);
    model.suggestedLongBreakMinutes = Math.round(clamp(model.suggestedShortBreakMinutes * 2.5, 15, 35) / 5) * 5;
    model.breakPolicy = {
      shortBreakMinutes: model.suggestedShortBreakMinutes,
      longBreakMinutes: model.suggestedLongBreakMinutes,
      blocksBeforeLongBreak: 4,
      source: scores.length >= 4 ? "learned" : "research-default"
    };
    model.generatedAt = new Date().toISOString();
    model.sessionCount = scores.length;

    return model;
  }

  function summarizeToday(sessions, nowMs) {
    var now = new Date(asNumber(nowMs, Date.now()));
    var startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var endOfDay = startOfDay + DAY_MS;
    var todaySessions = (Array.isArray(sessions) ? sessions : []).filter(function (session) {
      var started = getSessionStart(session);
      var time = started ? started.getTime() : NaN;

      return Number.isFinite(time) && time >= startOfDay && time < endOfDay;
    });
    var totalDurationMs = 0;
    var totalActiveMs = 0;
    var totalPausedMs = 0;
    var scores = [];
    var projects = {};

    todaySessions.forEach(function (session) {
      var durationMs = getSessionDurationMs(session);
      var activeMs = getSessionActiveMs(session, durationMs);
      var project = session.project || "Unassigned";

      totalDurationMs += durationMs;
      totalActiveMs += activeMs;
      totalPausedMs += Math.max(0, durationMs - activeMs);
      scores.push(scoreSession(session).score);
      projects[project] = (projects[project] || 0) + activeMs;
    });

    return {
      date: new Date(startOfDay).toISOString().slice(0, 10),
      sessionCount: todaySessions.length,
      totalDurationMs: totalDurationMs,
      totalActiveMs: totalActiveMs,
      totalPausedMs: totalPausedMs,
      activeRatio: round(totalDurationMs > 0 ? totalActiveMs / totalDurationMs : 0, 3),
      averageFocusScore: Math.round(average(scores, 0)),
      topProject: Object.keys(projects).sort(function (a, b) {
        return projects[b] - projects[a] || a.localeCompare(b);
      })[0] || null,
      formattedActive: formatDuration(totalActiveMs)
    };
  }

  function predictNextFocusWindow(model, nowDate) {
    var learned = model && Array.isArray(model.hours) && Array.isArray(model.days) ? model : createEmptyModel();
    var now = nowDate instanceof Date ? new Date(nowDate.getTime()) : new Date();
    var best = null;
    var offset;

    for (offset = 1; offset <= HOUR_COUNT * 7; offset += 1) {
      var candidate = new Date(now.getTime() + offset * HOUR_MS);
      candidate.setMinutes(0, 0, 0);

      if (candidate <= now) {
        candidate = new Date(candidate.getTime() + HOUR_MS);
      }

      var hourInfo = learned.hours[candidate.getHours()] || { score: DEFAULT_SCORE, count: 0 };
      var dayInfo = learned.days[candidate.getDay()] || { score: DEFAULT_SCORE, count: 0 };
      var blendedScore = Math.round(hourInfo.score * 0.7 + dayInfo.score * 0.3);
      var confidence = clamp((hourInfo.count + dayInfo.count) / 8, 0.2, 0.95);
      var ranked = {
        startAt: candidate.toISOString(),
        endAt: new Date(candidate.getTime() + Math.max(25, learned.suggestedGoalMinutes || DEFAULT_GOAL_MINUTES) * MINUTE_MS).toISOString(),
        hour: candidate.getHours(),
        day: candidate.getDay(),
        dayName: DAY_NAMES[candidate.getDay()],
        score: blendedScore,
        confidence: round(confidence, 2),
        label: formatHour(candidate.getHours()) + " on " + DAY_NAMES[candidate.getDay()]
      };

      if (!best || ranked.score > best.score || (ranked.score === best.score && ranked.confidence > best.confidence)) {
        best = ranked;
      }
    }

    return best;
  }

  function recommendBlockLength(model, recentSessions) {
    var learned = model || createEmptyModel();
    var recent = Array.isArray(recentSessions) ? recentSessions.slice(-5) : [];
    var recentScores = recent.map(function (session) {
      return scoreSession(session).score;
    });
    var recentDurations = recent.map(function (session) {
      return scoreSession(session).durationMinutes;
    }).filter(function (minutes) {
      return minutes > 0;
    });
    var scoreAverage = average(recentScores, learned.averageFocusScore || DEFAULT_SCORE);
    var base = average(recentDurations, learned.suggestedGoalMinutes || DEFAULT_GOAL_MINUTES);
    var adjusted = base;

    if (scoreAverage < 50) {
      adjusted -= 10;
    } else if (scoreAverage > 75) {
      adjusted += 10;
    }

    return roundToFive(clamp(adjusted, MIN_FOCUS_BLOCK_MINUTES, MAX_FOCUS_BLOCK_MINUTES));
  }

  function suggestShortBreakMinutes(blockMinutes, focusScore) {
    var base = blockMinutes <= 30 ? 5 : blockMinutes <= 55 ? 10 : blockMinutes <= 75 ? 15 : 20;

    if (focusScore < 55) {
      base += 5;
    }

    return roundToFive(clamp(base, 5, 20));
  }

  function recommendBreakLength(model, recentSessions, settings) {
    var options = settings || {};
    var learned = model || createEmptyModel();
    var recent = Array.isArray(recentSessions) ? recentSessions.slice(-5) : [];
    var recentScores = recent.map(function (session) {
      return scoreSession(session).score;
    });
    var averageScore = average(recentScores, learned.averageFocusScore || DEFAULT_SCORE);
    var blockMinutes = recommendBlockLength(learned, recent);
    var shortBreak = asNumber(options.shortBreakMinutes, learned.suggestedShortBreakMinutes || DEFAULT_SHORT_BREAK_MINUTES);
    var longBreak = asNumber(options.longBreakMinutes, learned.suggestedLongBreakMinutes || DEFAULT_LONG_BREAK_MINUTES);
    var type = options.forceLongBreak ? "long" : "short";
    var currentBlockMinutes = asNumber(options.currentBlockMinutes, blockMinutes);
    var minutes = type === "long" ? longBreak : suggestShortBreakMinutes(currentBlockMinutes, averageScore);

    if (type === "short") {
      minutes = Math.round(clamp(average([minutes, shortBreak], shortBreak), 5, 20) / 5) * 5;
    } else if (averageScore < 55) {
      minutes += 5;
    }

    minutes = roundToFive(clamp(minutes, type === "long" ? 15 : 5, type === "long" ? 40 : 20));

    return {
      type: type,
      minutes: minutes,
      confidence: round(clamp((learned.sessionCount || 0) / 12, 0.25, 0.95), 2),
      reason: type === "long"
        ? "Long recovery after repeated focus blocks"
        : "Research-backed recovery for the next focus block"
    };
  }

  function recommendDailyPlan(model, recentSessions, settings) {
    var options = settings || {};
    var learned = model || createEmptyModel();
    var recent = Array.isArray(recentSessions) ? recentSessions.slice(-5) : [];
    var remaining = clamp(asNumber(options.remainingGoalMinutes, options.dailyGoalMinutes || 0), 0, 720);
    var currentFocus = asNumber(options.currentFocusRating, 4);
    var currentEnergy = asNumber(options.currentEnergy, 4);
    var completedBlocks = Math.max(0, asNumber(options.completedBlocksSinceLongBreak, 0));
    var targetBlock = recommendBlockLength(learned, recent);
    var blocksRemaining;
    var nextBlock;
    var breakPlan;
    var plannedBreakMinutes = 0;
    var i;

    if (currentFocus <= 2 || currentEnergy <= 2) {
      targetBlock = Math.min(targetBlock, 35);
    } else if (currentFocus >= 4 && currentEnergy >= 4) {
      targetBlock = Math.max(targetBlock, DEFAULT_GOAL_MINUTES);
    }

    targetBlock = roundToFive(clamp(targetBlock, MIN_FOCUS_BLOCK_MINUTES, MAX_FOCUS_BLOCK_MINUTES));

    if (remaining <= 0) {
      return {
        goalMet: true,
        blocksRemaining: 0,
        nextBlockMinutes: 0,
        nextBreakMinutes: 0,
        nextBreakType: "none",
        plannedBreakMinutes: 0,
        totalActiveMinutes: 0,
        totalPlanMinutes: 0,
        reason: "Daily goal met"
      };
    }

    if (remaining <= MIN_FOCUS_BLOCK_MINUTES) {
      blocksRemaining = 1;
      nextBlock = ceilToFive(remaining);
    } else {
      blocksRemaining = Math.max(1, Math.round(remaining / targetBlock));
      nextBlock = roundToFive(remaining / blocksRemaining);

      if (nextBlock > MAX_FOCUS_BLOCK_MINUTES) {
        blocksRemaining = Math.ceil(remaining / MAX_FOCUS_BLOCK_MINUTES);
        nextBlock = roundToFive(remaining / blocksRemaining);
      }

      if (nextBlock < MIN_FOCUS_BLOCK_MINUTES && blocksRemaining > 1) {
        blocksRemaining = Math.max(1, Math.floor(remaining / MIN_FOCUS_BLOCK_MINUTES));
        nextBlock = roundToFive(remaining / blocksRemaining);
      }
    }

    nextBlock = Math.min(ceilToFive(remaining), clamp(nextBlock, 5, MAX_FOCUS_BLOCK_MINUTES));
    breakPlan = recommendBreakLength(learned, recent, {
      shortBreakMinutes: options.shortBreakMinutes,
      longBreakMinutes: options.longBreakMinutes,
      currentBlockMinutes: nextBlock,
      forceLongBreak: blocksRemaining > 1 && ((completedBlocks + 1) % asNumber(options.blocksBeforeLongBreak, 4) === 0)
    });

    for (i = 1; i < blocksRemaining; i += 1) {
      plannedBreakMinutes += ((completedBlocks + i) % asNumber(options.blocksBeforeLongBreak, 4) === 0)
        ? asNumber(options.longBreakMinutes, DEFAULT_LONG_BREAK_MINUTES)
        : recommendBreakLength(learned, recent, {
            shortBreakMinutes: options.shortBreakMinutes,
            currentBlockMinutes: nextBlock
          }).minutes;
    }

    return {
      goalMet: false,
      blocksRemaining: blocksRemaining,
      nextBlockMinutes: nextBlock,
      nextBreakMinutes: blocksRemaining > 1 ? breakPlan.minutes : 0,
      nextBreakType: blocksRemaining > 1 ? breakPlan.type : "optional",
      plannedBreakMinutes: plannedBreakMinutes,
      totalActiveMinutes: remaining,
      totalPlanMinutes: remaining + plannedBreakMinutes,
      confidence: breakPlan.confidence,
      reason: blocksRemaining > 1
        ? "Plan keeps breaks inside the remaining daily goal"
        : "Final block to finish today's goal"
    };
  }

  function formatHour(hour) {
    var normalized = ((hour % 24) + 24) % 24;
    var suffix = normalized >= 12 ? "PM" : "AM";
    var display = normalized % 12 || 12;

    return display + ":00 " + suffix;
  }

  function formatDuration(ms) {
    var totalMinutes = Math.max(0, Math.round(asNumber(ms, 0) / MINUTE_MS));
    var hours = Math.floor(totalMinutes / 60);
    var minutes = totalMinutes % 60;

    if (hours <= 0) {
      return minutes + "m";
    }

    if (minutes <= 0) {
      return hours + "h";
    }

    return hours + "h " + minutes + "m";
  }

  return {
    createEmptyModel: createEmptyModel,
    buildModel: buildModel,
    scoreSession: scoreSession,
    summarizeToday: summarizeToday,
    predictNextFocusWindow: predictNextFocusWindow,
    recommendBlockLength: recommendBlockLength,
    recommendBreakLength: recommendBreakLength,
    recommendDailyPlan: recommendDailyPlan,
    formatDuration: formatDuration
  };
});
