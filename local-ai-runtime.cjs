"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_HEALTH_TIMEOUT_MS = 1500;
const DEFAULT_START_ATTEMPTS = 20;
const DEFAULT_START_INTERVAL_MS = 250;

class LocalAiRuntimeError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "LocalAiRuntimeError";
    this.code = code;
    if (Number.isInteger(status)) this.status = status;
  }
}

function runtimeError(code, message, status) {
  return new LocalAiRuntimeError(code, message, status);
}

function executableName(platform) {
  return platform === "win32" ? "ollama.exe" : "ollama";
}

async function findOllamaBinary({
  env = process.env,
  homedir = os.homedir(),
  platform = process.platform,
  pathImpl = path,
  access = fs.promises.access
} = {}) {
  const filename = executableName(platform);
  const directories = String(env.PATH || "")
    .split(pathImpl.delimiter)
    .filter(Boolean);
  directories.push(pathImpl.join(homedir, ".local", "bin"));

  const seen = new Set();
  for (const directory of directories) {
    const candidate = pathImpl.resolve(directory, filename);
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      await access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Missing and non-executable candidates are both unsuitable.
    }
  }
  return null;
}

function normalizedBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_OLLAMA_URL).replace(/\/+$/, "");
}

async function fetchWithTimeout(url, init, {
  fetchImpl,
  timeoutMs,
  AbortControllerImpl
}) {
  const controller = new AbortControllerImpl();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkOllamaHealth({
  baseUrl = DEFAULT_OLLAMA_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
  AbortControllerImpl = AbortController
} = {}) {
  try {
    const response = await fetchWithTimeout(
      `${normalizedBaseUrl(baseUrl)}/api/version`,
      { method: "GET" },
      { fetchImpl, timeoutMs, AbortControllerImpl }
    );
    if (!response.ok) return { healthy: false, version: null };
    const body = await response.json();
    return {
      healthy: typeof body?.version === "string" && body.version.length > 0,
      version: typeof body?.version === "string" ? body.version : null
    };
  } catch {
    return { healthy: false, version: null };
  }
}

function ollamaHost(baseUrl) {
  const url = new URL(normalizedBaseUrl(baseUrl));
  return url.host;
}

async function startOllamaServer({
  binaryPath,
  dataDir,
  baseUrl = DEFAULT_OLLAMA_URL,
  spawnImpl = spawn,
  fsImpl = fs,
  env = process.env,
  platform = process.platform,
  pathImpl = path,
  now = () => new Date()
} = {}) {
  if (!binaryPath || typeof binaryPath !== "string") {
    throw runtimeError("OLLAMA_NOT_INSTALLED", "Ollama is not installed.");
  }
  if (!dataDir || typeof dataDir !== "string") {
    throw runtimeError("INVALID_DATA_DIR", "A local AI data directory is required.");
  }

  const runtimeDir = pathImpl.join(dataDir, "local-ai");
  const logPath = pathImpl.join(runtimeDir, "ollama.log");
  const statePath = pathImpl.join(runtimeDir, "ollama-state.json");
  await fsImpl.promises.mkdir(runtimeDir, { recursive: true });

  const logFd = fsImpl.openSync(logPath, "a");
  let child;
  try {
    child = spawnImpl(binaryPath, ["serve"], {
      detached: true,
      shell: false,
      windowsHide: platform === "win32",
      env: {
        ...env,
        OLLAMA_HOST: ollamaHost(baseUrl),
        OLLAMA_NO_CLOUD: "1",
        OLLAMA_VULKAN: env.OLLAMA_VULKAN || "1"
      },
      stdio: ["ignore", logFd, logFd]
    });
  } catch (error) {
    throw runtimeError("OLLAMA_START_FAILED", "Ollama could not be started.");
  } finally {
    fsImpl.closeSync(logFd);
  }

  if (!child || !Number.isInteger(child.pid) || child.pid <= 0) {
    throw runtimeError("OLLAMA_START_FAILED", "Ollama did not return a process id.");
  }
  if (typeof child.unref === "function") child.unref();

  const state = {
    pid: child.pid,
    binaryPath,
    baseUrl: normalizedBaseUrl(baseUrl),
    startedAt: now().toISOString()
  };
  await fsImpl.promises.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  return { started: true, pid: child.pid, logPath, statePath };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function ensureOllamaRunning({
  baseUrl = DEFAULT_OLLAMA_URL,
  binaryPath,
  dataDir,
  attempts = DEFAULT_START_ATTEMPTS,
  intervalMs = DEFAULT_START_INTERVAL_MS,
  findBinaryImpl = findOllamaBinary,
  checkHealthImpl = checkOllamaHealth,
  startServerImpl = startOllamaServer,
  sleepImpl = wait,
  ...dependencies
} = {}) {
  const initialHealth = await checkHealthImpl({ baseUrl, ...dependencies });
  if (initialHealth.healthy) {
    return {
      healthy: true,
      started: false,
      version: initialHealth.version,
      baseUrl: normalizedBaseUrl(baseUrl)
    };
  }

  const resolvedBinary = binaryPath || await findBinaryImpl(dependencies);
  if (!resolvedBinary) {
    throw runtimeError("OLLAMA_NOT_INSTALLED", "Ollama is not installed.");
  }

  const processState = await startServerImpl({
    binaryPath: resolvedBinary,
    dataDir,
    baseUrl,
    ...dependencies
  });
  const maximumAttempts = Number.isInteger(attempts) && attempts > 0
    ? attempts
    : DEFAULT_START_ATTEMPTS;

  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    await sleepImpl(intervalMs);
    const health = await checkHealthImpl({ baseUrl, ...dependencies });
    if (health.healthy) {
      return {
        ...processState,
        healthy: true,
        started: true,
        version: health.version,
        baseUrl: normalizedBaseUrl(baseUrl)
      };
    }
  }

  throw runtimeError("OLLAMA_START_TIMEOUT", "Ollama did not become ready in time.");
}

module.exports = {
  DEFAULT_HEALTH_TIMEOUT_MS,
  DEFAULT_OLLAMA_URL,
  DEFAULT_START_ATTEMPTS,
  DEFAULT_START_INTERVAL_MS,
  LocalAiRuntimeError,
  checkOllamaHealth,
  ensureOllamaRunning,
  findOllamaBinary,
  startOllamaServer
};
