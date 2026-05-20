(function () {
  const STORAGE_KEY = "focus-pattern-tracker:v1";
  const CLOUD_SYNC_KEY = "focus-pattern-tracker:cloud-sync:v1";
  const CLOUD_SYNC_TABLE = "focus_user_sync_documents";
  const RING_LENGTH = 678.58;
  const THEME_VALUES = ["light", "dark"];
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
    theme: "light",
    sideTab: "goals",
    settings: { ...DEFAULT_SETTINGS },
    sessions: [],
    timer: createIdleTimer(),
    manualDailyMinutes: {},
    goals: []
  };

  const dom = {};
  let state = structuredClone(defaultState);
  let model = FocusModel.buildModel(state.sessions, modelSettings());
  let tickHandle = null;
  let autoImportHandle = null;
  let syncHandle = null;
  let syncFolder = "";
  let syncStatus = "Local only";
  let syncBusy = false;
  let syncWriteHandle = null;
  let cloudSyncHandle = null;
  let cloudWriteHandle = null;
  let cloudSyncConfig = createEmptyCloudSyncConfig();
  let cloudSyncStatus = "Cloud off";
  let cloudSyncBusy = false;
  let lastCloudSignature = "";
  let lastSyncSignature = "";
  let alarmContext = null;
  let alarmRepeatHandle = null;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindDom();
    bindEvents();
    await hydrateSyncConfig();
    hydrateCloudSyncConfig();
    await hydrateState();
    await syncCloudData();
    await syncData();
    await autoImportData();
    hydrateControls();
    applyTheme(state.theme);
    render();
    tickHandle = window.setInterval(render, 1000);
    autoImportHandle = window.setInterval(autoImportData, 10000);
    syncHandle = window.setInterval(syncData, 10000);
    cloudSyncHandle = window.setInterval(syncCloudData, 15000);
  }

  function bindDom() {
    [
      "modelStatus",
      "themeToggle",
      "timerPanel",
      "timerTitle",
      "timerOrbit",
      "sidePanelTitle",
      "goalsTab",
      "settingsTab",
      "goalsTabPanel",
      "settingsTabPanel",
      "goalForm",
      "goalInput",
      "goalList",
      "clearCompletedGoals",
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
      "dailyPlanBlocks",
      "dailyPlanNextBlock",
      "dailyPlanTotal",
      "clearHistoryButton",
      "importDataButton",
      "exportDataButton",
      "syncStatusText",
      "chooseSyncFolderButton",
      "clearSyncFolderButton",
      "cloudSyncStatusText",
      "cloudSyncUrlInput",
      "cloudSyncKeyInput",
      "cloudSyncEmailInput",
      "cloudSyncCodeInput",
      "cloudSyncIdInput",
      "sendCloudCodeButton",
      "verifyCloudCodeButton",
      "syncCloudNowButton",
      "clearCloudSyncButton",
      "completionOverlay",
      "completionEyebrow",
      "completionTitle",
      "completionMessage",
      "completionConfirmButton"
    ].forEach((id) => {
      dom[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    dom.themeToggle.addEventListener("click", toggleTheme);
    dom.minimizeWindow.addEventListener("click", () => window.focusDesktop?.minimize());
    dom.maximizeWindow.addEventListener("click", () => window.focusDesktop?.maximize());
    dom.closeWindow.addEventListener("click", () => window.focusDesktop?.close());

    dom.goalsTab.addEventListener("click", () => setActiveSideTab("goals"));
    dom.settingsTab.addEventListener("click", () => setActiveSideTab("settings"));
    dom.goalForm.addEventListener("submit", addGoal);
    dom.clearCompletedGoals.addEventListener("click", clearCompletedGoals);
    dom.goalList.addEventListener("change", handleGoalListChange);
    dom.goalList.addEventListener("click", handleGoalListClick);

    dom.startButton.addEventListener("click", () => startFocusTimer());
    dom.pauseButton.addEventListener("click", togglePause);
    dom.finishButton.addEventListener("click", finishTimer);
    dom.completionConfirmButton.addEventListener("click", confirmTimerCompletion);
    dom.resetButton.addEventListener("click", resetTimer);
    dom.clearHistoryButton.addEventListener("click", (event) => {
      event.stopPropagation();
      clearHistory();
    });
    dom.importDataButton.addEventListener("click", (event) => {
      event.stopPropagation();
      importData();
    });
    dom.exportDataButton.addEventListener("click", (event) => {
      event.stopPropagation();
      exportData();
    });
    dom.chooseSyncFolderButton.addEventListener("click", chooseSyncFolder);
    dom.clearSyncFolderButton.addEventListener("click", clearSyncFolder);
    dom.sendCloudCodeButton.addEventListener("click", sendCloudLoginCode);
    dom.verifyCloudCodeButton.addEventListener("click", verifyCloudLoginCode);
    dom.syncCloudNowButton.addEventListener("click", () => syncCloudData({ force: true }));
    dom.clearCloudSyncButton.addEventListener("click", clearCloudSyncSettings);

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
      persist(true);
      if (tickHandle) {
        window.clearInterval(tickHandle);
      }
      if (autoImportHandle) {
        window.clearInterval(autoImportHandle);
      }
      if (syncHandle) {
        window.clearInterval(syncHandle);
      }
      if (syncWriteHandle) {
        window.clearTimeout(syncWriteHandle);
      }
      if (cloudSyncHandle) {
        window.clearInterval(cloudSyncHandle);
      }
      if (cloudWriteHandle) {
        window.clearTimeout(cloudWriteHandle);
      }
    });
  }

  function hydrateControls() {
    dom.dailyGoalInput.value = String(state.settings.dailyGoalMinutes / 60);
    dom.blockGoalInput.value = String(state.settings.blockGoalMinutes);
    syncManualInputs(getDateKey(Date.now()));
    syncFormFromTimer();
    setActiveSideTab(state.sideTab);
  }

  function startFocusTimer(goalMinutes = null) {
    const now = Date.now();
    const dailyPlan = getDailyPlan(now);
    const nextGoalMinutes = goalMinutes || dailyPlan.nextBlockMinutes || FocusModel.recommendBlockLength(model, recentSessions(8).reverse()) || state.settings.blockGoalMinutes;

    startTimer({
      mode: "focus",
      goalMinutes: nextGoalMinutes
    });
  }

  function startBreakTimer(breakPlan) {
    const plan = breakPlan && Number.isFinite(breakPlan.minutes) ? breakPlan : getRecommendedBreakPlan({ includeCurrentFocus: false });

    startTimer({
      mode: "break",
      goalMinutes: plan.minutes,
      breakType: plan.type
    });
  }

  function startTimer(options = {}) {
    const now = Date.now();
    const mode = options.mode === "break" ? "break" : "focus";
    const goalMinutes = clamp(
      Math.round(Number(options.goalMinutes) || (mode === "break" ? state.settings.shortBreakMinutes : state.settings.blockGoalMinutes)),
      mode === "break" ? 1 : 5,
      mode === "break" ? 60 : 180
    );

    if (mode === "focus") {
      readTimerFormIntoState();
    }

    state.timer = {
      id: createId(),
      status: "running",
      mode,
      breakType: mode === "break" ? options.breakType || "short" : null,
      title: mode === "focus" ? dom.taskInput.value.trim() : state.timer.title || dom.taskInput.value.trim(),
      project: mode === "focus" ? dom.projectInput.value.trim() : state.timer.project || dom.projectInput.value.trim(),
      tags: mode === "focus" ? parseTags(dom.tagsInput.value) : state.timer.tags || parseTags(dom.tagsInput.value),
      startedAt: now,
      lastResumedAt: now,
      activeMs: 0,
      pausedMs: 0,
      pauseStartedAt: null,
      pauseCount: 0,
      focusRating: Number(dom.focusInput.value),
      energy: Number(dom.energyInput.value),
      goalMinutes,
      completedAt: null
    };

    ensureAlarmReady();
    clearCompletionAlert();
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
      ensureAlarmReady();
      persistAndRender();
    }
  }

  function finishTimer() {
    if (state.timer.status === "idle") {
      return;
    }

    if (state.timer.status === "complete") {
      confirmTimerCompletion();
      return;
    }

    markTimerComplete(Date.now(), true);
    persistAndRender();
  }

  function resetTimer() {
    state.timer = createIdleTimer();
    clearCompletionAlert();
    syncFormFromTimer();
    persistAndRender();
  }

  function checkTimerCompletion(now) {
    if (state.timer.status !== "running") {
      return false;
    }

    if (getCurrentActiveMs() < getTimerGoalMs()) {
      return false;
    }

    markTimerComplete(now, false);
    persist();
    return true;
  }

  function markTimerComplete(now, allowEarly) {
    if (!["running", "paused"].includes(state.timer.status)) {
      return;
    }

    if ((state.timer.mode || "focus") === "focus") {
      readTimerFormIntoState();
    }

    state.timer.activeMs = allowEarly ? getCurrentActiveMs() : getTimerGoalMs();
    state.timer.pausedMs = getCurrentPausedMs();
    state.timer.status = "complete";
    state.timer.completedAt = now;
    state.timer.lastResumedAt = null;
    state.timer.pauseStartedAt = null;
    triggerCompletionAlert();
  }

  function confirmTimerCompletion() {
    if (state.timer.status !== "complete") {
      return;
    }

    const completedMode = state.timer.mode || "focus";
    clearCompletionAlert();

    if (completedMode === "break") {
      startFocusTimer();
      return;
    }

    const session = createSessionFromTimer();
    if (session.activeMs >= 1000) {
      state.sessions.push(session);
      state.sessions = state.sessions.slice(-600);
    }

    rebuildModel();
    startBreakTimer(getRecommendedBreakPlan({ includeCurrentFocus: false, completedAt: session.endedAt, currentBlockMinutes: session.goalMinutes }));
  }

  function createSessionFromTimer() {
    const endedAt = state.timer.completedAt || Date.now();
    const startedAt = state.timer.startedAt || endedAt;
    return {
      id: state.timer.id || createId(),
      title: state.timer.title || "Untitled focus block",
      project: state.timer.project || "General",
      tags: state.timer.tags || [],
      startedAt,
      endedAt,
      durationMs: Math.max(0, endedAt - startedAt),
      activeMs: Math.max(0, state.timer.activeMs || 0),
      pausedMs: Math.max(0, state.timer.pausedMs || 0),
      pauseCount: state.timer.pauseCount || 0,
      focusRating: state.timer.focusRating,
      energy: state.timer.energy,
      goalMinutes: state.timer.goalMinutes
    };
  }

  function getRecommendedBreakPlan(options = {}) {
    const completedAt = options.completedAt || Date.now();
    const completedBlocks = getCompletedFocusBlocksToday(completedAt) + (options.includeCurrentFocus ? 1 : 0);
    const blocksBeforeLongBreak = Math.max(1, Number(state.settings.blocksBeforeLongBreak) || DEFAULT_SETTINGS.blocksBeforeLongBreak);
    const forceLongBreak = completedBlocks > 0 && completedBlocks % blocksBeforeLongBreak === 0;
    const currentBlockMinutes = Number(options.currentBlockMinutes || state.timer.goalMinutes || state.settings.blockGoalMinutes);

    if (FocusModel.recommendBreakLength) {
      return FocusModel.recommendBreakLength(model, recentSessions(8).reverse(), {
        ...state.settings,
        currentBlockMinutes,
        forceLongBreak
      });
    }

    return {
      type: forceLongBreak ? "long" : "short",
      minutes: forceLongBreak ? state.settings.longBreakMinutes : state.settings.shortBreakMinutes,
      confidence: 0.25,
      reason: "Research default"
    };
  }

  function getCompletedFocusBlocksToday(now) {
    const day = new Date(now);
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    const end = start + 86400000;

    return state.sessions.filter((session) => session.startedAt >= start && session.startedAt < end).length;
  }

  function getTimerGoalMs() {
    return Math.max(1000, (Number(state.timer.goalMinutes) || state.settings.blockGoalMinutes) * 60000);
  }

  function triggerCompletionAlert() {
    syncCompletionOverlay();
    document.body.classList.add("timer-alerting");
    if (dom.timerPanel) {
      dom.timerPanel.classList.remove("timer-shake");
      void dom.timerPanel.offsetWidth;
      dom.timerPanel.classList.add("timer-shake");
    }
    playCompletionAlarm();
    window.focusDesktop?.prioritize?.();
    dom.completionConfirmButton?.focus({ preventScroll: true });
  }

  function clearCompletionAlert() {
    stopCompletionAlarm();
    document.body.classList.remove("timer-alerting");
    dom.timerPanel?.classList.remove("timer-shake");
    if (dom.completionOverlay) {
      dom.completionOverlay.hidden = true;
    }
  }

  function syncCompletionOverlay() {
    if (!dom.completionOverlay) {
      return;
    }

    if (state.timer.status !== "complete") {
      dom.completionOverlay.hidden = true;
      return;
    }

    const mode = state.timer.mode === "break" ? "break" : "focus";
    dom.completionOverlay.hidden = false;

    if (mode === "break") {
      const nextGoal = getNextFocusMinutes();
      dom.completionEyebrow.textContent = "Break complete";
      dom.completionTitle.textContent = "Break time is up";
      dom.completionMessage.textContent = "Confirm to start the next " + nextGoal + "m focus block.";
      dom.completionConfirmButton.textContent = "Start " + nextGoal + "m focus";
      return;
    }

    const breakPlan = getRecommendedBreakPlan({ includeCurrentFocus: true });
    const breakLabel = breakPlan.type === "long" ? "long break" : "break";
    dom.completionEyebrow.textContent = "Focus complete";
    dom.completionTitle.textContent = "Focus block complete";
    dom.completionMessage.textContent = "Confirm finish to start a " + breakPlan.minutes + "m " + breakLabel + ".";
    dom.completionConfirmButton.textContent = "Start " + breakPlan.minutes + "m " + (breakPlan.type === "long" ? "long break" : "break");
  }

  function getNextFocusMinutes() {
    const dailyPlan = getDailyPlan(Date.now());
    return Math.round(dailyPlan.nextBlockMinutes || FocusModel.recommendBlockLength(model, recentSessions(8).reverse()) || model.suggestedGoalMinutes || state.settings.blockGoalMinutes);
  }

  function ensureAlarmReady() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        return null;
      }
      if (!alarmContext) {
        alarmContext = new AudioContext();
      }
      if (alarmContext.state === "suspended") {
        alarmContext.resume().catch(() => {});
      }
      return alarmContext;
    } catch (error) {
      console.warn("Unable to prepare timer alarm", error);
      return null;
    }
  }

  function playCompletionAlarm() {
    if (alarmRepeatHandle) {
      return;
    }

    playAlarmPattern();
    alarmRepeatHandle = window.setInterval(playAlarmPattern, 2600);
  }

  function stopCompletionAlarm() {
    if (alarmRepeatHandle) {
      window.clearInterval(alarmRepeatHandle);
      alarmRepeatHandle = null;
    }
  }

  function playAlarmPattern() {
    const context = ensureAlarmReady();
    if (!context) {
      return;
    }

    const startAt = context.currentTime + 0.03;
    [0, 0.24, 0.48, 0.72, 1.04, 1.28].forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = startAt + offset;

      oscillator.type = index % 2 === 0 ? "square" : "sawtooth";
      oscillator.frequency.setValueAtTime(index % 2 === 0 ? 980 : 740, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
    });
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

  async function exportData() {
    if (!window.focusDesktop?.exportData) {
      window.alert("Export is only available in the desktop app.");
      return;
    }

    try {
      setTransferButtonsDisabled(true);
      const result = await window.focusDesktop.exportData(structuredClone(state));
      if (!result || result.canceled) {
        return;
      }
      if (result.ok === false) {
        window.alert("Could not export focus data: " + (result.error || "Unknown error"));
        return;
      }
      window.alert("Focus data exported to:\n" + result.path);
    } catch (error) {
      window.alert("Could not export focus data: " + error.message);
    } finally {
      setTransferButtonsDisabled(false);
    }
  }

  async function importData() {
    if (!window.focusDesktop?.importData) {
      window.alert("Import is only available in the desktop app.");
      return;
    }

    try {
      setTransferButtonsDisabled(true);
      const result = await window.focusDesktop.importData();
      if (!result || result.canceled) {
        return;
      }
      if (result.ok === false || !result.state) {
        window.alert("Could not import focus data: " + (result.error || "No saved state found in that file"));
        return;
      }

      const importedState = normalizeState(result.state);
      const merge = mergeImportedState(state, importedState);
      if (!merge.addedSessions && !merge.addedGoals && !merge.updatedManualDays) {
        window.alert("No new focus data found in that backup.");
        return;
      }

      state = merge.state;
      rebuildModel();
      hydrateControls();
      persistAndRender();
      window.alert("Imported " + merge.addedSessions + " sessions, " + merge.addedGoals + " goals, and " + merge.updatedManualDays + " manual day entries.");
    } catch (error) {
      window.alert("Could not import focus data: " + error.message);
    } finally {
      setTransferButtonsDisabled(false);
    }
  }

  async function autoImportData() {
    if (!window.focusDesktop?.autoImportData) {
      return;
    }

    try {
      const result = await window.focusDesktop.autoImportData();
      if (result?.ok === false) {
        console.warn("Unable to auto-import focus data", result.error);
        return;
      }

      let nextState = state;
      let addedSessions = 0;
      let addedGoals = 0;
      let updatedManualDays = 0;

      (result?.imports || []).forEach((item) => {
        const merge = mergeImportedState(nextState, normalizeState(item.state));
        nextState = merge.state;
        addedSessions += merge.addedSessions;
        addedGoals += merge.addedGoals;
        updatedManualDays += merge.updatedManualDays;
      });

      if (addedSessions || addedGoals || updatedManualDays) {
        state = nextState;
        rebuildModel();
        persist(true);
        console.info("Auto-imported focus data", { addedSessions, addedGoals, updatedManualDays });
      }
    } catch (error) {
      console.warn("Unable to auto-import focus data", error);
    }
  }

  function createEmptyCloudSyncConfig() {
    return { url: "", anonKey: "", email: "", accessToken: "", refreshToken: "", userId: "", syncId: "" };
  }

  function hydrateCloudSyncConfig() {
    cloudSyncConfig = loadCloudSyncConfig();
    cloudSyncStatus = isCloudSyncConfigured() ? "Cloud ready" : "Cloud off";
    syncCloudInputs();
  }

  function loadCloudSyncConfig() {
    try {
      const raw = window.localStorage.getItem(CLOUD_SYNC_KEY);
      if (!raw) {
        return createEmptyCloudSyncConfig();
      }

      const parsed = JSON.parse(raw);
      return {
        url: normalizeCloudUrl(parsed.url),
        anonKey: String(parsed.anonKey || "").trim(),
        email: normalizeEmail(parsed.email),
        accessToken: String(parsed.accessToken || ""),
        refreshToken: String(parsed.refreshToken || ""),
        userId: String(parsed.userId || ""),
        syncId: normalizeSyncId(parsed.syncId)
      };
    } catch (error) {
      console.warn("Unable to load cloud sync config", error);
      return createEmptyCloudSyncConfig();
    }
  }

  function persistCloudSyncConfig() {
    window.localStorage.setItem(CLOUD_SYNC_KEY, JSON.stringify(cloudSyncConfig));
  }

  function syncCloudInputs() {
    if (!dom.cloudSyncUrlInput) {
      return;
    }

    dom.cloudSyncUrlInput.value = cloudSyncConfig.url || "";
    dom.cloudSyncKeyInput.value = cloudSyncConfig.anonKey || "";
    if (dom.cloudSyncEmailInput) {
      dom.cloudSyncEmailInput.value = cloudSyncConfig.email || "";
    }
    if (dom.cloudSyncIdInput) {
      dom.cloudSyncIdInput.value = cloudSyncConfig.syncId || "";
    }
    if (dom.cloudSyncCodeInput) {
      dom.cloudSyncCodeInput.value = "";
    }
    updateCloudSyncStatus();
  }

  async function sendCloudLoginCode() {
    cloudSyncConfig = {
      ...cloudSyncConfig,
      url: normalizeCloudUrl(dom.cloudSyncUrlInput.value),
      anonKey: String(dom.cloudSyncKeyInput.value || "").trim(),
      email: normalizeEmail(dom.cloudSyncEmailInput.value)
    };

    if (!cloudSyncConfig.url || !cloudSyncConfig.anonKey || !cloudSyncConfig.email) {
      window.alert("Cloud sign in needs a Supabase URL, anon key, and email.");
      return;
    }

    try {
      cloudSyncStatus = "Sending code";
      updateCloudSyncStatus();
      const response = await fetch(cloudSyncConfig.url + "/auth/v1/otp", {
        method: "POST",
        headers: {
          apikey: cloudSyncConfig.anonKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email: cloudSyncConfig.email, create_user: true })
      });

      if (!response.ok) {
        throw new Error("Code request failed: " + response.status);
      }

      persistCloudSyncConfig();
      cloudSyncStatus = "Code sent";
      updateCloudSyncStatus();
    } catch (error) {
      cloudSyncStatus = "Cloud error";
      updateCloudSyncStatus();
      window.alert("Could not send login code: " + error.message);
    }
  }

  async function verifyCloudLoginCode() {
    cloudSyncConfig = {
      ...cloudSyncConfig,
      url: normalizeCloudUrl(dom.cloudSyncUrlInput.value),
      anonKey: String(dom.cloudSyncKeyInput.value || "").trim(),
      email: normalizeEmail(dom.cloudSyncEmailInput.value)
    };
    const token = String(dom.cloudSyncCodeInput.value || "").trim();

    if (!cloudSyncConfig.url || !cloudSyncConfig.anonKey || !cloudSyncConfig.email || !token) {
      window.alert("Enter the Supabase details, email, and login code.");
      return;
    }

    try {
      cloudSyncStatus = "Signing in";
      updateCloudSyncStatus();
      const response = await fetch(cloudSyncConfig.url + "/auth/v1/verify", {
        method: "POST",
        headers: {
          apikey: cloudSyncConfig.anonKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email: cloudSyncConfig.email, token, type: "email" })
      });

      if (!response.ok) {
        throw new Error("Sign in failed: " + response.status);
      }

      const payload = await response.json();
      cloudSyncConfig = {
        ...cloudSyncConfig,
        accessToken: payload.access_token || "",
        refreshToken: payload.refresh_token || "",
        userId: payload.user?.id || "",
        syncId: payload.user?.id || cloudSyncConfig.syncId || generateSyncIdValue()
      };

      if (!cloudSyncConfig.accessToken || !cloudSyncConfig.userId) {
        throw new Error("Supabase did not return a session.");
      }

      persistCloudSyncConfig();
      cloudSyncStatus = "Signed in";
      syncCloudInputs();
      await syncCloudData({ force: true });
      render();
    } catch (error) {
      cloudSyncStatus = "Cloud error";
      updateCloudSyncStatus();
      window.alert("Could not sign in: " + error.message);
    }
  }

  function clearCloudSyncSettings() {
    cloudSyncConfig = createEmptyCloudSyncConfig();
    lastCloudSignature = "";
    cloudSyncStatus = "Cloud off";
    try {
      window.localStorage.removeItem(CLOUD_SYNC_KEY);
    } catch (error) {
      console.warn("Unable to clear cloud sync config", error);
    }
    syncCloudInputs();
  }

  async function syncCloudData(options = {}) {
    if (cloudSyncBusy || !isCloudSyncConfigured()) {
      updateCloudSyncStatus();
      return;
    }

    cloudSyncBusy = true;
    cloudSyncStatus = "Cloud syncing";
    updateCloudSyncStatus();

    try {
      const remoteState = await readCloudState();
      let changed = false;
      if (remoteState) {
        const merge = mergeImportedState(state, normalizeState(remoteState));
        if (merge.addedSessions || merge.addedGoals || merge.updatedManualDays) {
          state = merge.state;
          changed = true;
          rebuildModel();
        }
      }

      const snapshot = createSyncSnapshot();
      const signature = snapshotSignature(snapshot);
      if (options.force || changed || signature !== lastCloudSignature || !remoteState) {
        await writeCloudState(snapshot);
        lastCloudSignature = signature;
      }

      if (changed) {
        persist(true);
        hydrateControls();
        render();
      }

      cloudSyncStatus = "Cloud synced";
    } catch (error) {
      cloudSyncStatus = "Cloud error";
      console.warn("Unable to sync cloud data", error);
    } finally {
      cloudSyncBusy = false;
      updateCloudSyncStatus();
    }
  }

  async function readCloudState() {
    const url = cloudApiUrl() + "?user_id=eq." + encodeURIComponent(cloudSyncConfig.userId) + "&select=payload";
    const response = await fetch(url, { headers: cloudHeaders() });
    if (!response.ok) {
      throw new Error("Cloud read failed: " + response.status);
    }

    const rows = await response.json();
    const payload = Array.isArray(rows) && rows[0] ? rows[0].payload : null;
    return payload && typeof payload === "object" && "state" in payload ? payload.state : payload;
  }

  async function writeCloudState(snapshot) {
    const response = await fetch(cloudApiUrl(), {
      method: "POST",
      headers: {
        ...cloudHeaders(),
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify({
        user_id: cloudSyncConfig.userId,
        payload: { version: 1, updatedAt: new Date().toISOString(), state: snapshot },
        updated_at: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error("Cloud write failed: " + response.status);
    }
  }

  function queueCloudSyncWrite() {
    if (!isCloudSyncConfigured() || cloudSyncBusy) {
      return;
    }

    cloudSyncStatus = "Cloud syncing";
    updateCloudSyncStatus();
    if (cloudWriteHandle) {
      window.clearTimeout(cloudWriteHandle);
    }

    cloudWriteHandle = window.setTimeout(() => {
      cloudWriteHandle = null;
      syncCloudData();
    }, 500);
  }

  function isCloudSyncConfigured() {
    return Boolean(cloudSyncConfig.url && cloudSyncConfig.anonKey && cloudSyncConfig.accessToken && cloudSyncConfig.userId);
  }

  function cloudApiUrl() {
    return cloudSyncConfig.url + "/rest/v1/" + CLOUD_SYNC_TABLE;
  }

  function cloudHeaders() {
    return {
      apikey: cloudSyncConfig.anonKey,
      Authorization: "Bearer " + cloudSyncConfig.accessToken
    };
  }

  function normalizeCloudUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeSyncId(value) {
    return String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  }

  function generateSyncIdValue() {
    if (window.crypto?.randomUUID) {
      return "focus-" + window.crypto.randomUUID();
    }

    return "focus-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }

  function updateCloudSyncStatus() {
    if (!dom.cloudSyncStatusText) {
      return;
    }

    dom.cloudSyncStatusText.textContent = isCloudSyncConfigured() ? cloudSyncStatus : "Off";
    dom.syncCloudNowButton.disabled = !isCloudSyncConfigured();
    dom.clearCloudSyncButton.disabled = !isCloudSyncConfigured();
  }

  function cloudSyncSummary() {
    return isCloudSyncConfigured() ? " + cloud sync" : "";
  }

  async function hydrateSyncConfig() {
    if (!window.focusDesktop?.getSyncConfig) {
      syncFolder = "";
      syncStatus = "Local only";
      return;
    }

    try {
      const result = await window.focusDesktop.getSyncConfig();
      syncFolder = result?.folder || "";
      syncStatus = syncFolder ? "Sync ready" : "Local only";
    } catch (error) {
      syncFolder = "";
      syncStatus = "Sync unavailable";
      console.warn("Unable to load sync config", error);
    }
  }

  async function chooseSyncFolder() {
    if (!window.focusDesktop?.chooseSyncFolder) {
      window.alert("Folder sync is only available in the desktop app.");
      return;
    }

    const result = await window.focusDesktop.chooseSyncFolder();
    if (!result || result.canceled) {
      return;
    }
    if (result.ok === false) {
      window.alert("Could not set sync folder: " + (result.error || "Unknown error"));
      return;
    }

    syncFolder = result.folder || "";
    syncStatus = syncFolder ? "Sync ready" : "Local only";
    updateSyncStatus();
    await syncData();
    render();
  }

  async function clearSyncFolder() {
    if (!window.focusDesktop?.clearSyncFolder) {
      return;
    }

    const result = await window.focusDesktop.clearSyncFolder();
    if (result?.ok === false) {
      window.alert("Could not clear sync folder: " + (result.error || "Unknown error"));
      return;
    }

    syncFolder = "";
    syncStatus = "Local only";
    lastSyncSignature = "";
    updateSyncStatus();
    render();
  }

  async function syncData() {
    if (syncBusy || !syncFolder || !window.focusDesktop?.readSyncData || !window.focusDesktop?.writeSyncData) {
      updateSyncStatus();
      return;
    }

    syncBusy = true;
    try {
      const result = await window.focusDesktop.readSyncData();
      if (result?.ok === false) {
        syncStatus = "Sync error";
        console.warn("Unable to read sync data", result.error);
        return;
      }

      let changed = false;
      if (result?.state) {
        const merge = mergeImportedState(state, normalizeState(result.state));
        if (merge.addedSessions || merge.addedGoals || merge.updatedManualDays) {
          state = merge.state;
          changed = true;
          rebuildModel();
        }
      }

      const snapshot = createSyncSnapshot();
      const signature = snapshotSignature(snapshot);
      if (changed || signature !== lastSyncSignature || !result?.state) {
        const writeResult = await window.focusDesktop.writeSyncData(snapshot);
        if (writeResult?.ok === false) {
          syncStatus = "Sync error";
          console.warn("Unable to write sync data", writeResult.error);
          return;
        }
        lastSyncSignature = signature;
      }

      if (changed) {
        persist(true);
        hydrateControls();
        render();
      }

      syncStatus = "Synced";
    } catch (error) {
      syncStatus = "Sync error";
      console.warn("Unable to sync focus data", error);
    } finally {
      syncBusy = false;
      updateSyncStatus();
    }
  }

  function queueSyncWrite() {
    if (!syncFolder || syncBusy || !window.focusDesktop?.readSyncData || !window.focusDesktop?.writeSyncData) {
      return;
    }

    syncStatus = "Syncing";
    updateSyncStatus();
    if (syncWriteHandle) {
      window.clearTimeout(syncWriteHandle);
    }

    syncWriteHandle = window.setTimeout(() => {
      syncWriteHandle = null;
      syncData();
    }, 350);
  }

  function createSyncSnapshot(source = state) {
    return {
      ...structuredClone(source),
      timer: createIdleTimer()
    };
  }

  function snapshotSignature(snapshot) {
    return JSON.stringify({
      sessions: snapshot.sessions || [],
      manualDailyMinutes: snapshot.manualDailyMinutes || {},
      goals: snapshot.goals || [],
      settings: snapshot.settings || {}
    });
  }

  function updateSyncStatus() {
    if (!dom.syncStatusText) {
      return;
    }

    dom.syncStatusText.textContent = syncFolder ? syncStatus : "Local only";
    dom.syncStatusText.title = syncFolder || "No sync folder selected";
    if (dom.clearSyncFolderButton) {
      dom.clearSyncFolderButton.disabled = !syncFolder;
    }
  }

  function syncSummary() {
    return syncFolder ? " + synced folder" : "";
  }

  function mergeImportedState(currentState, importedState) {
    const merged = structuredClone(currentState);
    const sessions = new Map();
    normalizeSessions(currentState.sessions).forEach((session) => {
      sessions.set(sessionKey(session), session);
    });

    let addedSessions = 0;
    normalizeSessions(importedState.sessions).forEach((session) => {
      const key = sessionKey(session);
      if (!sessions.has(key)) {
        sessions.set(key, session);
        addedSessions += 1;
      }
    });

    merged.sessions = Array.from(sessions.values())
      .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))
      .slice(-600);

    const goals = new Map();
    normalizeGoals(currentState.goals).forEach((goal) => {
      goals.set(goalKey(goal), goal);
    });

    let addedGoals = 0;
    normalizeGoals(importedState.goals).forEach((goal) => {
      const key = goalKey(goal);
      if (!goals.has(key)) {
        goals.set(key, goal);
        addedGoals += 1;
      }
    });

    merged.goals = Array.from(goals.values()).slice(-80);
    merged.manualDailyMinutes = { ...normalizeManualDailyMinutes(currentState.manualDailyMinutes) };

    let updatedManualDays = 0;
    Object.entries(normalizeManualDailyMinutes(importedState.manualDailyMinutes)).forEach(([key, minutes]) => {
      const currentMinutes = Number(merged.manualDailyMinutes[key]) || 0;
      if (minutes > currentMinutes) {
        merged.manualDailyMinutes[key] = minutes;
        updatedManualDays += 1;
      }
    });

    return { state: merged, addedSessions, addedGoals, updatedManualDays };
  }

  function sessionKey(session) {
    if (session.id) {
      return "id:" + session.id;
    }

    return [
      session.startedAt,
      session.endedAt,
      session.title,
      session.project,
      session.activeMs
    ].join("|");
  }

  function goalKey(goal) {
    return String(goal.text || "").trim().toLowerCase() + "|" + String(goal.createdAt || "");
  }

  function setTransferButtonsDisabled(disabled) {
    if (dom.importDataButton) {
      dom.importDataButton.disabled = disabled;
    }
    if (dom.exportDataButton) {
      dom.exportDataButton.disabled = disabled;
    }
  }

  function render() {
    const now = Date.now();
    checkTimerCompletion(now);

    const activeMs = getCurrentActiveMs();
    const pausedMs = getCurrentPausedMs();
    const blockGoalMs = getTimerGoalMs();
    const blockProgress = clamp(activeMs / blockGoalMs, 0, 1);
    const displayMs = state.timer.status === "idle" ? 0 : Math.max(0, blockGoalMs - activeMs);
    const timerMode = state.timer.mode === "break" ? "break" : "focus";
    const sessionsForToday = getSessionsWithCurrentTimer(now);
    const today = FocusModel.summarizeToday(sessionsForToday, now);
    const trackedActiveMs = today.activeMs || today.totalActiveMs || 0;
    const manualMinutes = getManualMinutesForDay(now);
    const manualMs = manualMinutes * 60000;
    const todayActiveMs = trackedActiveMs + manualMs;
    const todayCount = today.sessionCount || today.sessions || 0;
    const dayGoalMs = Math.max(1, state.settings.dailyGoalMinutes * 60000);
    const dayProgress = clamp(todayActiveMs / dayGoalMs, 0, 1);
    const dailyPlan = getDailyPlan(now, todayActiveMs);
    const prediction = FocusModel.predictNextFocusWindow(model, new Date(now));
    const recommendation = FocusModel.recommendBlockLength(model, recentSessions(8).reverse());

    updateThemeToggle();
    dom.timerTitle.textContent = timerMode === "break" ? "Break timer" : "Deep work timer";
    dom.timerDisplay.textContent = formatClock(displayMs);
    dom.timerState.textContent = timerLabel();
    dom.pauseButton.querySelector("span").textContent = state.timer.status === "paused" ? "Resume" : "Pause";
    dom.finishButton.querySelector("span").textContent = state.timer.status === "complete" ? "Confirm" : timerMode === "break" ? "End break" : "Finish";
    dom.blockProgressText.textContent = state.timer.status === "idle"
      ? "0% of block"
      : `${Math.round(blockProgress * 100)}% of ${timerMode === "break" ? "break" : "block"}`;
    dom.blockProgressRing.style.strokeDashoffset = String(RING_LENGTH - RING_LENGTH * blockProgress);
    dom.timerOrbit.dataset.mode = timerMode;

    dom.startButton.disabled = state.timer.status !== "idle";
    dom.pauseButton.disabled = state.timer.status === "idle" || state.timer.status === "complete";
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
    dom.manualCreditText.textContent = `${formatShortDuration(manualMs)} added`;
    renderDailyPlan(dailyPlan);
    syncManualInputsIfNeeded(now);
    renderGoals();
    dom.sessionCountToday.textContent = String(todayCount);
    dom.streakDays.textContent = `${model.streakDays || 0}d`;
    dom.averageScore.textContent = `${Math.round(model.averageFocusScore || 0)}`;
    dom.nextWindow.textContent = model.sessionCount ? formatPrediction(prediction) : "After first session";
    dom.recommendedBlock.textContent = `${Math.round(dailyPlan.nextBlockMinutes || recommendation || model.suggestedGoalMinutes || state.settings.blockGoalMinutes)}m`;
    dom.bestHours.textContent = model.sessionCount ? formatHours(model.bestHours) : "No history yet";
    dom.riskHours.textContent = model.sessionCount ? formatHours(model.riskHours) : "No history yet";
    dom.modelStatus.textContent = String(state.sessions.length) + " sessions saved in local database" + syncSummary() + cloudSyncSummary();
    updateSyncStatus();
    updateCloudSyncStatus();

    drawPatternCanvas();
    renderSessions();

    document.body.dataset.paused = pausedMs > 0 && state.timer.status === "paused" ? "true" : "false";
    syncCompletionOverlay();
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
    const colors = getThemeColors();

    context.fillStyle = colors.canvasBg;
    context.fillRect(0, 0, cssWidth, cssHeight);

    context.strokeStyle = colors.canvasLine;
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
      gradient.addColorStop(0, score >= 70 ? colors.green : score >= 52 ? colors.blue : colors.coral);
      gradient.addColorStop(1, colors.chartShadow);
      roundedRect(context, x, y, barWidth, barHeight, 5);
      context.fillStyle = gradient;
      context.fill();
    });

    context.fillStyle = colors.muted;
    context.font = "700 11px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    [0, 6, 12, 18, 23].forEach((hour) => {
      const x = padding.left + hour * (barWidth + barGap) + barWidth / 2;
      context.fillText(formatHour(hour), x, cssHeight - 12);
    });

    context.fillStyle = colors.ink;
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

  function renderDailyPlan(plan) {
    if (plan.goalMet) {
      dom.dailyPlanBlocks.textContent = "Done";
      dom.dailyPlanNextBlock.textContent = "0m";
      dom.dailyPlanTotal.textContent = "Goal met";
      return;
    }

    dom.dailyPlanBlocks.textContent = String(plan.blocksRemaining);
    dom.dailyPlanNextBlock.textContent = `${plan.nextBlockMinutes}m`;
    dom.dailyPlanTotal.textContent = formatPlanMinutes(plan.totalPlanMinutes);
  }

  function renderGoals() {
    const goals = state.goals || [];
    const completedCount = goals.filter((goal) => goal.completed).length;
    dom.clearCompletedGoals.disabled = completedCount === 0;

    if (goals.length === 0) {
      dom.goalList.innerHTML = `<li class="goal-empty">No goals yet.</li>`;
      return;
    }

    dom.goalList.innerHTML = goals
      .map((goal) => `
        <li class="goal-item${goal.completed ? " completed" : ""}">
          <label>
            <input type="checkbox" data-goal-id="${escapeHtml(goal.id)}"${goal.completed ? " checked" : ""}>
            <span>${escapeHtml(goal.text)}</span>
          </label>
          <button class="icon-button small remove-goal" type="button" data-goal-id="${escapeHtml(goal.id)}" aria-label="Remove goal" title="Remove goal">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>
          </button>
        </li>
      `)
      .join("");
  }

  function setActiveSideTab(tab) {
    const activeTab = tab === "settings" ? "settings" : "goals";
    state.sideTab = activeTab;
    dom.sidePanelTitle.textContent = activeTab === "settings" ? "Settings" : "Goals";

    const isGoals = activeTab === "goals";
    dom.goalsTab.classList.toggle("active", isGoals);
    dom.settingsTab.classList.toggle("active", !isGoals);
    dom.goalsTab.setAttribute("aria-selected", String(isGoals));
    dom.settingsTab.setAttribute("aria-selected", String(!isGoals));
    dom.goalsTabPanel.hidden = !isGoals;
    dom.settingsTabPanel.hidden = isGoals;
    dom.goalsTabPanel.classList.toggle("active", isGoals);
    dom.settingsTabPanel.classList.toggle("active", !isGoals);
    persist();
  }

  function addGoal(event) {
    event.preventDefault();
    const text = dom.goalInput.value.trim();
    if (!text) {
      return;
    }

    state.goals.unshift({
      id: createId(),
      text,
      completed: false,
      createdAt: Date.now()
    });
    state.goals = state.goals.slice(0, 80);
    dom.goalInput.value = "";
    persistAndRender();
  }

  function handleGoalListChange(event) {
    const input = event.target.closest("input[type='checkbox'][data-goal-id]");
    if (!input) {
      return;
    }

    const goal = state.goals.find((item) => item.id === input.dataset.goalId);
    if (!goal) {
      return;
    }

    goal.completed = input.checked;
    goal.completedAt = input.checked ? Date.now() : null;
    persistAndRender();
  }

  function handleGoalListClick(event) {
    const button = event.target.closest(".remove-goal[data-goal-id]");
    if (!button) {
      return;
    }

    state.goals = state.goals.filter((goal) => goal.id !== button.dataset.goalId);
    persistAndRender();
  }

  function clearCompletedGoals() {
    state.goals = state.goals.filter((goal) => !goal.completed);
    persistAndRender();
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
    if (state.timer.status === "idle" || state.timer.mode === "break") {
      return state.sessions;
    }

    return state.sessions.concat({
      id: state.timer.id,
      title: state.timer.title,
      project: state.timer.project,
      tags: state.timer.tags,
      startedAt: state.timer.startedAt || now,
      endedAt: state.timer.completedAt || now,
      durationMs: Math.max(0, (state.timer.completedAt || now) - (state.timer.startedAt || now)),
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

  function persist(sync = false) {
    const snapshot = structuredClone(state);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn("Unable to mirror focus tracker state to browser storage", error);
    }

    if (!window.focusDesktop?.saveData) {
      return;
    }

    if (sync && window.focusDesktop.saveDataSync) {
      const result = window.focusDesktop.saveDataSync(snapshot);
      if (result && result.ok === false) {
        console.warn("Unable to save focus tracker database", result.error);
      }
      queueSyncWrite(snapshot);
      queueCloudSyncWrite();
      return;
    }

    queueSyncWrite(snapshot);
    queueCloudSyncWrite();
    window.focusDesktop.saveData(snapshot)
      .then((result) => {
        if (result && result.ok === false) {
          console.warn("Unable to save focus tracker database", result.error);
        }
      })
      .catch((error) => {
        console.warn("Unable to save focus tracker database", error);
      });
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme(state.theme);
    persistAndRender();
  }

  function applyTheme(theme) {
    const normalizedTheme = normalizeTheme(theme);
    document.documentElement.dataset.theme = normalizedTheme;
    document.documentElement.style.colorScheme = normalizedTheme;
  }

  function updateThemeToggle() {
    const isDark = state.theme === "dark";
    const label = isDark ? "Switch to light mode" : "Switch to dark mode";
    dom.themeToggle.title = label;
    dom.themeToggle.setAttribute("aria-label", label);
    dom.themeToggle.setAttribute("aria-pressed", String(isDark));
  }

  async function hydrateState() {
    state = normalizeState(await loadState());
    rebuildModel();
  }

  async function loadState() {
    const databaseState = await loadDatabaseState();
    if (databaseState) {
      return databaseState;
    }

    const browserState = loadBrowserState();
    if (browserState) {
      state = normalizeState(browserState);
      persist();
      return browserState;
    }

    return structuredClone(defaultState);
  }

  async function loadDatabaseState() {
    if (!window.focusDesktop?.loadData) {
      return null;
    }

    try {
      const result = await window.focusDesktop.loadData();
      if (result?.state) {
        return result.state;
      }
      if (result && result.ok === false) {
        console.warn("Unable to load focus tracker database", result.error);
      }
    } catch (error) {
      console.warn("Unable to load focus tracker database", error);
    }

    return null;
  }

  function loadBrowserState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }

      return JSON.parse(raw);
    } catch (error) {
      console.warn("Unable to load saved focus tracker state", error);
      return null;
    }
  }

  function normalizeState(savedState) {
    const parsed = savedState && typeof savedState === "object" ? savedState : {};
    return {
      theme: normalizeTheme(parsed.theme),
      sideTab: parsed.sideTab === "settings" ? "settings" : "goals",
      settings: normalizeSettings(parsed.settings),
      sessions: normalizeSessions(parsed.sessions),
      timer: normalizeTimer(parsed.timer),
      manualDailyMinutes: normalizeManualDailyMinutes(parsed.manualDailyMinutes),
      goals: normalizeGoals(parsed.goals)
    };
  }

  function normalizeGoals(goals) {
    if (!Array.isArray(goals)) {
      return [];
    }

    return goals
      .map((goal) => {
        if (!goal || typeof goal !== "object") {
          return null;
        }

        const text = String(goal.text || "").trim();
        if (!text) {
          return null;
        }

        return {
          id: String(goal.id || createId()),
          text: text.slice(0, 90),
          completed: Boolean(goal.completed),
          createdAt: normalizeTimestamp(goal.createdAt) || Date.now(),
          completedAt: goal.completed ? normalizeTimestamp(goal.completedAt) : null
        };
      })
      .filter(Boolean)
      .slice(0, 80);
  }

  function normalizeSessions(sessions) {
    if (!Array.isArray(sessions)) {
      return [];
    }

    return sessions
      .map(normalizeSession)
      .filter(Boolean)
      .slice(-600);
  }

  function normalizeSession(session) {
    if (!session || typeof session !== "object") {
      return null;
    }

    const startedAt = normalizeTimestamp(session.startedAt);
    const endedAt = normalizeTimestamp(session.endedAt);
    if (!startedAt) {
      return null;
    }

    return {
      id: String(session.id || createId()),
      title: String(session.title || "Untitled focus block"),
      project: String(session.project || "General"),
      tags: Array.isArray(session.tags) ? session.tags.map(String).slice(0, 8) : [],
      startedAt,
      endedAt: endedAt || startedAt,
      durationMs: Math.max(0, Number(session.durationMs) || Math.max(0, (endedAt || startedAt) - startedAt)),
      activeMs: Math.max(0, Number(session.activeMs) || 0),
      pausedMs: Math.max(0, Number(session.pausedMs) || 0),
      pauseCount: Math.max(0, Number(session.pauseCount) || 0),
      focusRating: clamp(Number(session.focusRating) || 4, 1, 5),
      energy: clamp(Number(session.energy) || 4, 1, 5),
      goalMinutes: clamp(Number(session.goalMinutes) || DEFAULT_SETTINGS.blockGoalMinutes, 10, 180)
    };
  }

  function normalizeTimestamp(value) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }

    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeSettings(settings) {
    const normalized = { ...defaultState.settings, ...(settings || {}) };
    normalized.shortBreakMinutes = clamp(Number(normalized.shortBreakMinutes) || DEFAULT_SETTINGS.shortBreakMinutes, 5, 20);
    normalized.longBreakMinutes = clamp(Number(normalized.longBreakMinutes) || DEFAULT_SETTINGS.longBreakMinutes, 15, 40);
    normalized.blocksBeforeLongBreak = clamp(Number(normalized.blocksBeforeLongBreak) || DEFAULT_SETTINGS.blocksBeforeLongBreak, 2, 6);
    return normalized;
  }

  function normalizeTheme(theme) {
    return THEME_VALUES.includes(theme) ? theme : defaultState.theme;
  }

  function normalizeManualDailyMinutes(value) {
    if (!value || typeof value !== "object") {
      return {};
    }

    return Object.fromEntries(Object.entries(value).map(([key, minutes]) => [key, clamp(Number(minutes) || 0, 0, 1440)]));
  }

  function normalizeTimer(timer) {
    if (!timer || typeof timer !== "object") {
      return createIdleTimer();
    }

    const normalized = { ...createIdleTimer(), ...timer };
    if (!["idle", "running", "paused", "complete"].includes(normalized.status)) {
      normalized.status = "idle";
    }
    normalized.mode = normalized.mode === "break" ? "break" : "focus";
    normalized.breakType = normalized.mode === "break" ? normalized.breakType || "short" : null;
    normalized.completedAt = normalized.completedAt ? normalizeTimestamp(normalized.completedAt) : null;
    if (normalized.status === "running" && !normalized.lastResumedAt) {
      normalized.lastResumedAt = Date.now();
    }
    return normalized;
  }

  function createIdleTimer() {
    return {
      id: null,
      status: "idle",
      mode: "focus",
      breakType: null,
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
      goalMinutes: DEFAULT_SETTINGS.blockGoalMinutes,
      completedAt: null
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

  function getDailyPlan(now, todayActiveMs = null) {
    const currentActiveMs = todayActiveMs ?? getTodayActiveMs(now);
    const remainingGoalMinutes = Math.max(0, Math.ceil((state.settings.dailyGoalMinutes * 60000 - currentActiveMs) / 60000));

    if (FocusModel.recommendDailyPlan) {
      return FocusModel.recommendDailyPlan(model, recentSessions(8).reverse(), {
        ...state.settings,
        remainingGoalMinutes,
        completedBlocksSinceLongBreak: getCompletedFocusBlocksToday(now) % Math.max(1, Number(state.settings.blocksBeforeLongBreak) || DEFAULT_SETTINGS.blocksBeforeLongBreak),
        currentFocusRating: Number(dom.focusInput?.value || state.timer.focusRating || 4),
        currentEnergy: Number(dom.energyInput?.value || state.timer.energy || 4)
      });
    }

    return {
      goalMet: remainingGoalMinutes <= 0,
      blocksRemaining: remainingGoalMinutes <= 0 ? 0 : Math.max(1, Math.ceil(remainingGoalMinutes / state.settings.blockGoalMinutes)),
      nextBlockMinutes: Math.min(remainingGoalMinutes, state.settings.blockGoalMinutes),
      nextBreakMinutes: remainingGoalMinutes > state.settings.blockGoalMinutes ? state.settings.shortBreakMinutes : 0,
      nextBreakType: "short",
      plannedBreakMinutes: 0,
      totalActiveMinutes: remainingGoalMinutes,
      totalPlanMinutes: remainingGoalMinutes
    };
  }

  function getTodayActiveMs(now) {
    const sessionsForToday = getSessionsWithCurrentTimer(now);
    const today = FocusModel.summarizeToday(sessionsForToday, now);
    const trackedActiveMs = today.activeMs || today.totalActiveMs || 0;
    return trackedActiveMs + getManualMinutesForDay(now) * 60000;
  }

  function recentSessions(limit) {
    return [...state.sessions]
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
      .slice(0, limit);
  }

  function timerLabel() {
    const mode = state.timer.mode === "break" ? "Break" : "Focus";
    if (state.timer.status === "running") {
      return mode + " running";
    }
    if (state.timer.status === "paused") {
      return mode + " paused";
    }
    if (state.timer.status === "complete") {
      return mode + " complete";
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

  function formatPlanMinutes(minutes) {
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return "0m";
    }

    return formatShortDuration(minutes * 60000);
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

  function getThemeColors() {
    const styles = window.getComputedStyle(document.documentElement);
    return {
      canvasBg: readCssVar(styles, "--canvas-bg"),
      canvasLine: readCssVar(styles, "--canvas-line"),
      chartShadow: readCssVar(styles, "--chart-shadow"),
      green: readCssVar(styles, "--green"),
      blue: readCssVar(styles, "--blue"),
      coral: readCssVar(styles, "--coral"),
      muted: readCssVar(styles, "--muted"),
      ink: readCssVar(styles, "--ink")
    };
  }

  function readCssVar(styles, name) {
    return styles.getPropertyValue(name).trim();
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
