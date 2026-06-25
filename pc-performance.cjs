const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_PERFORMANCE_SETTINGS = Object.freeze({
  enabled: true,
  notificationsEnabled: true,
  cpuThreshold: 95,
  temperatureThreshold: 90,
  memoryThreshold: 95,
  diskThreshold: 95,
  sustainedSamples: 3,
  cooldownMinutes: 15
});

function finite(value, fallback, min = -Infinity, max = Infinity) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function normalizePerformanceSettings(value = {}) {
  return {
    enabled: value.enabled !== false,
    notificationsEnabled: value.notificationsEnabled !== false,
    cpuThreshold: finite(value.cpuThreshold, 95, 50, 100),
    temperatureThreshold: finite(value.temperatureThreshold, 90, 50, 120),
    memoryThreshold: finite(value.memoryThreshold, 95, 50, 100),
    diskThreshold: finite(value.diskThreshold, 95, 50, 100),
    sustainedSamples: Math.round(finite(value.sustainedSamples, 3, 1, 12)),
    cooldownMinutes: Math.round(finite(value.cooldownMinutes, 15, 1, 1440))
  };
}

function cpuSnapshot(cpus = os.cpus()) {
  return cpus.reduce((result, cpu) => {
    const times = cpu?.times || {};
    const total = Object.values(times).reduce((sum, value) => sum + finite(value, 0), 0);
    result.idle += finite(times.idle, 0);
    result.total += total;
    return result;
  }, { idle: 0, total: 0 });
}

function cpuUsage(previous, current) {
  if (!previous || !current) return null;
  const idle = current.idle - previous.idle;
  const total = current.total - previous.total;
  if (total <= 0) return null;
  return finite(((total - idle) / total) * 100, 0, 0, 100);
}

async function readLinuxTemperature(fsImpl = fs, root = "/sys") {
  const candidates = [];
  const thermalRoot = path.join(root, "class", "thermal");
  const hwmonRoot = path.join(root, "class", "hwmon");

  try {
    const zones = await fsImpl.promises.readdir(thermalRoot, { withFileTypes: true });
    for (const zone of zones) {
      if (!zone.isDirectory() || !zone.name.startsWith("thermal_zone")) continue;
      const directory = path.join(thermalRoot, zone.name);
      const [rawTemperature, rawType] = await Promise.all([
        fsImpl.promises.readFile(path.join(directory, "temp"), "utf8").catch(() => ""),
        fsImpl.promises.readFile(path.join(directory, "type"), "utf8").catch(() => "")
      ]);
      addTemperatureCandidate(candidates, rawTemperature, rawType.trim() || zone.name);
    }
  } catch {}

  try {
    const monitors = await fsImpl.promises.readdir(hwmonRoot, { withFileTypes: true });
    for (const monitor of monitors) {
      if (!monitor.isDirectory() && !monitor.isSymbolicLink()) continue;
      const directory = path.join(hwmonRoot, monitor.name);
      const files = await fsImpl.promises.readdir(directory).catch(() => []);
      for (const filename of files.filter((name) => /^temp\d+_input$/.test(name))) {
        const prefix = filename.replace(/_input$/, "");
        const [rawTemperature, rawLabel] = await Promise.all([
          fsImpl.promises.readFile(path.join(directory, filename), "utf8").catch(() => ""),
          fsImpl.promises.readFile(path.join(directory, `${prefix}_label`), "utf8").catch(() => "")
        ]);
        addTemperatureCandidate(candidates, rawTemperature, rawLabel.trim() || `${monitor.name} ${prefix}`);
      }
    }
  } catch {}

  if (!candidates.length) return { available: false, celsius: null, source: "" };
  const preferred = candidates.filter((item) => /cpu|core|package|k10|tdie|tctl|x86/i.test(item.source));
  const hottest = (preferred.length ? preferred : candidates)
    .sort((left, right) => right.celsius - left.celsius)[0];
  return { available: true, celsius: hottest.celsius, source: hottest.source };
}

function addTemperatureCandidate(candidates, rawValue, source) {
  let celsius = Number.parseFloat(String(rawValue).trim());
  if (!Number.isFinite(celsius)) return;
  if (celsius > 1000) celsius /= 1000;
  if (celsius < -20 || celsius > 150) return;
  candidates.push({ celsius, source });
}

