# Focus Personal OS: Product and Implementation Architecture

## 1. Purpose

Transform the existing Focus Pattern Tracker into a local-first personal operating
system that helps one person decide what matters now, do focused work, remember
commitments, and review progress without turning the app into a crowded dashboard.

The application will cover:

- Today
- Calendar
- Tasks and reminders
- Focus
- Health
- Progress and habits
- Timeline
- Recent work
- Insights
- Search
- Settings

This is an incremental replacement plan, not a rewrite that discards proven
behavior. The existing focus timer, deterministic focus model, local persistence,
backup import/export, optional folder and MySQL sync, and Electron security
boundary remain operational throughout the transition.

## 2. Product Thesis

Focus should be the private home for a person's day, not a collection of unrelated
mini-apps.

The core loop is:

1. **Orient:** Today answers what is happening, what is due, and what deserves
   attention.
2. **Act:** The user completes a task, starts a focus block, records a health
   check-in, or adjusts the plan.
3. **Capture:** Meaningful activity becomes structured local data.
4. **Reflect:** Progress, timeline, recent work, and explainable insights show
   what changed.
5. **Adjust:** The next day and future commitments become more realistic.

The app is useful with no account, no internet connection, no integrations, and
no accumulated history.

## 3. Non-Negotiable Constraints

### 3.1 Preserve proven behavior

- Keep `focusModel.js` framework-independent and retain its current scoring,
  smoothing, prediction, break, and daily-plan contracts.
- Keep the current session fields accepted by the model: `id`, `title`,
  `project`, `tags`, `startedAt`, `endedAt`, `durationMs`, `activeMs`,
  `pausedMs`, `pauseCount`, `focusRating`, `energy`, and `goalMinutes`.
- Keep the timer states `idle`, `running`, `paused`, and `complete`, plus focus
  and break modes.
- Preserve timer recovery after application restart.
- Preserve atomic local writes and corrupt-file preservation.
- Preserve backup import/export and automatic discovery of legacy backups.
- Preserve optional folder sync and optional MySQL document sync. The app must
  remain fully useful when both are disabled.

### 3.2 Preserve the Electron security boundary

- `contextIsolation` stays enabled.
- `nodeIntegration` stays disabled.
- The renderer never receives direct `fs`, database, process, shell, or arbitrary
  IPC access.
- Privileged actions are implemented in the main process and exposed through a
  narrow, named preload API.
- Every new IPC handler validates inputs and returns serializable result objects.
- No renderer-provided file path may be trusted without main-process
  normalization and an explicit user-selected root.
- Secrets use Electron `safeStorage` when available and are never included in
  export or sync payloads.
- External URLs are not opened until an allowlist and explicit main-process API
  exist.

### 3.3 Local-first behavior

- The local document is authoritative for immediate interaction.
- Every write updates local state before optional sync is attempted.
- Sync failure never blocks task, timer, calendar, habit, or health actions.
- Derived data such as insights and search indexes can always be rebuilt from
  canonical local records.
- The user can export all canonical personal data in a documented JSON format.
- The user can inspect sync status and disconnect without losing local data.

## 4. Simplicity Contract

These rules are acceptance criteria, not visual preferences:

1. Today is the default route and contains no more than four primary sections:
   schedule, priorities, focus, and recent activity.
2. The persistent navigation contains no more than eight visible destinations.
   Recent Work is a reusable view shown on Today and as a Timeline filter, not a
   separate permanent destination.
3. There is one global quick-add action. It accepts a task by default and offers
   event, reminder, habit check-in, and note as secondary choices.
4. There is one global search entry point, available by button and keyboard
   shortcut.
5. A normal task requires only a title. Dates, project, priority, recurrence, and
   reminder are optional details.
6. A normal calendar event requires only a title and time range.
7. A normal health check-in can be completed in under 15 seconds.
8. The focus timer remains one click from Today and always directly reachable
   from Focus.
9. No page repeats the same statistic in multiple cards.
10. No page has more than one visually dominant call to action.
11. Advanced sync, import, export, retention, and integration controls live in
    Settings, not the daily workflow.
12. Empty states offer one useful action and one sentence at most.
13. Insights use plain language and show their evidence; they do not claim
    diagnosis, causation, or artificial intelligence.
14. New dependencies require a written reason. A framework, state library,
    chart library, date library, or native database is not added in the first
    implementation phase.
