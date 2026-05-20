const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("ozone-platform", "x11");
app.disableHardwareAcceleration();

let mainWindow;
let writeQueue = Promise.resolve();
let dataRevision = 0;

const DATA_FILE = "focus-data.db";

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

ipcMain.on("data:saveSync", (event, state) => {
  try {
    dataRevision += 1;
    saveDataSync(state);
    event.returnValue = { ok: true, path: getDataPath() };
  } catch (error) {
    event.returnValue = { ok: false, error: error.message };
  }
});

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
  });
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
