const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("ozone-platform", "x11");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("in-process-gpu");
app.disableHardwareAcceleration();

let mainWindow;
let writeQueue = Promise.resolve();
let dataRevision = 0;

const DATA_FILE = "focus-data.db";
const SYNC_CONFIG_FILE = "focus-sync-config.json";
const SYNC_DATA_FILE = "focus-pattern-tracker-sync.json";
const MYSQL_USERS_TABLE = "focus_users";
const MYSQL_TABLE = "focus_user_documents";
const DEFAULT_MYSQL_CONFIG = {
  host: process.env.FOCUS_MYSQL_HOST || "127.0.0.1",
  port: Number.parseInt(process.env.FOCUS_MYSQL_PORT, 10) || 3306,
  database: process.env.FOCUS_MYSQL_DATABASE || "focus_pattern_tracker",
  databaseUser: process.env.FOCUS_MYSQL_USER || "focus_app",
  databasePassword: process.env.FOCUS_MYSQL_PASSWORD ?? "FocusAppLocal-2026!"
};

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

ipcMain.handle("mysql:createAccount", async (event, account, state) => {
  return createMysqlAccount(account, state);
});

ipcMain.handle("mysql:login", async (event, account) => {
  return loginMysqlUser(account);
});

ipcMain.handle("mysql:read", async (event, account) => {
  return readMysqlUserState(account);
});