15. Canonical source modules should stay below 250 lines where practical.
    Oversized modules must be split by domain or responsibility, not by arbitrary
    line ranges.

## 5. Information Architecture

### 5.1 Persistent navigation

The desktop shell uses a narrow left rail:

1. Today
2. Calendar
3. Tasks
4. Focus
5. Health
6. Progress
7. Timeline
8. Insights

Search is a command in the top bar and Settings is anchored at the bottom of the
rail. This meets the eight-destination limit while keeping every major activity
easy to find.

### 5.2 Route responsibilities

#### Today

- Current date and one concise orientation line.
- Chronological agenda combining calendar events and due reminders.
- Up to three chosen priorities, with overdue work called out calmly.
- Compact focus launcher with the next recommended block.
- Recent Work list derived from completed tasks, focus sessions, and work-tagged
  timeline entries.
- Quick check-in affordance for energy, mood, and sleep when not yet recorded.

Today is a projection. It does not own duplicate copies of tasks, events, focus
sessions, or health records.

#### Calendar

- Day, week, and compact month navigation; week is the desktop default.
- Local events, task deadlines, and reminders on one timeline with distinct but
  restrained visual treatment.
- Fast event creation and drag/reschedule only after keyboard-accessible editing
  is complete.
- Optional `.ics` import/export after the local event model is stable.
- External provider connections are explicitly out of the initial scope.

#### Tasks and reminders

- Inbox, Today, Upcoming, and Completed saved views.
- Task title, notes, status, priority, due date, reminder, project, tags,
  recurrence, estimate, and completion timestamps.
- Subtasks are deferred; a checklist inside task notes is sufficient initially.
- A reminder is task metadata unless it has no actionable task, in which case it
  is stored as a lightweight reminder record.
- Recurrence generates the next occurrence on completion instead of precreating
  an unlimited series.

#### Focus

- Existing timer workflow and session metadata.
- Daily active-time goal and learned next-block recommendation.
- Session history, focus fingerprint, best/risk windows, and break guidance.
- Optional association with a task and project.
- Completing a linked focus block can update task time spent but never
  automatically completes the task.
- Manual daily credit remains supported and clearly distinguished from measured
  sessions.

#### Health

- Lightweight daily check-in: sleep duration, sleep quality, mood, energy,
  movement minutes, water, and an optional note.
- User-selected metrics can be hidden; no metric is mandatory.
- Trends are descriptive and private.
- No diagnosis, treatment guidance, emergency advice, or medical-record claims.
- Fine-grained health records are excluded from optional sync by default until
  the user explicitly enables them.

#### Progress and habits

- Habit definitions with frequency, target, color, archived state, and start
  date.
- Daily habit check-ins with value, completion state, note, and timestamp.
- Weekly consistency, streaks, and goal progress.
- Focus goals and task completion can appear here as derived metrics without
  duplicating their records.
- Streaks are supportive, not punitive: a missed day uses neutral language.

#### Timeline

- A chronological, filterable record of meaningful events.
- Sources include focus completion, task completion, event attendance,
  habit check-in, health check-in, manual note, import, and milestone.
- Timeline items are mostly derived from canonical records. Manual notes and
  milestones are canonical timeline records.
- Deleting a derived timeline item means editing or deleting its source.
- Filters: All, Work, Focus, Health, Habits, and Notes.

#### Recent Work

- Shared query, not a separate data store.
- Includes recent focus sessions, completed tasks, and manual timeline entries
  whose project or tags mark them as work.
- Displayed on Today and available through the Work filter in Timeline.
- Grouped by day, with project, duration, and outcome where available.

#### Insights

- Deterministic summaries computed locally from focus, tasks, habits, health,
  and calendar records.
- Every insight includes a date range, sample size, confidence label, and a short
  explanation of the contributing records.
- Initial examples:
  - Strong focus windows from the existing focus model.
  - Planned versus completed task load.
  - Habit consistency by weekday.
  - Descriptive association between self-reported energy and focus score.
  - Meeting load versus available focus time.
- Insights are cached projections and are never sync authorities.

#### Search

- Searches task titles/notes, events, focus session titles/projects/tags, habit
  names, timeline notes, and user-visible health notes.
