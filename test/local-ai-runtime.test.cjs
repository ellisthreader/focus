"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  checkOllamaHealth,
  ensureOllamaRunning,
  findOllamaBinary,
  startOllamaServer
} = require("../local-ai-runtime.cjs");

test("findOllamaBinary searches PATH before the user-local fallback", async () => {
  const checked = [];
  const result = await findOllamaBinary({
    env: { PATH: ["/opt/tools", "/usr/bin"].join(path.delimiter) },
    homedir: "/home/tester",
    access: async (candidate) => {
      checked.push(candidate);
      if (candidate !== "/usr/bin/ollama") throw new Error("missing");
    }
  });

  assert.equal(result, "/usr/bin/ollama");
  assert.deepEqual(checked, ["/opt/tools/ollama", "/usr/bin/ollama"]);
});

test("findOllamaBinary checks ~/.local/bin and supports Windows executable names", async () => {
  const checked = [];
  const result = await findOllamaBinary({
    env: { PATH: "" },
    homedir: "C:\\Users\\tester",
    platform: "win32",
    pathImpl: path.win32,
    access: async (candidate) => {
      checked.push(candidate);
    }
  });

  assert.equal(result, "C:\\Users\\tester\\.local\\bin\\ollama.exe");
  assert.deepEqual(checked, [result]);
});

test("checkOllamaHealth reports healthy versions and treats connection failures as offline", async () => {
  let captured;
  const healthy = await checkOllamaHealth({
    baseUrl: "http://localhost:11434/",
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return {
        ok: true,
        async json() {
          return { version: "0.11.0" };
        }
      };
    }
  });
  const offline = await checkOllamaHealth({
    fetchImpl: async () => {
      throw new Error("connection refused");
    }
  });

  assert.deepEqual(healthy, { healthy: true, version: "0.11.0" });
  assert.equal(captured.url, "http://localhost:11434/api/version");
  assert.equal(captured.init.method, "GET");
  assert.ok(captured.init.signal);
  assert.deepEqual(offline, { healthy: false, version: null });
});

test("startOllamaServer uses a detached argument array and stores logs and state under app data", async () => {
  const calls = { mkdir: [], writes: [], opened: [], closed: [] };
  let spawnCall;
  let unrefCalled = false;
  const fsImpl = {
    promises: {
      async mkdir(...args) {
        calls.mkdir.push(args);
      },
      async writeFile(...args) {
        calls.writes.push(args);
      }
    },
    openSync(...args) {
      calls.opened.push(args);
      return 17;
    },
    closeSync(fd) {
      calls.closed.push(fd);
    }
  };

  const result = await startOllamaServer({
    binaryPath: "/home/tester/.local/bin/ollama",
    dataDir: "/tmp/focus-data",
    baseUrl: "http://127.0.0.1:11434",
    env: { HOME: "/home/tester" },
    platform: "linux",
    fsImpl,
    spawnImpl(binary, args, options) {
      spawnCall = { binary, args, options };
      return { pid: 4321, unref: () => { unrefCalled = true; } };
    },
    now: () => new Date("2026-06-08T10:00:00.000Z")
  });

  assert.deepEqual(calls.mkdir, [["/tmp/focus-data/local-ai", { recursive: true }]]);
  assert.deepEqual(calls.opened, [["/tmp/focus-data/local-ai/ollama.log", "a"]]);
  assert.deepEqual(calls.closed, [17]);
  assert.equal(spawnCall.binary, "/home/tester/.local/bin/ollama");
  assert.deepEqual(spawnCall.args, ["serve"]);
  assert.equal(spawnCall.options.detached, true);
  assert.equal(spawnCall.options.shell, false);
  assert.deepEqual(spawnCall.options.stdio, ["ignore", 17, 17]);
  assert.equal(spawnCall.options.env.OLLAMA_HOST, "127.0.0.1:11434");
  assert.equal(spawnCall.options.env.OLLAMA_NO_CLOUD, "1");
  assert.equal(spawnCall.options.env.OLLAMA_VULKAN, "1");
  assert.equal(unrefCalled, true);

  const [statePath, stateText, writeOptions] = calls.writes[0];
  assert.equal(statePath, "/tmp/focus-data/local-ai/ollama-state.json");
  assert.equal(writeOptions.mode, 0o600);
  assert.deepEqual(JSON.parse(stateText), {
    pid: 4321,
    binaryPath: "/home/tester/.local/bin/ollama",
    baseUrl: "http://127.0.0.1:11434",
    startedAt: "2026-06-08T10:00:00.000Z"
  });
  assert.deepEqual(result, {
    started: true,
    pid: 4321,
    logPath: "/tmp/focus-data/local-ai/ollama.log",
    statePath: "/tmp/focus-data/local-ai/ollama-state.json"
  });
});

