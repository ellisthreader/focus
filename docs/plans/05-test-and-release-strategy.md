# Focus Personal OS: Test and Release Strategy

## 1. Purpose

This plan defines the evidence required to release the redesigned Focus Electron
application without losing existing Focus Pattern Tracker data or weakening its
local-first privacy boundary.

The release is not complete when the new pages render. It is complete only when:

- A real version-1 user document migrates to schema version 2 without losing
  sessions, elapsed focus time, settings, manual daily credit, goals, or an
  active timer.
- The timer survives pause, restart, sleep, completion, and confirmation flows
  without double-counting time or sessions.
- Every shipped page boots from empty, realistic, malformed, and migrated state.
- Keyboard-only and screen-reader-critical workflows work in the packaged app.
- Import, export, local persistence, folder sync, and optional MySQL sync have
  explicit compatibility behavior.
- Sensitive personal data is not copied or synchronized beyond what the user
  has knowingly enabled.
- Signed or otherwise platform-appropriate Linux, macOS, and Windows artifacts
  install, launch, upgrade, retain data, and uninstall predictably.
- A failed release can be stopped and rolled back without asking the user to
  surrender the only valid copy of their data.

## 2. Current Repository Baseline

The strategy is based on the repository as it exists at the time of this plan.

### Existing runtime and test surfaces

- Electron entry point: `main.cjs`
- Context-isolated bridge: `preload.cjs`
- Current HTML entry point: `index.html`
- Legacy renderer: `app.js`
- Legacy deterministic model: `focusModel.js`
- New schema/state modules:
  - `src/core/schema.mjs`
  - `src/core/reducer.mjs`
  - `src/core/store.mjs`
  - `src/core/timer.mjs`
  - `src/core/date.mjs`
  - `src/core/persistence.mjs`
- New implemented views:
  - Today: `src/features/dashboard.mjs`
  - Calendar: `src/features/calendar.mjs`
  - Tasks: `src/features/tasks.mjs`
  - Focus: `src/features/focus.mjs`
  - Health: `src/features/health.mjs`
  - Progress: `src/features/progress.mjs`
  - Timeline: `src/features/timeline.mjs`
  - Work: `src/features/work.mjs`
  - Insights: `src/features/insights.mjs`
  - Settings: `src/features/settings.mjs`
  - Search overlay: `src/features/search.mjs`
- Existing automated tests:
  - `focusModel.test.cjs`
  - `test/schema.test.mjs`
  - `test/store.test.mjs`
  - `test/date.test.mjs`
- Existing screenshot command: `npm run screenshots`
- Existing optional sync implementations:
  - Folder snapshot: `focus-pattern-tracker-sync.json`
  - MySQL tables: `focus_users` and `focus_user_documents`

### Baseline commands that work now

```bash
npm ci
npm run check
npm test
```

`npm run check` currently syntax-checks the legacy files and all new `.mjs`
modules. `npm test` currently runs 33 model, schema, store, and date tests.
Passing those commands is the baseline, but not yet a complete release signal.

### Current release blockers

The following are release blockers, not optional cleanup:

1. There are no reducer, timer, persistence, IPC, page smoke, accessibility, or
   packaged-app tests.
2. The screenshot script seeds version-1 state and captures only two legacy
   portfolio views. It is not yet a redesign regression suite.
3. There is no Electron Forge or Electron Builder configuration, no package
   scripts for distributables, and no documented signing/notarization setup.
4. `main.cjs` applies `no-sandbox`, X11, disabled-GPU, and `in-process-gpu`
   switches on every platform. Linux-specific compatibility flags must not be
   shipped unconditionally on macOS and Windows, and disabling Chromium's
   sandbox is a security release blocker unless a platform-specific necessity
   is documented and accepted.
5. The current persistence helper mirrors the complete schema-v2 document into
   renderer `localStorage`. Folder and MySQL sync also serialize whole
   documents, including health data. This conflicts with the planned sensitive
   data defaults unless the product explicitly discloses and gates that behavior.
6. `safeStorage` falls back to base64 when OS encryption is unavailable. Base64
   is not encryption; remembered database secrets must become session-only or
   the integration must be disabled in that condition.
7. The file/MySQL envelope still writes `version: 1` while the contained
    application state uses `schemaVersion: 2`. The meanings and compatibility
    rules of both fields must be documented and tested before release.
8. The current `start` and `check` scripts invoke Bash. They are useful on the
   current Linux workspace but cannot be treated as the Windows release
   contract until replaced with cross-platform Node commands or platform-neutral
   package tooling.

No alpha artifact may be distributed until blocker 1 is closed. No public beta
may be distributed until all eight blockers are closed or the affected
feature is removed from that build.

## 3. Quality Model

### Test layers

| Layer | Purpose | Required tooling |
| --- | --- | --- |
| Pure unit | Schema, reducer, timer, date, model, search, projections | Node test runner |
| Renderer component | Render/bind each page against controlled state | DOM test environment or Playwright page |
| Main-process integration | Files, corruption, atomic writes, dialogs, IPC validation | Node tests with extracted services and temp directories |
| Electron end-to-end | Real preload, renderer, window, keyboard, restart | Playwright Electron |
| Accessibility | Automated rules plus keyboard and screen-reader checks | axe-core, Playwright, manual AT |
| Visual | Stable route/state screenshot comparison | Existing Chrome script initially, Playwright for Electron truth |
| Sync compatibility | Folder fixtures and disposable MySQL | Node/Electron integration plus local MySQL |
| Packaging | Install, launch, upgrade, data retention, uninstall | Native CI runner for each OS |