- Results are grouped by type and ordered by relevance then recency.
- Keyboard navigation and route opening are required.
- The initial implementation uses a rebuilt in-memory index. Full-text database
  infrastructure is deferred until measured data volume requires it.

#### Settings

- Appearance and accessibility.
- Focus and workday defaults.
- Visible health metrics and privacy.
- Reminder and notification behavior.
- Local data location status.
- Backup import/export.
- Folder sync and MySQL sync.
- Data retention and destructive actions.
- About, schema version, and diagnostic information.

## 6. Target Runtime Architecture

### 6.1 Layers

```text
Renderer UI
  routes + components + view models
           |
Application services
  commands + queries + validation + derived projections
           |
Domain modules
  tasks | calendar | focus | health | habits | timeline | insights | search
           |
Local repository interface
  load | transact | subscribe | export snapshot
           |
Preload contract
  explicit typed-shaped methods over IPC
           |
Electron main process
  atomic file store | dialogs | notifications | safeStorage | optional sync
```

The renderer owns presentation and unprivileged domain behavior. The main process
owns filesystem, native dialogs, credentials, notification scheduling, window
behavior, and network/database adapters.

### 6.2 Proposed source layout

The implementation may be introduced gradually alongside existing files:

```text
src/
  main/
    window.cjs
    ipc/
      data-ipc.cjs
      sync-ipc.cjs
      notification-ipc.cjs
      window-ipc.cjs
    persistence/
      document-store.cjs
      backup-service.cjs
      migration-service.cjs
    sync/
      folder-adapter.cjs
      mysql-adapter.cjs
      merge-engine.cjs
    security/
      ipc-validation.cjs
      secret-store.cjs
  preload/
    desktop-api.cjs
  renderer/
    bootstrap.js
    shell/
      router.js
      navigation.js
      command-palette.js
    state/
      app-store.js
      commands.js
      queries.js
    domains/
      today/
      calendar/
      tasks/
      focus/
      health/
      habits/
      timeline/
      insights/
      search/
      settings/
    ui/
      components/
      tokens.css
      shell.css
      utilities.css
  shared/
    schema.js
    validation.js
    migrations.js
    record-utils.js
focusModel.js
focusModel.test.cjs
```

This is a destination map, not permission for a big-bang move. Existing
`main.cjs`, `preload.cjs`, and `app.js` remain entry points until extracted
modules have tests and equivalent behavior.

### 6.3 Renderer state model

Use a small explicit store rather than a framework-specific state system:

- `document`: canonical persisted personal data.
- `deviceState`: persisted state that belongs only to this device, including the
  active timer and selected route.
- `uiState`: ephemeral dialogs, drafts, selection, filters, and loading states.
- `projections`: derived Today agenda, timeline, recent work, progress, insights,
  and search index.

State changes happen through named commands such as `tasks.create`,
`tasks.complete`, `calendar.reschedule`, `focus.finish`, and
`health.recordCheckIn`. Commands validate input, update records, append audit
metadata, rebuild affected projections, and queue persistence.

Views do not mutate the document directly.

## 7. Canonical Data Architecture

### 7.1 Continue with a versioned JSON document

The first product architecture keeps the existing JSON document store because it
is dependency-free, portable, already supports atomic writes, and matches folder
and MySQL snapshot sync.

Do not introduce SQLite during the transformation. Reconsider it only when one
of these measured thresholds is reached:

- A typical document exceeds 20 MB.
- Cold load exceeds 500 ms on supported hardware.
- Search over 25,000 records exceeds 150 ms after indexing.
- Snapshot sync causes repeated user-visible contention.

The misleading legacy filename `focus-data.db` remains readable. A later release
may write a clearer filename only after migration and rollback behavior are
tested.

### 7.2 Document envelope

```js
{
  schemaVersion: 2,
  documentId: "uuid",
  revision: 42,
  createdAt: 1760000000000,
  updatedAt: 1760001000000,
  deviceId: "uuid",
  preferences: {},
  projects: [],
  tasks: [],
  reminders: [],
  calendarEvents: [],
  focus: {
    sessions: [],
    manualDailyMinutes: {},
    manualDailyUpdatedAt: {}
  },
  healthCheckIns: [],
  habits: [],
  habitCheckIns: [],
  timelineEntries: [],
  tombstones: []
}
```

