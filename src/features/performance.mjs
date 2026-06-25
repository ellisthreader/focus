export const page = Object.freeze({
  id: "performance",
  label: "PC Performance",
  icon: "monitor"
});

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function formatBytes(value) {
  const bytes = finite(value, -1);
  if (bytes < 0) return "Unavailable";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && amount >= 1024; index += 1) {
    amount /= 1024;
    unit = units[index];
  }
  return `${amount >= 10 ? Math.round(amount) : amount.toFixed(1)} ${unit}`;
}

function formatUptime(value) {
  const minutes = Math.max(0, Math.floor(finite(value) / 60));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainder = minutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${remainder}m`;
  return `${remainder}m`;
}

function systemSummary(sample) {
  const system = sample?.system || {};
  const cpu = sample?.cpu || {};
  return [
    system.hostname,
    cpu.model,
    [system.platform, system.release, system.arch].filter(Boolean).join(" ")
  ].filter(Boolean);
}

function metricLevel(value, threshold) {
  if (!Number.isFinite(Number(value))) return "neutral";
  const ratio = Number(value) / Math.max(1, finite(threshold, 100));
  if (ratio >= 1) return "danger";
  if (ratio >= 0.85) return "warning";
  return "healthy";
}

function healthState(sample, settings) {
  if (settings.enabled === false || sample.status === "disabled") {
    return {
      label: "Monitoring off",
      tone: "neutral",
      description: "Turn monitoring on in Settings to receive live readings and alerts."
    };
  }
  if (sample.status === "error" || sample.status === "unavailable") {
    return {
      label: "Unavailable",
      tone: "warning",
      description: sample.error || "Focus could not read performance data from this device."
    };
  }
  if (sample.status !== "ready") {
    return {
      label: "Checking",
      tone: "neutral",
      description: "Establishing a live performance baseline."
    };
  }

  const alerts = list(sample.alerts);
  const levels = [
    metricLevel(sample?.cpu?.usagePercent, settings.cpuThreshold ?? 95),
    metricLevel(
      sample?.temperature?.available ? sample.temperature.celsius : null,
      settings.temperatureThreshold ?? 90
    ),
    metricLevel(sample?.memory?.usagePercent, settings.memoryThreshold ?? 95),
    metricLevel(
      sample?.disk?.available ? sample.disk.usagePercent : null,
      settings.diskThreshold ?? 95
    )
  ];
  if (alerts.length || levels.includes("danger")) {
    return {
      label: "Critical",
      tone: "danger",
      description: alerts[0]?.body || "One or more readings have reached their alert threshold."
    };
  }
  if (levels.includes("warning")) {
    return {
      label: "Elevated",
      tone: "warning",
      description: "One or more readings are approaching their alert threshold."
    };
  }
  return {
    label: "Healthy",
    tone: "success",
    description: "Core system readings are within your configured limits."
  };
}

function renderMetric(label, value, detail, percent, level) {
  const safePercent = Number.isFinite(Number(percent))
    ? Math.min(100, Math.max(0, Number(percent)))
    : 0;
  const modifier = ["warning", "danger"].includes(level)
    ? ` performance-metric--${level}`
    : "";
  return `
    <article class="performance-metric${modifier}">
      <div class="performance-metric__header">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
      <small>${escapeHtml(detail)}</small>
      <div class="performance-meter" aria-hidden="true"><span style="width:${safePercent}%"></span></div>
    </article>
  `;
}

function renderReadings(sample, settings) {
  if (sample.status !== "ready") {
    return `
      <div class="performance-state" role="status">
        <span class="performance-state__pulse" aria-hidden="true"></span>
        <div>
          <strong>${sample.status === "error" || sample.status === "unavailable" ? "Performance data unavailable" : "Reading PC performance"}</strong>
          <p>${escapeHtml(sample.error || "CPU usage needs a moment to establish a live baseline.")}</p>
        </div>
      </div>
    `;
  }

  const cpu = sample.cpu || {};
  const temperature = sample.temperature || {};
  const memory = sample.memory || {};
  const disk = sample.disk || {};
  const cpuThreshold = finite(settings.cpuThreshold, 95);
  const temperatureThreshold = finite(settings.temperatureThreshold, 90);
  const memoryThreshold = finite(settings.memoryThreshold, 95);
  const diskThreshold = finite(settings.diskThreshold, 95);

  return `
    <div class="performance-grid" aria-label="Primary performance readings">
      ${renderMetric(
        "CPU",
        Number.isFinite(cpu.usagePercent) ? `${Math.round(cpu.usagePercent)}%` : "Sampling",
        `${cpu.logicalCores || 0} logical cores · ${Math.round(finite(cpu.speedMHz))} MHz`,
        cpu.usagePercent,
        metricLevel(cpu.usagePercent, cpuThreshold)
      )}
      ${renderMetric(
        "Temperature",
        temperature.available ? `${Math.round(temperature.celsius)}°C` : "Unavailable",
        temperature.available ? temperature.source || "CPU sensor" : "No supported OS sensor found",
        temperature.available ? (temperature.celsius / temperatureThreshold) * 100 : null,
        metricLevel(temperature.available ? temperature.celsius : null, temperatureThreshold)
      )}
      ${renderMetric(
        "Memory",
        Number.isFinite(memory.usagePercent) ? `${Math.round(memory.usagePercent)}%` : "Unavailable",
        `${formatBytes(memory.usedBytes)} of ${formatBytes(memory.totalBytes)}`,
        memory.usagePercent,
        metricLevel(memory.usagePercent, memoryThreshold)
      )}
      ${renderMetric(
        "System disk",
        disk.available ? `${Math.round(finite(disk.usagePercent))}%` : "Unavailable",
        disk.available ? `${formatBytes(disk.availableBytes)} free on ${disk.path || "system disk"}` : "Disk statistics unavailable",
        disk.usagePercent,
        metricLevel(disk.available ? disk.usagePercent : null, diskThreshold)
      )}
    </div>
  `;
}

function renderDetails(sample, settings) {
  const cpu = sample.cpu || {};
  const network = sample.network || {};
  const system = sample.system || {};
  return `
    <details class="performance-page__details">
      <summary>System details and alert limits</summary>
      <div class="performance-page__details-body">
        <dl class="performance-details">
          <div><dt>Download</dt><dd>${network.available && Number.isFinite(network.receivedBytesPerSecond) ? `${formatBytes(network.receivedBytesPerSecond)}/s` : "Sampling"}</dd></div>
          <div><dt>Upload</dt><dd>${network.available && Number.isFinite(network.sentBytesPerSecond) ? `${formatBytes(network.sentBytesPerSecond)}/s` : "Sampling"}</dd></div>
          <div><dt>Load average</dt><dd>${Array.isArray(cpu.loadAverage) ? cpu.loadAverage.map((value) => finite(value).toFixed(2)).join(" / ") : "Unavailable"}</dd></div>
          <div><dt>Uptime</dt><dd>${formatUptime(system.uptimeSeconds)}</dd></div>
        </dl>
        <div class="performance-page__protection">
          <div>
            <h3>Active protection</h3>
            <p>Focus checks these limits continuously and sends notifications after sustained high readings.</p>
          </div>
          <dl class="performance-thresholds">
            <div><dt>CPU</dt><dd>${escapeHtml(settings.cpuThreshold ?? 95)}%</dd></div>
            <div><dt>Temperature</dt><dd>${escapeHtml(settings.temperatureThreshold ?? 90)}°C</dd></div>
            <div><dt>Memory</dt><dd>${escapeHtml(settings.memoryThreshold ?? 95)}%</dd></div>
            <div><dt>Disk</dt><dd>${escapeHtml(settings.diskThreshold ?? 95)}%</dd></div>
          </dl>
        </div>
      </div>
    </details>
  `;
}

export function render(state = {}, ctx = {}) {
  const sample = ctx?.pcPerformance || {};
  const settings = state?.settings?.pcPerformance || {};
  const summary = systemSummary(sample);
  const health = healthState(sample, settings);

  return `
    <main class="page page--wide performance-page" data-page="performance" aria-labelledby="performance-title">
      <header class="page-header">
        <div class="page-header__content">
          <p class="eyebrow">Local system monitor</p>
          <h1 class="page-header__title" id="performance-title">PC Performance</h1>
          <p class="page-header__description">${escapeHtml(summary.join(" · ") || "Current device")}</p>
        </div>
        <div class="page-header__actions">
          <button class="button button--secondary" type="button" data-action="navigate" data-page="settings">Alert settings</button>
        </div>
      </header>

      <section class="performance-health performance-health--${escapeHtml(health.tone)}" aria-labelledby="performance-health-title" aria-live="polite">
        <div>
          <p class="eyebrow">Overall health</p>
          <h2 id="performance-health-title">${escapeHtml(health.label)}</h2>
          <p>${escapeHtml(health.description)}</p>
        </div>
        <span class="badge ${health.tone === "success" ? "success" : ""}">${escapeHtml(sample.status === "ready" ? "Live" : sample.status || "Loading")}</span>
      </section>

      <section class="card performance-page__overview" aria-labelledby="performance-overview-title">
        <header class="card__header">
          <div>
            <h2 class="card__title" id="performance-overview-title">Core readings</h2>
            <p class="card__description">Updated every five seconds while monitoring is enabled.</p>
          </div>
        </header>
        <div class="card__body">${renderReadings(sample, settings)}</div>
      </section>

      ${renderDetails(sample, settings)}
    </main>
  `;
}

export function bind(root, actions = {}) {
  if (!root?.addEventListener) return;
  const click = (event) => {
    const control = event.target?.closest?.('[data-action="navigate"]');
    if (!control || !root.contains(control)) return;
    actions.navigate?.(control.dataset.page);
  };
  root.addEventListener("click", click);
  return () => root.removeEventListener("click", click);
}
