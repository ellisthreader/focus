import {
  projectAssistantContext,
  projectAssistantApplicationContext,
  projectBrowserState,
  projectExportState,
  projectSyncState
} from "./privacy.mjs";

const STORAGE_KEY = "focus-pattern-tracker:v2";
const LEGACY_STORAGE_KEY = "focus-pattern-tracker:v1";

export {
  projectAssistantApplicationContext,
  projectAssistantContext,
  projectBrowserState,
  projectExportState,
  projectSyncState,
  projectSyncState as projectFolderSyncState,
  projectSyncState as projectMysqlSyncState
};

export async function loadPersistedState() {
  const database = await loadDesktopState();
  if (database) return database;

  const local = readLocalState(STORAGE_KEY);
  if (local) return local;

  return readLocalState(LEGACY_STORAGE_KEY);
}

async function loadDesktopState() {
  if (!window.focusDesktop?.loadData) return null;
  try {
    const result = await window.focusDesktop.loadData();
    if (result?.ok === false) {
      const error = new Error(result.error || "Focus could not read the local data file.");
      error.code = result.code || "LOCAL_LOAD_FAILED";
      throw error;
    }
    return result?.state && typeof result.state === "object" ? result.state : null;
  } catch (error) {
    console.error("Unable to load Focus data", error);
    throw error;
  }
}

function readLocalState(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Unable to read local Focus data", error);
    return null;
  }
}

export async function savePersistedState(state, options = {}) {
  const snapshot = structuredClone(state);
  const browserSnapshot = projectBrowserState(state);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(browserSnapshot));
  } catch (error) {
    console.warn("Unable to mirror Focus data", error);
  }

  if (!window.focusDesktop?.saveData) return { ok: true, localOnly: true };
  try {
    if (options.sync && window.focusDesktop.saveDataSync) {
      return window.focusDesktop.saveDataSync(snapshot);
    }
    return await window.focusDesktop.saveData(snapshot);
  } catch (error) {
    console.warn("Unable to save Focus data", error);
    return { ok: false, error: error.message };
  }
}

export async function exportPersistedState(state) {
  if (!window.focusDesktop?.exportData) {
    return { ok: false, error: "Export is available in the desktop app." };
  }
  return window.focusDesktop.exportData(projectExportState(state));
}

export async function importPersistedState() {
  if (!window.focusDesktop?.importData) {
    return { ok: false, error: "Import is available in the desktop app." };
  }
  return window.focusDesktop.importData();
}

export async function getSyncStatus() {
  if (!window.focusDesktop?.getSyncConfig) return { folder: "", available: false };
  try {
    const result = await window.focusDesktop.getSyncConfig();
    return { folder: result?.folder || "", available: true };
  } catch {
    return { folder: "", available: true };
  }
}

export async function chooseSyncFolder() {
  if (!window.focusDesktop?.chooseSyncFolder) return { ok: false, error: "Folder sync is unavailable." };
  return window.focusDesktop.chooseSyncFolder();
}

export async function clearSyncFolder() {
  if (!window.focusDesktop?.clearSyncFolder) return { ok: false, error: "Folder sync is unavailable." };
  return window.focusDesktop.clearSyncFolder();
}