The serialized file retains the existing outer envelope with `version`,
`updatedAt`, and `state` during compatibility releases. `schemaVersion` belongs
inside `state` and governs domain migration.

### 7.3 Common record metadata

Every syncable canonical record has:

```js
{
  id: "uuid",
  createdAt: 1760000000000,
  updatedAt: 1760001000000,
  source: "local",
  deviceId: "uuid"
}
```

Deletions produce tombstones containing `entityType`, `entityId`, `deletedAt`,
and `deviceId`. Tombstones are retained for at least 90 days so deletion can
propagate through intermittently connected sync targets.

### 7.4 Entity outlines

#### Project

`id`, `name`, `color`, `archived`, common metadata.

#### Task

`id`, `title`, `notes`, `status`, `priority`, `projectId`, `tags`, `dueAt`,
`reminderAt`, `recurrence`, `estimatedMinutes`, `completedAt`, common metadata.

Statuses are `inbox`, `planned`, `inProgress`, `completed`, and `cancelled`.

#### Reminder

`id`, `title`, `notes`, `remindAt`, `completedAt`, `snoozedUntil`, common
metadata. A reminder with an actionable task uses `task.reminderAt` instead.

#### Calendar event

`id`, `title`, `notes`, `startsAt`, `endsAt`, `allDay`, `location`, `projectId`,
`sourceCalendar`, `externalId`, `status`, `recurrence`, common metadata.

#### Focus session

The existing focus fields remain unchanged. Additive fields are allowed:
`taskId`, `projectId`, `kind`, and common metadata. Existing model functions
continue to receive the original field names and values.

#### Health check-in

`id`, `dateKey`, `sleepMinutes`, `sleepQuality`, `mood`, `energy`,
`movementMinutes`, `waterUnits`, `note`, common metadata.

Only one default check-in exists per `dateKey`; later edits update that record.

#### Habit

`id`, `name`, `unit`, `targetValue`, `frequency`, `weekdays`, `color`,
`archivedAt`, common metadata.

#### Habit check-in

`id`, `habitId`, `dateKey`, `value`, `completed`, `note`, common metadata.
The pair `habitId + dateKey` is unique for daily habits.

#### Timeline entry

Canonical entries are only manual notes and milestones:
`id`, `kind`, `occurredAt`, `title`, `body`, `projectId`, `tags`, common
metadata. Derived activity references use the source record ID and are rebuilt.

### 7.5 Device-only state

Device state is stored locally but excluded from folder and MySQL snapshots:

- Active timer and alarm state.
- Current route, filters, expanded panels, and window preferences.
- Notification delivery ledger.
- Search index cache.
- Encrypted sync credential references.
- Last sync cursor and adapter diagnostics.

Backups may include device state in a separate optional section, but importing a
backup never replaces a currently running timer without explicit confirmation.

## 8. Commands, Queries, and Projections

### 8.1 Command rules

- Each command validates and normalizes its payload.
- A command either commits one coherent document revision or returns an error.
- IDs and timestamps are assigned in the application service, not UI components.
- Destructive commands produce tombstones.
- Completion commands are idempotent.
- Recurring tasks/events produce the next occurrence only after the current
  occurrence is completed or elapsed according to a tested recurrence policy.
- Focus timer ticks are not persisted every second. Persist on start, pause,
  resume, completion, reset, metadata change, and app close.

### 8.2 Query examples

- `today.getAgenda(dateKey)`
- `tasks.list({ view, projectId, query })`
- `calendar.getRange(startAt, endAt)`
- `focus.getDailySummary(dateKey)`
- `health.getTrend(metric, range)`
- `habits.getWeek(weekStart)`
- `timeline.list({ range, filters })`
- `recentWork.list({ from, limit })`
- `insights.list({ range })`
- `search.query(text, filters)`

Queries return view-ready data and never mutate canonical records.

### 8.3 Derived projections

Rebuild only affected projections after a command:

- Today depends on tasks, reminders, events, focus, health, and recent activity.
- Timeline depends on all canonical activity sources.
- Recent Work depends on focus sessions, completed tasks, projects, and manual
  work entries.
- Progress depends on focus, tasks, habits, and selected goals.
- Insights depend on normalized historical data and a date range.
- Search depends on user-visible text fields.

Projections are disposable. They are not exported or merged.

## 9. Persistence, Backup, and Recovery