test("ensureOllamaRunning returns without starting an already healthy runtime", async () => {
  let findCalled = false;
  let startCalled = false;
  const result = await ensureOllamaRunning({
    baseUrl: "http://localhost:11434/",
    checkHealthImpl: async () => ({ healthy: true, version: "0.11.0" }),
    findBinaryImpl: async () => {
      findCalled = true;
      return "/usr/bin/ollama";
    },
    startServerImpl: async () => {
      startCalled = true;
    }
  });

  assert.deepEqual(result, {
    healthy: true,
    started: false,
    version: "0.11.0",
    baseUrl: "http://localhost:11434"
  });
  assert.equal(findCalled, false);
  assert.equal(startCalled, false);
});

test("ensureOllamaRunning discovers, starts, and waits for the runtime", async () => {
  const calls = [];
  let healthChecks = 0;
  const result = await ensureOllamaRunning({
    dataDir: "/tmp/focus-data",
    attempts: 3,
    intervalMs: 10,
    checkHealthImpl: async (options) => {
      calls.push(["health", options.baseUrl]);
      healthChecks += 1;
      return healthChecks < 3
        ? { healthy: false, version: null }
        : { healthy: true, version: "0.11.0" };
    },
    findBinaryImpl: async () => {
      calls.push(["find"]);
      return "/home/tester/.local/bin/ollama";
    },
    startServerImpl: async (options) => {
      calls.push(["start", options.binaryPath, options.dataDir]);
      return { pid: 4321, logPath: "/tmp/focus-data/local-ai/ollama.log" };
    },
    sleepImpl: async (milliseconds) => {
      calls.push(["sleep", milliseconds]);
    }
  });

  assert.deepEqual(result, {
    healthy: true,
    started: true,
    version: "0.11.0",
    baseUrl: "http://127.0.0.1:11434",
    pid: 4321,
    logPath: "/tmp/focus-data/local-ai/ollama.log"
  });
  assert.deepEqual(calls, [
    ["health", "http://127.0.0.1:11434"],
    ["find"],
    ["start", "/home/tester/.local/bin/ollama", "/tmp/focus-data"],
    ["sleep", 10],
    ["health", "http://127.0.0.1:11434"],
    ["sleep", 10],
    ["health", "http://127.0.0.1:11434"]
  ]);
});

test("ensureOllamaRunning reports missing binaries and startup timeouts", async () => {
  const offline = async () => ({ healthy: false, version: null });
  await assert.rejects(
    ensureOllamaRunning({
      checkHealthImpl: offline,
      findBinaryImpl: async () => null
    }),
    (error) => error.code === "OLLAMA_NOT_INSTALLED"
  );

  await assert.rejects(
    ensureOllamaRunning({
      binaryPath: "/usr/bin/ollama",
      dataDir: "/tmp/focus-data",
      attempts: 2,
      intervalMs: 0,
      checkHealthImpl: offline,
      startServerImpl: async () => ({ pid: 1234 }),
      sleepImpl: async () => {}
    }),
    (error) => error.code === "OLLAMA_START_TIMEOUT"
  );
});
