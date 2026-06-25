"use strict";

const LOCAL_ENVELOPE_FORMAT = "focus-local-state";
const LOCAL_ENVELOPE_VERSION = 2;
const MEDICAL_VAULT_VERSION = 1;
const MEDICAL_VAULT_ALGORITHM = "electron-safe-storage";

const MEDICAL_STATE_KEYS = Object.freeze([
  "medicalAppointments",
  "medicalRecords",
  "medicalDocuments",
  "medicalProfiles",
  "emergencyProfile",
  "emergencyProfiles",
  "symptomEntries",
  "medications"
]);

const PROTECTED_LINUX_BACKENDS = new Set([
  "gnome_libsecret",
  "kwallet",
  "kwallet5",
  "kwallet6"
]);

class MedicalVaultError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "MedicalVaultError";
    this.code = code;
  }
}

function getMedicalVaultCapability(safeStorage, platform = process.platform) {
  if (!safeStorage
    || typeof safeStorage.isEncryptionAvailable !== "function"
    || typeof safeStorage.encryptString !== "function"
    || typeof safeStorage.decryptString !== "function") {
    return unavailable("SAFE_STORAGE_MISSING", "Protected operating-system storage is unavailable.");
  }

  let available;
  try {
    available = safeStorage.isEncryptionAvailable();
  } catch (error) {
    return unavailable("SAFE_STORAGE_CHECK_FAILED", "Protected storage capability could not be verified.");
  }

  if (!available) {
    return unavailable("SAFE_STORAGE_UNAVAILABLE", "Protected operating-system storage is unavailable.");
  }

  let backend = "";
  if (platform === "linux") {
    try {
      backend = typeof safeStorage.getSelectedStorageBackend === "function"
        ? String(safeStorage.getSelectedStorageBackend() || "")
        : "";
    } catch (error) {
      return unavailable("SAFE_STORAGE_BACKEND_UNKNOWN", "The Linux protected-storage backend could not be verified.");
    }

    if (!PROTECTED_LINUX_BACKENDS.has(backend)) {
      return {
        available: false,
        protected: false,
        backend: backend || "unknown",
        code: backend === "basic_text" ? "SAFE_STORAGE_INSECURE_BACKEND" : "SAFE_STORAGE_BACKEND_UNKNOWN",
        reason: backend === "basic_text"
          ? "Electron is using the insecure basic_text Linux storage backend."
          : "A protected Linux keyring backend could not be verified."
      };
    }
  }

  return {
    available: true,
    protected: true,
    backend: backend || (platform === "darwin" ? "keychain" : platform === "win32" ? "dpapi" : "os-protected"),
    code: "AVAILABLE",
    reason: ""
  };
}

function encodeLocalState(state, options = {}) {
  const normalizedState = requireObject(state, "State must be an object.");
  const { publicState, medicalState } = splitMedicalState(normalizedState);
  const envelope = {
    format: LOCAL_ENVELOPE_FORMAT,
    version: LOCAL_ENVELOPE_VERSION,
    updatedAt: normalizeUpdatedAt(options.updatedAt),
    state: publicState
  };

  if (hasMedicalData(medicalState)) {
    const capability = requireCapability(options.safeStorage, options.platform);
    let encrypted;
    try {
      encrypted = options.safeStorage.encryptString(JSON.stringify({
        version: MEDICAL_VAULT_VERSION,
        medical: medicalState
      }));
    } catch (error) {
      throw new MedicalVaultError(
        "MEDICAL_VAULT_ENCRYPT_FAILED",
        "Medical data could not be encrypted with protected operating-system storage.",
        error
      );
    }

    if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) {
      throw new MedicalVaultError(
        "MEDICAL_VAULT_ENCRYPT_FAILED",
        "Protected storage returned an invalid encrypted medical payload."
      );
    }

    envelope.medicalVault = {
      version: MEDICAL_VAULT_VERSION,
      algorithm: MEDICAL_VAULT_ALGORITHM,
      backend: capability.backend,
      ciphertext: encrypted.toString("base64")
    };
  }

  return JSON.stringify(envelope, null, 2);
}

function decodeLocalState(payload, options = {}) {
  const parsed = parsePayload(payload);

  if (parsed.format === LOCAL_ENVELOPE_FORMAT || parsed.version === LOCAL_ENVELOPE_VERSION) {
    return decodeVersionedEnvelope(parsed, options);
  }

  const state = unwrapLegacyState(parsed);
  const { medicalState } = splitMedicalState(state);
  if (hasMedicalData(medicalState)) {
    requireCapability(options.safeStorage, options.platform);
  }

  return {
    state,
    needsMigration: true,
    sourceVersion: Number.isFinite(Number(parsed.version)) ? Number(parsed.version) : 0
  };
}

