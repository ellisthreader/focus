import { icon } from "./icons.mjs";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function field(label, name, value = "", options = {}) {
  const type = options.type || "text";
  const id = `editor-field-${name}`;
  const attrs = [
    `id="${id}"`,
    `name="${name}"`,
    `type="${type}"`,
    options.required ? "required" : "",
    options.min !== undefined ? `min="${options.min}"` : "",
    options.max !== undefined ? `max="${options.max}"` : "",
    options.step !== undefined ? `step="${options.step}"` : "",
    options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : ""
  ].filter(Boolean).join(" ");
  return `<label class="field editor-field" for="${id}"><span class="field__label">${escapeHtml(label)}</span><input ${attrs} value="${escapeHtml(value)}"></label>`;
}

function textarea(label, name, value = "", placeholder = "") {
  const id = `editor-field-${name}`;
  return `<label class="field editor-field" for="${id}"><span class="field__label">${escapeHtml(label)}</span><textarea id="${id}" name="${name}" rows="3" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea></label>`;
}

function select(label, name, value, choices) {
  const id = `editor-field-${name}`;
  const options = choices.map(([key, text]) => (
    `<option value="${escapeHtml(key)}"${key === value ? " selected" : ""}>${escapeHtml(text)}</option>`
  )).join("");
  return `<label class="field editor-field" for="${id}"><span class="field__label">${escapeHtml(label)}</span><select id="${id}" name="${name}">${options}</select></label>`;
}

function toLocalDateTime(value) {
  const date = new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function decimalToMinorUnits(value) {
  const match = String(value ?? "").trim().match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!match) return 0;
  const whole = Number(match[1]);
  const fraction = Number((match[2] || "").padEnd(2, "0"));
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(fraction)) return 0;
  const result = whole * 100 + fraction;
  return Number.isSafeInteger(result) ? result : 0;
}