Unit tests should be broad and deterministic. End-to-end tests should be fewer
and centered on boundaries that pure tests cannot prove: Electron IPC, restart,
native dialogs, filesystem behavior, focus order, and packaged applications.

### Severity policy

- **P0:** Data loss, duplicate sessions, secret exposure, app cannot launch,
  migration cannot complete, or rollback cannot recover. Zero open issues.
- **P1:** Core workflow broken, inaccessible primary action, sync corruption,
  installer/upgrade failure, or timer materially wrong. Zero open issues.
- **P2:** Important but recoverable workflow defect or serious visual
  regression. Zero known regressions at stable release; a beta exception
  requires a named owner and workaround.
- **P3:** Cosmetic or low-frequency defect. May ship only when documented and
  excluded from migration, privacy, timer, accessibility, and packaging areas.

Flaky tests are failed tests. A test may be quarantined only with an issue,
owner, reproduction notes, and expiry date, and never if it protects a P0/P1
gate.

## 4. Required Test Command Contract

Before beta, `package.json` must expose one canonical set of commands. The
implementation may use different supporting tools, but the release interface
must be:

```bash
npm run check
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:a11y
npm run screenshots
npm run package
```

Recommended definitions based on the current repository:

```json
{
  "scripts": {
    "check": "node scripts/check-sources.cjs",
    "test": "npm run test:unit && npm run test:integration",
    "test:unit": "node scripts/run-tests.cjs unit",
    "test:integration": "node scripts/run-tests.cjs integration",
    "test:e2e": "playwright test",
    "test:a11y": "playwright test --grep @a11y",
    "package": "electron-builder --dir",
    "dist": "electron-builder"
  }
}
```

The exact glob implementation must be made cross-platform; shell-only wildcard
behavior must not be assumed on Windows. If necessary, use a small Node test
launcher or list test directories rather than relying on Bash expansion.

Every pull request runs:

```bash
npm ci
npm run check
npm test
TZ=UTC node --test focusModel.test.cjs test/*.test.mjs
TZ=America/New_York node --test test/date.test.mjs test/schema.test.mjs test/timer.test.mjs
TZ=Europe/London node --test test/date.test.mjs test/schema.test.mjs test/timer.test.mjs
```

Release candidates additionally run all Electron, accessibility, visual, sync,
and native packaging jobs.

## 5. Fixtures and Determinism

Create committed, anonymized fixtures under `test/fixtures/`. Never use a
developer's real `focus-data.db`, backup, sync folder, or MySQL payload.

Required fixtures:

- `v1-empty.json`
- `v1-realistic.json`
- `v1-running-timer.json`
- `v1-paused-timer.json`
- `v1-complete-timer.json`
- `v1-max-history.json`
- `v1-malformed-recoverable.json`
- `v1-corrupt.json`
- `v2-empty.json`
- `v2-all-domains.json`
- `v2-sensitive-health.json`
- `v2-envelope.json`
- `folder-sync-v1.json`
- `folder-sync-v2.json`
- `mysql-payload-v1.json`
- `mysql-payload-v2.json`

Fixture rules:

- Use fixed IDs and timestamps.
- Include local-midnight, daylight-saving transition, leap-day, and year-boundary
  records.
- Include Unicode, apostrophes, long notes, empty optional fields, duplicate
  IDs, invalid dates, prototype-pollution keys, and unknown future fields.
- Include at least 1,000 sessions and 1,000 timeline items in a scale fixture.
- Store expected migration summaries beside each fixture: entity counts, total
  active time, total paused time, incomplete goal count, settings, timer status,
  and expected dropped malformed records.
- Tests control `Date.now`, locale, timezone, and generated IDs where equality
  depends on them.
- No screenshot fixture uses the current date without pinning it.

## 6. Legacy Version-1 Migration Invariants

Migration is a P0 boundary. It must be testable independently from UI rendering
and must not silently truncate valid data.

### Required invariants

For every valid version-1 input:

1. The output has `schemaVersion === 2`.
2. Every valid session retains its original `id`, `title`, `project`, `tags`,
   `startedAt`, `endedAt`, `durationMs`, `activeMs`, `pausedMs`, `pauseCount`,
   `focusRating`, `energy`, `goalMinutes`, and `taskId` when present.
3. Session count is unchanged.
4. Sum of `activeMs`, `pausedMs`, and `durationMs` is unchanged.
5. Session ordering is stable unless a documented canonical sort is applied.
6. Every legacy goal becomes exactly one task.
7. Goal IDs, text/title, completion state, creation time, and completion time
   survive.
8. No migrated goal remains in a duplicate `goals` collection.
9. Theme and all known settings survive; unknown settings survive unless
   explicitly unsafe.