async function readDiskUsage(fsImpl = fs, target = path.parse(process.cwd()).root) {
  try {
    const stats = await fsImpl.promises.statfs(target);
    const blockSize = Number(stats.bsize || stats.frsize || 0);
    const totalBytes = Number(stats.blocks) * blockSize;
    const availableBytes = Number(stats.bavail) * blockSize;
    const usedBytes = Math.max(0, totalBytes - availableBytes);
    return {
      available: totalBytes > 0,
      path: target,
      totalBytes,
      usedBytes,
      availableBytes,
      usagePercent: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : null
    };
  } catch {
    return {
      available: false,
      path: target,
      totalBytes: null,
      usedBytes: null,
      availableBytes: null,
      usagePercent: null
    };
  }
}

async function readLinuxNetworkCounters(fsImpl = fs, procRoot = "/proc") {
  try {
    const raw = await fsImpl.promises.readFile(path.join(procRoot, "net", "dev"), "utf8");
    return raw.split("\n").slice(2).reduce((result, line) => {
      const [namePart, valuesPart] = line.split(":");
      if (!valuesPart) return result;
      const name = namePart.trim();
      if (!name || name === "lo") return result;
      const values = valuesPart.trim().split(/\s+/).map(Number);
      result.receivedBytes += finite(values[0], 0, 0);
      result.sentBytes += finite(values[8], 0, 0);
      result.interfaces += 1;
      return result;
    }, { receivedBytes: 0, sentBytes: 0, interfaces: 0 });
  } catch {
    return null;
  }
}

function networkRates(previous, current, elapsedMs) {
  if (!previous || !current || elapsedMs <= 0) {
    return {
      available: Boolean(current),
      receivedBytesPerSecond: null,
      sentBytesPerSecond: null,
      interfaces: current?.interfaces || 0
    };
  }
  const seconds = elapsedMs / 1000;
  return {
    available: true,
    receivedBytesPerSecond: Math.max(0, current.receivedBytes - previous.receivedBytes) / seconds,
    sentBytesPerSecond: Math.max(0, current.sentBytes - previous.sentBytes) / seconds,
    interfaces: current.interfaces
  };
}

function performanceAlertDefinitions(sample, settings) {
  return [
    {
      id: "temperature",
      active: sample.temperature.available && sample.temperature.celsius >= settings.temperatureThreshold,
      title: "PC temperature is too high",
      body: `CPU temperature reached ${Math.round(sample.temperature.celsius)}°C (limit ${settings.temperatureThreshold}°C).`
    },
    {
      id: "cpu",
      active: Number.isFinite(sample.cpu.usagePercent) && sample.cpu.usagePercent >= settings.cpuThreshold,
      title: "CPU usage is extremely high",
      body: `CPU usage reached ${Math.round(sample.cpu.usagePercent)}% (limit ${settings.cpuThreshold}%).`
    },
    {
      id: "memory",
      active: sample.memory.usagePercent >= settings.memoryThreshold,
      title: "Memory usage is extremely high",
      body: `Memory usage reached ${Math.round(sample.memory.usagePercent)}% (limit ${settings.memoryThreshold}%).`
    },
    {
      id: "disk",
      active: sample.disk.available && sample.disk.usagePercent >= settings.diskThreshold,
      title: "System disk is almost full",
      body: `Disk usage reached ${Math.round(sample.disk.usagePercent)}% (limit ${settings.diskThreshold}%).`
    }
  ];
}

function evaluatePerformanceAlerts(sample, settings, state = {}, now = Date.now()) {
  const normalized = normalizePerformanceSettings(settings);
  const cooldownMs = normalized.cooldownMinutes * 60_000;
  const alerts = [];

  for (const definition of performanceAlertDefinitions(sample, normalized)) {
    const entry = state[definition.id] || { consecutive: 0, lastNotifiedAt: 0 };
    entry.consecutive = definition.active ? entry.consecutive + 1 : 0;
    const cooledDown = !entry.lastNotifiedAt || now - entry.lastNotifiedAt >= cooldownMs;
    if (definition.active && entry.consecutive >= normalized.sustainedSamples && cooledDown) {
      entry.lastNotifiedAt = now;
      alerts.push({ id: definition.id, title: definition.title, body: definition.body, createdAt: now });
    }
    state[definition.id] = entry;
  }

  return alerts;
}

