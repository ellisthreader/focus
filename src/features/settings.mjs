import { dailyRoutineBoundaries, renderDailyDashboardSettings } from "./daily-routines.mjs";

export const page = Object.freeze({
  id: "settings",
  label: "Settings",
  icon: "settings"
});
const bindings = new WeakMap();
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function finite(value, fallback, min = 0, max = Number.POSITIVE_INFINITY) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, number))
    : fallback;
}
function selected(value, current) {
  return String(value) === String(current) ? " selected" : "";
}
function weekStartValue(value) {
  return value === 0 || value === "0" || value === "sunday" ? 0 : 1;
}
function syncDetails(state, ctx) {
  const source = ctx?.syncStatus ?? state?.syncStatus ?? state?.sync ?? {};
  if (typeof source === "string") return { label: source, detail: "" };
  const folder = String(source?.folder || source?.path || "").trim();
  const label = source?.busy
    ? "Syncing"
    : String(source?.label || source?.status || (folder ? "Sync ready" : "Local only"));
  return { label, detail: folder || String(source?.detail || "") };
}
function mysqlConfig(state, ctx) {
  const source = ctx?.mysqlConfig ?? state?.device?.mysql ?? {};
  return {
    host: source.host || "localhost",
    port: finite(source.port, 3306, 1, 65535),
    database: source.database || "focus",
    databaseUser: source.databaseUser || source.user || ""
  };
}
function settingNumberField(id, label, key, value, min, max, step, hint) {
  return `
    <label class="field" for="${id}">
      <span class="field__label">${label}</span>
      <input id="${id}" data-setting="${key}" data-value-type="number" type="number" min="${min}" max="${max}" step="${step}" value="${value}">
      <span class="field__hint">${hint}</span>
    </label>
  `;
}
function mysqlField(id, label, name, value, type = "text") {
  return `
    <label class="field" for="${id}">
      <span class="field__label">${label}</span>
      <input id="${id}" name="${name}" type="${type}" value="${escapeHtml(value)}" autocomplete="off">
    </label>
  `;
}
function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}
function assistantDetails(source = {}) {
  const local = source.local || source.providers?.local || {};
  const openai = source.openai || source.providers?.openai || {};
  const legacyOpenai = !source.provider
    && ["environment", "secure-storage"].includes(source.source);
  const provider = ["local", "openai"].includes(source.provider)
    ? source.provider
    : "local";
  const runtimeAvailable = Boolean(firstDefined(
    local.runtimeAvailable,
    source.localRuntimeAvailable,
    source.runtimeAvailable,
    source.ollamaAvailable,
    false
  ));
  const modelInstalled = Boolean(firstDefined(
    local.modelInstalled,
    local.modelAvailable,
    source.localModelInstalled,
    source.modelInstalled,
    source.modelAvailable,
    false
  ));
  const localReady = Boolean(firstDefined(
    local.ready,
    source.localReady,
    runtimeAvailable && modelInstalled
  ));
  const openaiSource = firstDefined(
    openai.source,
    source.openaiSource,
    provider === "openai" ? source.source : undefined,
    legacyOpenai ? source.source : undefined,
    "none"
  );
  const openaiConfigured = Boolean(firstDefined(
    openai.configured,
    source.openaiConfigured,
    source.cloudConfigured,
    provider === "openai" ? source.configured : undefined,
    legacyOpenai ? source.configured : undefined,
    openaiSource === "environment"
  ));
  const setupBusy = Boolean(firstDefined(
    local.setupBusy,
    source.localSetupBusy,
    source.setupBusy,
    false
  ));
  return {
    provider,
    runtimeAvailable,
    modelInstalled,
    localReady,
    setupBusy,
    localModel: firstDefined(local.model, source.localModel, provider === "local" ? source.model : undefined, "qwen3:4b-instruct"),
    openaiModel: firstDefined(openai.model, source.openaiModel, provider === "openai" ? source.model : undefined, "gpt-5.4-mini"),
    openaiSource,
    openaiConfigured
  };
}
function renderAssistantSettings(source = {}) {
  const assistant = assistantDetails(source);
  const usingLocal = assistant.provider === "local";
  const localStatus = assistant.localReady
    ? "Ready"
    : !assistant.runtimeAvailable ? "Runtime needed" : "Model needed";
  const openaiSource = assistant.openaiSource === "environment"
    ? "Environment variable"
    : assistant.openaiConfigured ? "Secure device storage" : "Not connected";
  return `
    <section class="card" aria-labelledby="assistant-settings-title">
      <header class="card__header">
        <div>
          <h2 class="card__title" id="assistant-settings-title">AI assistant</h2>
          <p class="card__description">Local AI runs on this computer and previews every data change before it is applied.</p>
        </div>
        <span class="badge">${usingLocal ? localStatus : assistant.openaiConfigured ? "Cloud ready" : "Cloud off"}</span>
      </header>
      <div class="card__body stack">
        <div class="row-between">
          <div>
            <strong>Local AI ${usingLocal ? "(default)" : ""}</strong>
            <p class="field__hint">Private by default. Prompts and app context stay on this device.</p>
          </div>
          ${usingLocal ? "" : '<button class="button button--secondary button--sm" type="button" data-action="assistant-use-local">Use local AI</button>'}
        </div>
        <div class="form-grid" aria-label="Local AI status">
          <div>
            <span class="field__label">Runtime</span>
            <strong>${assistant.runtimeAvailable ? "Available" : "Not detected"}</strong>
          </div>
          <div>
            <span class="field__label">Model</span>
            <strong>${escapeHtml(assistant.localModel)}</strong>
            <p class="field__hint">${assistant.modelInstalled ? "Installed" : "Not installed"}</p>
          </div>
        </div>
        ${assistant.localReady ? `
          <p class="field__hint">Local AI is installed and ready${usingLocal ? " to use" : ""}.</p>
        ` : `
          <div class="form-actions">
            <button class="button button--secondary" type="button" data-action="assistant-setup-local"${assistant.setupBusy ? " disabled" : ""}>
              ${assistant.setupBusy ? "Setting up local AI..." : assistant.runtimeAvailable || assistant.modelInstalled ? "Retry local AI setup" : "Set up local AI"}
            </button>
          </div>
        `}
        <details class="subtle">
          <summary>Advanced cloud provider</summary>
          <div class="stack">
            <div class="row-between">
              <div>
                <strong>OpenAI</strong>
                <p class="field__hint">${escapeHtml(openaiSource)}. Model: ${escapeHtml(assistant.openaiModel)}.</p>
              </div>
              ${assistant.provider === "openai"
                ? '<span class="badge">In use</span>'
                : `<button class="button button--ghost button--sm" type="button" data-action="assistant-use-openai"${assistant.openaiConfigured ? "" : " disabled"}>Use OpenAI</button>`}
            </div>
            <form class="stack" data-assistant-settings-form>
              ${assistant.openaiSource === "environment" ? `
                <p class="field__hint">The key is managed by OPENAI_API_KEY. Remove it from the launch environment to disconnect.</p>
              ` : `
                <label class="field" for="assistant-api-key">
                  <span class="field__label">OpenAI API key</span>
                  <input id="assistant-api-key" name="apiKey" type="password" autocomplete="off" placeholder="${assistant.openaiConfigured ? "Enter a replacement key" : "sk-..."}" required>
                  <span class="field__hint">Encrypted by the operating system and never saved in your Focus data.</span>
                </label>
                <div class="form-actions">
                  <button class="button button--secondary" type="submit">${assistant.openaiConfigured ? "Replace key" : "Connect OpenAI"}</button>
                  ${assistant.openaiConfigured ? '<button class="button button--ghost" type="button" data-action="assistant-disconnect">Disconnect</button>' : ""}
                </div>
              `}
            </form>
          </div>
        </details>
      </div>
    </section>
  `;
}