### 9.1 Local save flow

1. Renderer executes a validated command.
2. Renderer updates its in-memory document and revision.
3. Renderer sends the complete normalized snapshot through `data:save`.
4. Main process validates the envelope and schema version.
5. Main process serializes to a process-specific temporary file.
6. Main process discards stale queued revisions.
7. Main process atomically renames the newest temporary file.
8. Renderer mirrors a bounded recovery snapshot to `localStorage`.

Retain the current synchronous close-time save only as an emergency flush. Normal
writes remain asynchronous and queued.

### 9.2 Backup format

- Export filename becomes `focus-personal-os-backup-YYYY-MM-DD.json`.
- The exporter can continue offering the legacy filename during transition.
- Backup envelope includes `format`, `schemaVersion`, `exportedAt`, `appVersion`,
  and `state`.
- Export excludes credentials, notification delivery records, transient UI
  state, and derived projections.
- Import parses, validates, migrates, previews counts by entity, and then asks
  whether to merge or replace.
- Replace always creates an automatic pre-replace backup.
- Invalid records are reported by type and never silently accepted.

### 9.3 Recovery

- Keep renaming unreadable local files to `.corrupt-<timestamp>`.
- On failed primary load, offer the localStorage recovery snapshot and latest
  valid automatic backup.
- Write a rotating local backup before schema migration and before destructive
  replace import.
- Keep the three most recent automatic backups, subject to a documented size
  cap.

## 10. Legacy Migration

### 10.1 Supported legacy inputs

- Current `focus-data.db` JSON document.
- Current `focus-pattern-tracker-backup*.json` files.
- Raw state documents and outer `{ version, updatedAt, state }` envelopes.
- Browser `localStorage` key `focus-pattern-tracker:v1`.
- Current folder sync document.
- Current MySQL payload document.

### 10.2 Version 1 to version 2 mapping

| Version 1 field | Version 2 destination |
| --- | --- |
| `theme` | `preferences.theme` |
| `sideTab` | device-only selected route/panel |
| `settings` | normalized preferences and focus settings |
| `sessions` | `focus.sessions`, preserving all model fields |
| `timer` | device-only active timer |
| `manualDailyMinutes` | `focus.manualDailyMinutes` |
| `manualDailyUpdatedAt` | `focus.manualDailyUpdatedAt` |
| `goals` | tasks with mapped completion timestamps |

Legacy goal conversion rules:

- Preserve `id`, text, creation, and completion state.
- Map incomplete goals to `planned`.
- Map completed goals to `completed`.
- Do not invent due dates, priorities, projects, or recurrence.

### 10.3 Migration guarantees

- Migration is pure and deterministic: the same input produces the same output.
- Migration never modifies the source file in place.
- A pre-migration copy is written before the first version 2 save.
- Session IDs, timestamps, active time, pause data, ratings, energy, and goal
  minutes remain byte-for-byte equivalent where their legacy types are valid.
- Invalid legacy records are skipped with a structured report.
- Migration can be rerun without duplicating records.
- A version 2 app can import a version 1 backup at any later time.
- Rollback documentation identifies the preserved version 1 backup.

## 11. Optional Sync Architecture

### 11.1 Adapter contract

Folder and MySQL implementations share:

```js
readSnapshot()
writeSnapshot(snapshot, expectedRevision)
getStatus()
disconnect()
```

The application does not contain adapter-specific merge logic.

### 11.2 Merge rules

The current additive merge remains the compatibility baseline, then advances to
record-aware merge:

- Records merge by stable `id`.
- Higher `updatedAt` wins for a changed record.
- An exact timestamp tie uses lexical `deviceId` as a deterministic tiebreaker.
- Tombstones newer than a record remove that record.
- Focus sessions are append-mostly; matching IDs never duplicate.
- Legacy records without metadata receive deterministic migration metadata before
  merge.
- Device-only state and derived projections never sync.
- Settings use last-write-wins as one settings record.
- Health data is excluded unless the user explicitly enables health sync.

### 11.3 Sync loop

1. Read remote snapshot.
2. Validate and migrate it in memory.
3. Merge local and remote canonical records.
4. Commit the merged local document.
5. Write the merged snapshot remotely.
6. Record status and revision locally.

Sync is serialized per adapter. Exponential backoff replaces fixed aggressive
retry loops after repeated failure. Manual Sync Now remains available.

