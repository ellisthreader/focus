# PC Performance Implementation Plan

## Scope

Add local PC telemetry to Today and notify the user when sustained resource
pressure or unsafe temperatures are detected.

## Implementation

1. Collect CPU, memory, disk, network, load, uptime, and supported temperature
   sensors in the Electron main process.
2. Evaluate CPU, temperature, memory, and disk thresholds after three
   consecutive high readings, with a per-alert cooldown.
3. Deliver native operating-system notifications and focus the app when a
   notification is clicked.
4. Expose read-only snapshots and bounded configuration through the preload
   bridge.
5. Render current metrics on Today and persist monitoring preferences under
   `settings.pcPerformance`.
6. Cover calculations, cooldown behavior, schema normalization, Home rendering,
   and Settings rendering with automated tests.

## Platform Behavior

CPU, memory, disk, and uptime are cross-platform. Linux additionally reports
network throughput and temperature from kernel interfaces. Unsupported sensors
remain explicitly unavailable; the app does not estimate safety-critical
temperature values.