function checked(value) {
  return value === true ? " checked" : "";
}

function encodedRecord(value) {
  return escapeHtml(encodeURIComponent(JSON.stringify(value && typeof value === "object" ? value : {})));
}

function decodedRecord(value) {
  try {
    const parsed = JSON.parse(decodeURIComponent(String(value || "")));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function personalAreaSettings(settings = {}) {
  const nutrition = settings.nutritionGoals || {};
  const privacy = settings.privacy || {};
  return `
    ${renderDailyDashboardSettings({ settings, dailyRoutineItems: settings.__dailyRoutineItems || [] })}
    <section class="card" aria-labelledby="nutrition-goals-title">
      <header class="card__header">
        <div>
          <h2 class="card__title" id="nutrition-goals-title">Nutrition goals</h2>
          <p class="card__description">Optional targets you choose for yourself. Focus does not calculate a diet prescription.</p>
        </div>
      </header>
      <form class="card__body stack" data-personal-settings-form="nutrition">
        <label class="field field--toggle">
          <span><span class="field__label">Show daily goal progress</span><span class="field__hint">Keep this off if you only want a food log.</span></span>
          <input name="enabled" type="checkbox"${checked(nutrition.enabled)}>
        </label>
        <div class="form-grid">
          ${settingNumberField("nutrition-calories", "Calories", "nutrition-calories", finite(nutrition.calories, 2000, 0, 10000), 0, 10000, 10, "kcal per day")}
          ${settingNumberField("nutrition-protein", "Protein", "nutrition-protein", finite(nutrition.proteinGrams, 100, 0, 1000), 0, 1000, 1, "Grams per day")}
          ${settingNumberField("nutrition-carbs", "Carbohydrate", "nutrition-carbs", finite(nutrition.carbsGrams, 250, 0, 2000), 0, 2000, 1, "Grams per day")}
          ${settingNumberField("nutrition-fat", "Fat", "nutrition-fat", finite(nutrition.fatGrams, 70, 0, 1000), 0, 1000, 1, "Grams per day")}
        </div>
        <div class="form-actions"><button class="button button--secondary" type="submit">Save nutrition goals</button></div>
      </form>
    </section>

    <section class="card" aria-labelledby="personal-preferences-title">
      <header class="card__header">
        <div>
          <h2 class="card__title" id="personal-preferences-title">Finance and learning</h2>
          <p class="card__description">Set display preferences without connecting bank or education accounts.</p>
        </div>
      </header>
      <form class="card__body stack" data-personal-settings-form="preferences">
        <div class="form-grid">
          <label class="field" for="finance-currency">
            <span class="field__label">Finance currency</span>
            <input id="finance-currency" name="currency" maxlength="3" value="${escapeHtml(settings.financeCurrency || "GBP")}">
            <span class="field__hint">Three-letter currency code</span>
          </label>
          ${settingNumberField("learning-weekly-minutes", "Weekly learning goal", "learning-weekly-minutes", finite(settings.learningTargetMinutes, 150, 0, 10080), 0, 10080, 15, "Minutes per week")}
        </div>
        <div class="form-actions"><button class="button button--secondary" type="submit">Save preferences</button></div>
      </form>
    </section>

    <section class="card" aria-labelledby="domain-privacy-title">
      <header class="card__header">
        <div>
          <h2 class="card__title" id="domain-privacy-title">Sensitive data controls</h2>
          <p class="card__description">Canonical data stays in the desktop database. These opt-ins control additional copies and AI summaries.</p>
        </div>
      </header>
      <form
        class="card__body stack"
        data-personal-settings-form="privacy"
        data-browser-storage="${encodedRecord(privacy.browserStorage)}"
        data-cloud-assistant="${encodedRecord(privacy?.assistant?.cloud)}"
      >
        <div class="form-grid">
          <label class="field field--toggle"><span><span class="field__label">Wellbeing in optional sync</span><span class="field__hint">Nutrition, recovery, and exercise.</span></span><input name="syncWellbeing" type="checkbox"${checked(privacy?.optionalSync?.wellbeing)}></label>
          <label class="field field--toggle"><span><span class="field__label">Finance in optional sync</span><span class="field__hint">Transactions, budgets, and goals.</span></span><input name="syncFinance" type="checkbox"${checked(privacy?.optionalSync?.finance)}></label>
          <label class="field field--toggle"><span><span class="field__label">Learning notes in optional sync</span><span class="field__hint">Resource records still sync; note bodies require this opt-in.</span></span><input name="syncLearningNotes" type="checkbox"${checked(privacy?.optionalSync?.learningNotes)}></label>
        </div>
        <details>
          <summary>Backup and AI permissions</summary>
          <div class="stack">
            <div class="form-grid">
              <label class="field field--toggle"><span><span class="field__label">Wellbeing in exports</span></span><input name="exportWellbeing" type="checkbox"${checked(privacy?.manualExport?.wellbeing)}></label>
              <label class="field field--toggle"><span><span class="field__label">Finance in exports</span></span><input name="exportFinance" type="checkbox"${checked(privacy?.manualExport?.finance)}></label>
              <label class="field field--toggle"><span><span class="field__label">Learning notes in exports</span></span><input name="exportLearningNotes" type="checkbox"${checked(privacy?.manualExport?.learningNotes)}></label>
            </div>
            <div class="form-grid">
              <label class="field field--toggle"><span><span class="field__label">Profile and goals for local AI</span></span><input name="localProfile" type="checkbox"${checked(privacy?.assistant?.local?.profile)}></label>
              <label class="field field--toggle"><span><span class="field__label">Wellbeing summaries for local AI</span></span><input name="localWellbeing" type="checkbox"${checked(privacy?.assistant?.local?.nutrition && privacy?.assistant?.local?.recovery && privacy?.assistant?.local?.exercise)}></label>
              <label class="field field--toggle"><span><span class="field__label">Finance summaries for local AI</span></span><input name="localFinance" type="checkbox"${checked(privacy?.assistant?.local?.finance)}></label>
              <label class="field field--toggle"><span><span class="field__label">Learning summaries for local AI</span></span><input name="localLearning" type="checkbox"${checked(privacy?.assistant?.local?.learning)}></label>
            </div>
          </div>
        </details>
        <div class="form-actions"><button class="button button--secondary" type="submit">Save privacy controls</button></div>
      </form>
    </section>
    <section class="card subtle" aria-labelledby="medical-storage-settings-title">
      <header class="card__header">
        <div>
          <h2 class="card__title" id="medical-storage-settings-title">Medical storage</h2>
          <p class="card__description">Medical records are encrypted at rest with the operating system keyring. They are excluded from browser storage, sync, exports, search, timeline, and AI.</p>
        </div>
      </header>
      <div class="card__body">
        <p class="field__hint">This is not an application lock. Anyone using your unlocked operating-system account may be able to open Focus.</p>
      </div>
    </section>
  `;
}

export function render(state = {}, ctx = {}) {
  const profile = state?.profile || {};
  const settings = state?.settings || {};
  const theme = ["light", "dark", "system"].includes(settings.theme)
    ? settings.theme
    : ["light", "dark", "system"].includes(state?.theme) ? state.theme : "system";
  const weekStart = weekStartValue(settings.weekStart);
  const sync = syncDetails(state, ctx);
  const mysql = mysqlConfig(state, ctx);
  const assistant = ctx?.assistant || {};
  const performance = settings.pcPerformance || {};
  return `
    <main class="page page--narrow settings-page" data-page="settings" aria-labelledby="settings-title">
      <header class="page-header">
        <div class="page-header__content">
          <p class="eyebrow">Personal preferences</p>
          <h1 class="page-header__title" id="settings-title">Settings</h1>
          <p class="page-header__description">Keep Focus comfortable, private, and suited to how you work.</p>
        </div>
      </header>
      <div class="section-stack">
        <div class="settings-layout">
          <nav class="settings-nav" aria-label="Settings categories">
            <div class="settings-nav__list" role="tablist" aria-orientation="vertical">
              <button class="settings-nav__item" type="button" role="tab" id="settings-tab-general" aria-controls="settings-panel-general" aria-selected="true" tabindex="0" data-settings-category="general">General</button>
              <button class="settings-nav__item" type="button" role="tab" id="settings-tab-personal" aria-controls="settings-panel-personal" aria-selected="false" tabindex="-1" data-settings-category="personal">Personal areas</button>
              <button class="settings-nav__item" type="button" role="tab" id="settings-tab-assistant" aria-controls="settings-panel-assistant" aria-selected="false" tabindex="-1" data-settings-category="assistant">AI assistant</button>
              <button class="settings-nav__item" type="button" role="tab" id="settings-tab-performance" aria-controls="settings-panel-performance" aria-selected="false" tabindex="-1" data-settings-category="performance">Performance</button>
              <button class="settings-nav__item" type="button" role="tab" id="settings-tab-data" aria-controls="settings-panel-data" aria-selected="false" tabindex="-1" data-settings-category="data">Data &amp; privacy</button>
              <button class="settings-nav__item" type="button" role="tab" id="settings-tab-advanced" aria-controls="settings-panel-advanced" aria-selected="false" tabindex="-1" data-settings-category="advanced">Advanced</button>
            </div>
          </nav>
          <div class="settings-content">
            <section class="settings-panel section-stack" id="settings-panel-general" role="tabpanel" aria-labelledby="settings-tab-general" data-settings-panel="general">
              <header class="settings-panel__header">
                <div>
                  <p class="eyebrow">General</p>
                  <h2>Profile and preferences</h2>
                  <p>Personalize Focus and set your default working rhythm.</p>
                </div>
              </header>
              <section class="card" aria-labelledby="profile-settings-title">
          <header class="card__header">
            <div>
              <h2 class="card__title" id="profile-settings-title">Profile</h2>
              <p class="card__description">Used for personal greetings inside this app.</p>
            </div>
          </header>
          <form class="card__body" data-profile-form>
            <label class="field" for="settings-name">
              <span class="field__label">Name</span>
              <input id="settings-name" name="name" type="text" maxlength="120" autocomplete="name" value="${escapeHtml(profile.name)}">
            </label>
            <div class="form-actions">
              <button class="button button--ghost" type="button" data-action="open-onboarding">Update personal baseline</button>
              <button class="button button--secondary" type="submit">Save profile</button>
            </div>
          </form>
        </section>
        <section class="card" aria-labelledby="preferences-title">
          <header class="card__header">
            <div>
              <h2 class="card__title" id="preferences-title">Preferences</h2>
              <p class="card__description">Changes save as soon as you choose them.</p>
            </div>
          </header>
          <div class="card__body stack">
            <div class="form-grid">
              <label class="field" for="settings-theme">
                <span class="field__label">Theme</span>
                <select id="settings-theme" data-setting="theme">
                  <option value="system"${selected("system", theme)}>System</option>
                  <option value="light"${selected("light", theme)}>Light</option>
                  <option value="dark"${selected("dark", theme)}>Dark</option>
                </select>
              </label>
              <label class="field" for="settings-week-start">
                <span class="field__label">Week starts on</span>
                <select id="settings-week-start" data-setting="weekStart" data-value-type="number">
                  <option value="1"${selected(1, weekStart)}>Monday</option>
                  <option value="0"${selected(0, weekStart)}>Sunday</option>
                </select>
              </label>
            </div>
            <div class="stack" role="group" aria-labelledby="focus-goals-title">
              <h3 class="card__title" id="focus-goals-title">Focus goals</h3>
              <div class="form-grid">
                ${settingNumberField("settings-daily-goal", "Daily focus goal", "dailyGoalMinutes", finite(settings.dailyGoalMinutes, 360, 0, 1440), 0, 1440, 15, "Minutes per day")}
                ${settingNumberField("settings-block-goal", "Default focus block", "blockGoalMinutes", finite(settings.blockGoalMinutes, 50, 10, 180), 10, 180, 5, "Minutes per session")}
                ${settingNumberField("settings-weekly-goal", "Weekly focus goal", "weeklyGoalHours", finite(settings.weeklyGoalHours, 30, 0, 168), 0, 168, 0.5, "Hours per week")}
              </div>
            </div>
          </div>
        </section>
            </section>

            <section class="settings-panel section-stack" id="settings-panel-personal" role="tabpanel" aria-labelledby="settings-tab-personal" data-settings-panel="personal" hidden>
              <header class="settings-panel__header">
                <div>
                  <p class="eyebrow">Personal areas</p>
                  <h2>Goals and privacy</h2>
                  <p>Configure the personal domains without turning them into compulsory dashboards.</p>
                </div>
              </header>
              ${personalAreaSettings({ ...settings, __dailyRoutineItems: state.dailyRoutineItems || [] })}
            </section>

            <section class="settings-panel section-stack" id="settings-panel-assistant" role="tabpanel" aria-labelledby="settings-tab-assistant" data-settings-panel="assistant" hidden>
              <header class="settings-panel__header">
                <div>
                  <p class="eyebrow">AI assistant</p>
                  <h2>Assistant provider</h2>
                  <p>Choose how Focus assists you and where processing happens.</p>
                </div>
              </header>
              ${renderAssistantSettings(assistant)}
            </section>

            <section class="settings-panel section-stack" id="settings-panel-performance" role="tabpanel" aria-labelledby="settings-tab-performance" data-settings-panel="performance" hidden>
              <header class="settings-panel__header">
                <div>
                  <p class="eyebrow">Performance</p>
                  <h2>PC monitoring</h2>
                  <p>Control live system monitoring and alert sensitivity.</p>
                </div>
              </header>
              <section class="card" aria-labelledby="performance-settings-title">
          <header class="card__header">
            <div>
              <h2 class="card__title" id="performance-settings-title">PC performance alerts</h2>
              <p class="card__description">Monitor this computer locally and notify you after a limit is exceeded for several readings.</p>
            </div>
          </header>
          <div class="card__body stack">
            <div class="form-grid">
              <label class="field field--toggle" for="performance-enabled">
                <span>
                  <span class="field__label">Live monitoring</span>
                  <span class="field__hint">Show current performance on Today.</span>
                </span>
                <input id="performance-enabled" type="checkbox" data-performance-setting="enabled"${performance.enabled !== false ? " checked" : ""}>
              </label>
              <label class="field field--toggle" for="performance-notifications">
                <span>
                  <span class="field__label">System notifications</span>
                  <span class="field__hint">Alert even when Today is not open.</span>
                </span>
                <input id="performance-notifications" type="checkbox" data-performance-setting="notificationsEnabled"${performance.notificationsEnabled !== false ? " checked" : ""}>
              </label>
            </div>
            <div class="form-grid" role="group" aria-label="Performance alert thresholds">
              ${settingNumberField("performance-cpu", "Extreme CPU usage", "pc-cpu", finite(performance.cpuThreshold, 95, 50, 100), 50, 100, 1, "Percent")}
              ${settingNumberField("performance-temperature", "High CPU temperature", "pc-temperature", finite(performance.temperatureThreshold, 90, 50, 120), 50, 120, 1, "Degrees Celsius")}
              ${settingNumberField("performance-memory", "Extreme memory usage", "pc-memory", finite(performance.memoryThreshold, 95, 50, 100), 50, 100, 1, "Percent")}
              ${settingNumberField("performance-disk", "System disk almost full", "pc-disk", finite(performance.diskThreshold, 95, 50, 100), 50, 100, 1, "Percent")}
            </div>
            <p class="field__hint">An alert is sent after three consecutive high readings, then cooled down for 15 minutes.</p>
          </div>
        </section>
            </section>

            <section class="settings-panel section-stack" id="settings-panel-data" role="tabpanel" aria-labelledby="settings-tab-data" data-settings-panel="data" hidden>
              <header class="settings-panel__header">
                <div>
                  <p class="eyebrow">Data &amp; privacy</p>
                  <h2>Your information</h2>
                  <p>Review storage, sync, backup, and restore options.</p>
                </div>
              </header>
              <section class="card subtle" aria-labelledby="privacy-title">
          <header class="card__header">
            <div>
              <h2 class="card__title" id="privacy-title">Private by default</h2>
              <p class="card__description">Your profile, plans, health check-ins, and focus history are stored locally. Sync is optional and only runs when you configure it.</p>
            </div>
          </header>
          <div class="card__body row-between">
            <div>
              <strong data-sync-label>${escapeHtml(sync.label)}</strong>
              ${sync.detail ? `<p class="field__hint">${escapeHtml(sync.detail)}</p>` : ""}
            </div>
            <button class="button button--secondary" type="button" data-action="sync">Sync now</button>
          </div>
        </section>

        <section class="card" aria-labelledby="data-title">
          <header class="card__header">
            <div>
              <h2 class="card__title" id="data-title">Your data</h2>
              <p class="card__description">Create a portable backup or restore one you made earlier.</p>
            </div>
          </header>
          <div class="card__body cluster">
            <button class="button button--secondary" type="button" data-action="export">Export backup</button>
            <button class="button button--secondary" type="button" data-action="import">Import backup</button>
          </div>
        </section>
            </section>

            <section class="settings-panel section-stack" id="settings-panel-advanced" role="tabpanel" aria-labelledby="settings-tab-advanced" data-settings-panel="advanced" hidden>
              <header class="settings-panel__header">
                <div>
                  <p class="eyebrow">Advanced</p>
                  <h2>Connections and reset</h2>
                  <p>Configure optional database sync or reset local data.</p>
                </div>
              </header>
              <details class="card subtle">
          <summary>Advanced MySQL sync</summary>
          <form class="card__body stack" data-mysql-form>
            <p class="field__hint">Optional secondary sync for experienced users. Credentials should remain in secure device storage.</p>
            <div class="form-grid">
              ${mysqlField("mysql-host", "Host", "host", mysql.host)}
              <label class="field" for="mysql-port">
                <span class="field__label">Port</span>
                <input id="mysql-port" name="port" type="number" min="1" max="65535" value="${mysql.port}">
              </label>
              ${mysqlField("mysql-database", "Database", "database", mysql.database)}
              ${mysqlField("mysql-user", "Database user", "databaseUser", mysql.databaseUser)}
            </div>
            <label class="field" for="mysql-password">
              <span class="field__label">Password</span>
              <input id="mysql-password" name="password" type="password" autocomplete="current-password">
            </label>
            <div class="form-actions">
              <button class="button button--secondary" type="submit">Save and sync</button>
            </div>
          </form>
        </details>

        <section class="card danger-zone" aria-labelledby="reset-title">
          <header class="card__header">
            <div>
              <h2 class="card__title" id="reset-title">Reset Focus</h2>
              <p class="card__description">Permanently remove local profile, plans, history, and settings from this device.</p>
            </div>
            <button class="button button--danger" type="button" data-action="reset">Reset all data</button>
          </header>
        </section>
            </section>
          </div>
        </div>
      </div>
    </main>
  `;
}
function callAction(actions, names, ...args) {
  const handler = names.map((name) => actions?.[name]).find((value) => typeof value === "function");
  return handler?.(...args);
}
export function bind(root, actions = {}) {
  if (!root?.addEventListener) return;
  const previous = bindings.get(root);
  const binding = { activeCategory: previous?.activeCategory || "general" };
  if (previous) {
    root.removeEventListener("change", previous.change);
    root.removeEventListener("click", previous.click);
    root.removeEventListener("submit", previous.submit);
    root.removeEventListener("keydown", previous.keydown);
  }
  const change = (event) => {
    if (event.target?.closest?.("[data-personal-settings-form]")) return;
    const performanceControl = event.target?.closest?.("[data-performance-setting], [data-setting^='pc-']");
    if (performanceControl && root.contains(performanceControl)) {
      const keyMap = {
        "pc-cpu": "cpuThreshold",
        "pc-temperature": "temperatureThreshold",
        "pc-memory": "memoryThreshold",
        "pc-disk": "diskThreshold"
      };
      const key = performanceControl.dataset.performanceSetting || keyMap[performanceControl.dataset.setting];
      const value = performanceControl.type === "checkbox"
        ? performanceControl.checked
        : Number(performanceControl.value);
      if (key) actions.updatePerformanceSetting?.(key, value);
      return;
    }
    const control = event.target?.closest?.("[data-setting]");
    if (!control || !root.contains(control)) return;
    const value = control.dataset.valueType === "number" ? Number(control.value) : control.value;
    actions.dispatch?.({
      type: "settings/update",
      payload: { patch: { [control.dataset.setting]: value } }
    });
  };
  const click = (event) => {
    const category = event.target?.closest?.("[data-settings-category]");
    if (category && root.contains(category)) {
      binding.activeCategory = category.dataset.settingsCategory;
      activateSettingsCategory(root, category.dataset.settingsCategory, true);
      return;
    }
    const control = event.target?.closest?.("[data-action]");
    if (!control || !root.contains(control) || control.disabled) return;
    const action = control.dataset.action;
    if (action === "import") callAction(actions, ["importData", "import"]);
    if (action === "export") callAction(actions, ["exportData", "export"]);
    if (action === "sync") callAction(actions, ["syncNow", "syncData", "sync"]);
    if (action === "reset") callAction(actions, ["resetData", "reset"]);
    if (action === "assistant-disconnect") callAction(actions, ["clearAssistantSettings"]);
    if (action === "assistant-use-local") callAction(actions, ["setAssistantProvider"], "local");
    if (action === "assistant-use-openai") callAction(actions, ["setAssistantProvider"], "openai");
    if (action === "assistant-setup-local") callAction(actions, ["setupLocalAssistant"]);
    if (action === "open-onboarding") actions.openOnboarding?.();
    if (action === "routine/open-editor") {
      actions.openEditor?.(control.dataset.kind || "dailyRoutineItem", control.dataset.id || "");
    }
    if (action === "routine/delete-item" && control.dataset.id) {
      actions.dispatch?.({ type: "dailyRoutineItem/delete", payload: { id: control.dataset.id } });
    }
  };
  const submit = (event) => {
    const profileForm = event.target?.closest?.("[data-profile-form]");
    const mysqlForm = event.target?.closest?.("[data-mysql-form]");
    const assistantForm = event.target?.closest?.("[data-assistant-settings-form]");
    const personalForm = event.target?.closest?.("[data-personal-settings-form]");
    const dailyDashboardForm = event.target?.closest?.("[data-daily-dashboard-form]");
    if ((!profileForm && !mysqlForm && !assistantForm && !personalForm && !dailyDashboardForm) || !root.contains(event.target)) return;
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target).entries());
    if (profileForm) {
      actions.dispatch?.({
        type: "profile/update",
        payload: { patch: { name: String(values.name || "").trim() } }
      });
      return;
    }
    if (assistantForm) {
      callAction(actions, ["saveAssistantSettings"], {
        apiKey: String(values.apiKey || "").trim()
      });
      return;
    }
    if (dailyDashboardForm) {
      const boundaries = dailyRoutineBoundaries(values);
      actions.dispatch?.({
        type: "settings/update",
        payload: {
          patch: {
            dailyDashboard: {
              mode: ["auto", "morning", "day", "evening"].includes(values.mode) ? values.mode : "auto",
              showRoutineCard: dailyDashboardForm.querySelector('[name="showRoutineCard"]')?.checked === true,
              ...boundaries,
              updatedAt: Date.now()
            }
          }
        }
      });
      return;
    }
    if (personalForm?.dataset.personalSettingsForm === "nutrition") {
      const numberValue = (id) => finite(personalForm.querySelector(`#${id}`)?.value, 0);
      actions.dispatch?.({
        type: "settings/update",
        payload: {
          patch: {
            nutritionGoals: {
              enabled: personalForm.querySelector('[name="enabled"]')?.checked === true,
              calories: numberValue("nutrition-calories"),
              proteinGrams: numberValue("nutrition-protein"),
              carbsGrams: numberValue("nutrition-carbs"),
              fatGrams: numberValue("nutrition-fat")
            }
          }
        }
      });
      return;
    }
    if (personalForm?.dataset.personalSettingsForm === "preferences") {
      const weeklyMinutes = finite(
        personalForm.querySelector("#learning-weekly-minutes")?.value,
        0,
        0,
        10080
      );
      actions.dispatch?.({
        type: "settings/update",
        payload: {
          patch: {
            financeCurrency: String(values.currency || "GBP").trim().toUpperCase().slice(0, 3),
            learningTargetMinutes: weeklyMinutes
          }
        }
      });
      return;
    }
    if (personalForm?.dataset.personalSettingsForm === "privacy") {
      const enabled = (name) => personalForm.querySelector(`[name="${name}"]`)?.checked === true;
      const browserStorage = decodedRecord(personalForm.dataset.browserStorage);
      const cloud = decodedRecord(personalForm.dataset.cloudAssistant);
      actions.dispatch?.({
        type: "settings/update",
        payload: {
          patch: {
            privacy: {
              browserStorage,
              optionalSync: {
                wellbeing: enabled("syncWellbeing"),
                finance: enabled("syncFinance"),
                learningNotes: enabled("syncLearningNotes")
              },
              manualExport: {
                wellbeing: enabled("exportWellbeing"),
                finance: enabled("exportFinance"),
                learningNotes: enabled("exportLearningNotes"),
                includeSensitiveDomains: false
              },
              assistant: {
                local: {
                  profile: enabled("localProfile"),
                  nutrition: enabled("localWellbeing"),
                  recovery: enabled("localWellbeing"),
                  exercise: enabled("localWellbeing"),
                  finance: enabled("localFinance"),
                  learning: enabled("localLearning")
                },
                cloud
              }
            }
          }
        }
      });
      return;
    }
    values.port = finite(values.port, 3306, 1, 65535);
    callAction(actions, ["saveMysqlSettings", "configureSync", "sync"], values);
  };
  root.addEventListener("change", change);
  root.addEventListener("click", click);
  root.addEventListener("submit", submit);
  const keydown = (event) => {
    const category = event.target?.closest?.("[data-settings-category]");
    if (!category || !root.contains(category)) return;
    const tabs = [...root.querySelectorAll("[data-settings-category]")];
    const index = tabs.indexOf(category);
    const nextIndex = {
      ArrowDown: (index + 1) % tabs.length,
      ArrowRight: (index + 1) % tabs.length,
      ArrowUp: (index - 1 + tabs.length) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1
    }[event.key];
    if (nextIndex === undefined) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    binding.activeCategory = next.dataset.settingsCategory;
    activateSettingsCategory(root, next.dataset.settingsCategory, true);
  };
  root.addEventListener("keydown", keydown);
  Object.assign(binding, { change, click, submit, keydown });
  bindings.set(root, binding);
  if (binding.activeCategory !== "general") {
    activateSettingsCategory(root, binding.activeCategory);
  }
}

function activateSettingsCategory(root, category, focus = false) {
  const tabs = [...root.querySelectorAll("[data-settings-category]")];
  const panels = [...root.querySelectorAll("[data-settings-panel]")];
  const selected = tabs.find((tab) => tab.dataset.settingsCategory === category);
  if (!selected) return;
  tabs.forEach((tab) => {
    const active = tab === selected;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== category;
  });
  if (focus) selected.focus({ preventScroll: true });
}