### 11.4 Conflict visibility

Most conflicts resolve automatically. Show a conflict review only when:

- Both sides changed long-form notes since the last common revision.
- An active record conflicts with a deletion.
- A replace import would remove local records.

Do not expose generic conflict controls for ordinary field updates.

## 12. Notifications and Reminders

- Renderer schedules logical reminders through a narrow preload method.
- Main process validates time, ID, title length, and allowed action type.
- Notification delivery is best effort while the app is running in the first
  release.
- Background/startup delivery requires an explicit later phase with OS-specific
  packaging tests.
- Snooze and complete actions call named task/reminder commands.
- Notification bodies avoid sensitive health details by default.
- The user can disable all notifications without disabling reminders in the UI.

## 13. Visual System

### 13.1 Design direction

- Calm desktop utility, not a marketing dashboard.
- Warm neutral surfaces, one restrained accent color, and semantic status colors.
- Typography and spacing provide hierarchy before borders and cards.
- Use panels only when they group an action or independently scroll.
- Prefer one continuous page surface over a grid of statistic cards.
- Light and dark themes share identical hierarchy and contrast targets.

### 13.2 Design tokens

Create tokens for:

- Surface, elevated surface, text, muted text, border, accent, success, warning,
  danger, and focus ring.
- A four-point spacing scale.
- Three radii only: control, panel, and pill.
- Three text roles beyond body: page title, section title, and metric.
- Compact and comfortable density, with comfortable as the default.

### 13.3 Interaction rules

- Full keyboard navigation for rail, forms, dialogs, search, timer, and calendar.
- Visible focus states in both themes.
- Respect reduced motion.
- Do not rely on color alone for status.
- Confirmation is required for data deletion, replace import, disconnect-and-wipe,
  and history clearing.
- Undo is preferred for task completion, rescheduling, and archive actions.

## 14. Implementation Phases

### Phase 0: Baseline and safety net

**Scope**

- Document current version 1 state and IPC contracts.
- Expand regression fixtures for timer states, focus sessions, import envelopes,
  merge behavior, corrupt data, and optional sync.
- Capture baseline screenshots and startup/load timings.

**Acceptance criteria**

- Existing `npm run check` and `npm test` pass.
- Tests prove current focus scoring, recommendations, timer recovery, and legacy
  normalization behavior.
- A representative version 1 fixture can load, export, and import without data
  loss.
- No UI redesign begins before the fixture and migration expectations exist.

### Phase 1: Versioned data foundation

**Scope**

- Add the version 2 document schema, validators, record metadata, and migration.
- Introduce repository and command boundaries behind the existing UI.
- Separate canonical document, device state, UI state, and projections.
- Retain the current file and outer envelope.

**Acceptance criteria**

- Fresh installs create a valid version 2 document.
- Existing installs migrate automatically after a pre-migration backup.
- Reopening the app preserves a running or paused timer.
- Invalid command payloads do not reach persistence.
- The existing focus screen behaves the same against the new repository.

### Phase 2: Shell and design system

**Scope**

- Build the route shell, left rail, top bar, command/search entry, tokens, and
  reusable controls.
- Place the existing focus experience inside the Focus route before redesigning
  its internals.
- Add responsive behavior for the current minimum desktop size and narrower
  fallback widths.

**Acceptance criteria**

- All routes are keyboard reachable.
- Today is the startup route; an active timer remains visible globally.
- Light and dark themes meet WCAG AA contrast for text and controls.
- No route displays placeholder statistics as if they were real data.
- Navigation has no more than eight visible destinations.

### Phase 3: Tasks, reminders, and Today

**Scope**

- Implement task/reminder commands, queries, recurrence, inbox, and saved views.
- Build Today from task due dates, reminders, and existing focus recommendations.
- Implement global quick add and priority selection.
- Add in-app reminder delivery and best-effort Electron notifications.

**Acceptance criteria**

- A task can be captured with title only in under three interactions.
- Complete, undo, reschedule, archive, and recurrence paths are tested.
- Today never owns copied task records.
- Overdue, due-today, and upcoming boundaries work in local time.
- Reminder failure does not block task usage.

### Phase 4: Calendar

**Scope**

