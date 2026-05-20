const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("ozone-platform", "x11");
app.disableHardwareAcceleration();

let mainWindow;
let writeQueue = Promise.resolve();
let dataRevision = 0;

const DATA_FILE = "focus-data.db";
const SYNC_CONFIG_FILE = "focus-sync-config.json";
const SYNC_DATA_FILE = "focus-pattern-tracker-sync.json";

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: "#f5f7f2",
    frame: false,
    title: "Focus Pattern Tracker",
    titleBarStyle: "hidden",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const showMainWindow = () => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  };

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.once("ready-to-show", showMainWindow);
  mainWindow.webContents.once("did-finish-load", showMainWindow);
  setTimeout(showMainWindow, 1500);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:maximize", () => {
  if (!mainWindow) {
    return false;
  }

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }

  mainWindow.maximize();
  return true;
});

ipcMain.handle("window:close", () => {
  mainWindow?.close();
});

ipcMain.handle("window:prioritize", () => {
  if (!mainWindow) {
    return false;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
  mainWindow.flashFrame(true);
  mainWindow.setAlwaysOnTop(true, "screen-saver");

  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(false);
      mainWindow.flashFrame(false);
    }
  }, 7000);

  return true;
});

ipcMain.handle("data:load", () => {
  return loadData();
});

ipcMain.handle("data:save", async (event, state) => {
  const revision = ++dataRevision;
  writeQueue = writeQueue.catch(() => {}).then(() => saveData(state, revision));

  try {
    await writeQueue;
    return { ok: true, path: getDataPath() };
  } catch (error) {
    return { ok: false, path: getDataPath(), error: error.message };
  }
});

