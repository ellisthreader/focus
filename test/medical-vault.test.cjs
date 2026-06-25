"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  decodeLocalState,
  encodeLocalState,
  getMedicalVaultCapability
} = require("../medical-vault.cjs");

function createSafeStorage(options = {}) {
  return {
    isEncryptionAvailable: () => options.available !== false,
    getSelectedStorageBackend: () => options.backend || "gnome_libsecret",
    encryptString(value) {
      if (options.encryptError) throw options.encryptError;
      return Buffer.from(`protected:${value}`, "utf8");
    },
    decryptString(value) {
      if (options.decryptError) throw options.decryptError;
      const text = value.toString("utf8");
      if (!text.startsWith("protected:")) throw new Error("invalid ciphertext");
      return text.slice("protected:".length);
    }
  };
}

test("reports only verified protected Linux backends as available", () => {
  assert.equal(getMedicalVaultCapability(createSafeStorage(), "linux").available, true);

  const basicText = getMedicalVaultCapability(createSafeStorage({ backend: "basic_text" }), "linux");
  assert.equal(basicText.available, false);
  assert.equal(basicText.code, "SAFE_STORAGE_INSECURE_BACKEND");

  const unknown = getMedicalVaultCapability({
    ...createSafeStorage(),
    getSelectedStorageBackend: undefined
  }, "linux");
  assert.equal(unknown.available, false);
  assert.equal(unknown.code, "SAFE_STORAGE_BACKEND_UNKNOWN");
});

test("round trips medical state without plaintext medical collections", () => {
  const safeStorage = createSafeStorage();
  const state = {
    tasks: [{ id: "task-1", title: "Normal task" }],
    medicalAppointments: [{ id: "appointment-1", title: "Sensitive appointment" }],
    medicalRecords: [{ id: "record-1", summary: "Sensitive summary" }],
    medicalHistory: [{ id: "history-1", detail: "Future medical collection" }],
    emergencyProfiles: [{ id: "emergency-profile", bloodType: "O+" }]
  };

  const encoded = encodeLocalState(state, {
    safeStorage,
    platform: "linux",
    updatedAt: "2026-06-08T12:00:00.000Z"
  });
  const envelope = JSON.parse(encoded);

  assert.equal(envelope.version, 2);
  assert.deepEqual(envelope.state.tasks, state.tasks);
  assert.equal("medicalAppointments" in envelope.state, false);
  assert.equal("medicalRecords" in envelope.state, false);
  assert.equal("medicalHistory" in envelope.state, false);
  assert.equal("emergencyProfiles" in envelope.state, false);
  assert.doesNotMatch(encoded, /Sensitive appointment|Sensitive summary|Future medical collection|bloodType/);

  const decoded = decodeLocalState(encoded, { safeStorage, platform: "linux" });
  assert.deepEqual(decoded.state, state);
  assert.equal(decoded.needsMigration, false);
});

test("does not require protected storage when no medical records exist", () => {
  const encoded = encodeLocalState({
    tasks: [],
    medicalAppointments: [],
    medicalRecords: [],
    emergencyProfiles: []
  }, {
    safeStorage: createSafeStorage({ available: false }),
    platform: "linux"
  });

  const envelope = JSON.parse(encoded);
  assert.equal("medicalVault" in envelope, false);
  assert.equal("medicalAppointments" in envelope.state, false);
});

test("fails closed instead of using plaintext or base64 when storage is unavailable", () => {
  assert.throws(
    () => encodeLocalState({
      medicalRecords: [{ id: "record-1", summary: "Never plaintext" }]
    }, {
      safeStorage: createSafeStorage({ available: false }),
      platform: "linux"
    }),
    (error) => error.code === "MEDICAL_VAULT_UNAVAILABLE"
  );
});

test("accepts legacy plaintext state only when it can be migrated securely", () => {
  const legacy = JSON.stringify({
    version: 1,
    state: {
      tasks: [{ id: "task-1" }],
      medicalRecords: [{ id: "record-1", summary: "Legacy detail" }]
    }
  });
  const safeStorage = createSafeStorage();

  const decoded = decodeLocalState(legacy, { safeStorage, platform: "linux" });
  assert.equal(decoded.needsMigration, true);
  assert.equal(decoded.state.medicalRecords[0].summary, "Legacy detail");

  const migrated = encodeLocalState(decoded.state, { safeStorage, platform: "linux" });
  assert.doesNotMatch(migrated, /Legacy detail/);

  assert.throws(
    () => decodeLocalState(legacy, {
      safeStorage: createSafeStorage({ available: false }),
      platform: "linux"
    }),
    (error) => error.code === "MEDICAL_VAULT_UNAVAILABLE"
  );
});

test("rejects plaintext medical fields in a versioned envelope", () => {
  assert.throws(
    () => decodeLocalState(JSON.stringify({
      format: "focus-local-state",
      version: 2,
      state: { medicalRecords: [{ summary: "leaked" }] }
    }), {
      safeStorage: createSafeStorage(),
      platform: "linux"
    }),
    (error) => error.code === "MEDICAL_VAULT_PLAINTEXT_DETECTED"
  );
});

test("reports malformed and undecryptable vaults as explicit errors", () => {
  const safeStorage = createSafeStorage();
  const malformed = JSON.stringify({
    format: "focus-local-state",
    version: 2,
    state: {},
    medicalVault: {
      version: 1,
      algorithm: "electron-safe-storage",
      ciphertext: "not base64"
    }
  });
  assert.throws(
    () => decodeLocalState(malformed, { safeStorage, platform: "linux" }),
    (error) => error.code === "MEDICAL_VAULT_CORRUPT"
  );

  const encoded = encodeLocalState({
    medicalRecords: [{ id: "record-1" }]
  }, { safeStorage, platform: "linux" });
  assert.throws(
    () => decodeLocalState(encoded, {
      safeStorage: createSafeStorage({ decryptError: new Error("keychain reset") }),
      platform: "linux"
    }),
    (error) => error.code === "MEDICAL_VAULT_DECRYPT_FAILED"
  );
});

test("rejects corrupt JSON and unsupported envelope versions", () => {
  assert.throws(
    () => decodeLocalState("{", {}),
    (error) => error.code === "LOCAL_ENVELOPE_CORRUPT"
  );
  assert.throws(
    () => decodeLocalState(JSON.stringify({
      format: "focus-local-state",
      version: 99,
      state: {}
    }), {}),
    (error) => error.code === "LOCAL_ENVELOPE_UNSUPPORTED"
  );
});