- Implement local calendar events and day/week/month queries.
- Combine events, task deadlines, and reminders in the agenda.
- Add event editing, all-day behavior, and bounded recurrence.
- Defer provider connections; optionally add `.ics` import/export at the end of
  the phase.

**Acceptance criteria**

- Event ranges render correctly across midnight and daylight-saving changes.
- Editing one recurrence occurrence versus the series has an explicit tested
  policy.
- Calendar remains useful offline with zero account configuration.
- Keyboard users can create and edit every event field.
- Today agenda and Calendar show the same source records.

### Phase 5: Focus integration

**Scope**

- Extract the timer state machine and focus repository from `app.js`.
- Link sessions to tasks/projects without changing existing model inputs.
- Rebuild focus history and fingerprint using shared components.
- Keep alarm, break, daily goal, manual credit, and recovery behavior.

**Acceptance criteria**

- All existing focus model tests pass unchanged.
- New timer state-machine tests cover start, pause, resume, early finish,
  automatic completion, confirmation, break transition, reset, and restart.
- Existing version 1 sessions produce the same focus scores after migration.
- A linked task records focused minutes without being auto-completed.
- Folder and MySQL snapshots continue to exclude the active timer.

### Phase 6: Health, habits, and progress

**Scope**

- Add customizable daily health check-ins.
- Add habit definitions/check-ins and weekly progress.
- Build Progress from habits, task outcomes, and focus goals.
- Add health privacy controls and sync opt-in.

**Acceptance criteria**

- A default check-in is completable in under 15 seconds.
- Hidden health metrics disappear from entry and summary views.
- Habit streaks handle timezone and date-key boundaries correctly.
- Archiving a habit preserves history.
- Health records do not enter optional sync unless enabled.
- No health copy implies diagnosis or causation.

### Phase 7: Timeline, Recent Work, and Search

**Scope**

- Implement derived activity generation and manual timeline entries.
- Build shared Recent Work query and Today component.
- Build the in-memory search index and command palette results.
- Add filters and source navigation.

**Acceptance criteria**

- Derived entries update when their source record changes.
- A source record appears only once in the timeline.
- Recent Work is identical on Today and the Timeline Work filter for the same
  date range.
- Search returns all supported entity types and opens the correct source.
- Search remains responsive against the agreed 25,000-record fixture.
- Rebuilding the index produces no persisted canonical changes.

### Phase 8: Insights

**Scope**

- Wrap the existing focus model as the first insight provider.
- Add task-load, habit-consistency, calendar-load, and descriptive
  health/focus providers.
- Add confidence, evidence, date range, and dismissal behavior.

**Acceptance criteria**

- Every insight identifies its sample and period.
- Sparse data yields a neutral onboarding explanation rather than a strong claim.
- The same records and settings produce deterministic results.
- Dismissing an insight does not delete source data.
- Insight computation can be disabled or rebuilt.

### Phase 9: Import, export, and sync hardening

**Scope**

- Add version 2 backup preview, merge/replace, automatic pre-replace backup, and
  migration reports.
- Move folder/MySQL adapters behind the shared sync interface.
- Add record metadata, tombstones, health exclusion, and conflict handling.
- Add backoff, status history, and manual recovery actions.

**Acceptance criteria**

- Version 1 and version 2 backups import successfully.
- Round-trip export/import preserves all canonical records.
- Offline edits synchronize after reconnection without duplicates.
- Edits and deletions propagate between two fixture devices.
- Sync can be disabled with no local data loss.
- Credentials never appear in local documents, exports, logs, or snapshots.

### Phase 10: Release quality

**Scope**

- Accessibility audit, performance profiling, destructive-flow review, packaging,
  and platform smoke tests.
- Add first-run sample-free onboarding and concise help.
- Verify Windows, macOS, and Linux paths where release targets exist.

**Acceptance criteria**

- Cold start, route switch, command save, and search meet performance budgets.
- Keyboard-only critical paths pass.
- Reduced-motion and both themes pass visual regression review.
- Crash/restart tests preserve committed local data and active timer state.
- Packaged builds retain context isolation and narrow preload exposure.
- The app remains fully functional with network disabled.

## 15. Test Strategy

### 15.1 Unit tests

- Schema normalization and command validation.
- Version 1 to version 2 migration.
- Timer state machine and existing focus model.
- Recurrence, local-day boundaries, and daylight-saving behavior.
- Task, habit, health, timeline, recent work, and search queries.
- Record-aware merge and tombstone resolution.
- Insight determinism and sparse-data handling.

