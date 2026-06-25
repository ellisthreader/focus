# Architecture

Focus is a local-first Electron application with a context-isolated renderer.

## Runtime

- `main.cjs`: window lifecycle, atomic JSON persistence, native dialogs,
  folder sync, optional MySQL sync, secure AI credentials, and AI IPC.
- `assistant-service.cjs`: dependency-free OpenAI Responses API and audio
  transcription gateway with strict plan validation and redacted failures.
- `local-assistant-service.cjs`: loopback-only Ollama structured generation
  using the same strict plan schema and validator.
- `local-ai-runtime.cjs`: user-local Ollama discovery, detached startup,
  Vulkan enablement, health checks, and model provisioning.
- `pc-performance.cjs`: dependency-free CPU, memory, disk, network, uptime,
  and Linux temperature sampling with sustained threshold evaluation.
- `preload.cjs`: narrow `window.focusDesktop` IPC bridge.
- `src/app.mjs`: renderer bootstrap, routing, persistence coordination, timer
  completion, search, editors, and feature composition.
- `src/core/`: v2 schema/migration, store, reducer, timer, date, merge, and
  persistence helpers, plus deterministic assistant action expansion.
- `src/features/`: independent page projections over one canonical state.
- `src/ui/`: shell, icons, and shared editor.
- `src/styles/`: semantic tokens, shell components, and page layouts.
- `focusModel.js`: deterministic focus scoring and recommendation engine.

## Data

The v4 document stores profile, settings, tasks, reminders, events, habits,
health entries, milestone-based goals, medical organizer records, daily routines,
learning and finance data, journal entries, timeline records, focus sessions,
timer recovery data, manual time, and UI preferences.
PC performance thresholds are stored under `settings.pcPerformance`; live
telemetry is transient and is never written to the personal data document.

First-run onboarding is persisted in `onboarding` and captures a compact personal
baseline. The profile stores goals and typical schedule anchors; optional starter
goals and routines are created through the same reducer contracts used elsewhere.
Today shows data-readiness guidance until the main personalization areas have
useful input.

`normalizeState()` migrates the original tracker document automatically. Legacy
task-like goals become tasks, improvements become personal goals, and sessions,
timer state, settings, and manual time remain intact.

## Security

- `contextIsolation: true`
- `nodeIntegration: false`
- No renderer filesystem or database access
- Privileged work only through named IPC methods
- OS `safeStorage` used for the optional OpenAI API key
- Medical collections are removed from the plaintext local envelope and encrypted
  with a verified OS keyring backend; writes fail closed when it is unavailable
- Microphone permission restricted to audio from the local Electron renderer
- AI output validated against an allowlist and previewed before reducer actions
  are dispatched
- Assistant profile, wellbeing, finance, exercise, and learning context is
  summary-only and separately permissioned per provider
- Weekly-review snapshots are rebuilt in the main process from canonical state
  so renderer input cannot bypass assistant privacy controls
- Local Ollama starts with cloud access disabled
- PC telemetry is collected in the main process and exposed as read-only
  snapshots; the renderer receives no filesystem or process access

## PC Performance

The main process samples performance every five seconds. CPU, memory, system
disk, load, and uptime use Node OS/filesystem APIs. Linux network throughput
uses `/proc/net/dev`, and CPU temperature uses `/sys/class/thermal` plus
`/sys/class/hwmon`. Unsupported temperature or network sensors are shown as
unavailable rather than estimated.

CPU, temperature, memory, and disk alerts require three consecutive threshold
violations by default. Native notifications have a 15-minute per-alert
cooldown, and clicking one focuses the app. Monitoring, notifications, and
thresholds are configurable in Settings. Current readings and alert state are
shown in the dedicated PC Performance tab, with a compact summary on Today.

## Focus AI

Focus AI is a full-height companion dock in the application shell. It remains
available beside every page with independent conversation scrolling and a
bottom-anchored composer. The renderer sends a prompt, current local date, and
timezone to the main process. Local mode is the default and requests a strict
JSON plan from `qwen3:4b-instruct` through Ollama on `127.0.0.1`. The optional
OpenAI provider uses `gpt-5.4-mini`; when explicitly selected, voice recordings
use `gpt-4o-mini-transcribe`. There is no automatic cloud fallback. The
renderer validates returned calendar, task, or reminder actions again, renders
a preview, and applies normal reducer actions only after explicit approval.
Recurring calendar schedules expand deterministically in local wall time and
are capped at 400 events.

## Sync

Local state is authoritative. Folder sync performs entity-level merge by stable
ID and freshness while preserving the active local timer. MySQL remains an
advanced optional document sync path. Import merges with local records instead
of blindly replacing the document.

Local writes use a flushed temporary file, rotate the previous document to
`focus-data.db.bak`, and atomically rename the new document. Startup fails closed
on unreadable desktop data and attempts recovery from the last known-good backup
before offering manual backup restore.