10. `manualDailyMinutes` and `manualDailyUpdatedAt` preserve every valid date.
11. A running timer remains running with its original accumulated active time,
    resume timestamp, target, metadata, and timer ID.
12. A paused timer remains paused and does not accumulate active time while the
    app is closed.
13. A complete timer remains complete and cannot create a second session merely
    by reopening the app.
14. Migration is idempotent:
    `normalizeState(normalizeState(input))` equals the first normalized result.
15. Input objects and imported files are not mutated.
16. Unknown, safe top-level and entity fields are either preserved or listed in
    a reviewed drop manifest.
17. Invalid records are rejected individually; one malformed task or event does
    not erase unrelated valid data.
18. Prototype keys such as `__proto__`, `constructor`, and `prototype` cannot
    escape normalization.
19. The pre-migration source remains recoverable until the migrated app has
    successfully loaded and persisted at least twice.
20. Migration never overwrites the only copy of a source file.

### Migration comparison report

Each migration test should produce a structured comparison in failure output:

```text
sessions: 824 -> 824
activeMs: 123456789 -> 123456789
pausedMs: 456789 -> 456789
goals/tasks: 37 -> 37
incomplete goals/tasks: 12 -> 12
timer: running -> running
manual days: 180 -> 180
dropped records: 0
```

### Migration acceptance test

On each supported OS:

1. Install the last stable version.
2. Seed it with `v1-realistic.json`.
3. Start a focus timer and leave it running.
4. Exit normally.
5. Install the release candidate over the existing installation.
6. Launch and verify the migration report.
7. Confirm counts and aggregate times against the fixture manifest.
8. Complete the recovered timer.
9. Restart twice and verify exactly one new session exists.
10. Export the migrated document and re-import it into a clean profile.

**Gate M1:** All migration invariants pass for every fixture and supported OS.
Any count, duration, running-timer, or ID mismatch is P0.

## 7. Schema, Reducer, Store, Date, and Model Unit Tests

### Schema

Extend `test/schema.test.mjs` to cover every collection:

- Profile and settings defaults and bounds.
- Tasks, reminders, events, habits, health entries, work items, improvements,
  journal entries, timeline entries, sessions, timer, daily maps, and UI state.
- Empty, null, wrong-type, oversized, duplicate, and unknown-field cases.
- Date/time normalization and all-day events.
- Completed task/status consistency.
- Health bounds without converting health data into medical conclusions.
- Compatibility envelopes `{ version, updatedAt, state }`.
- Future `schemaVersion` handling. The app must not destructively rewrite a
  document from a newer unsupported schema.

### Reducer

Add `test/reducer.test.mjs` with table-driven tests for every action in
`reduceAppState`.

For each action, assert:

- The previous state is unchanged.
- Unknown actions return the same state reference.
- Invalid additions return the same state reference.
- Valid changes affect only intended domains.
- IDs are stable across updates.
- Timeline side effects occur once and reference the canonical entity.
- Deleting an entity has documented timeline behavior.
- Task completion and reopening set/clear `completedAt` correctly.
- Habit increments use the intended local date.
- Health increments cannot create invalid negative or non-finite values.
- Timeline remains bounded to its documented maximum without losing canonical
  source records.
- `data/reset` accepts only normalized state at the application boundary.

Add action-sequence tests for real workflows, not just individual cases:

- Add task -> update -> complete -> reopen -> delete.
- Add event -> reschedule -> delete.
- Add habit -> check -> uncheck.
- Save health -> increment water -> edit note.
- Start focus-related timer state -> add session -> append timeline.

### Store

Retain the existing notification and transaction tests, then add:

- Subscriber adding/removing subscribers during notification.
- Listener or `onChange` throwing without corrupting state.
- Reentrant dispatch behavior.
- Large state replacement.
- Persistence callback ordering.
- A transaction containing reducer dispatches and state replacement.

### Date and timezone

Run date tests in at least `UTC`, `America/New_York`, `Europe/London`, and
`Asia/Kolkata`.

Cover:

- Spring-forward and fall-back days.
- Leap day.
- Month/year rollover.
- Date keys around local midnight.
- Calendar grids for Sunday and Monday week starts.
- Events crossing midnight.
- Locale formatting without snapshotting machine-specific punctuation.

### Focus model

Keep `focusModel.test.cjs` as a compatibility suite. Add regression fixtures so
the redesigned renderer cannot accidentally change scoring, recommendation, or
session contracts while moving code.

**Gate U1:** All unit tests pass in three consecutive clean runs, in UTC and at
least two non-UTC timezones. No skipped P0/P1 tests.

## 8. Timer Restart and Completion Strategy

The timer is the highest-risk interactive state machine.

### Pure timer tests

Add `test/timer.test.mjs` for:

- Idle -> running focus.
- Idle -> running short/long break.
- Running -> paused -> running.
- Running -> complete.
- Paused -> complete.
- Early completion allowed.
- Goal-bound completion when early completion is not allowed.
- Reset to idle while retaining intended form metadata.
- Active and paused duration calculations at exact boundaries.
- Negative, missing, non-finite, and future timestamps.
- Goal clamping for focus and break modes.
- Session generation from completed timer.
- Focus rating and energy bounds.
- Linked task ID preservation.
- Timer IDs and session IDs do not collide.