### 15.2 Integration tests

- Renderer command to repository to IPC save.
- Atomic write and stale-revision rejection.
- Import preview, merge, replace, and rollback backup.
- Folder adapter two-device merge.
- MySQL adapter authentication and snapshot round trip when configured.
- Notification scheduling and disabled-notification fallback.

### 15.3 End-to-end critical paths

1. Fresh start, quick-add a task, schedule it, focus on it, complete it, and see
   it in Recent Work and Timeline.
2. Create an event and reminder, restart, and see both on Today.
3. Record a health check-in and habit, then see weekly Progress.
4. Export, clear a test profile, import, and recover all canonical data.
5. Open a version 1 fixture and verify focus scores, goals-as-tasks, settings,
   and timer recovery.
6. Work offline, enable folder sync later, and merge without duplicate sessions.

### 15.4 Performance budgets

- Cold document load under 500 ms for the standard 25,000-record fixture.
- Route projection under 100 ms.
- Search response under 150 ms.
- Command-to-local-save acknowledgement under 250 ms under normal disk
  conditions.
- No per-second disk write while a timer is running.

## 16. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Product becomes a dense dashboard | Daily use feels overwhelming | Enforce route responsibilities, section limits, and one dominant action |
| Big-bang rewrite breaks focus | Loss of the app's proven core | Keep existing entry points and move one tested boundary at a time |
| New schema loses legacy data | Irreversible user harm | Pure migration, fixtures, pre-migration backup, idempotence, rollback copy |
| Whole-document sync overwrites edits | Cross-device data loss | Stable IDs, metadata, tombstones, deterministic merge, serialized adapters |
| Health scope creates medical expectations | Trust and safety problem | Descriptive metrics only, explicit privacy, no diagnosis or treatment language |
| Notification expectations exceed Electron lifecycle | Missed reminders | Label first release as best effort while running; test startup support separately |
| Calendar integrations expand scope | Delayed core product | Local calendar first; `.ics` second; provider adapters require a separate plan |
| Search slows as history grows | Poor daily interaction | Rebuilt index, performance fixture, measured threshold before database adoption |
| Vanilla modules become another monolith | High change risk | Domain folders, command/query boundaries, line-size review, focused tests |
| Sync credentials leak into backups | Security incident | Device-only secret references, `safeStorage`, export allowlist, fixture scan |
| Timeline duplicates data | Confusing history and merge complexity | Derive activity from source IDs; persist only manual notes/milestones |
| Insight language overstates evidence | Misleading recommendations | Deterministic providers, sample size, confidence, date range, descriptive wording |
| Too many controls erode visual quality | Clutter and hesitation | Progressive disclosure, compact defaults, Settings for rare operations |

## 17. Explicitly Deferred Work

The following are not part of the initial transformation:

- Cloud account as a requirement.
- Team collaboration or shared workspaces.
- Google, Apple, Microsoft, wearable, or health-provider integrations.
- Medical records or clinical recommendations.
- AI chat, remote model calls, or opaque generated coaching.
- Email client, messaging client, finance tracker, password manager, or file
  storage.
- Nested projects, arbitrary databases, formulas, or user-built dashboards.
- Unlimited subtasks and dependency graphs.
- Plugin marketplace.
- SQLite or another native persistence dependency without measured need.
- Mobile companion app.

Deferral protects the core promise: one calm place to run the day and understand
personal progress.

## 18. Definition of Done

The transformation is complete when:

- Today provides a reliable plan assembled from canonical tasks, reminders,
  calendar events, focus, health, and recent activity.
- Every named domain is usable offline and has a clear source of truth.
- The original focus timer and tested model retain behavior and data fidelity.
- Existing users migrate without losing sessions, settings, goals, manual
  credit, or active timer recovery.
- Import/export round trips all canonical data.
- Folder and MySQL sync remain optional and merge version 2 records safely.
- Electron privilege remains confined to the main/preload boundary.
- Search and insights are local, deterministic, and rebuildable.
- The visible interface obeys the simplicity contract.
- Critical paths pass automated tests and packaged smoke tests.

The product should feel smaller than its feature list: Today for direction,
Focus for execution, and the remaining routes for planning or reflection only
when requested.