ipcMain.handle("mysql:write", async (event, account, state) => {
  return writeMysqlUserState(account, state);
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

async function createMysqlAccount(account, state) {
  const normalized = normalizeMysqlAccount(account);
  if (!normalized.ok) return normalized;
  let connection;

  try {
    connection = await openMysqlConnection(normalized.mysql);
    await ensureMysqlTable(connection);
    const existingAccount = await selectMysqlAccount(connection, normalized.account.username);
    if (existingAccount) {
      return { ok: false, error: "That account already exists. Log in instead." };
    }

    const credentials = hashPassword(normalized.account.password);
    await insertMysqlAccount(connection, normalized.account.username, credentials);
    await upsertMysqlUserState(connection, normalized.account.username, state || {});
    return { ok: true, username: normalized.account.username, state: state || {} };
  } catch (error) {
    return { ok: false, error: formatMysqlError(error, normalized.mysql) };
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}

async function loginMysqlUser(account) {
  const normalized = normalizeMysqlAccount(account);
  if (!normalized.ok) return normalized;
  let connection;

  try {
    connection = await openMysqlConnection(normalized.mysql);
    await ensureMysqlTable(connection);
    await verifyMysqlAccount(connection, normalized.account);
    const state = await selectMysqlUserState(connection, normalized.account.username);
    return { ok: true, username: normalized.account.username, state };
  } catch (error) {
    return { ok: false, error: formatMysqlError(error, normalized.mysql) };
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}

async function readMysqlUserState(account) {
  const normalized = normalizeMysqlAccount(account);
  if (!normalized.ok) return normalized;
  let connection;

  try {
    connection = await openMysqlConnection(normalized.mysql);
    await ensureMysqlTable(connection);
    await verifyMysqlAccount(connection, normalized.account);
    const state = await selectMysqlUserState(connection, normalized.account.username);
    return { ok: true, username: normalized.account.username, state };
  } catch (error) {
    return { ok: false, error: formatMysqlError(error, normalized.mysql) };
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}

async function writeMysqlUserState(account, state) {
  const normalized = normalizeMysqlAccount(account);
  if (!normalized.ok) return normalized;
  let connection;

  try {
    connection = await openMysqlConnection(normalized.mysql);
    await ensureMysqlTable(connection);
    await verifyMysqlAccount(connection, normalized.account);
    await upsertMysqlUserState(connection, normalized.account.username, state || {});
    return { ok: true, username: normalized.account.username };
  } catch (error) {
    return { ok: false, error: formatMysqlError(error, normalized.mysql) };
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}

async function openMysqlConnection(config = DEFAULT_MYSQL_CONFIG) {
  const mysql = require("mysql2/promise");
  const options = {
    host: config.host,
    port: config.port,
    user: config.databaseUser,
    password: config.databasePassword,
    database: config.database,
    connectTimeout: 5000,
    charset: "utf8mb4"
  };

  try {
    return await mysql.createConnection(options);
  } catch (error) {
    if (error?.code !== "ER_BAD_DB_ERROR") {
      throw error;
    }
  }

  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.databaseUser,
    password: config.databasePassword,
    connectTimeout: 5000,
    charset: "utf8mb4"
  });
  await connection.query(`CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(config.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.changeUser({ database: config.database });
  return connection;
}

async function ensureMysqlTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS ${escapeIdentifier(MYSQL_USERS_TABLE)} (
      username varchar(160) NOT NULL PRIMARY KEY,
      password_salt varchar(64) NOT NULL,
      password_hash varchar(128) NOT NULL,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS ${escapeIdentifier(MYSQL_TABLE)} (
      username varchar(160) NOT NULL PRIMARY KEY,
      payload longtext NOT NULL,
      updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT ${escapeIdentifier("focus_user_documents_user_fk")}
        FOREIGN KEY (username) REFERENCES ${escapeIdentifier(MYSQL_USERS_TABLE)} (username)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function selectMysqlAccount(connection, username) {
  const [rows] = await connection.execute(
    `SELECT username, password_salt, password_hash FROM ${escapeIdentifier(MYSQL_USERS_TABLE)} WHERE username = ? LIMIT 1`,
    [username]
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function insertMysqlAccount(connection, username, credentials) {
  await connection.execute(
    `INSERT INTO ${escapeIdentifier(MYSQL_USERS_TABLE)} (username, password_salt, password_hash)
     VALUES (?, ?, ?)`,
    [username, credentials.salt, credentials.hash]
  );
}

async function verifyMysqlAccount(connection, account) {
  const stored = await selectMysqlAccount(connection, account.username);
  if (!stored) {
    throw new Error("Account not found. Create it first.");
  }

  const hash = hashPassword(account.password, stored.password_salt).hash;
  const expected = Buffer.from(stored.password_hash, "hex");
  const actual = Buffer.from(hash, "hex");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error("Incorrect password.");
  }
}

async function selectMysqlUserState(connection, profileName) {
  const [rows] = await connection.execute(
    `SELECT payload FROM ${escapeIdentifier(MYSQL_TABLE)} WHERE username = ? LIMIT 1`,
    [profileName]
  );
  if (!Array.isArray(rows) || !rows[0]) {
    return null;
  }

  return parseStoredState(rows[0].payload);
}

async function upsertMysqlUserState(connection, profileName, state) {
  await connection.execute(
    `INSERT INTO ${escapeIdentifier(MYSQL_TABLE)} (username, payload, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP`,
    [profileName, serializeState(state)]
  );
}

function parseStoredState(payload) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  return parsed && typeof parsed === "object" && "state" in parsed ? parsed.state : parsed;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 210000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function normalizeMysqlAccount(account) {
  const parsed = account && typeof account === "object" ? account : {};
  const mysql = normalizeMysqlConfig(parsed);
  const normalized = {
    username: normalizeMysqlProfileName(parsed.username || parsed.profileName),
    password: String(parsed.password || "")
  };

  if (!normalized.username) {
    return { ok: false, error: "Enter a username." };
  }
  if (!normalized.password) {
    return { ok: false, error: "Enter a password." };
  }

  return { ok: true, account: normalized, mysql };
}

function normalizeMysqlProfileName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 160);
}

function normalizeMysqlConfig(config) {
  const port = Number.parseInt(config.port, 10);
  return {
    host: normalizeMysqlConnectionText(config.host) || DEFAULT_MYSQL_CONFIG.host,
    port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_MYSQL_CONFIG.port,
    database: normalizeMysqlConnectionText(config.database) || DEFAULT_MYSQL_CONFIG.database,
    databaseUser: normalizeMysqlConnectionText(config.databaseUser) || DEFAULT_MYSQL_CONFIG.databaseUser,
    databasePassword: typeof config.databasePassword === "string" ? config.databasePassword : DEFAULT_MYSQL_CONFIG.databasePassword
  };
}

function normalizeMysqlConnectionText(value) {
  return String(value || "").trim();
}

function formatMysqlError(error, config = DEFAULT_MYSQL_CONFIG) {
  if (error?.code === "ER_ACCESS_DENIED_ERROR" || error?.code === "ER_ACCESS_DENIED_NO_PASSWORD_ERROR") {
    return "MySQL rejected the database login for \"" + config.databaseUser + "\" at " + config.host + ":" + config.port + (config.databaseUser === "focus_app" ? ". Run npm run setup:mysql once to create and grant the app database user." : ". Check the Database user and Database password fields.");
  }
  if (error?.code === "ECONNREFUSED") {
    return "Could not connect to MySQL at " + config.host + ":" + config.port + ". Start MySQL or update the MySQL host and port.";
  }
  if (error?.code === "ENOTFOUND") {
    return "Could not resolve MySQL host \"" + config.host + "\". Check the MySQL host field.";
  }
  if (error?.code === "ER_DBACCESS_DENIED_ERROR") {
    return "MySQL user \"" + config.databaseUser + "\" cannot access database \"" + config.database + "\". Grant access or choose a database that user can use.";
  }
  return error?.message || "MySQL request failed.";
}

function escapeIdentifier(identifier) {
  return "`" + String(identifier).replace(/`/g, "``") + "`";
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
