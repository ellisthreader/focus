import test from "node:test";
import assert from "node:assert/strict";
import { bind, render } from "../src/features/medical-view.mjs";

const ctx = {
  now: new Date(2026, 5, 8, 12),
  locale: "en-GB",
  medicalVault: { available: true, status: "ready", error: "" }
};

function rootHarness() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    contains() {
      return true;
    }
  };
}

function control(dataset, owner = {}) {
  return {
    dataset,
    disabled: false,
    closest(selector) {
      if (selector === "[data-action]") return this;
      if (selector === "[data-medical-appointment-id]" && owner.appointmentId) {
        return { dataset: { medicalAppointmentId: owner.appointmentId } };
      }
      if (selector === "[data-medical-record-id]" && owner.recordId) {
        return { dataset: { medicalRecordId: owner.recordId } };
      }
      return null;
    }
  };
}

test("unavailable vault hides all medical state and explains the failure", () => {
  const html = render({
    medicalAppointments: [{ id: "appointment-1", title: "Sensitive appointment" }],
    medicalRecords: [{ id: "record-1", title: "Sensitive record" }],
    emergencyProfile: { id: "profile-1", allergies: ["Sensitive allergy"] }
  }, {
    ...ctx,
    medicalVault: {
      available: false,
      status: "error",
      error: "<Keychain unavailable>"
    }
  });

  assert.match(html, /Secure storage unavailable/);
  assert.match(html, /&lt;Keychain unavailable&gt;/);
  assert.match(html, /will not fall back to ordinary app storage/);
  assert.match(html, /data-action="medical\/retry-vault"/);
  assert.doesNotMatch(html, /Sensitive appointment|Sensitive record|Sensitive allergy/);
});

test("renders clean appointment, record, emergency, and safety sections", () => {
  const html = render({
    medicalAppointments: [
      {
        id: "future",
        title: "<Dental check>",
        startAt: new Date(2026, 5, 10, 9).getTime(),
        provider: "Town clinic",
        location: "Douglas",
        status: "confirmed"
      },
      {
        id: "past",
        title: "Eye test",
        date: "2026-05-01",
        provider: "Optician"
      },
      { id: "deleted", title: "Deleted appointment", date: "2026-06-12", deletedAt: 1 }
    ],
    medicalRecords: [{
      id: "record-1",
      title: "Blood test",
      kind: "test_result",
      date: "2026-06-01",
      provider: "Town clinic",
      summary: "<Review with clinician>",
      documentLabel: "Lab report",
      documentPath: "/home/person/private-diagnosis.pdf"
    }],
    emergencyProfile: {
      id: "profile-1",
      bloodType: "O+",
      allergies: ["Penicillin"],
      conditions: "Asthma",
      medications: ["Inhaler"],
      contacts: [{ name: "Alex", relationship: "Partner", phone: "01234" }],
      updatedAt: new Date(2026, 5, 8, 10).getTime()
    }
  }, ctx);

  assert.match(html, /<section class="health-subview medical-view"/);
  assert.doesNotMatch(html, /<main|data-page=/);
  assert.match(html, /1 upcoming · 1 past/);
  assert.match(html, /&lt;Dental check&gt;/);
  assert.match(html, /Past appointments \(1\)/);
  assert.doesNotMatch(html, /Deleted appointment/);
  assert.match(html, /Blood Test|Test Result/);
  assert.match(html, /&lt;Review with clinician&gt;/);
  assert.match(html, /Document reference: Lab report/);
  assert.doesNotMatch(html, /private-diagnosis|documentPath/);
  assert.match(html, /Emergency profile/);
  assert.match(html, /Last updated/);
  assert.match(html, /Penicillin/);
  assert.match(html, /Do not rely on Focus during an emergency/);
  assert.match(html, /does not diagnose conditions/);
});

test("renders accessible empty organizer states", () => {
  const html = render({}, ctx);

  assert.match(html, /aria-labelledby="medical-title"/);
  assert.match(html, /aria-labelledby="medical-appointments-title"/);
  assert.match(html, /aria-labelledby="medical-records-title"/);
  assert.match(html, /No upcoming appointments/);
  assert.match(html, /No medical records added/);
  assert.match(html, /Emergency profile · Not set up/);
  assert.match(html, /data-action="medical\/add-appointment"/);
  assert.match(html, /data-action="medical\/add-record"/);
});

test("bind opens medical editors, dispatches deletes, and handles vault controls", () => {
  const root = rootHarness();
  const opened = [];
  const dispatched = [];
  let retries = 0;
  let settings = 0;

  bind(root, {
    openEditor(kind, id) {
      opened.push([kind, id]);
    },
    dispatch(action) {
      dispatched.push(action);
    },
    retryMedicalVault() {
      retries += 1;
    },
    openMedicalSettings() {
      settings += 1;
    }
  });

  const click = root.listeners.get("click");
  click({ target: control({ action: "medical/add-appointment" }) });
  click({ target: control({ action: "medical/edit-appointment" }, { appointmentId: "appointment-1" }) });
  click({ target: control({ action: "medical/delete-appointment" }, { appointmentId: "appointment-1" }) });
  click({ target: control({ action: "medical/add-record" }) });
  click({ target: control({ action: "medical/edit-record" }, { recordId: "record-1" }) });
  click({ target: control({ action: "medical/delete-record" }, { recordId: "record-1" }) });
  click({ target: control({ action: "medical/edit-emergency-profile", id: "profile-1" }) });
  click({ target: control({ action: "medical/delete-emergency-profile", id: "profile-1" }) });
  click({ target: control({ action: "medical/retry-vault" }) });
  click({ target: control({ action: "medical/open-settings" }) });

  assert.deepEqual(opened, [
    ["medicalAppointment", undefined],
    ["medicalAppointment", "appointment-1"],
    ["medicalRecord", undefined],
    ["medicalRecord", "record-1"],
    ["emergencyProfile", "profile-1"]
  ]);
  assert.deepEqual(dispatched, [
    { type: "medicalAppointment/delete", payload: { id: "appointment-1" } },
    { type: "medicalRecord/delete", payload: { id: "record-1" } },
    { type: "emergencyProfile/delete", payload: { id: "profile-1" } }
  ]);
  assert.equal(retries, 1);
  assert.equal(settings, 1);
});

test("rebinding replaces the delegated click listener", () => {
  const root = rootHarness();
  let first = 0;
  let second = 0;

  bind(root, { retryMedicalVault() { first += 1; } });
  bind(root, { retryMedicalVault() { second += 1; } });
  root.listeners.get("click")({ target: control({ action: "medical/retry-vault" }) });

  assert.equal(first, 0);
  assert.equal(second, 1);
});