### Restart matrix

| State before exit | Time closed | Expected state after launch |
| --- | ---: | --- |
| Idle | Any | Idle, no session |
| Running focus | 10 seconds | Running; elapsed active time advances once |
| Running focus | Beyond goal | Complete prompt once; no session before confirmation |
| Paused focus | 10 minutes | Paused; active time unchanged, paused time advances |
| Complete focus | Any | Complete prompt restored; confirmation creates one session |
| Running break | Beyond goal | Break complete prompt once; no focus session created |
| Complete break | Any | Confirmation starts the proposed focus block once |

Test normal close, forced process termination, OS shutdown simulation where
possible, renderer reload, and main-process restart.

### Completion flow invariants

- The alarm and visual completion state trigger once per timer completion.
- Re-rendering once per second does not append sessions.
- Focus completion creates a session only on the defined confirmation action.
- Repeated click, Enter key repeat, double IPC delivery, and restart after click
  cannot create duplicate sessions.
- Break completion never enters the focus session history.
- A linked task is not automatically completed.
- The completed timer and new session are persisted in one logical transaction.
- If persistence fails, the UI reports the failure and retains a recoverable
  completed timer rather than discarding it.
- Alarm audio is supplementary. Completion remains visible and screen-reader
  announced without audio.
- Sleep/wake and wall-clock changes do not produce negative or repeated elapsed
  time.

**Gate T1:** The restart matrix passes in unpackaged Electron and in all packaged
release candidates. Zero duplicate or missing sessions in 100 repeated
completion runs.

## 9. Persistence, Import, and Export

### Local document tests

Extract filesystem persistence from `main.cjs` into testable functions or inject
the user-data directory. All tests use a temporary directory.

Cover:

- Missing data file returns an empty state.
- Bare-state and envelope documents both load.
- Writes create parent directories.
- Atomic temporary-file rename succeeds.
- An older queued write cannot overwrite a newer revision.
- Temporary files are removed after failure.
- Synchronous close-time save produces valid JSON.
- Corrupt JSON is renamed to `focus-data.db.corrupt-<timestamp>`.
- A corrupt source is preserved byte-for-byte.
- Disk full, permission denied, interrupted rename, and invalid payload errors
  are visible and do not report success.
- Unknown newer schema is opened read-only or rejected without rewrite.

### Export tests

- Canceling the save dialog is success-with-cancel, not an error.
- Export produces valid UTF-8 JSON with an explicit envelope version,
  application schema version, export timestamp, and app version.
- Export contains every canonical user-owned domain selected by the user.
- Export never contains MySQL database passwords, remembered account passwords,
  safeStorage ciphertext, sync folder configuration, machine paths, or
  diagnostics.
- Export to an existing file follows an explicit overwrite confirmation.
- Exported state normalizes and re-imports identically.

### Import tests

- Import accepts documented `.json` and legacy `.db` JSON files.
- Cancel leaves state unchanged.
- Invalid JSON shows a useful error and leaves state unchanged.
- Unsupported future schema is rejected without partial import.
- Import runs normalization and migration before state replacement or merge.
- Import preview reports counts by domain, schema version, date range, and
  records that will be dropped.
- The user chooses Replace or Merge; the app does not guess.
- Replace creates a pre-import backup.
- Merge is deterministic, idempotent, and conflict-aware for all shipped
  domains, not only sessions/goals/manual minutes.
- Importing the same file twice creates no duplicates.
- IDs that collide with different content produce an explicit conflict result.
- Imported running/complete timer state requires an explicit user decision when
  a local active timer exists.

### Round-trip gate

For each fixture:

```text
load -> migrate/normalize -> export -> clean profile import -> export
```

Canonical state from the two exports must be deeply equal after excluding
document metadata such as export timestamps.

**Gate D1:** Persistence fault tests and all fixture round trips pass. No secret
appears in exported JSON.

## 10. Folder and MySQL Sync Compatibility

Sync remains optional. Local actions must succeed while sync is unavailable.

### Compatibility contract

Before beta, choose and document one of these policies:

1. **Version-2 sync enabled:** Both folder and MySQL adapters understand all
   version-2 entities, tombstones/conflicts, privacy exclusions, and envelope
   versions.
2. **Legacy sync read-only:** The redesigned app can import legacy snapshots but
   does not write version-2 state to shared locations.
3. **Sync temporarily disabled:** Existing local data remains intact and users
   receive clear migration/export guidance.

Writing a whole version-2 state document into a location that an older client
can overwrite is prohibited.

### Folder sync tests

- Folder selection, cancel, disconnect, missing folder, read-only folder,
  offline network mount, delayed write, partial file, invalid JSON, and conflict.
- Atomic write uses a unique temporary file and cleans it up.
- Two app instances cannot silently overwrite unrelated changes.
- Reading the same snapshot repeatedly is idempotent.
- Version-1 folder snapshot migrates correctly.
- Unsupported newer snapshots are not rewritten.
- Sync failure does not block local save.
- Disconnect stops reads/writes but keeps local state.
- The UI shows last success, last failure, active folder, and data categories.
- Health and other sensitive categories follow the user's explicit inclusion
  setting.

