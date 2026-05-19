(function () {
  const STORAGE_KEY = "focus-pattern-tracker:v1";
  const RING_LENGTH = 678.58;
  const DEFAULT_SETTINGS = {
    dailyGoalMinutes: 360,
    blockGoalMinutes: 50,
    weeklyGoalHours: 30,
    shortBreakMinutes: 10,
    longBreakMinutes: 25,
    blocksBeforeLongBreak: 4
  };

  const fallbackModel = {
    createEmptyModel() {
      return {
        bestHours: [],
        bestDays: [],
        riskHours: [],
        averageFocusScore: 0,
        streakDays: 0,
        suggestedGoalMinutes: 50,
        generatedAt: new Date().toISOString()
      };
    },
    buildModel() {
      return this.createEmptyModel();
    },
    scoreSession(session) {
      const active = Math.max(0, Number(session.activeMs) || 0);
      const duration = Math.max(active, Number(session.durationMs) || active || 1);
      return Math.round(Math.min(100, Math.max(0, (active / duration) * 72 + 18)));
    },
    summarizeToday(sessions, nowMs) {
      const day = new Date(nowMs);
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
      const end = start + 86400000;
      const today = sessions.filter((session) => session.startedAt >= start && session.startedAt < end);
      return {
        activeMs: today.reduce((sum, session) => sum + (Number(session.activeMs) || 0), 0),
        sessionCount: today.length
      };
    },
    predictNextFocusWindow() {
      return null;
    },
    recommendBlockLength() {
      return 50;
    },
    recommendBreakLength(model, recentSessions, settings) {
      const options = settings || {};
      return {
        type: options.forceLongBreak ? "long" : "short",
        minutes: options.forceLongBreak ? 25 : 10,
        confidence: 0.25,
        reason: "Research default"
      };
    },
    formatDuration(ms) {
      return formatDuration(ms);
    }
  };

  const FocusModel = window.FocusModel || fallbackModel;

  const defaultState = {
    settings: { ...DEFAULT_SETTINGS },
    sessions: [],
    timer: createIdleTimer(),
    breakTimer: createIdleBreakTimer(),
    manualDailyMinutes: {},
    recovery: { completedBlocksSinceLongBreak: 0 }
  };

  const dom = {};
  let state = loadState();
  let model = FocusModel.buildModel(state.sessions, modelSettings());
  let tickHandle = null;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindDom();
    bindEvents();
    hydrateControls();
    render();
    tickHandle = window.setInterval(render, 1000);
  }

  function bindDom() {
    [
      "modelStatus",
      "minimizeWindow",
      "maximizeWindow",
      "closeWindow",
      "timerState",
      "timerDisplay",
      "blockProgressRing",
      "blockProgressText",
      "taskInput",
      "projectInput",
      "tagsInput",
      "energyInput",
      "focusInput",
      "startButton",
      "pauseButton",
      "finishButton",
      "resetButton",
      "todayDate",
      "activeToday",
      "dayGoalBar",
      "dayGoalText",
      "remainingText",
      "dailyGoalInput",
      "dailyGoalValue",
      "blockGoalInput",
      "blockGoalValue",
      "sessionCountToday",
      "streakDays",
      "patternCanvas",
      "averageScore",
      "nextWindow",
      "recommendedBlock",
      "bestHours",
      "riskHours",
      "sessionList",
      "manualHoursInput",
      "manualMinutesInput",
      "manualCreditText",
      "shortBreakInput",
      "shortBreakValue",
      "longBreakInput",
      "longBreakValue",
      "breakState",
      "breakDisplay",
      "breakProgressBar",
      "breakAdvice",
      "startBreakButton",
      "pauseBreakButton",
      "skipBreakButton",
      "clearHistoryButton"
    ].forEach((id) => {
      dom[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    dom.minimizeWindow.addEventListener("click", () => window.focusDesktop?.minimize());
    dom.maximizeWindow.addEventListener("click", () => window.focusDesktop?.maximize());
    dom.closeWindow.addEventListener("click", () => window.focusDesktop?.close());

    dom.startButton.addEventListener("click", startTimer);
    dom.pauseButton.addEventListener("click", togglePause);
    dom.finishButton.addEventListener("click", finishTimer);
    dom.resetButton.addEventListener("click", resetTimer);
    dom.clearHistoryButton.addEventListener("click", clearHistory);
    dom.startBreakButton.addEventListener("click", startBreak);
    dom.pauseBreakButton.addEventListener("click", toggleBreakPause);
    dom.skipBreakButton.addEventListener("click", skipBreak);

    dom.dailyGoalInput.addEventListener("input", () => {
      state.settings.dailyGoalMinutes = Math.round(Number(dom.dailyGoalInput.value) * 60);
      persistAndRender();
    });

    dom.blockGoalInput.addEventListener("input", () => {
      state.settings.blockGoalMinutes = Number(dom.blockGoalInput.value);
      if (state.timer.status === "idle") {
        state.timer.goalMinutes = state.settings.blockGoalMinutes;
      }
      persistAndRender();
    });

    dom.shortBreakInput.addEventListener("input", () => {
      state.settings.shortBreakMinutes = Number(dom.shortBreakInput.value);
      if (["idle", "ready", "completed"].includes(state.breakTimer.status)) {
        state.breakTimer = createIdleBreakTimer();
      }
      persistAndRender();
    });

    dom.longBreakInput.addEventListener("input", () => {
      state.settings.longBreakMinutes = Number(dom.longBreakInput.value);
      persistAndRender();
    });

    [dom.manualHoursInput, dom.manualMinutesInput].forEach((input) => {
      input.addEventListener("input", updateManualCredit);
    });

    [dom.taskInput, dom.projectInput, dom.tagsInput, dom.energyInput, dom.focusInput].forEach((input) => {
      input.addEventListener("input", () => {
        if (state.timer.status !== "idle") {
          readTimerFormIntoState();
          persist();
        }
      });
    });

    window.addEventListener("beforeunload", () => {
      persist();
      if (tickHandle) {
        window.clearInterval(tickHandle);
      }
    });
  }

  function hydrateControls() {
    dom.dailyGoalInput.value = String(state.settings.dailyGoalMinutes / 60);
    dom.blockGoalInput.value = String(state.settings.blockGoalMinutes);
    dom.shortBreakInput.value = String(state.settings.shortBreakMinutes);
    dom.longBreakInput.value = String(state.settings.longBreakMinutes);
    syncManualInputs(getDateKey(Date.now()));
    syncFormFromTimer();
  }

  function startTimer() {
    const now = Date.now();

    if (!["idle", "completed"].includes(state.breakTimer.status)) {
      state.breakTimer = createIdleBreakTimer();
    }

    state.timer = {
      id: createId(),
      status: "running",
      title: dom.taskInput.value.trim(),
      project: dom.projectInput.value.trim(),
      tags: parseTags(dom.tagsInput.value),
      startedAt: now,
      lastResumedAt: now,
      activeMs: 0,
      pausedMs: 0,
      pauseStartedAt: null,
      pauseCount: 0,
      focusRating: Number(dom.focusInput.value),
      energy: Number(dom.energyInput.value),
      goalMinutes: state.settings.blockGoalMinutes
    };

    persistAndRender();
  }

  function togglePause() {
    if (state.timer.status === "running") {
      state.timer.activeMs = getCurrentActiveMs();
      state.timer.status = "paused";
      state.timer.pauseStartedAt = Date.now();
      state.timer.pauseCount += 1;
      persistAndRender();
      return;
    }

    if (state.timer.status === "paused") {
      state.timer.pausedMs = getCurrentPausedMs();
      state.timer.status = "running";
      state.timer.lastResumedAt = Date.now();
      state.timer.pauseStartedAt = null;
      persistAndRender();
    }
  }

  function finishTimer() {
    if (state.timer.status === "idle") {
      return;
    }

    readTimerFormIntoState();
    const endedAt = Date.now();
    const activeMs = getCurrentActiveMs();
    const pausedMs = getCurrentPausedMs();
    let completedSession = false;
    const session = {
      id: state.timer.id || createId(),
      title: state.timer.title || "Untitled focus block",
      project: state.timer.project || "General",
      tags: state.timer.tags,
      startedAt: state.timer.startedAt || endedAt,
      endedAt,
      durationMs: Math.max(0, endedAt - (state.timer.startedAt || endedAt)),
      activeMs,
      pausedMs,
      pauseCount: state.timer.pauseCount,
      focusRating: state.timer.focusRating,
      energy: state.timer.energy,
      goalMinutes: state.timer.goalMinutes
    };

    if (session.activeMs >= 1000) {
      state.sessions.push(session);
      state.sessions = state.sessions.slice(-600);
      completedSession = true;
      state.recovery.completedBlocksSinceLongBreak += 1;
    }

    state.timer = createIdleTimer();
    syncFormFromTimer();
    rebuildModel();
    if (completedSession) {
      prepareBreakTimer();
    }
    persistAndRender();
  }

  function resetTimer() {
    state.timer = createIdleTimer();
    syncFormFromTimer();
    persistAndRender();
  }

  function clearHistory() {
    const hasHistory = state.sessions.length > 0;
    if (!hasHistory) {
      return;
    }

    const confirmed = window.confirm("Clear all completed sessions from this device?");
    if (!confirmed) {
      return;
    }

    state.sessions = [];
    rebuildModel();
    persistAndRender();
  }

  function render() {
    const now = Date.now();
    updateBreakCompletion(now);
    const activeMs = getCurrentActiveMs();
    const pausedMs = getCurrentPausedMs();
    const blockGoalMs = Math.max(1, (state.timer.goalMinutes || state.settings.blockGoalMinutes) * 60000);
    const blockProgress = clamp(activeMs / blockGoalMs, 0, 1);
    const displayMs = state.timer.status === "idle" ? 0 : activeMs;
    const sessionsForToday = getSessionsWithCurrentTimer(now);
    const today = FocusModel.summarizeToday(sessionsForToday, now);
    const trackedActiveMs = today.activeMs || today.totalActiveMs || 0;
    const manualMinutes = getManualMinutesForDay(now);
    const manualMs = manualMinutes * 60000;
    const todayActiveMs = trackedActiveMs + manualMs;
    const todayCount = today.sessionCount || today.sessions || 0;
    const dayGoalMs = Math.max(1, state.settings.dailyGoalMinutes * 60000);
    const dayProgress = clamp(todayActiveMs / dayGoalMs, 0, 1);
    const breakPlan = getBreakPlan();
    const prediction = FocusModel.predictNextFocusWindow(model, new Date(now));
    const recommendation = FocusModel.recommendBlockLength(model, recentSessions(8).reverse());

    dom.timerDisplay.textContent = formatClock(displayMs);
    dom.timerState.textContent = timerLabel();
    dom.pauseButton.querySelector("span").textContent = state.timer.status === "paused" ? "Resume" : "Pause";
    dom.blockProgressText.textContent = `${Math.round(blockProgress * 100)}% of block`;
    dom.blockProgressRing.style.strokeDashoffset = String(RING_LENGTH - RING_LENGTH * blockProgress);

    dom.startButton.disabled = state.timer.status !== "idle";
    dom.pauseButton.disabled = state.timer.status === "idle";
    dom.finishButton.disabled = state.timer.status === "idle";
    dom.resetButton.disabled = state.timer.status === "idle";

    dom.todayDate.textContent = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric"
    }).format(new Date(now));
    dom.activeToday.textContent = formatShortDuration(todayActiveMs);
    dom.dayGoalBar.style.width = `${Math.round(dayProgress * 100)}%`;
    dom.dayGoalText.textContent = `${formatShortDuration(todayActiveMs)} of ${formatShortDuration(dayGoalMs)}`;
    dom.remainingText.textContent = `${formatShortDuration(Math.max(0, dayGoalMs - todayActiveMs))} remaining`;
    dom.dailyGoalValue.textContent = formatGoalHours(state.settings.dailyGoalMinutes);
    dom.blockGoalValue.textContent = `${state.settings.blockGoalMinutes}m`;
    dom.shortBreakValue.textContent = `${state.settings.shortBreakMinutes}m`;
    dom.longBreakValue.textContent = `${state.settings.longBreakMinutes}m`;
    dom.manualCreditText.textContent = `${formatShortDuration(manualMs)} added`;
    syncManualInputsIfNeeded(now);
    dom.sessionCountToday.textContent = String(todayCount);
    dom.streakDays.textContent = `${model.streakDays || 0}d`;
    dom.averageScore.textContent = `${Math.round(model.averageFocusScore || 0)}`;
    dom.nextWindow.textContent = model.sessionCount ? formatPrediction(prediction) : "After first session";
    dom.recommendedBlock.textContent = `${Math.round(recommendation || model.suggestedGoalMinutes || state.settings.blockGoalMinutes)}m`;
    dom.bestHours.textContent = model.sessionCount ? formatHours(model.bestHours) : "No history yet";
    dom.riskHours.textContent = model.sessionCount ? formatHours(model.riskHours) : "No history yet";
    dom.modelStatus.textContent = `${state.sessions.length} sessions learned locally`;
    renderBreak(now, breakPlan);

    drawPatternCanvas();
    renderSessions();

    if (pausedMs > 0) {
      document.body.dataset.paused = state.timer.status === "paused" ? "true" : "false";
    }
  }

  function drawPatternCanvas() {
    const canvas = dom.patternCanvas;
    const context = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * scale));
    const height = Math.max(1, Math.floor(rect.height * scale));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    context.clearRect(0, 0, width, height);
    context.save();
    context.scale(scale, scale);

    const cssWidth = width / scale;
    const cssHeight = height / scale;
    const padding = { top: 22, right: 22, bottom: 34, left: 36 };
    const chartWidth = cssWidth - padding.left - padding.right;
    const chartHeight = cssHeight - padding.top - padding.bottom;
    const scores = getHourlyScores();
    const maxScore = 100;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, cssWidth, cssHeight);

    context.strokeStyle = "#dfe5dc";
    context.lineWidth = 1;
    context.beginPath();
    for (let i = 0; i <= 4; i += 1) {
      const y = padding.top + (chartHeight / 4) * i;
      context.moveTo(padding.left, y);
      context.lineTo(cssWidth - padding.right, y);
    }
    context.stroke();

    const barGap = 5;
    const barWidth = Math.max(8, (chartWidth - barGap * 23) / 24);
    scores.forEach((score, hour) => {
      const x = padding.left + hour * (barWidth + barGap);
      const normalized = clamp(score / maxScore, 0.04, 1);
      const barHeight = Math.max(6, normalized * chartHeight);
      const y = padding.top + chartHeight - barHeight;
      const gradient = context.createLinearGradient(0, y, 0, y + barHeight);
      gradient.addColorStop(0, score >= 70 ? "#1f9d65" : score >= 52 ? "#246bfe" : "#e3574f");
      gradient.addColorStop(1, "rgba(21, 25, 22, 0.22)");
      roundedRect(context, x, y, barWidth, barHeight, 5);
      context.fillStyle = gradient;
      context.fill();
    });

    context.fillStyle = "#6c746d";
    context.font = "700 11px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    [0, 6, 12, 18, 23].forEach((hour) => {
      const x = padding.left + hour * (barWidth + barGap) + barWidth / 2;
      context.fillText(formatHour(hour), x, cssHeight - 12);
    });

    context.fillStyle = "#151916";
    context.font = "800 12px Inter, system-ui, sans-serif";
    context.textAlign = "left";
    context.fillText("Hourly focus score", padding.left, 16);

    context.restore();
  }

  function renderSessions() {
    const items = recentSessions(12);

    if (items.length === 0) {
      dom.sessionList.innerHTML = `<div class="empty-state">Completed focus blocks will appear here.</div>`;
      return;
    }

    dom.sessionList.innerHTML = items
      .map((session) => {
        const score = Math.round(scoreValue(session));
        const title = escapeHtml(session.title || "Untitled focus block");
        const project = escapeHtml(session.project || "General");
        const started = new Intl.DateTimeFormat(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit"
        }).format(new Date(session.startedAt));
        const tags = (session.tags || []).slice(0, 3).map(escapeHtml).join(", ");
        const meta = [
          started,
          `${formatShortDuration(session.activeMs)} active`,
          `${session.pauseCount || 0} pauses`,
          tags ? `#${tags}` : ""
        ].filter(Boolean).join(" | ");

        return `
          <article class="session-item">
            <div class="session-title">
              <strong>${title}</strong>
              <span>${project}</span>
            </div>
            <span class="session-score">${score}</span>
            <div class="session-meta">${meta}</div>
          </article>
        `;
      })
      .join("");
  }

  function readTimerFormIntoState() {
    state.timer.title = dom.taskInput.value.trim();
    state.timer.project = dom.projectInput.value.trim();
    state.timer.tags = parseTags(dom.tagsInput.value);
    state.timer.energy = Number(dom.energyInput.value);
    state.timer.focusRating = Number(dom.focusInput.value);
  }

  function syncFormFromTimer() {
    dom.taskInput.value = state.timer.title || "";
    dom.projectInput.value = state.timer.project || "";
    dom.tagsInput.value = (state.timer.tags || []).join(", ");
    dom.energyInput.value = String(state.timer.energy || 4);
    dom.focusInput.value = String(state.timer.focusRating || 4);
  }

  function getCurrentActiveMs() {
    if (state.timer.status === "running") {
      return Math.max(0, (state.timer.activeMs || 0) + Date.now() - (state.timer.lastResumedAt || Date.now()));
    }

    return Math.max(0, state.timer.activeMs || 0);
  }

  function getCurrentPausedMs() {
    if (state.timer.status === "paused") {
      return Math.max(0, (state.timer.pausedMs || 0) + Date.now() - (state.timer.pauseStartedAt || Date.now()));
    }

    return Math.max(0, state.timer.pausedMs || 0);
  }

  function getSessionsWithCurrentTimer(now) {
    if (state.timer.status === "idle") {
      return state.sessions;
    }

    return state.sessions.concat({
      id: state.timer.id,
      title: state.timer.title,
      project: state.timer.project,
      tags: state.timer.tags,
      startedAt: state.timer.startedAt || now,
      endedAt: now,
      durationMs: Math.max(0, now - (state.timer.startedAt || now)),
      activeMs: getCurrentActiveMs(),
      pausedMs: getCurrentPausedMs(),
      pauseCount: state.timer.pauseCount,
      focusRating: state.timer.focusRating,
      energy: state.timer.energy,
      goalMinutes: state.timer.goalMinutes
    });
  }

  function getHourlyScores() {
    if (Array.isArray(model.hours) && model.hours.length === 24) {
      return model.hours.map((hour) => Number(hour.score) || 0);
    }

    const totals = Array.from({ length: 24 }, () => ({ score: 52, weight: 1 }));
    state.sessions.forEach((session) => {
      const hour = new Date(session.startedAt).getHours();
      totals[hour].score += scoreValue(session);
      totals[hour].weight += 1;
    });
    return totals.map((item) => item.score / item.weight);
  }

  function rebuildModel() {
    model = FocusModel.buildModel(state.sessions, modelSettings());
  }

  function modelSettings() {
    return {
      ...state.settings,
      defaultGoalMinutes: state.settings.blockGoalMinutes
    };
  }

  function persistAndRender() {
    persist();
    render();
  }

  function persist() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return structuredClone(defaultState);
      }

      const parsed = JSON.parse(raw);
      return {
        settings: normalizeSettings(parsed.settings),
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        timer: normalizeTimer(parsed.timer),
        breakTimer: normalizeBreakTimer(parsed.breakTimer),
        manualDailyMinutes: normalizeManualDailyMinutes(parsed.manualDailyMinutes),
        recovery: normalizeRecovery(parsed.recovery)
      };
    } catch (error) {
      console.warn("Unable to load saved focus tracker state", error);
      return structuredClone(defaultState);
    }
  }

  function normalizeSettings(settings) {
    const normalized = { ...defaultState.settings, ...(settings || {}) };
    normalized.shortBreakMinutes = clamp(Number(normalized.shortBreakMinutes) || DEFAULT_SETTINGS.shortBreakMinutes, 5, 20);
    normalized.longBreakMinutes = clamp(Number(normalized.longBreakMinutes) || DEFAULT_SETTINGS.longBreakMinutes, 15, 40);
    normalized.blocksBeforeLongBreak = clamp(Number(normalized.blocksBeforeLongBreak) || DEFAULT_SETTINGS.blocksBeforeLongBreak, 2, 6);
    return normalized;
  }

  function normalizeBreakTimer(timer) {
    if (!timer || typeof timer !== "object") {
      return createIdleBreakTimer();
    }

    const normalized = { ...createIdleBreakTimer(), ...timer };
    if (!["idle", "ready", "running", "paused", "completed"].includes(normalized.status)) {
      normalized.status = "idle";
    }
    normalized.totalMs = Math.max(60000, Number(normalized.totalMs) || DEFAULT_SETTINGS.shortBreakMinutes * 60000);
    normalized.remainingMs = Math.max(0, Number(normalized.remainingMs) || normalized.totalMs);
    if (normalized.status === "running" && normalized.lastStartedAt) {
      normalized.remainingMs = Math.max(0, normalized.remainingMs - (Date.now() - normalized.lastStartedAt));
      normalized.lastStartedAt = Date.now();
      if (normalized.remainingMs === 0) {
        normalized.status = "completed";
      }
    }
    return normalized;
  }

  function normalizeManualDailyMinutes(value) {
    if (!value || typeof value !== "object") {
      return {};
    }

    return Object.fromEntries(Object.entries(value).map(([key, minutes]) => [key, clamp(Number(minutes) || 0, 0, 1440)]));
  }

  function normalizeRecovery(value) {
    return {
      completedBlocksSinceLongBreak: Math.max(0, Number(value?.completedBlocksSinceLongBreak) || 0)
    };
  }

  function normalizeTimer(timer) {
    if (!timer || typeof timer !== "object") {
      return createIdleTimer();
    }

    const normalized = { ...createIdleTimer(), ...timer };
    if (!["idle", "running", "paused"].includes(normalized.status)) {
      normalized.status = "idle";
    }
    if (normalized.status === "running" && !normalized.lastResumedAt) {
      normalized.lastResumedAt = Date.now();
    }
    return normalized;
  }

  function createIdleTimer() {
    return {
      id: null,
      status: "idle",
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
      goalMinutes: DEFAULT_SETTINGS.blockGoalMinutes
    };
  }

  function createIdleBreakTimer() {
    const minutes = DEFAULT_SETTINGS.shortBreakMinutes;
    return {
      status: "idle",
      type: "short",
      minutes,
      totalMs: minutes * 60000,
      remainingMs: minutes * 60000,
      lastStartedAt: null,
      completedAt: null,
      reason: "Research default"
    };
  }

  function updateManualCredit() {
    const hours = clamp(Number(dom.manualHoursInput.value) || 0, 0, 24);
    const minutes = clamp(Number(dom.manualMinutesInput.value) || 0, 0, 59);
    const key = getDateKey(Date.now());
    state.manualDailyMinutes[key] = Math.round(hours * 60 + minutes);
    dom.manualHoursInput.dataset.dateKey = key;
    dom.manualMinutesInput.dataset.dateKey = key;
    persistAndRender();
  }

  function syncManualInputsIfNeeded(now) {
    const key = getDateKey(now);
    const active = document.activeElement;
    if (active === dom.manualHoursInput || active === dom.manualMinutesInput) {
      return;
    }
    if (dom.manualHoursInput.dataset.dateKey !== key) {
      syncManualInputs(key);
    }
  }

  function syncManualInputs(key) {
    const minutes = clamp(Number(state.manualDailyMinutes[key]) || 0, 0, 1440);
    dom.manualHoursInput.value = String(Math.floor(minutes / 60));
    dom.manualMinutesInput.value = String(minutes % 60);
    dom.manualHoursInput.dataset.dateKey = key;
    dom.manualMinutesInput.dataset.dateKey = key;
  }

  function getManualMinutesForDay(now) {
    return clamp(Number(state.manualDailyMinutes[getDateKey(now)]) || 0, 0, 1440);
  }

  function getDateKey(now) {
    const date = new Date(now);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function getBreakPlan(forceLong = false) {
    const blocks = state.recovery.completedBlocksSinceLongBreak || 0;
    const isLong = forceLong || (blocks > 0 && blocks % state.settings.blocksBeforeLongBreak === 0);
    if (FocusModel.recommendBreakLength) {
      return FocusModel.recommendBreakLength(model, recentSessions(8).reverse(), {
        ...state.settings,
        forceLongBreak: isLong
      });
    }
    return {
      type: isLong ? "long" : "short",
      minutes: isLong ? state.settings.longBreakMinutes : state.settings.shortBreakMinutes,
      confidence: 0.25,
      reason: "Research default"
    };
  }

  function prepareBreakTimer() {
    const plan = getBreakPlan();
    state.breakTimer = {
      status: "ready",
      type: plan.type,
      minutes: plan.minutes,
      totalMs: plan.minutes * 60000,
      remainingMs: plan.minutes * 60000,
      lastStartedAt: null,
      completedAt: null,
      reason: plan.reason
    };

    if (plan.type === "long") {
      state.recovery.completedBlocksSinceLongBreak = 0;
    }
  }

  function startBreak() {
    if (["idle", "completed"].includes(state.breakTimer.status)) {
      const plan = getBreakPlan();
      state.breakTimer = {
        status: "ready",
        type: plan.type,
        minutes: plan.minutes,
        totalMs: plan.minutes * 60000,
        remainingMs: plan.minutes * 60000,
        lastStartedAt: null,
        completedAt: null,
        reason: plan.reason
      };
    }

    state.breakTimer.status = "running";
    state.breakTimer.lastStartedAt = Date.now();
    persistAndRender();
  }

  function toggleBreakPause() {
    if (state.breakTimer.status === "running") {
      state.breakTimer.remainingMs = getBreakRemainingMs(Date.now());
      state.breakTimer.status = "paused";
      state.breakTimer.lastStartedAt = null;
      persistAndRender();
      return;
    }

    if (state.breakTimer.status === "paused") {
      state.breakTimer.status = "running";
      state.breakTimer.lastStartedAt = Date.now();
      persistAndRender();
    }
  }

  function skipBreak() {
    state.breakTimer = createIdleBreakTimer();
    persistAndRender();
  }

  function getBreakRemainingMs(now) {
    if (state.breakTimer.status !== "running") {
      return Math.max(0, state.breakTimer.remainingMs || state.breakTimer.totalMs || 0);
    }

    const elapsed = now - (state.breakTimer.lastStartedAt || now);
    return Math.max(0, (state.breakTimer.remainingMs || state.breakTimer.totalMs || 0) - elapsed);
  }

  function updateBreakCompletion(now) {
    if (state.breakTimer.status === "running" && getBreakRemainingMs(now) <= 0) {
      state.breakTimer.remainingMs = 0;
      state.breakTimer.status = "completed";
      state.breakTimer.completedAt = now;
      state.breakTimer.lastStartedAt = null;
      persist();
    }
  }

  function renderBreak(now, plan) {
    const timer = state.breakTimer;
    const remaining = getBreakRemainingMs(now);
    const total = Math.max(1, timer.totalMs || plan.minutes * 60000);
    const progress = clamp(1 - remaining / total, 0, 1);
    const label = timer.status === "idle" ? "Recommended" : capitalize(timer.type) + " break";

    dom.breakState.textContent = timer.status === "running" ? "Break running" : timer.status === "paused" ? "Break paused" : timer.status === "ready" ? "Break ready" : timer.status === "completed" ? "Break done" : "Break idle";
    dom.breakDisplay.textContent = formatCountdown(timer.status === "idle" ? plan.minutes * 60000 : remaining);
    dom.breakProgressBar.style.width = Math.round(progress * 100) + "%";
    dom.breakAdvice.textContent = label + ": " + (timer.status === "idle" ? plan.minutes : timer.minutes) + "m. " + (timer.status === "completed" ? "Recovery complete." : timer.reason || plan.reason);
    dom.startBreakButton.disabled = timer.status === "running" || timer.status === "paused";
    dom.startBreakButton.textContent = timer.status === "ready" ? "Start break" : "Start suggested";
    dom.pauseBreakButton.disabled = !(timer.status === "running" || timer.status === "paused");
    dom.pauseBreakButton.textContent = timer.status === "paused" ? "Resume" : "Pause";
    dom.skipBreakButton.disabled = timer.status === "idle";
  }

  function capitalize(value) {
    return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
  }

  function recentSessions(limit) {
    return [...state.sessions]
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
      .slice(0, limit);
  }

  function timerLabel() {
    if (state.timer.status === "running") {
      return "Running";
    }
    if (state.timer.status === "paused") {
      return "Paused";
    }
    return "Idle";
  }

  function parseTags(value) {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  function formatPrediction(prediction) {
    if (!prediction) {
      return "After more sessions";
    }

    if (typeof prediction === "string") {
      return prediction;
    }

    if (prediction.label) {
      return prediction.label;
    }

    if (typeof prediction.hour === "number") {
      return formatHour(prediction.hour);
    }

    if (prediction.startHour !== undefined) {
      return `${formatHour(prediction.startHour)} - ${formatHour(prediction.endHour ?? prediction.startHour + 1)}`;
    }

    return "After more sessions";
  }

  function formatHours(hours) {
    if (!Array.isArray(hours) || hours.length === 0) {
      return "No history yet";
    }

    return hours
      .slice(0, 3)
      .map((item) => {
        if (typeof item === "number") {
          return formatHour(item);
        }
        if (typeof item === "string") {
          return item;
        }
        if (typeof item.hour === "number") {
          return formatHour(item.hour);
        }
        return item.label || "";
      })
      .filter(Boolean)
      .join(", ");
  }

  function formatHour(hour) {
    const normalized = ((Number(hour) % 24) + 24) % 24;
    const suffix = normalized >= 12 ? "PM" : "AM";
    const display = normalized % 12 || 12;
    return `${display}${suffix}`;
  }

  function formatClock(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  }

  function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  }

  function formatShortDuration(ms) {
    const totalMinutes = Math.round(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) {
      return `${minutes}m`;
    }
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  function formatGoalHours(minutes) {
    const hours = minutes / 60;
    if (Number.isInteger(hours)) {
      return `${hours}h`;
    }
    return `${hours.toFixed(2).replace(/0$/, "")}h`;
  }

  function formatDuration(ms) {
    return formatShortDuration(ms);
  }

  function scoreValue(session) {
    const scoring = FocusModel.scoreSession(session);
    if (typeof scoring === "number") {
      return scoring;
    }
    return Number(scoring?.score) || 0;
  }

  function roundedRect(context, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + safeRadius, y);
    context.arcTo(x + width, y, x + width, y + height, safeRadius);
    context.arcTo(x + width, y + height, x, y + height, safeRadius);
    context.arcTo(x, y + height, x, y, safeRadius);
    context.arcTo(x, y, x + width, y, safeRadius);
    context.closePath();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function createId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
})();