ipcMain.handle("data:export", async (event, state) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Export focus data",
      defaultPath: "focus-pattern-tracker-backup-" + dateStamp() + ".json",
      filters: [
        { name: "Focus data backup", extensions: ["json"] },
        { name: "All files", extensions: ["*"] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { ok: true, canceled: true };
    }

    await fs.promises.writeFile(result.filePath, serializeState(state), "utf8");
    return { ok: true, path: result.filePath };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("data:import", async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import focus data",
      properties: ["openFile"],
      filters: [
        { name: "Focus data backup", extensions: ["json", "db"] },
        { name: "All files", extensions: ["*"] }
      ]
    });

    if (result.canceled || !result.filePaths?.[0]) {
      return { ok: true, canceled: true };
    }

    const filePath = result.filePaths[0];
    const raw = await fs.promises.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ok: true,
      path: filePath,
      state: parsed && typeof parsed === "object" && "state" in parsed ? parsed.state : parsed
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("data:autoImport", async () => {
  try {
    const imports = [];
    const candidatePaths = await findAutoImportFiles();

    for (const filePath of candidatePaths) {
      const raw = await fs.promises.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      const state = parsed && typeof parsed === "object" && "state" in parsed ? parsed.state : parsed;
      if (state && typeof state === "object") {
        imports.push({ path: filePath, state });
      }
    }

    return { ok: true, imports };
  } catch (error) {
    return { ok: false, error: error.message, imports: [] };
  }
});

ipcMain.handle("sync:getConfig", () => {
  const config = loadSyncConfig();
  return { ok: true, folder: config.folder || "", path: config.folder ? getSyncDataPath(config.folder) : "" };
});

ipcMain.handle("sync:chooseFolder", async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Choose sync folder",
      properties: ["openDirectory", "createDirectory"]
    });

    if (result.canceled || !result.filePaths?.[0]) {
      return { ok: true, canceled: true };
    }

    const folder = result.filePaths[0];
    saveSyncConfig({ folder });
    return { ok: true, folder, path: getSyncDataPath(folder) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("sync:clearFolder", () => {
  try {
    saveSyncConfig({ folder: "" });
    return { ok: true, folder: "", path: "" };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("sync:read", async () => {
  return readSyncData();
});

ipcMain.handle("sync:write", async (event, state) => {
  return writeSyncData(state);
});

ipcMain.on("data:saveSync", (event, state) => {
  try {
    dataRevision += 1;
    saveDataSync(state);
    event.returnValue = { ok: true, path: getDataPath() };
  } catch (error) {
    event.returnValue = { ok: false, error: error.message };
  }
});

function getSyncConfigPath() {
  return path.join(app.getPath("userData"), SYNC_CONFIG_FILE);
}

function getSyncDataPath(folder = loadSyncConfig().folder) {
  return folder ? path.join(folder, SYNC_DATA_FILE) : "";
}

function loadSyncConfig() {
  const configPath = getSyncConfigPath();

  try {
    if (!fs.existsSync(configPath)) {
      return { folder: "" };
    }

    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return { folder: typeof parsed.folder === "string" ? parsed.folder : "" };
  } catch (error) {
    return { folder: "" };
  }
}

function saveSyncConfig(config) {
  const configPath = getSyncConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ folder: config.folder || "" }, null, 2), "utf8");
}

async function readSyncData() {
  const config = loadSyncConfig();
  if (!config.folder) {
    return { ok: true, enabled: false, state: null, path: "" };
  }

  const syncPath = getSyncDataPath(config.folder);
  try {
    if (!fs.existsSync(syncPath)) {
      return { ok: true, enabled: true, state: null, path: syncPath };
    }

    const raw = await fs.promises.readFile(syncPath, "utf8");
    const parsed = JSON.parse(raw);
    const stats = await fs.promises.stat(syncPath);
    return {
      ok: true,
      enabled: true,
      state: parsed && typeof parsed === "object" && "state" in parsed ? parsed.state : parsed,
      updatedAt: parsed && typeof parsed === "object" ? parsed.updatedAt : null,
      path: syncPath,
      mtimeMs: stats.mtimeMs
    };
  } catch (error) {
    return { ok: false, enabled: true, state: null, path: syncPath, error: error.message };
  }
}

async function writeSyncData(state) {
  const config = loadSyncConfig();
  if (!config.folder) {
    return { ok: true, enabled: false, path: "" };
  }

  const syncPath = getSyncDataPath(config.folder);
  const tmpPath = syncPath + "." + process.pid + ".tmp";

  try {
    await fs.promises.mkdir(path.dirname(syncPath), { recursive: true });
    await fs.promises.writeFile(tmpPath, serializeState(state), "utf8");
    await fs.promises.rename(tmpPath, syncPath);
    return { ok: true, enabled: true, path: syncPath };
  } catch (error) {
    try {
      await fs.promises.rm(tmpPath, { force: true });
    } catch (_) {}
    return { ok: false, enabled: true, path: syncPath, error: error.message };
  }
}

function getDataPath() {
  return path.join(app.getPath("userData"), DATA_FILE);
}

function loadData() {
  const dataPath = getDataPath();

  try {
    if (!fs.existsSync(dataPath)) {
      return { ok: true, state: null, path: dataPath };
    }

    const raw = fs.readFileSync(dataPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ok: true,
      state: parsed && typeof parsed === "object" && "state" in parsed ? parsed.state : parsed,
      path: dataPath
    };
  } catch (error) {
    preserveCorruptDataFile(dataPath);
    return { ok: false, state: null, path: dataPath, error: error.message };
  }
}

async function saveData(state, revision) {
  const dataPath = getDataPath();
  const tmpPath = `${dataPath}.${process.pid}-${revision}.tmp`;
  const payload = serializeState(state);

  await fs.promises.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.promises.writeFile(tmpPath, payload, "utf8");
  if (revision !== dataRevision) {
    await fs.promises.rm(tmpPath, { force: true });
    return;
  }
  await fs.promises.rename(tmpPath, dataPath);
}

function saveDataSync(state) {
  const dataPath = getDataPath();
  const tmpPath = `${dataPath}.${process.pid}-sync.tmp`;

  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(tmpPath, serializeState(state), "utf8");
  fs.renameSync(tmpPath, dataPath);
}

function serializeState(state) {
  return JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    state
  }, null, 2);
}

async function findAutoImportFiles() {
  const sourceDirs = [app.getPath("desktop"), app.getPath("downloads")].filter(Boolean);
  const dataPath = getDataPath();
  const paths = [];

  for (const sourceDir of sourceDirs) {
    let entries;
    try {
      entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !isImportFileName(entry.name)) {
        continue;
      }

      const filePath = path.join(sourceDir, entry.name);
      if (path.resolve(filePath) !== path.resolve(dataPath)) {
        paths.push(filePath);
      }
    }
  }

  return [...new Set(paths)];
}

function isImportFileName(name) {
  const lowerName = String(name).toLowerCase();
  return name === DATA_FILE || (lowerName.startsWith("focus-pattern-tracker-backup") && lowerName.endsWith(".json"));
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function preserveCorruptDataFile(dataPath) {
  try {
    if (fs.existsSync(dataPath)) {
      fs.renameSync(dataPath, `${dataPath}.corrupt-${Date.now()}`);
    }
  } catch (error) {
    console.warn("Unable to preserve corrupt focus data file", error);
  }
}