function createPerformanceMonitor(options = {}) {
  const osImpl = options.os || os;
  const fsImpl = options.fs || fs;
  const platform = options.platform || process.platform;
  const now = options.now || Date.now;
  const intervalMs = finite(options.intervalMs, 5000, 1000, 60_000);
  let settings = normalizePerformanceSettings(options.settings);
  let previousCpu = cpuSnapshot(osImpl.cpus());
  let previousNetwork = null;
  let previousNetworkAt = now();
  let latest = null;
  let interval = null;
  let initialTimeout = null;
  let collecting = false;
  const alertState = {};

  async function collect() {
    if (collecting || !settings.enabled) return latest;
    collecting = true;
    try {
      const collectedAt = now();
      const currentCpu = cpuSnapshot(osImpl.cpus());
      const currentNetwork = platform === "linux"
        ? await readLinuxNetworkCounters(fsImpl, options.procRoot)
        : null;
      const [temperature, disk] = await Promise.all([
        platform === "linux"
          ? readLinuxTemperature(fsImpl, options.sysRoot)
          : Promise.resolve({ available: false, celsius: null, source: "" }),
        readDiskUsage(fsImpl, options.diskPath)
      ]);
      const totalMemoryBytes = osImpl.totalmem();
      const availableMemoryBytes = osImpl.freemem();
      const usedMemoryBytes = Math.max(0, totalMemoryBytes - availableMemoryBytes);
      const cpuList = osImpl.cpus();
      const usagePercent = cpuUsage(previousCpu, currentCpu);
      const network = networkRates(previousNetwork, currentNetwork, collectedAt - previousNetworkAt);

      latest = {
        status: "ready",
        collectedAt,
        cpu: {
          usagePercent,
          logicalCores: cpuList.length,
          model: cpuList[0]?.model || "Unknown CPU",
          speedMHz: finite(cpuList[0]?.speed, null),
          loadAverage: osImpl.loadavg().map((value) => finite(value, 0, 0))
        },
        temperature,
        memory: {
          totalBytes: totalMemoryBytes,
          usedBytes: usedMemoryBytes,
          availableBytes: availableMemoryBytes,
          usagePercent: totalMemoryBytes > 0 ? (usedMemoryBytes / totalMemoryBytes) * 100 : 0
        },
        disk,
        network,
        system: {
          hostname: osImpl.hostname(),
          platform,
          release: osImpl.release(),
          arch: osImpl.arch(),
          uptimeSeconds: osImpl.uptime()
        },
        alerts: []
      };
      latest.alerts = evaluatePerformanceAlerts(latest, settings, alertState, collectedAt);
      previousCpu = currentCpu;
      previousNetwork = currentNetwork;
      previousNetworkAt = collectedAt;
      options.publish?.(latest);
      if (settings.notificationsEnabled) {
        for (const alert of latest.alerts) options.notify?.(alert);
      }
      return latest;
    } catch (error) {
      latest = {
        status: "error",
        collectedAt: now(),
        error: error?.message || "PC performance data is unavailable.",
        alerts: []
      };
      options.publish?.(latest);
      return latest;
    } finally {
      collecting = false;
    }
  }

  function start() {
    stop();
    if (!settings.enabled) return;
    previousCpu = cpuSnapshot(osImpl.cpus());
    previousNetworkAt = now();
    initialTimeout = setTimeout(collect, Math.min(1000, intervalMs));
    initialTimeout.unref?.();
    interval = setInterval(collect, intervalMs);
    interval.unref?.();
  }

  function stop() {
    if (initialTimeout) clearTimeout(initialTimeout);
    if (interval) clearInterval(interval);
    initialTimeout = null;
    interval = null;
  }

  function configure(nextSettings) {
    const wasEnabled = settings.enabled;
    const normalized = normalizePerformanceSettings(nextSettings);
    const changed = JSON.stringify(normalized) !== JSON.stringify(settings);
    settings = normalized;
    if (changed) {
      for (const key of Object.keys(alertState)) delete alertState[key];
    }
    if (settings.enabled && !wasEnabled) start();
    if (!settings.enabled) {
      stop();
      latest = { status: "disabled", collectedAt: now(), alerts: [] };
      options.publish?.(latest);
    }
    return settings;
  }

  return {
    collect,
    configure,
    getLatest: () => latest || {
      status: settings.enabled ? "loading" : "disabled",
      collectedAt: null,
      alerts: []
    },
    getSettings: () => ({ ...settings }),
    start,
    stop
  };
}

module.exports = {
  DEFAULT_PERFORMANCE_SETTINGS,
  cpuSnapshot,
  cpuUsage,
  createPerformanceMonitor,
  evaluatePerformanceAlerts,
  networkRates,
  normalizePerformanceSettings,
  readDiskUsage,
  readLinuxNetworkCounters,
  readLinuxTemperature
};
