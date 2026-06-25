function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function currentActiveMs(timer, now = Date.now()) {
  if (timer?.status === "running") {
    return Math.max(0, Number(timer.activeMs || 0) + now - Number(timer.lastResumedAt || now));
  }
  return Math.max(0, Number(timer?.activeMs || 0));
}

export function currentPausedMs(timer, now = Date.now()) {
  if (timer?.status === "paused") {
    return Math.max(0, Number(timer.pausedMs || 0) + now - Number(timer.pauseStartedAt || now));
  }
  return Math.max(0, Number(timer?.pausedMs || 0));
}

export function timerGoalMs(timer, settings) {
  return Math.max(1000, Number(timer?.goalMinutes || settings?.blockGoalMinutes || 50) * 60000);
}

export function timerRemainingMs(timer, settings, now = Date.now()) {
  if (!timer || timer.status === "idle") return timerGoalMs(timer, settings);
  return Math.max(0, timerGoalMs(timer, settings) - currentActiveMs(timer, now));
}

export function startTimer(state, options = {}, now = Date.now()) {
  const mode = options.mode === "break" ? "break" : "focus";
  const fallbackMinutes = mode === "break"
    ? Number(state.settings.shortBreakMinutes || 10)
    : Number(state.settings.blockGoalMinutes || 50);
  const goalMinutes = clamp(Number(options.goalMinutes || fallbackMinutes), mode === "break" ? 1 : 5, mode === "break" ? 60 : 180);
  return {
    id: options.id || `timer-${now}`,
    status: "running",
    mode,
    breakType: mode === "break" ? options.breakType || "short" : null,
    title: options.title || state.timer?.title || "",
    project: options.project || state.timer?.project || "",
    tags: Array.isArray(options.tags) ? options.tags : state.timer?.tags || [],
    taskId: options.taskId || state.timer?.taskId || null,
    startedAt: now,
    lastResumedAt: now,
    activeMs: 0,
    pausedMs: 0,
    pauseStartedAt: null,
    pauseCount: 0,
    focusRating: clamp(Number(options.focusRating || state.timer?.focusRating || 4), 1, 5),
    energy: clamp(Number(options.energy || state.timer?.energy || 4), 1, 5),
    goalMinutes,
    completedAt: null
  };
}

export function toggleTimerPause(timer, now = Date.now()) {
  if (timer.status === "running") {
    return {
      ...timer,
      activeMs: currentActiveMs(timer, now),
      status: "paused",
      pauseStartedAt: now,
      lastResumedAt: null,
      pauseCount: Number(timer.pauseCount || 0) + 1
    };
  }
  if (timer.status === "paused") {
    return {
      ...timer,
      pausedMs: currentPausedMs(timer, now),
      status: "running",
      lastResumedAt: now,
      pauseStartedAt: null
    };
  }
  return timer;
}

export function completeTimer(timer, settings, now = Date.now(), allowEarly = true) {
  if (!["running", "paused"].includes(timer.status)) return timer;
  return {
    ...timer,
    activeMs: allowEarly ? currentActiveMs(timer, now) : timerGoalMs(timer, settings),
    pausedMs: currentPausedMs(timer, now),
    status: "complete",
    completedAt: now,
    lastResumedAt: null,
    pauseStartedAt: null
  };
}

export function sessionFromTimer(timer, now = Date.now()) {
  const endedAt = Number(timer.completedAt || now);
  const startedAt = Number(timer.startedAt || endedAt);
  return {
    id: timer.id || `session-${endedAt}`,
    title: timer.title || "Untitled focus block",
    project: timer.project || "General",
    taskId: timer.taskId || null,
    tags: Array.isArray(timer.tags) ? timer.tags : [],
    startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    activeMs: Math.max(0, Number(timer.activeMs || 0)),
    pausedMs: Math.max(0, Number(timer.pausedMs || 0)),
    pauseCount: Math.max(0, Number(timer.pauseCount || 0)),
    focusRating: clamp(Number(timer.focusRating || 4), 1, 5),
    energy: clamp(Number(timer.energy || 4), 1, 5),
    goalMinutes: clamp(Number(timer.goalMinutes || 50), 1, 180)
  };
}

export function idleTimer(settings = {}, previous = {}) {
  return {
    id: null,
    status: "idle",
    mode: "focus",
    breakType: null,
    title: previous.title || "",
    project: previous.project || "",
    tags: previous.tags || [],
    taskId: previous.taskId || null,
    startedAt: null,
    lastResumedAt: null,
    activeMs: 0,
    pausedMs: 0,
    pauseStartedAt: null,
    pauseCount: 0,
    focusRating: Number(previous.focusRating || 4),
    energy: Number(previous.energy || 4),
    goalMinutes: Number(settings.blockGoalMinutes || 50),
    completedAt: null
  };
}
