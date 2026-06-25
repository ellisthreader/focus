function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function checked(value) {
  return value ? " checked" : "";
}

export function render(state = {}) {
  const profile = state.profile || {};
  const settings = state.settings || {};
  const localAi = settings.privacy?.assistant?.local || {};
  return `
    <div class="onboarding-backdrop">
      <section class="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" aria-describedby="onboarding-description">
        <header class="onboarding-header">
          <div>
            <p class="eyebrow">Personal baseline</p>
            <h1 id="onboarding-title">Set up Focus around your life</h1>
            <p id="onboarding-description">Add the useful context once. You can change every field later, and medical records are never shared with AI.</p>
          </div>
        </header>
        <form class="onboarding-form" data-onboarding-form>
          <div class="onboarding-grid">
            <section class="onboarding-section" aria-labelledby="onboarding-about-title">
              <h2 id="onboarding-about-title">About you</h2>
              <label class="field">
                <span class="field__label">Name</span>
                <input name="name" maxlength="120" autocomplete="name" value="${escapeHtml(profile.name)}" required>
              </label>
              <label class="field">
                <span class="field__label">Useful context</span>
                <textarea name="bio" rows="3" maxlength="1000" placeholder="Work, responsibilities, preferences, constraints...">${escapeHtml(profile.bio)}</textarea>
              </label>
              <label class="field">
                <span class="field__label">Main goal right now</span>
                <input name="primaryGoal" maxlength="240" value="${escapeHtml(profile.primaryGoal)}" placeholder="What matters most over the next few months?">
              </label>
            </section>

            <section class="onboarding-section" aria-labelledby="onboarding-rhythm-title">
              <h2 id="onboarding-rhythm-title">Typical rhythm</h2>
              <div class="form-grid">
                <label class="field"><span class="field__label">Wake time</span><input name="wakeTime" type="time" value="${escapeHtml(profile.wakeTime || "07:00")}"></label>
                <label class="field"><span class="field__label">Sleep time</span><input name="sleepTime" type="time" value="${escapeHtml(profile.sleepTime || "23:00")}"></label>
                <label class="field"><span class="field__label">Work starts</span><input name="workStart" type="time" value="${escapeHtml(profile.workStart || "09:00")}"></label>
                <label class="field"><span class="field__label">Work ends</span><input name="workEnd" type="time" value="${escapeHtml(profile.workEnd || "17:00")}"></label>
              </div>
              <div class="form-grid">
                <label class="field"><span class="field__label">Daily focus goal</span><input name="dailyGoalMinutes" type="number" min="0" max="1440" step="15" value="${Number(settings.dailyGoalMinutes) || 360}"><span class="field__hint">Minutes</span></label>
                <label class="field"><span class="field__label">Currency</span><input name="financeCurrency" maxlength="3" value="${escapeHtml(settings.financeCurrency || "GBP")}"></label>
              </div>
            </section>

            <section class="onboarding-section" aria-labelledby="onboarding-goals-title">
              <h2 id="onboarding-goals-title">Personal areas</h2>
              <label class="field"><span class="field__label">Fitness goal</span><input name="fitnessGoal" maxlength="240" value="${escapeHtml(profile.fitnessGoal)}" placeholder="Build muscle, improve fitness, train consistently..."></label>
              <label class="field"><span class="field__label">Nutrition goal</span><input name="nutritionGoal" maxlength="240" value="${escapeHtml(profile.nutritionGoal)}" placeholder="Protein target, meal consistency, weight goal..."></label>
              <label class="field"><span class="field__label">Learning goal</span><input name="learningGoal" maxlength="240" value="${escapeHtml(profile.learningGoal)}" placeholder="A skill, course, qualification, or reading goal..."></label>
            </section>

            <section class="onboarding-section onboarding-section--privacy" aria-labelledby="onboarding-ai-title">
              <h2 id="onboarding-ai-title">AI personalization</h2>
              <p>Local AI runs through Ollama on this computer. Choose which summaries it may use. Raw medical records remain excluded.</p>
              <label class="field field--toggle"><span><span class="field__label">Use my profile and goals</span></span><input name="aiProfile" type="checkbox"${checked(localAi.profile !== false)}></label>
              <label class="field field--toggle"><span><span class="field__label">Use wellbeing summaries</span><span class="field__hint">Nutrition, recovery, and exercise.</span></span><input name="aiWellbeing" type="checkbox"${checked(localAi.nutrition || localAi.recovery || localAi.exercise)}></label>
              <label class="field field--toggle"><span><span class="field__label">Use finance summaries</span></span><input name="aiFinance" type="checkbox"${checked(localAi.finance)}></label>
              <label class="field field--toggle"><span><span class="field__label">Use learning summaries</span></span><input name="aiLearning" type="checkbox"${checked(localAi.learning)}></label>
              <label class="field field--toggle"><span><span class="field__label">Create starter goal and routines</span><span class="field__hint">Uses your main goal and adds simple morning/evening planning prompts.</span></span><input name="createStarterItems" type="checkbox" checked></label>
            </section>
          </div>
          <footer class="onboarding-actions">
            <button class="button button--ghost" type="button" data-action="onboarding-skip">Set up later</button>
            <button class="button button--primary" type="submit">Save my baseline</button>
          </footer>
        </form>
      </section>
    </div>
  `;
}

export function bind(root, actions = {}) {
  const form = root?.querySelector?.("[data-onboarding-form]");
  const skip = root?.querySelector?.('[data-action="onboarding-skip"]');
  const onSubmit = (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    values.dailyGoalMinutes = Number(values.dailyGoalMinutes) || 0;
    for (const key of ["aiProfile", "aiWellbeing", "aiFinance", "aiLearning", "createStarterItems"]) {
      values[key] = event.currentTarget.querySelector(`[name="${key}"]`)?.checked === true;
    }
    actions.completeOnboarding?.(values);
  };
  const onSkip = () => actions.skipOnboarding?.();
  form?.addEventListener("submit", onSubmit);
  skip?.addEventListener("click", onSkip);
  form?.querySelector("input")?.focus({ preventScroll: true });
  return () => {
    form?.removeEventListener("submit", onSubmit);
    skip?.removeEventListener("click", onSkip);
  };
}