### MySQL tests

Use a disposable local MySQL database and unique database/user names in CI or a
dedicated integration environment:

```bash
FOCUS_MYSQL_PASSWORD="test-only-password" npm run setup:mysql
```

Test:

- Schema setup is idempotent.
- Account creation, duplicate account, login, wrong password, read, write, and
  disconnect.
- PBKDF2 salt/hash storage and timing-safe comparison.
- UTF-8/Unicode payloads and large documents.
- Connection refused, DNS failure, access denied, missing database, and timeout.
- A failed remote write does not roll back local work.
- Version-1 MySQL payload migrates once.
- Concurrent clients detect revision conflict rather than last-writer-wins
  silently.
- SQL values remain parameterized and user-selected identifiers are validated.
- Secrets are never logged, exported, placed in app state, or sent to folder
  sync.
- When `safeStorage.isEncryptionAvailable()` is false, the database password is
  not persisted. The UI explains that it is session-only.

### Sensitive data compatibility

The current whole-document adapters include `healthEntries`. Public beta is
blocked until one of these is implemented:

- Sensitive collections are excluded by default and enabled per adapter through
  informed consent, or
- Sync is clearly described as a full-document copy and requires explicit
  confirmation before first write.

The first option is preferred.

**Gate S1:** Folder and MySQL compatibility matrices pass, or the corresponding
adapter is disabled in the release build. There is no ambiguous partial support.

## 11. Page and Workflow Smoke Tests

Every shipped destination needs a render-and-bind smoke test plus at least one
real Electron navigation test.

### State matrix per page

Each page renders without throwing from:

- Default empty state.
- Realistic version-2 fixture.
- Migrated version-1 fixture.
- Missing optional arrays/properties.
- Malformed values after normalization.
- Large fixture.
- Light theme.
- Dark theme.

### Required page assertions

| Surface | Minimum assertions |
| --- | --- |
| Shell | Current navigation, title, skip link, window controls, search |
| Today | Schedule, priorities, focus state, health prompt, recent work |
| Calendar | 42-day grid, selected/today states, agenda, event/reminder actions |
| Tasks | Filters, add, edit, toggle, delete, reminders, empty state |
| Focus | Idle/running/paused/complete controls, history, recommendations |
| Health | Save, quick increment, seven-day history, disclaimer |
| Progress | Habit checks, streaks, improvements, goals, empty state |
| Search | Open/close, grouped results, no results, keyboard selection |
| Timeline | Required before shipping its navigation destination |
| Insights | Required before shipping its navigation destination |
| Settings | Required before import/export/sync/privacy controls are exposed |

No navigation item may point to a placeholder, missing module, or page that
throws. Unimplemented destinations must be removed from the release navigation.

### Core end-to-end smoke path

1. Launch a clean profile.
2. Create a task.
3. Schedule an event.
4. Create a reminder.
5. Start a focus session linked to the task.
6. Pause and resume.
7. Complete and confirm the session.
8. Record a health check-in.
9. Check a habit.
10. Search for the task and open it.
11. Restart the app.
12. Confirm all records and timeline effects remain.
13. Export, reset to a clean profile, import, and compare.

**Gate P1:** Every shipped page passes the state matrix and core smoke path in
Electron on Linux, macOS, and Windows.

## 12. Keyboard and Accessibility Checks

The detailed behavior contract is in
`docs/plans/04-accessibility-and-keyboard.md`. Release testing must verify it,
not merely cite it.

### Automated checks

Run axe against every page and major overlay in light and dark themes:

- Empty state.
- Populated state.
- Editor/dialog open.
- Search open.
- Timer complete prompt open.
- Validation error visible.

Automated failures for missing names, invalid ARIA, duplicate IDs, landmark
errors, contrast, and focusable hidden content block release.

### Keyboard-only script

Without a pointer:

1. Use the skip link.
2. Traverse primary navigation.
3. Open each destination with navigation and documented shortcuts.
4. Create, edit, complete, reopen, and delete a task.
5. Navigate the calendar grid with arrows, Home/End, Page Up/Down, and select a
   date.
6. Start, pause, resume, finish, and confirm a timer.
7. Open search, move through results, activate one, and close with Escape.
8. Open and close editor/dialog layers.
9. Confirm focus returns to the invoker or nearest surviving control.
10. Use F6/Shift+F6 if that feature ships.
11. Reach window controls in the frameless title bar.

There must be no keyboard trap, lost focus, invisible focus, inaccessible
action, or shortcut firing while typing into a field.

### Manual assistive technology matrix

| OS | Screen reader | Required release coverage |
| --- | --- | --- |
| Windows | NVDA current stable | All core workflows |
| macOS | VoiceOver current OS | All core workflows |
| Linux | Orca on supported distro | Launch, navigation, tasks, timer, dialogs |

Also verify:

- 200% zoom at the minimum supported window size.
- Increased text spacing.
- OS high-contrast/forced-colors where supported.
- Reduced motion.
- Completion announcements do not repeat every second.
- Timer countdown is labelled but not a per-second live region.
- Charts have text summaries and do not rely on color.
- All hit targets and focus indicators meet the documented dimensions/contrast.