function decodeVersionedEnvelope(envelope, options) {
  if (envelope.format !== LOCAL_ENVELOPE_FORMAT || envelope.version !== LOCAL_ENVELOPE_VERSION) {
    throw new MedicalVaultError(
      "LOCAL_ENVELOPE_UNSUPPORTED",
      `Unsupported local state envelope version: ${String(envelope.version)}.`
    );
  }

  const publicState = requireObject(envelope.state, "The local state envelope is missing its public state.");
  const leakedKeys = Object.keys(publicState).filter(isMedicalStateKey);
  if (leakedKeys.length > 0) {
    throw new MedicalVaultError(
      "MEDICAL_VAULT_PLAINTEXT_DETECTED",
      `The local state envelope contains plaintext medical fields: ${leakedKeys.join(", ")}.`
    );
  }

  if (envelope.medicalVault == null) {
    return { state: { ...publicState }, needsMigration: false, sourceVersion: LOCAL_ENVELOPE_VERSION };
  }

  const vault = requireObject(envelope.medicalVault, "The encrypted medical vault is invalid.");
  if (vault.version !== MEDICAL_VAULT_VERSION
    || vault.algorithm !== MEDICAL_VAULT_ALGORITHM
    || typeof vault.ciphertext !== "string"
    || !isCanonicalBase64(vault.ciphertext)) {
    throw new MedicalVaultError("MEDICAL_VAULT_CORRUPT", "The encrypted medical vault is malformed.");
  }

  requireCapability(options.safeStorage, options.platform);

  let decrypted;
  try {
    decrypted = options.safeStorage.decryptString(Buffer.from(vault.ciphertext, "base64"));
  } catch (error) {
    throw new MedicalVaultError(
      "MEDICAL_VAULT_DECRYPT_FAILED",
      "Medical data could not be unlocked. The operating-system keyring may have changed or be unavailable.",
      error
    );
  }

  let vaultPayload;
  try {
    vaultPayload = JSON.parse(decrypted);
  } catch (error) {
    throw new MedicalVaultError("MEDICAL_VAULT_CORRUPT", "The decrypted medical vault is not valid JSON.", error);
  }

  if (!vaultPayload
    || vaultPayload.version !== MEDICAL_VAULT_VERSION
    || !vaultPayload.medical
    || typeof vaultPayload.medical !== "object"
    || Array.isArray(vaultPayload.medical)) {
    throw new MedicalVaultError("MEDICAL_VAULT_CORRUPT", "The decrypted medical vault has an invalid structure.");
  }

  const invalidKeys = Object.keys(vaultPayload.medical).filter((key) => !isMedicalStateKey(key));
  if (invalidKeys.length > 0) {
    throw new MedicalVaultError("MEDICAL_VAULT_CORRUPT", "The decrypted medical vault contains unsupported fields.");
  }

  return {
    state: { ...publicState, ...vaultPayload.medical },
    needsMigration: false,
    sourceVersion: LOCAL_ENVELOPE_VERSION
  };
}

function splitMedicalState(state) {
  const publicState = {};
  const medicalState = {};

  for (const [key, value] of Object.entries(state)) {
    if (isMedicalStateKey(key)) {
      medicalState[key] = value;
    } else {
      publicState[key] = value;
    }
  }

  return { publicState, medicalState };
}

function isMedicalStateKey(key) {
  return MEDICAL_STATE_KEYS.includes(key) || /^medical(?:$|[A-Z_])/.test(key);
}

function hasMedicalData(medicalState) {
  return Object.values(medicalState).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return value !== null && value !== undefined && value !== "";
  });
}

function requireCapability(safeStorage, platform) {
  const capability = getMedicalVaultCapability(safeStorage, platform);
  if (!capability.available) {
    throw new MedicalVaultError(
      "MEDICAL_VAULT_UNAVAILABLE",
      capability.reason || "Protected operating-system storage is unavailable."
    );
  }
  return capability;
}

function unwrapLegacyState(parsed) {
  const candidate = parsed && typeof parsed === "object" && !Array.isArray(parsed) && "state" in parsed
    ? parsed.state
    : parsed;
  return requireObject(candidate, "The legacy local state is invalid.");
}

function parsePayload(payload) {
  if (payload && typeof payload === "object" && !Buffer.isBuffer(payload)) {
    return requireObject(payload, "The local state payload is invalid.");
  }
  try {
    return requireObject(JSON.parse(String(payload)), "The local state payload is invalid.");
  } catch (error) {
    if (error instanceof MedicalVaultError) throw error;
    throw new MedicalVaultError("LOCAL_ENVELOPE_CORRUPT", "The local state file is not valid JSON.", error);
  }
}

function requireObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MedicalVaultError("LOCAL_ENVELOPE_CORRUPT", message);
  }
  return value;
}

function isCanonicalBase64(value) {
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  return Buffer.from(value, "base64").toString("base64") === value;
}

function normalizeUpdatedAt(value) {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return value;
  return new Date().toISOString();
}

function unavailable(code, reason) {
  return { available: false, protected: false, backend: "unavailable", code, reason };
}

module.exports = {
  LOCAL_ENVELOPE_FORMAT,
  LOCAL_ENVELOPE_VERSION,
  MEDICAL_STATE_KEYS,
  MedicalVaultError,
  decodeLocalState,
  encodeLocalState,
  getMedicalVaultCapability,
  hasMedicalData,
  isMedicalStateKey,
  splitMedicalState
};