function editorBody(kind, item, ctx, editor = {}) {
  const today = ctx?.todayKey || new Date().toISOString().slice(0, 10);
  if (kind === "nutrition") {
    return [
      field("Food or meal", "name", item?.name, { required: true, placeholder: "Chicken curry with rice" }),
      '<div class="form-grid">',
      field("Date", "date", item?.date || today, { type: "date", required: true }),
      select("Meal", "mealType", item?.mealType || "snack", [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snack", "Snack"]]),
      "</div>",
      '<div class="form-grid">',
      field("Serving", "servingAmount", item?.servingAmount || 1, { type: "number", min: 0, step: "0.1" }),
      field("Unit", "servingUnit", item?.servingUnit || "serving"),
      "</div>",
      '<div class="form-grid">',
      field("Calories", "calories", item?.calories, { type: "number", min: 0, step: "1" }),
      field("Protein (g)", "proteinGrams", item?.proteinGrams, { type: "number", min: 0, step: "0.1" }),
      field("Carbs (g)", "carbsGrams", item?.carbsGrams, { type: "number", min: 0, step: "0.1" }),
      field("Fat (g)", "fatGrams", item?.fatGrams, { type: "number", min: 0, step: "0.1" }),
      "</div>",
      textarea("Notes", "notes", item?.notes, "Optional serving or preparation details")
    ].join("");
  }
  if (kind === "wellnessRoutine") {
    return [
      field("Routine", "name", item?.name, { required: true, placeholder: "Vitamin D" }),
      '<div class="form-grid">',
      select("Type", "kind", item?.kind || "supplement", [["medication", "Medication"], ["supplement", "Supplement"]]),
      field("Dose", "dose", item?.dose, { placeholder: "Your recorded dose" }),
      "</div>",
      field("Schedule time", "scheduleTime", item?.scheduleTime || "09:00", { type: "time" }),
      textarea("Instructions", "instructions", item?.instructions, "Your own instructions"),
      '<input type="hidden" name="active" value="true">'
    ].join("");
  }
  if (kind === "workout") {
    const exercise = Array.isArray(item?.exercises) ? item.exercises[0] || {} : {};
    return [
      field("Workout", "name", item?.name, { required: true, placeholder: "Upper body" }),
      '<div class="form-grid">',
      field("Date", "date", item?.date || today, { type: "date", required: true }),
      select("Type", "type", item?.type || "strength", [["strength", "Strength"], ["cardio", "Cardio"], ["mobility", "Mobility"], ["sport", "Sport"], ["other", "Other"]]),
      "</div>",
      '<div class="form-grid">',
      field("Duration (min)", "durationMinutes", item?.durationMinutes, { type: "number", min: 0, step: "1" }),
      field("Distance (km)", "distanceKm", item?.distanceKm, { type: "number", min: 0, step: "0.01" }),
      field("Effort (1-5)", "effort", item?.effort, { type: "number", min: 1, max: 5, step: "1" }),
      "</div>",
      "<details><summary>Add a main exercise</summary><div class=\"stack\">",
      field("Exercise", "exerciseName", exercise.name, { placeholder: "Bench press" }),
      '<div class="form-grid">',
      field("Sets", "exerciseSets", exercise.sets, { type: "number", min: 0, step: "1" }),
      field("Reps", "exerciseReps", exercise.reps, { type: "number", min: 0, step: "1" }),
      field("Weight (kg)", "exerciseWeightKg", exercise.weightKg, { type: "number", min: 0, step: "0.1" }),
      "</div></div></details>",
      textarea("Notes", "notes", item?.notes, "How did the session go?")
    ].join("");
  }
  if (kind === "trainingPlan") {
    return [
      field("Plan name", "name", item?.name, { required: true, placeholder: "Three-day strength plan" }),
      field("Goal", "goal", item?.goal, { placeholder: "Build consistency" }),
      field("Sessions per week", "weeklyTarget", item?.weeklyTarget || 3, { type: "number", min: 1, max: 14, step: "1" }),
      '<input type="hidden" name="active" value="true">'
    ].join("");
  }
  if (kind === "financeEntry") {
    return [
      field("Description", "label", item?.label, { required: true, placeholder: "Groceries" }),
      '<div class="form-grid">',
      field("Date", "date", item?.date || today, { type: "date", required: true }),
      select("Type", "kind", item?.kind || "expense", [["expense", "Expense"], ["income", "Income"], ["refund", "Refund"]]),
      "</div>",
      '<div class="form-grid">',
      field("Amount", "amount", item?.amountMinor === undefined ? "" : Number(item.amountMinor) / 100, { type: "number", min: 0, step: "0.01", required: true }),
      field("Currency", "currency", item?.currency || ctx?.currency || "GBP", { required: true }),
      "</div>",
      '<div class="form-grid">',
      field("Category", "category", item?.category || "General"),
      field("Account", "account", item?.account || "Default"),
      "</div>",
      textarea("Notes", "notes", item?.notes)
    ].join("");
  }
  if (kind === "financeBudget") {
    return [
      field("Category", "category", item?.category, { required: true, placeholder: "Groceries" }),
      field("Monthly limit", "monthlyLimit", item?.monthlyLimitMinor === undefined ? "" : Number(item.monthlyLimitMinor) / 100, { type: "number", min: 0, step: "0.01", required: true }),
      '<input type="hidden" name="active" value="true">'
    ].join("");
  }
  if (kind === "financeRecurring") {
    return [
      field("Name", "name", item?.name, { required: true, placeholder: "Internet bill" }),
      '<div class="form-grid">',
      field("Amount", "amount", item?.amountMinor === undefined ? "" : Number(item.amountMinor) / 100, { type: "number", min: 0, step: "0.01", required: true }),
      select("Type", "kind", item?.kind || "expense", [["expense", "Expense"], ["income", "Income"]]),
      "</div>",
      '<div class="form-grid">',
      select("Frequency", "frequency", item?.frequency || "monthly", [["weekly", "Weekly"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["yearly", "Yearly"]]),
      field("Next due", "nextDueDate", item?.nextDueDate || today, { type: "date", required: true }),
      "</div>",
      field("Category", "category", item?.category || "Bills"),
      field("Currency", "currency", item?.currency || ctx?.currency || "GBP"),
      '<input type="hidden" name="active" value="true">'
    ].join("");
  }
  if (kind === "financeGoal") {
    return [
      field("Goal", "name", item?.name, { required: true, placeholder: "Emergency fund" }),
      select("Type", "kind", item?.kind || "saving", [["saving", "Saving"], ["debt", "Debt"]]),
      '<div class="form-grid">',
      field("Target amount", "targetAmount", item?.targetAmountMinor === undefined ? "" : Number(item.targetAmountMinor) / 100, { type: "number", min: 0, step: "0.01", required: true }),
      field("Current amount", "currentAmount", item?.currentAmountMinor === undefined ? "" : Number(item.currentAmountMinor) / 100, { type: "number", min: 0, step: "0.01" }),
      "</div>",
      field("Target date", "targetDate", item?.targetDate, { type: "date" }),
      '<input type="hidden" name="active" value="true">'
    ].join("");
  }
  if (kind === "learningItem") {
    return [
      field("Title", "title", item?.title, { required: true, placeholder: "Learn conversational Spanish" }),
      '<div class="form-grid">',
      select("Type", "kind", item?.kind || "skill", [["book", "Book"], ["course", "Course"], ["skill", "Skill"], ["article", "Article"], ["other", "Other"]]),
      select("Status", "status", item?.status || "active", [["planned", "Planned"], ["active", "Active"], ["paused", "Paused"], ["completed", "Completed"]]),
      "</div>",
      '<div class="form-grid">',
      field("Progress", "progress", item?.progress || 0, { type: "number", min: 0, step: "0.1" }),
      field("Target", "target", item?.target || 100, { type: "number", min: 0, step: "0.1" }),
      field("Unit", "unit", item?.unit || "%"),
      "</div>",
      field("Source", "source", item?.source, { placeholder: "Book, course, or URL" }),
      textarea("Notes", "notes", item?.notes)
    ].join("");
  }
  if (kind === "learningLog") {
    return [
      field("Session title", "title", item?.title, { required: true, placeholder: "Chapter 3 review" }),
      '<div class="form-grid">',
      field("Date", "date", item?.date || today, { type: "date", required: true }),
      field("Duration (min)", "durationMinutes", item?.durationMinutes || 25, { type: "number", min: 1, max: 1440, step: "1", required: true }),
      "</div>",
      field("Learning item ID", "learningItemId", item?.learningItemId, { placeholder: "Optional" }),
      textarea("What did you learn?", "note", item?.note)
    ].join("");
  }
  if (kind === "learningNote") {
    return [
      field("Note title", "title", item?.title, { required: true }),
      field("Learning item ID", "learningItemId", item?.learningItemId, { placeholder: "Optional" }),
      textarea("Note", "body", item?.body, "Write the key idea in your own words"),
      field("Next review", "nextReviewDate", item?.nextReviewDate || today, { type: "date" })
    ].join("");
  }
  if (kind === "task") {
    return [
      field("Task", "title", item?.title, { required: true, placeholder: "What needs doing?" }),
      '<div class="form-grid">',
      field("Due", "dueDate", item?.dueDate || today, { type: "date" }),
      select("Priority", "priority", item?.priority || "medium", [["low", "Low"], ["medium", "Medium"], ["high", "High"]]),
      "</div>",
      textarea("Notes", "notes", item?.notes, "Optional context")
    ].join("");
  }
  if (kind === "reminder") {
    return [
      field("Reminder", "title", item?.title, { required: true }),
      field("When", "dueAt", toLocalDateTime(item?.dueAt), { type: "datetime-local", required: true }),
      select("Type", "kind", item?.kind || "personal", [["personal", "Personal"], ["work", "Work"], ["health", "Health"]])
    ].join("");
  }
  if (kind === "event") {
    return [
      field("Event", "title", item?.title, { required: true }),
      '<div class="form-grid">',
      field("Starts", "start", toLocalDateTime(item?.start), { type: "datetime-local", required: true }),
      field("Ends", "end", toLocalDateTime(item?.end || Date.now() + 3600000), { type: "datetime-local", required: true }),
      "</div>",
      '<div class="form-grid">',
      select("Category", "category", item?.category || "personal", [["personal", "Personal"], ["work", "Work"], ["health", "Health"], ["focus", "Focus"]]),
      field("Location", "location", item?.location),
      "</div>",
      textarea("Notes", "notes", item?.notes)
    ].join("");
  }
  if (kind === "habit") {
    return [
      field("Habit", "name", item?.name, { required: true, placeholder: "Read, walk, stretch..." }),
      '<div class="form-grid">',
      field("Target", "target", item?.target || 1, { type: "number", min: 1, max: 1000 }),
      field("Unit", "unit", item?.unit || "times"),
      "</div>",
      select("Frequency", "frequency", item?.frequency || "daily", [["daily", "Daily"], ["weekdays", "Weekdays"], ["weekly", "Weekly"]])
    ].join("");
  }
  if (kind === "improvement") {
    return [
      field("Improvement", "title", item?.title, { required: true, placeholder: "What are you improving?" }),
      '<div class="form-grid">',
      field("Area", "area", item?.area || "Personal"),
      field("Metric", "metric", item?.metric || "%"),
      "</div>",
      '<div class="form-grid">',
      field("Current", "progress", item?.progress || 0, { type: "number", step: "0.1" }),
      field("Target", "target", item?.target || 100, { type: "number", min: 1, step: "0.1" }),
      "</div>"
    ].join("");
  }
  if (kind === "personalGoal") {
    return [
      field("Goal", "title", item?.title, { required: true, placeholder: "What outcome matters?" }),
      textarea("Why it matters", "description", item?.description, "Keep the outcome specific and meaningful"),
      '<div class="form-grid">',
      field("Area", "area", item?.area || "Personal"),
      select("Priority", "priority", item?.priority || "medium", [["low", "Low"], ["medium", "Medium"], ["high", "High"]]),
      "</div>",
      '<div class="form-grid">',
      select("Progress", "progressMode", item?.progressMode || "milestones", [["milestones", "Milestones"], ["manual", "Manual value"]]),
      select("Status", "status", item?.status || "active", [["planned", "Planned"], ["active", "Active"], ["paused", "Paused"], ["completed", "Completed"]]),
      "</div>",
      '<div class="form-grid">',
      field("Current", "current", item?.current ?? 0, { type: "number", min: 0, step: "0.1" }),
      field("Target", "target", item?.target ?? 100, { type: "number", min: 0.1, step: "0.1" }),
      field("Unit", "unit", item?.unit || "%"),
      "</div>",
      '<div class="form-grid">',
      field("Start date", "startDate", item?.startDate || today, { type: "date" }),
      field("Target date", "targetDate", item?.targetDate, { type: "date" }),
      "</div>"
    ].join("");
  }
  if (kind === "goalMilestone") {
    return [
      `<input type="hidden" name="goalId" value="${escapeHtml(item?.goalId || editor.parentId || "")}">`,
      field("Milestone", "title", item?.title, { required: true, placeholder: "A clear checkpoint" }),
      '<div class="form-grid">',
      field("Target date", "targetDate", item?.targetDate, { type: "date" }),
      field("Weight", "weight", item?.weight ?? 1, { type: "number", min: 0.1, step: "0.1" }),
      "</div>"
    ].join("");
  }
  if (kind === "dailyRoutineItem") {
    return [
      field("Routine item", "title", item?.title, { required: true, placeholder: "Plan the day" }),
      '<div class="form-grid">',
      select("Period", "period", item?.period || editor.period || "morning", [["morning", "Morning"], ["evening", "Evening"]]),
      field("Order", "order", item?.order ?? 0, { type: "number", min: 0, step: 1 }),
      "</div>",
      select("Open page", "actionPage", item?.actionPage || "", [["", "No linked page"], ["today", "Today"], ["calendar", "Calendar"], ["tasks", "Tasks"], ["focus", "Focus"], ["health", "Health"], ["progress", "Progress"], ["insights", "Insights"]]),
      '<input type="hidden" name="active" value="true">'
    ].join("");
  }
  if (kind === "medicalAppointment") {
    return [
      field("Appointment", "title", item?.title, { required: true, placeholder: "GP appointment" }),
      '<div class="form-grid">',
      field("Starts", "start", toLocalDateTime(item?.start), { type: "datetime-local", required: true }),
      field("Ends", "end", toLocalDateTime(item?.end || Date.now() + 3600000), { type: "datetime-local" }),
      "</div>",
      '<div class="form-grid">',
      field("Provider", "provider", item?.provider),
      field("Location", "location", item?.location),
      "</div>",
      select("Status", "status", item?.status || "scheduled", [["scheduled", "Scheduled"], ["completed", "Completed"], ["cancelled", "Cancelled"]]),
      textarea("Reason", "reason", item?.reason, "Your own appointment context"),
      textarea("Notes", "notes", item?.notes, "Preparation or follow-up notes"),
      field("Follow-up date", "followUpDate", item?.followUpDate, { type: "date" })
    ].join("");
  }
  if (kind === "medicalRecord") {
    return [
      field("Record title", "title", item?.title, { required: true, placeholder: "Blood test results" }),
      '<div class="form-grid">',
      field("Date", "date", item?.date || today, { type: "date", required: true }),
      select("Type", "kind", item?.kind || "visit", [["visit", "Visit"], ["test", "Test"], ["diagnosis", "Diagnosis"], ["procedure", "Procedure"], ["vaccination", "Vaccination"], ["other", "Other"]]),
      "</div>",
      field("Provider", "provider", item?.provider),
      textarea("Summary", "summary", item?.summary, "A factual summary for your own records"),
      field("Reference label", "referenceLabel", item?.referenceLabel, { placeholder: "Optional label, no file path" })
    ].join("");
  }
  if (kind === "emergencyProfile") {
    return [
      field("Blood type", "bloodType", item?.bloodType, { placeholder: "If known" }),
      textarea("Allergies", "allergies", item?.allergies),
      textarea("Conditions", "conditions", item?.conditions),
      textarea("Current medications", "medications", item?.medications, "Your record; do not use this app for dosing"),
      '<div class="form-grid">',
      field("Emergency contact", "emergencyContactName", item?.emergencyContactName),
      field("Contact phone", "emergencyContactPhone", item?.emergencyContactPhone, { type: "tel" }),
      "</div>",
      textarea("Other notes", "notes", item?.notes)
    ].join("");
  }
  if (kind === "work") {
    return [
      field("Work item", "title", item?.title, { required: true, placeholder: "Project, document, or result" }),
      '<div class="form-grid">',
      field("Project", "project", item?.project || "Personal"),
      select("Status", "status", item?.status || "active", [["active", "Active"], ["waiting", "Waiting"], ["done", "Done"], ["archived", "Archived"]]),
      "</div>",
      textarea("Summary", "summary", item?.summary, "What changed or what comes next?"),
      field("Tags", "tags", Array.isArray(item?.tags) ? item.tags.join(", ") : item?.tags || ""),
      field("Link", "link", item?.link || "", { type: "url", placeholder: "https://..." })
    ].join("");
  }
  if (kind === "journal" || kind === "reflection") {
    return [
      field("Title", "title", item?.title || (kind === "reflection" ? "Weekly reflection" : "Daily note")),
      field("Date", "date", item?.date || today, { type: "date" }),
      textarea("Note", "body", item?.body, kind === "reflection" ? "What worked, what did not, and what will change?" : "Capture the moment"),
      field("Mood (1-5)", "mood", item?.mood || 3, { type: "number", min: 1, max: 5 })
    ].join("");
  }
  return `<p class="empty-state">This editor is not available yet.</p>`;
}

function titleFor(kind, exists) {
  const names = {
    task: "task",
    reminder: "reminder",
    event: "event",
    habit: "habit",
    improvement: "improvement",
    personalGoal: "goal",
    goalMilestone: "milestone",
    dailyRoutineItem: "routine item",
    medicalAppointment: "appointment",
    medicalRecord: "medical record",
    emergencyProfile: "emergency profile",
    work: "work item",
    journal: "note",
    reflection: "reflection",
    nutrition: "meal",
    wellnessRoutine: "wellness routine",
    workout: "workout",
    trainingPlan: "training plan",
    financeEntry: "transaction",
    financeBudget: "budget",
    financeRecurring: "recurring item",
    financeGoal: "finance goal",
    learningItem: "learning item",
    learningLog: "study session",
    learningNote: "learning note"
  };
  return `${exists ? "Edit" : "Add"} ${names[kind] || "item"}`;
}

function submitLabel(kind, exists) {
  if (exists) return "Save changes";
  const names = {
    task: "task",
    reminder: "reminder",
    event: "event",
    habit: "habit",
    improvement: "improvement",
    personalGoal: "goal",
    goalMilestone: "milestone",
    dailyRoutineItem: "routine item",
    medicalAppointment: "appointment",
    medicalRecord: "medical record",
    emergencyProfile: "emergency profile",
    work: "work item",
    journal: "note",
    reflection: "reflection",
    nutrition: "meal",
    wellnessRoutine: "wellness routine",
    workout: "workout",
    trainingPlan: "training plan",
    financeEntry: "transaction",
    financeBudget: "budget",
    financeRecurring: "recurring item",
    financeGoal: "finance goal",
    learningItem: "learning item",
    learningLog: "study session",
    learningNote: "learning note"
  };
  return `Add ${names[kind] || "item"}`;
}

function collectionFor(kind) {
  return {
    task: "tasks",
    reminder: "reminders",
    event: "events",
    habit: "habits",
    improvement: "improvements",
    personalGoal: "personalGoals",
    goalMilestone: "goalMilestones",
    dailyRoutineItem: "dailyRoutineItems",
    medicalAppointment: "medicalAppointments",
    medicalRecord: "medicalRecords",
    emergencyProfile: "emergencyProfiles",
    work: "workItems",
    journal: "journalEntries",
    reflection: "journalEntries",
    nutrition: "nutritionEntries",
    wellnessRoutine: "wellnessRoutines",
    workout: "workoutSessions",
    trainingPlan: "trainingPlans",
    financeEntry: "financeEntries",
    financeBudget: "financeBudgets",
    financeRecurring: "financeRecurring",
    financeGoal: "financeGoals",
    learningItem: "learningItems",
    learningLog: "learningLogs",
    learningNote: "learningNotes"
  }[kind];
}

export function renderEditor(state, editor, ctx) {
  if (!editor?.kind) return "";
  const collection = collectionFor(editor.kind);
  const existingItem = collection && editor.id
    ? (Array.isArray(state[collection]) ? state[collection] : []).find((entry) => entry.id === editor.id)
    : null;
  const item = existingItem || (
    editor.prefill && typeof editor.prefill === "object"
      ? editor.prefill
      : null
  );
  const exists = Boolean(existingItem);
  return `
    <div class="modal-backdrop" data-action="close-editor">
      <section class="modal-card editor-card editor-card--${escapeHtml(editor.kind)}" role="dialog" aria-modal="true" aria-labelledby="editor-title" aria-describedby="editor-description" data-editor-dialog>
        <header class="modal-header editor-card__header">
          <div>
            <h2 id="editor-title">${titleFor(editor.kind, exists)}</h2>
            <p class="modal__description" id="editor-description">${exists ? "Update the details below." : "Add the essential details now. You can edit them later."}</p>
          </div>
          <button class="icon-button" type="button" data-action="close-editor" aria-label="Close">${icon("close")}</button>
        </header>
        <form class="editor-form" data-editor-form data-kind="${escapeHtml(editor.kind)}" data-id="${escapeHtml(editor.id || "")}">
          <div class="editor-form__body stack">
            ${editorBody(editor.kind, item, ctx, editor)}
          </div>
          <footer class="modal-actions editor-card__actions">
            <button class="button button--ghost ghost" type="button" data-action="close-editor">Cancel</button>
            <button class="button button--primary primary" type="submit">${submitLabel(editor.kind, exists)}</button>
          </footer>
        </form>
      </section>
    </div>
  `;
}

export function bindEditor(root, actions) {
  if (!root) return;
  root.querySelectorAll('[data-action="close-editor"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      if (event.target.closest("[data-editor-dialog]") && event.currentTarget.classList.contains("modal-backdrop")) return;
      actions.closeEditor?.();
    });
  });
  const dialog = root.querySelector("[data-editor-dialog]");
  dialog?.addEventListener("click", (event) => event.stopPropagation());
  dialog?.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    actions.closeEditor?.();
  });
  root.querySelector("[data-editor-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const kind = form.dataset.kind;
    const itemId = form.dataset.id;
    [
      "target", "progress", "mood", "servingAmount", "calories", "proteinGrams",
      "carbsGrams", "fatGrams", "durationMinutes", "distanceKm", "effort",
      "weeklyTarget", "exerciseSets", "exerciseReps", "exerciseWeightKg",
      "current", "weight", "order"
    ].forEach((key) => {
      if (key in values) values[key] = values[key] === "" ? null : Number(values[key]);
    });
    ["start", "end", "dueAt"].forEach((key) => {
      if (values[key]) values[key] = new Date(values[key]).toISOString();
    });
    ["active"].forEach((key) => {
      if (key in values) values[key] = values[key] !== "false";
    });
    if (kind === "workout") {
      const exercise = String(values.exerciseName || "").trim()
        ? [{
            name: String(values.exerciseName).trim(),
            sets: values.exerciseSets,
            reps: values.exerciseReps,
            weightKg: values.exerciseWeightKg
          }]
        : [];
      delete values.exerciseName;
      delete values.exerciseSets;
      delete values.exerciseReps;
      delete values.exerciseWeightKg;
      values.exercises = exercise;
    }
    if (["financeEntry", "financeRecurring"].includes(kind)) {
      values.amountMinor = decimalToMinorUnits(values.amount);
      delete values.amount;
    }
    if (kind === "financeBudget") {
      values.monthlyLimitMinor = decimalToMinorUnits(values.monthlyLimit);
      delete values.monthlyLimit;
    }
    if (kind === "financeGoal") {
      values.targetAmountMinor = decimalToMinorUnits(values.targetAmount);
      values.currentAmountMinor = decimalToMinorUnits(values.currentAmount);
      delete values.targetAmount;
      delete values.currentAmount;
    }
    if (kind === "nutrition") {
      values.sourceType = "manual";
      values.confidence = "manual";
    }
    if (kind === "journal" || kind === "reflection") {
      actions.dispatch?.({ type: "journal/add", payload: values });
    } else if (itemId) {
      const action = { type: `${kind}/update`, payload: { id: itemId, patch: values } };
      if (kind.startsWith("medical") || kind === "emergencyProfile") actions.commitMedicalAction?.(action);
      else actions.dispatch?.(action);
    } else {
      const action = { type: `${kind}/add`, payload: values };
      if (kind.startsWith("medical") || kind === "emergencyProfile") actions.commitMedicalAction?.(action);
      else actions.dispatch?.(action);
    }
    if (!(kind.startsWith("medical") || kind === "emergencyProfile")) actions.closeEditor?.();
  });
  window.setTimeout(() => {
    root.querySelector("[data-editor-form] input, [data-editor-form] textarea, [data-editor-form] select")?.focus({ preventScroll: true });
  }, 0);
}