**Gate A1:** Zero critical/serious axe findings, zero keyboard blockers, and no
P0/P1 issue in the manual assistive technology matrix.

## 13. Privacy and Security Release Checks

### Data inventory

Maintain a checked release manifest listing where each category is stored:

| Category | Local file | localStorage | Export | Folder sync | MySQL |
| --- | --- | --- | --- | --- | --- |
| Tasks/reminders | Required | Temporary compatibility only | User-selected | Explicit | Explicit |
| Calendar events | Required | Temporary compatibility only | User-selected | Explicit | Explicit |
| Focus sessions | Required | Temporary compatibility only | User-selected | Explicit | Explicit |
| Health entries | Required | Prohibited long-term | Explicit opt-in | Off by default | Off by default |
| Secrets | Credential store only | Prohibited | Prohibited | Prohibited | Prohibited |

The manifest must match observed behavior, not product copy.

### Privacy tests

- Fresh install makes no network request.
- Local-only use never loads a remote script, font, image, analytics endpoint,
  update feed, or MySQL connection.
- DevTools network capture remains empty during local workflows.
- CSP prevents unexpected remote content and inline script injection.
- `contextIsolation` remains true and `nodeIntegration` remains false.
- Preload exposes only named methods; no generic IPC send, filesystem, shell,
  process, or database object reaches the renderer.
- IPC handlers validate shape, size, and type before filesystem/database use.
- Renderer-provided paths are never trusted outside user-selected roots.
- Notes and titles containing HTML render as text, not executable markup.
- Export/sync payload inspection finds no passwords or machine-local secrets.
- Logs and crash reports redact titles, notes, health entries, credentials, and
  full file paths.
- Telemetry remains absent or opt-in with a viewable payload.
- Destructive reset clearly states what is local and what remains in sync.

### Security packaging checks

- Chromium sandbox is enabled in release builds unless an approved,
  platform-specific exception exists.
- Linux X11/GPU workarounds are conditional and not forced on macOS/Windows.
- Navigation and new-window handlers deny unexpected external URLs.
- Dependency audit is reviewed:

```bash
npm audit --omit=dev
npm audit
```

An audit finding is evaluated for actual Electron runtime reachability; critical
or high exploitable production findings block release.

**Gate Q1:** The privacy manifest matches payload inspection, local-only mode
makes no network request, no secret is persisted without real OS encryption,
and the release renderer keeps its Electron security boundary.

## 14. Screenshot and Visual Regression Matrix

The existing `npm run screenshots` command must be converted from two legacy
portfolio captures into deterministic redesign fixtures. Keep portfolio images
separate from release regression images.

### Required desktop captures

Capture every shipped destination at `1440x960` in light and dark themes:

- Today
- Calendar
- Tasks
- Focus
- Health
- Progress
- Timeline, if shipped
- Insights, if shipped
- Settings

### Required state captures

- Today empty and populated.
- Calendar month boundary and dense day.
- Tasks empty, filtered, overdue, and editor open.
- Focus idle, running, paused, and complete prompt.
- Health empty, check-in form, and seven-day history.
- Progress empty and populated.
- Search results and no-results states.
- Import preview, sync error, validation error, and destructive confirmation.

### Required size captures

- `1440x960`: primary review size.
- `1280x800`: compact desktop.
- Minimum supported window size from `BrowserWindow`.
- `1920x1080`: wide-layout spacing.
- 200% zoom at a usable viewport.

### Platform captures

At least one shell screenshot per OS is required because frameless window
controls, fonts, focus rings, scrollbars, and rendering differ:

- Linux
- macOS
- Windows

### Visual gate

- Pin fixture data, date, locale, timezone, fonts, device scale, and animation.
- Disable caret and transient timer ticking during capture.
- Compare against reviewed baselines.
- Automatic pixel thresholds may identify candidates, but a human reviews every
  changed baseline.
- Reject clipped text, overlapping controls, horizontal scrolling in ordinary
  layouts, unreadable contrast, broken focus rings, and accidental density.
- A baseline update requires a linked design reason; never approve all changed
  images merely to make CI green.

Commands:

```bash
npm run screenshots
git diff -- docs/screenshots
```

When Playwright visual tests are introduced:

```bash
npx playwright test --grep @visual
npx playwright show-report
```

**Gate V1:** All required screenshots exist, intentional changes are reviewed in
both themes, and the packaged shell is manually checked on all three OSes.

## 15. Packaging Strategy

The repository currently has no packaging tool. Select Electron Builder or
Electron Forge in a small packaging spike. Electron Builder is a reasonable
default for the desired artifact matrix, but selection is complete only after a
minimal signed/notarized path and `mysql2` runtime inclusion are proven.

### Package metadata required before distribution

- Stable app name and executable name.
- Reverse-DNS application ID.
- Versioning policy.
- Copyright and license.
- Platform icons.
- Maintainer/publisher metadata.
- Artifact naming including version, OS, and architecture.
- Included/excluded file manifest.
- ASAR policy and any required unpack rules.
- Update-feed policy, even if automatic updates are deferred.
- Signing and notarization environment-variable documentation.

