const bindings = new WeakMap();

function list(value) {
  return Array.isArray(value) ? value.filter((item) => item && !item.deletedAt) : [];
}

function clean(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function titleCase(value, fallback = "") {
  const text = clean(value).replace(/[_-]+/g, " ");
  return text ? text.replace(/\b\w/g, (letter) => letter.toUpperCase()) : fallback;
}

function timestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function recordDate(record) {
  return timestamp(
    record?.startAt
      ?? record?.start
      ?? record?.date
      ?? record?.recordedAt
      ?? record?.createdAt
  );
}

function formatDate(value, ctx = {}, includeTime = false) {
  const time = timestamp(value);
  if (time === null) return "";
  const options = {
    day: "numeric",
    month: "short",
    year: "numeric"
  };
  if (includeTime) {
    options.hour = "numeric";
    options.minute = "2-digit";
  }
  return new Intl.DateTimeFormat(ctx.locale, options).format(new Date(time));
}

function dateTimeAttribute(value) {
  const time = timestamp(value);
  return time === null ? "" : new Date(time).toISOString();
}

function nowTime(ctx = {}) {
  const value = typeof ctx.now === "function" ? ctx.now() : ctx.now;
  return timestamp(value) ?? Date.now();
}

function textList(value) {
  if (Array.isArray(value)) {
    return value.map(clean).filter(Boolean);
  }
  return clean(value)
    .split(/\r?\n|,/)
    .map(clean)
    .filter(Boolean);
}

function activeEmergencyProfile(state) {
  if (state?.emergencyProfile && !state.emergencyProfile.deletedAt) {
    return state.emergencyProfile;
  }
  return list(state?.emergencyProfiles)
    .sort((left, right) => (timestamp(right.updatedAt) ?? 0) - (timestamp(left.updatedAt) ?? 0))[0] || null;
}

function renderUnavailable(vault) {
  const pending = ["checking", "initializing", "loading"].includes(clean(vault?.status).toLowerCase());
  const error = clean(vault?.error);
  return `
    <section class="health-subview medical-view" data-health-view="medical" aria-labelledby="medical-title">
      <header class="health-subview__header">
        <div>
          <p class="eyebrow">Private organizer</p>
          <h2 id="medical-title">Medical</h2>
          <p class="muted">Appointments, personal records, and emergency details.</p>
        </div>
      </header>
      <section class="card" aria-labelledby="medical-storage-title">
        <header class="card__header">
          <div>
            <h3 class="card__title" id="medical-storage-title">${pending ? "Checking secure storage" : "Secure storage unavailable"}</h3>
            <p class="card__description">${pending
              ? "Medical records will appear after the local vault is ready."
              : "Medical records are hidden because the local vault is not available."}</p>
          </div>
        </header>
        <div class="card__body">
          ${error ? `<p role="alert">${escapeHtml(error)}</p>` : `<p role="status">${pending ? "Checking this device now." : "No medical information has been loaded."}</p>`}
          <p class="muted">Focus will not fall back to ordinary app storage for medical information.</p>
          <div class="toolbar-row">
            <button class="button button--secondary button--sm" type="button" data-action="medical/retry-vault">Check again</button>
            <button class="button button--ghost button--sm" type="button" data-action="medical/open-settings">Open settings</button>
          </div>
        </div>
      </section>
      ${renderSafetyCopy()}
    </section>
  `;
}

function renderAppointment(appointment, ctx, isPast) {
  const id = escapeHtml(appointment.id);
  const dateValue = appointment.startAt ?? appointment.start ?? appointment.date;
  const title = clean(appointment.title || appointment.name || appointment.reason) || "Untitled appointment";
  const supporting = [
    clean(appointment.provider),
    clean(appointment.location),
    titleCase(appointment.status)
  ].filter(Boolean);

  return `
    <li class="list-row" data-medical-appointment-id="${id}">
      <span class="badge${isPast ? "" : " success"}">${isPast ? "Past" : "Upcoming"}</span>
      <span class="row-content">
        <strong>${escapeHtml(title)}</strong>
        ${dateValue ? `<time datetime="${escapeHtml(dateTimeAttribute(dateValue))}">${escapeHtml(formatDate(dateValue, ctx, Boolean(appointment.startAt || appointment.start)))}</time>` : "<span>Date not set</span>"}
        ${supporting.length ? `<span>${supporting.map(escapeHtml).join(" · ")}</span>` : ""}
      </span>
      <div class="toolbar-row">
        <button class="button button--ghost button--sm" type="button" data-action="medical/edit-appointment" aria-label="Edit ${escapeHtml(title)}">Edit</button>
        <button class="button button--ghost button--sm" type="button" data-action="medical/delete-appointment" aria-label="Delete ${escapeHtml(title)}">Delete</button>
      </div>
    </li>
  `;
}

function renderAppointments(state, ctx) {
  const now = nowTime(ctx);
  const appointments = list(state.medicalAppointments)
    .sort((left, right) => (recordDate(left) ?? Number.MAX_SAFE_INTEGER) - (recordDate(right) ?? Number.MAX_SAFE_INTEGER));
  const upcoming = appointments.filter((item) => (recordDate(item) ?? Number.MAX_SAFE_INTEGER) >= now);
  const past = appointments
    .filter((item) => (recordDate(item) ?? Number.MAX_SAFE_INTEGER) < now)
    .sort((left, right) => (recordDate(right) ?? 0) - (recordDate(left) ?? 0));

  return `
    <section class="card" aria-labelledby="medical-appointments-title">
      <header class="card__header">
        <div>
          <h3 class="card__title" id="medical-appointments-title">Appointments</h3>
          <p class="card__description">${upcoming.length} upcoming · ${past.length} past</p>
        </div>
        <button class="button button--secondary button--sm" type="button" data-action="medical/add-appointment">Add appointment</button>
      </header>
      <div class="card__body">
        ${upcoming.length
          ? `<ul class="item-list" aria-label="Upcoming medical appointments">${upcoming.map((item) => renderAppointment(item, ctx, false)).join("")}</ul>`
          : '<p class="empty-state">No upcoming appointments.</p>'}
        ${past.length ? `
          <details>
            <summary>Past appointments (${past.length})</summary>
            <ul class="item-list" aria-label="Past medical appointments">${past.map((item) => renderAppointment(item, ctx, true)).join("")}</ul>
          </details>
        ` : ""}
      </div>
    </section>
  `;
}

function renderRecord(record, ctx) {
  const id = escapeHtml(record.id);
  const title = clean(record.title || record.name) || "Untitled record";
  const kind = titleCase(record.kind || record.type, "Record");
  const dateValue = record.date ?? record.recordedAt ?? record.createdAt;
  const provider = clean(record.provider);
  const summary = clean(record.summary || record.notes);
  const documentLabel = clean(record.referenceLabel || record.documentLabel || record.attachmentLabel);

  return `
    <li class="list-row" data-medical-record-id="${id}">
      <span class="badge">${escapeHtml(kind)}</span>
      <span class="row-content">
        <strong>${escapeHtml(title)}</strong>
        <span>${[
          dateValue ? formatDate(dateValue, ctx) : "",
          provider
        ].filter(Boolean).map(escapeHtml).join(" · ") || "Date not set"}</span>
        ${summary ? `<span>${escapeHtml(summary)}</span>` : ""}
        ${documentLabel ? `<span>Document reference: ${escapeHtml(documentLabel)}</span>` : ""}
      </span>
      <div class="toolbar-row">
        <button class="button button--ghost button--sm" type="button" data-action="medical/edit-record" aria-label="Edit ${escapeHtml(title)}">Edit</button>
        <button class="button button--ghost button--sm" type="button" data-action="medical/delete-record" aria-label="Delete ${escapeHtml(title)}">Delete</button>
      </div>
    </li>
  `;
}

function renderRecords(state, ctx) {
  const records = list(state.medicalRecords)
    .sort((left, right) => (recordDate(right) ?? 0) - (recordDate(left) ?? 0));
  return `
    <section class="card" aria-labelledby="medical-records-title">
      <header class="card__header">
        <div>
          <h3 class="card__title" id="medical-records-title">Personal records</h3>
          <p class="card__description">A private organizer for information you enter yourself.</p>
        </div>
        <button class="button button--secondary button--sm" type="button" data-action="medical/add-record">Add record</button>
      </header>
      <div class="card__body">
        ${records.length
          ? `<ul class="item-list" aria-label="Medical records">${records.map((record) => renderRecord(record, ctx)).join("")}</ul>`
          : '<p class="empty-state">No medical records added.</p>'}
      </div>
    </section>
  `;
}

function renderProfileGroup(label, values) {
  const items = textList(values);
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${items.length ? items.map(escapeHtml).join(", ") : "Not recorded"}</dd>
    </div>
  `;
}

function contactText(contact) {
  if (typeof contact === "string") return clean(contact);
  return [
    clean(contact?.name),
    clean(contact?.relationship),
    clean(contact?.phone || contact?.telephone)
  ].filter(Boolean).join(" · ");
}

function renderEmergencyProfile(state, ctx) {
  const profile = activeEmergencyProfile(state);
  const id = clean(profile?.id);
  const contacts = list(profile?.contacts || profile?.emergencyContacts).map(contactText).filter(Boolean);
  const primaryContact = [clean(profile?.emergencyContactName), clean(profile?.emergencyContactPhone)].filter(Boolean).join(" · ");
  if (primaryContact) contacts.unshift(primaryContact);
  const updatedAt = profile?.updatedAt ?? profile?.createdAt;

  return `
    <details class="card" data-emergency-profile${profile ? "" : " data-empty"}>
      <summary>Emergency profile${profile ? "" : " · Not set up"}</summary>
      <div class="card__body">
        <div class="toolbar-row">
          <p class="muted">${updatedAt ? `Last updated ${escapeHtml(formatDate(updatedAt, ctx, true))}.` : "No emergency profile has been recorded."}</p>
          <button class="button button--secondary button--sm" type="button" data-action="medical/edit-emergency-profile" data-id="${escapeHtml(id)}">${profile ? "Edit profile" : "Set up profile"}</button>
        </div>
        ${profile ? `
          <dl class="summary-grid" aria-label="Emergency profile details">
            ${renderProfileGroup("Blood type", profile.bloodType)}
            ${renderProfileGroup("Allergies", profile.allergies)}
            ${renderProfileGroup("Conditions", profile.conditions)}
            ${renderProfileGroup("Medications", profile.medications)}
            ${renderProfileGroup("Emergency contacts", contacts)}
          </dl>
          <button class="button button--ghost button--sm" type="button" data-action="medical/delete-emergency-profile" data-id="${escapeHtml(id)}">Clear profile</button>
        ` : '<p class="empty-state">Add only the details you want available in this app.</p>'}
        <p class="disclaimer">This profile may be incomplete or out of date. Do not rely on Focus during an emergency; contact local emergency services.</p>
      </div>
    </details>
  `;
}

function renderSafetyCopy() {
  return `
    <p class="disclaimer">
      Focus organizes information you enter. It does not diagnose conditions, check treatment safety, provide medical advice,
      or replace a qualified healthcare professional.
    </p>
  `;
}

export function render(state = {}, ctx = {}) {
  if (ctx?.medicalVault?.available !== true) {
    return renderUnavailable(ctx?.medicalVault);
  }

  return `
    <section class="health-subview medical-view" data-health-view="medical" aria-labelledby="medical-title">
      <header class="health-subview__header">
        <div>
          <p class="eyebrow">Private organizer</p>
          <h2 id="medical-title">Medical</h2>
          <p class="muted">Appointments, personal records, and emergency details stored in the local medical vault.</p>
        </div>
      </header>
      <div class="page-grid">
        ${renderAppointments(state, ctx)}
        ${renderRecords(state, ctx)}
      </div>
      ${renderEmergencyProfile(state, ctx)}
      ${renderSafetyCopy()}
    </section>
  `;
}

function ownerId(control, selector, key) {
  return control.closest?.(selector)?.dataset?.[key] || clean(control.dataset?.id);
}

function commitMedical(actions, action) {
  if (typeof actions.commitMedicalAction === "function") actions.commitMedicalAction(action);
  else actions.dispatch?.(action);
}

export function bind(root, actions = {}) {
  if (!root?.addEventListener) return;
  const previous = bindings.get(root);
  if (previous) root.removeEventListener("click", previous);

  const click = (event) => {
    const control = event.target?.closest?.("[data-action]");
    if (!control || !root.contains(control) || control.disabled) return;

    const action = control.dataset.action;
    const appointmentId = ownerId(control, "[data-medical-appointment-id]", "medicalAppointmentId");
    const recordId = ownerId(control, "[data-medical-record-id]", "medicalRecordId");

    if (action === "medical/add-appointment") {
      actions.openEditor?.("medicalAppointment");
    } else if (action === "medical/edit-appointment" && appointmentId) {
      actions.openEditor?.("medicalAppointment", appointmentId);
    } else if (action === "medical/delete-appointment" && appointmentId) {
      commitMedical(actions, { type: "medicalAppointment/delete", payload: { id: appointmentId } });
    } else if (action === "medical/add-record") {
      actions.openEditor?.("medicalRecord");
    } else if (action === "medical/edit-record" && recordId) {
      actions.openEditor?.("medicalRecord", recordId);
    } else if (action === "medical/delete-record" && recordId) {
      commitMedical(actions, { type: "medicalRecord/delete", payload: { id: recordId } });
    } else if (action === "medical/edit-emergency-profile") {
      actions.openEditor?.("emergencyProfile", clean(control.dataset.id) || undefined);
    } else if (action === "medical/delete-emergency-profile" && control.dataset.id) {
      commitMedical(actions, { type: "emergencyProfile/delete", payload: { id: control.dataset.id } });
    } else if (action === "medical/retry-vault") {
      actions.retryMedicalVault?.();
    } else if (action === "medical/open-settings") {
      actions.openMedicalSettings?.();
    }
  };

  root.addEventListener("click", click);
  bindings.set(root, click);
}