Ensure packages include:

- `main.cjs`
- `preload.cjs`
- `index.html`
- `focusModel.js`
- Required `src/` modules and styles
- `mysql2` and its runtime dependencies

Ensure packages exclude:

- Tests and fixtures unless needed for diagnostics
- Development screenshots
- `.env`
- Credentials
- Raw signing keys
- Local databases and sync files
- Git and editor metadata

### Artifact matrix

| OS | Architectures | Required artifacts | Required trust checks |
| --- | --- | --- | --- |
| Linux | x64; arm64 if supported | AppImage and `.deb` | Install/launch, desktop entry, permissions |
| macOS | arm64 and x64, or tested universal | Signed `.dmg` plus `.zip` | Hardened runtime, notarization, Gatekeeper |
| Windows | x64; arm64 when supported | Signed NSIS installer | SmartScreen/signature, install/upgrade/uninstall |

Build each platform on its native CI runner. Do not treat a cross-compiled
artifact as equivalent to a native install test.

### Packaged application tests

For each artifact:

1. Install on a clean supported OS.
2. Launch from the normal OS entry point, not the build directory.
3. Verify the app title, icon, frameless controls, fonts, and no missing assets.
4. Complete the core smoke path.
5. Restart and verify data.
6. Upgrade over the previous stable build and verify version-1 migration.
7. Export and import through native dialogs.
8. Enable/disable folder sync.
9. Connect to disposable MySQL where supported.
10. Uninstall and document whether user data is retained.
11. Reinstall and verify retained-data behavior.
12. Launch offline.
13. Verify no console/module errors in production mode.

### Platform-specific checks

Linux:

- Test Wayland and X11 where supported.
- Verify sandbox behavior without unconditional `--no-sandbox`.
- Test AppImage executable permission and `.deb` dependencies.

macOS:

- Verify Intel and Apple Silicon behavior.
- Validate notarization:

```bash
spctl --assess --type execute --verbose "/Applications/Focus.app"
codesign --verify --deep --strict --verbose=2 "/Applications/Focus.app"
```

Windows:

- Verify install for standard user and upgrade over an existing install.
- Check Add/Remove Programs metadata, shortcuts, uninstall, and signature.
- Verify long paths and non-ASCII Windows usernames.

**Gate B1:** Native CI produces all required artifacts, and each artifact passes
clean install, upgrade, launch, restart, export/import, and uninstall checks.

## 16. Continuous Integration Layout

Recommended jobs:

1. `lint-check-unit`
   - Linux, Node 20 minimum supported version.
   - `npm ci`, syntax checks, all unit tests.
2. `timezone`
   - UTC, New York, London, Kolkata.
3. `integration-linux`
   - Persistence, IPC services, folder sync.
4. `mysql-integration`
   - Disposable MySQL service.
5. `electron-e2e-linux`
   - Renderer, restart, keyboard, accessibility, visuals.
6. `package-linux`
   - AppImage and `.deb`, install smoke.
7. `package-macos`
   - arm64/x64 build, sign/notarize on protected release branches.
8. `package-windows`
   - NSIS build, sign on protected release branches.
9. `artifact-smoke`
   - Download produced artifact and test the artifact, not the source tree.

Use pinned Node major/minor, lockfile-based `npm ci`, and protected secrets.
Pull requests do not receive signing credentials. Release signing occurs only
for protected tags after all non-signing gates pass.

## 17. Release Gates

| Gate | Requirement | Blocks |
| --- | --- | --- |
| G0 Boot | `src/app.mjs` exists; redesigned entry point launches without console errors | Any alpha |
| G1 Static/unit | Canonical check/test commands cover all current source and pass repeatedly | Any alpha |
| G2 Migration | M1 invariants and native upgrade test pass | Any user with v1 data |
| G3 Timer | T1 restart/completion matrix passes, zero duplicates | Any beta |
| G4 Data | D1 persistence/import/export round trips pass | Any beta |
| G5 Sync | S1 passes or sync adapters are disabled | Any beta advertising sync |
| G6 Pages | P1 smoke matrix passes for every visible destination | Any beta |
| G7 Access | A1 automated/manual accessibility passes | Public beta |
| G8 Privacy | Q1 privacy/security checks pass | Public beta |
| G9 Visual | V1 reviewed screenshot matrix passes | Release candidate |
| G10 Packages | B1 native artifacts pass install/upgrade tests | Stable |
| G11 Rollback | Backup, kill switch, prior installer, and recovery drill verified | Stable |

Release approval requires named sign-off from:

- Product/design for scope and screenshots.
- Engineering for code, tests, and packages.
- Data owner for migration and rollback.
- Accessibility reviewer.
- Privacy/security reviewer.

One person may hold multiple roles, but each sign-off must cite the relevant
gate evidence.

## 18. Staged Rollout

Focus is local-first, so staged rollout cannot depend on silent telemetry. Use
explicit build channels, opt-in diagnostics, support reports, and migration
success confirmation.

### Stage 0: Internal pre-alpha

- Clean profiles only.
- Sync disabled.
- Goal: boot, page smoke, timer, and daily use.
- Exit: G0, G1, and basic P1 pass for implemented pages.

### Stage 1: Migration dogfood

- Internal users with copied version-1 fixtures and voluntary backup copies.
- Folder/MySQL writes remain disabled until compatibility passes.
- Goal: migration reports, timer restart, import/export recovery.
- Exit: G2-G4 pass; no P0/P1 issue through seven days of use.

### Stage 2: Closed alpha

- Small invited group with explicit backup instructions.
- Publish known limitations and data locations.
- Sync only when G5 passes for the selected adapter.
- Collect opt-in diagnostic bundles that exclude personal content.
- Exit: at least 25 successful upgrades, zero unresolved P0/P1, rollback drill
  completed.

### Stage 3: Public beta

- Separate beta channel and clearly labelled prerelease artifacts.
- Require automatic pre-upgrade backup.
- Offer one-click export from Settings.
- Exit: G0-G11 pass, at least two weeks without migration/data-loss incident,
  and platform package success on the supported OS matrix.

### Stage 4: Stable

- Promote the exact tested release-candidate artifacts; do not rebuild from the
  same tag after approval.
- Publish checksums, supported OS versions, migration notes, data/privacy notes,
  known issues, and rollback instructions.
- Keep the previous stable installers available.

For updater-based percentage rollout in a later release:

1. 5% for 24 hours.
2. 25% for 48 hours.
3. 50% for 48 hours.
4. 100% only when migration, crash, and support thresholds remain healthy.

Automatic updates must not be introduced in the same release as the first
schema-v2 migration unless independently tested and rollback-capable.

## 19. Rollback and Recovery

### Pre-upgrade protection

Before the first schema-v2 write:

- Copy the existing local document to a timestamped, read-only backup.
- Record app version, envelope version, schema version, file hash, and original
  path in a small migration receipt.
- Do not delete or rewrite legacy folder/MySQL snapshots automatically.
- Keep at least the latest successful pre-upgrade backup and latest user export.
- Show the backup location without exposing it to arbitrary renderer writes.

### Rollback rules

- A downgrade must never open schema-v2 state and rewrite it as version 1.
- The prior stable app uses the preserved version-1 backup, not the migrated
  file.
- New version-2-only records are exported before rollback.
- Sync writes are disabled during rollback to prevent an old client from
  overwriting a newer remote document.
- If a release is withdrawn, stop updater distribution immediately, retain
  downloadable recovery artifacts, and publish exact affected versions.

### Kill switches

Each optional high-risk subsystem needs a release-configurable off switch:

- Folder sync writes.
- MySQL sync writes.
- Automatic import discovery.
- Any future updater.
- Any future telemetry.

The local task, timer, calendar, health, habit, search, export, and manual import
workflows must remain usable with all optional switches off.

### Recovery drill

Before stable:

1. Install previous stable and seed `v1-realistic.json`.
2. Upgrade to release candidate and make version-2-only changes.
3. Simulate a migration or launch failure.
4. Preserve/export version-2 state.
5. Restore the previous app and its version-1 backup.
6. Verify the previous app launches and its original data is intact.
7. Reinstall the fixed release candidate.
8. Import the version-2 export and verify no duplicate sessions/tasks.

**Gate R1:** The drill succeeds on Linux, macOS, and Windows, and support can
perform it from written instructions without developer intervention.

## 20. Release Runbook

Run from a clean checkout of the tagged commit:

```bash
git status --short
npm ci
npm run check
npm test
npm run test:e2e
npm run test:a11y
npm run screenshots
npm audit --omit=dev
```

Then:

1. Confirm the tag version matches `package.json` and package metadata.
2. Confirm migration fixture manifests and screenshot baselines are unchanged
   unless intentionally reviewed.
3. Build unsigned artifacts in ordinary CI and run artifact smoke tests.
4. Build/sign/notarize from protected release CI.
5. Download and verify the exact signed artifacts.
6. Record SHA-256 checksums.
7. Complete the native install/upgrade matrix.
8. Complete the rollback drill.
9. Attach gate evidence to the release record.
10. Publish to the intended channel.
11. Monitor support and opt-in diagnostics through the staged window.
12. Promote the same artifact or halt/rollback; never patch an artifact in place.

Suggested checksum commands:

```bash
sha256sum dist/*
```

On macOS, use `shasum -a 256 dist/*` when `sha256sum` is unavailable.

## 21. Definition of Done

The redesigned Focus personal OS is releasable only when:

- The redesigned entry point exists and every visible destination is functional.
- Canonical commands cover all source and tests.
- Version-1 migration preserves counts, IDs, durations, settings, daily credit,
  goals/tasks, and active timer state.
- Timer restart and completion cannot lose or duplicate a session.
- Local persistence, import, export, corruption recovery, folder sync, and
  optional MySQL behavior are proven or explicitly disabled.
- Sensitive data and credentials follow the privacy manifest.
- Keyboard, accessibility, and visual matrices pass.
- Native Linux, macOS, and Windows artifacts pass clean install and upgrade.
- Staged rollout controls and a tested rollback path exist.
- There are zero open P0/P1 defects.

Until those conditions hold, a build may be called a development preview, but
not a stable personal operating system release.
