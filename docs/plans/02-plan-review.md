# Focus Personal OS Redesign: Senior Plan Review

## Review Verdict

**Status: reject the current direction until the plan is narrowed and the data
foundation is redesigned.**

The product ambition is understandable, but "one app for everything about me"
is not a product scope. It is an unbounded category containing several mature
products: calendar, tasks, reminders, time tracking, health, journaling,
personal analytics, file activity, and life logging. Building all of them at
once would create a crowded dashboard, weak versions of critical tools,
unmanageable privacy exposure, and a rewrite that risks losing the useful
focus history the app already has.

The corrected goal should be:

> Focus is a calm personal execution system that shows what matters now, helps
> the user complete it, and turns completed work into a trustworthy timeline
> and weekly review.

Focus should initially **coordinate** personal data, not become the permanent
system of record for every category of a person's life. Calendar providers
remain authoritative for calendar events. Health platforms remain
authoritative for health records. Focus owns tasks, focus sessions, reminders,
and the derived activity timeline.

## Review Basis

This review uses the product brief and the current repository as the baseline:

- The existing app is a functional local-first Electron focus tracker.
- The renderer is concentrated in `app.js` (about 2,300 lines), with
  `styles.css` (about 1,300 lines) and `main.cjs` (about 740 lines).
- State is persisted as a version-1 JSON document, mirrored in browser
  `localStorage`, and optionally synchronized as another whole JSON document
  through a folder or MySQL.
- Existing normalization silently limits history to 600 sessions and 80 goals.
- Current automated tests cover the focus recommendation model, not the timer,
  persistence, IPC, sync, migration, or UI.

Those constraints make an additive "just add modules" plan unsafe.

## Non-Negotiable Plan Corrections

1. Replace "everything about me" with a defined first user outcome.
2. Freeze health, finance, messaging, email, file surveillance, and generalized
   journaling until after the first release.
3. Preserve the existing timer and focus history as a migration requirement,
   not as disposable prototype code.
4. Move durable domain data and rules out of the renderer before adding major
   domains.
5. Replace whole-document sync with entity-level persistence and explicit
   conflict behavior before enabling multi-device editing.
6. Make privacy permissions, retention, export, deletion, and integration
   revocation part of the product plan rather than post-launch settings.
7. Define one calm primary screen. Do not place every module, metric, chart, and
   control on the dashboard.
8. Add release gates for migration recovery, timezone correctness, reminders,
   accessibility, and packaged desktop builds.

## Risk Register

### Critical: Unbounded Scope

**Problem**

The proposed categories do not share the same maturity, data source, risk, or
interaction model. A to-do item can be created locally in seconds. A calendar
integration requires OAuth, recurrence handling, provider-specific sync, time
zones, conflict behavior, and token security. Health data introduces more
sensitive permissions, units, provenance, and interpretation risk.

**Likely failure**

The team builds many navigation destinations and cards before any end-to-end
workflow is excellent. The app looks comprehensive in screenshots but is less
useful than the original focus tracker.

**Correction**

Organize the roadmap around one loop:

1. Decide what matters today.
2. Start and complete focused work.
3. Capture the result automatically.
4. Review progress and adjust tomorrow.

Every first-release feature must directly support that loop. Features that do
not support it are deferred.

**Exit criterion**

The first-release backlog contains no more than four primary destinations and
can be explained without using "and anything else."

### Critical: Rewrite Risk

**Problem**

The current app already has timer state, completed sessions, goals, manual
credits, settings, backup files, folder sync, and optional MySQL state. A visual
redesign that replaces these structures without a migration contract can
discard or duplicate real user data.

**Correction**

Treat the redesign as a staged migration:

- Inventory every persisted field and identify its new owner.
- Build migration fixtures from current version-1 documents.
- Create an automatic pre-migration backup.
- Import into the new store in a transaction.
- Compare source and destination counts and aggregate durations.
- Keep the old data file untouched until the new app has opened successfully
  more than once.
- Provide a visible recovery/import action.
- Never silently truncate old sessions or goals during migration.

**Exit criterion**

Automated migration tests prove that session count, total active time, running
timer state, settings, and incomplete goals survive the upgrade.

### Critical: Sensitive Data Concentration

**Problem**

Combining schedule, work, reminders, health, habits, and timeline data creates a
high-value personal profile. The current local database is JSON despite its
`.db` name, browser storage mirrors the state, folder sync writes readable JSON,
and MySQL stores one readable payload. The current credential fallback is base64
when OS encryption is unavailable; base64 is encoding, not encryption.

**Correction**

- Publish a data classification before adding integrations.
- Keep credentials only in the OS credential store. If secure storage is
  unavailable, require session-only credentials or disable that integration.
- Stop mirroring sensitive domain data into renderer `localStorage`.
- Encrypt backups and remote sync before health or similarly sensitive data is
  supported.
- Separate integration secrets from domain records.
- Add per-integration permission disclosure, last-sync time, disconnect, and
  delete-imported-data controls.
- Default analytics and telemetry to off.
- Never infer medical advice or present productivity correlations as health
  conclusions.

**Exit criterion**

A threat model covers local device access, malicious renderer content, stolen
backups, compromised sync storage, leaked OAuth tokens, and account deletion.

### High: Dashboard and Navigation Clutter

**Problem**

A screen containing calendar, recent work, reminders, timer, improvements,
tasks, health, timeline, goals, streaks, charts, and settings cannot remain
simple. Each card will compete for attention and turn daily planning into
dashboard maintenance.

**Correction**

Use four primary destinations:

- **Today:** agenda, top tasks, next reminder, and the active focus session.
- **Tasks:** inbox, projects, scheduled work, and completed tasks.
- **Focus:** timer, session history, and focused analytics.
- **Timeline:** a chronological record derived from completed work.

Use command search/quick capture globally. Put settings, integrations, detailed
analytics, archive, and later modules behind secondary navigation.

The Today screen should answer only:

1. What is next?
2. What must happen today?
3. Can I start focusing now?
4. How is today progressing?

**Exit criterion**

At the default desktop size, Today has one dominant action, no horizontal
carousel, no more than three visual regions, and no settings controls.

### High: Duplicate Sources of Truth

**Problem**

An imported calendar event can become a task, a reminder, a focus block, and a
timeline event. Without ownership rules, edits will diverge and the user will
not know which object is authoritative.

**Correction**

Define ownership explicitly:

| Data | Focus ownership | First-release behavior |
| --- | --- | --- |
| Task | Authoritative | Create and edit in Focus |
| Reminder | Authoritative | Local reminder attached to a task |
| Focus session | Authoritative | Existing timer remains canonical |
| Calendar event | External provider | Read-only mirror in first release |
| Timeline entry | Derived | Generated from task/session activity |
| Health record | External platform | Deferred |
| Recent work | Derived | Completed tasks and sessions only |

Do not allow two-way calendar editing until recurrence, deletes, provider
conflicts, and offline queues have dedicated tests.

### High: Weak Persistence Model for a Personal OS

**Problem**

The existing design serializes the entire application state for each save and
sync. This is workable for a bounded tracker but not for years of tasks,
reminders, events, notes, activity records, and integration metadata. It also
makes conflict resolution coarse: one concurrent update can overwrite an
unrelated update.

**Correction**

Adopt a main-process repository layer backed by a transactional local database.
SQLite is the expected choice, but the driver must be proven in packaged
Electron builds before commitment. Use:

- Schema migrations with monotonically increasing versions.
- Stable UUIDs.
- `created_at`, `updated_at`, and optional `deleted_at` fields.
- Entity-specific repositories and validation.
- Tombstones for synchronized deletion.
- Database transactions for multi-record workflows.
- Explicit backup and restore services.
- Bounded IPC methods instead of accepting arbitrary whole-state objects.

Do not expose SQL or generic file access to the renderer.

### High: Renderer Monolith

**Problem**

Adding every domain to the current renderer will amplify coupling between timer
state, rendering, sync, integration credentials, and normalization. Testability
will decline as event handlers and global state expand.

**Correction**

Split by domain and runtime boundary before feature growth:

```text
src/
  main/
    database/
    repositories/
    integrations/
    reminders/
    ipc/
  preload/
  renderer/
    shell/
    today/
    tasks/
    focus/
    timeline/
    settings/
  shared/
    contracts/
    validation/
    time/
```

The exact framework is secondary. A framework migration should happen only if a
small spike proves it improves state isolation, testing, and maintainability.
Do not combine a full framework rewrite, storage rewrite, and product redesign
in one unreviewable change.

### High: Sync Semantics Are Undefined

**Problem**

The current folder and MySQL sync operate on snapshots with merge rules tailored
to sessions, goals, and manual time. Tasks require edits, reordering, completion
and reopening, while reminders require cancellation and rescheduling. Unioning
records or picking the latest snapshot is insufficient.

**Correction**

For the first release, choose one:

- Single-device local-first operation with encrypted export/restore.
- A deliberately limited entity sync protocol with revision numbers,
  tombstones, idempotency, and tested conflict rules.

The safer first release is single-device. Existing sync users must be told how
legacy sync behaves during migration; it must not silently upload the new store
to an incompatible client.

### High: Calendar Complexity Is Underestimated

**Problem**

Calendar is not a list of timestamped titles. It includes recurrence rules,
exceptions, all-day events, time zones, daylight-saving transitions, canceled
instances, provider pagination, offline behavior, and permission revocation.

**Correction**

Start with one read-only calendar path selected after user discovery:

- One provider integration, or
- Local `.ics` import/subscription.

Display provenance and last-sync status. Keep provider IDs and recurrence
metadata. Do not convert every event into a Focus task. Add a user action to
"plan work from event" that creates a separate linked task.

### High: Reminder Reliability

**Problem**

An in-app countdown is not a reminder system. Desktop reminders must survive
window closure, process restart, sleep/wake, clock changes, and missed
notification windows.

**Correction**

Schedule reminders in the main process, persist them, recompute on startup and
resume, and use native notifications. Define behavior for overdue reminders,
quiet hours, notification denial, and deleted tasks.

**Exit criterion**

Automated tests cover restart, sleep simulation, DST changes, duplicate
delivery, and task deletion.

### Medium: "Recent Work" Can Become Surveillance

**Problem**

Reading editor history, browser history, file activity, or application usage
would introduce invasive permissions and unclear interpretation.

**Correction**

For the first release, recent work means completed Focus tasks and focus
sessions. Any future filesystem, Git, browser, or application integration must
be separately opt-in, scoped to selected locations/accounts, and previewed
before import.

### Medium: Metrics Can Become Punitive

**Problem**

Scores, streaks, health signals, and improvement prompts can turn a calm
personal tool into a judgment system. Empty days, illness, travel, and
incomplete tracking will make definitive "productivity" claims misleading.

**Correction**

- Prefer neutral trends over grades.
- Always show the data basis and confidence.
- Let users hide streaks and analytics.
- Distinguish "not recorded" from zero.
- Never merge health and productivity data into causal claims.
- Make weekly review dismissible and editable.

### Medium: Multi-Agent Coordination Risk

**Problem**

Twenty parallel agents editing shared state, navigation, and data contracts will
produce conflicting abstractions and inconsistent UI.

**Correction**

Use the agents for bounded research, fixtures, tests, and independent documents.
Limit simultaneous core implementation to a few non-overlapping workstreams.
One architecture owner must approve data contracts; one design owner must
approve information architecture and tokens; one integration owner must approve
permissions. Merge vertical slices, not twenty disconnected component patches.

## Corrected Product Definition

### Primary User

A single person using a desktop app to plan and complete knowledge work. Team
collaboration, shared projects, family coordination, and public profiles are
out of scope.

### Core Promise

Open Focus and understand the next useful action within five seconds. Start a
focus session within ten seconds. End the day with an accurate record that did
not require manual life logging.

### Product Principles

- **Action before analytics:** the next task and focus action outrank charts.
- **Derived before duplicated:** timeline and recent work come from actual
  activity.
- **Local by default:** no account is required for core use.
- **Explicit integrations:** no silent data collection or broad permissions.
- **One source of truth:** imported data keeps its provider ownership.
- **Progressive disclosure:** advanced controls stay out of daily workflows.
- **Calm failure:** offline integrations do not block local tasks or the timer.
- **Reversible changes:** imports, migrations, and integration connections can
  be undone.

## Minimum Lovable First Release

The first release should feel like a meaningful evolution of Focus, not a
collection of placeholders.

### 1. Today

Include:

- Current date and a compact day progress indicator.
- A chronological agenda combining read-only calendar items and scheduled
  Focus tasks.
- Up to three user-selected priority tasks.
- The active/next focus block with one clear Start action.
- A quick capture field for a task or reminder.
- A small completed-today section, collapsed by default.

Exclude:

- Health cards.
- Habit grids.
- Multiple charts.
- Weather, quotes, news, inboxes, or decorative greetings.
- Settings, sync controls, sliders, and integration forms.

### 2. Tasks and Reminders

Include:

- Inbox, Today, Upcoming, Project, and Completed filters.
- Task title, notes, project, due date, optional scheduled time, priority, and
  status.
- A reminder attached to a task.
- Keyboard-first capture and completion.
- Undo for completion and deletion.
- A clear distinction between due date and scheduled work time.

Exclude:

- Dependencies, Gantt charts, team assignment, comments, custom field builders,
  complex recurrence, and automation rules.

### 3. Focus

Preserve and improve:

- Start, pause, resume, finish, reset, and restart recovery.
- Link a session to a task without requiring a task.
- Existing active/paused duration semantics.
- Existing explainable focus recommendations.
- Session history and a small weekly trend.

Move advanced fields such as tags, energy, ratings, block policy, sync, and
manual corrections behind contextual or settings surfaces.

### 4. Timeline and Weekly Review

Timeline entries are generated from:

- Task creation, scheduling, completion, and reopening.
- Focus session start and completion.
- Calendar events that occurred, clearly marked as external.
- User-authored short notes only when deliberately added.

Weekly review includes:

- Completed tasks.
- Focus time and session count.
- Planned versus completed work.
- Projects receiving attention.
- A user-written reflection and next-week priorities.

It must avoid unsupported claims such as "you are most productive because your
health score increased."

### 5. Calendar, Read-Only

Support one integration path only. It must:

- Request the minimum scopes.
- Preserve provider/event identifiers.
- Handle all-day and recurring events.
- Display timezone and sync status correctly.
- Continue to show local tasks when offline.
- Offer disconnect and delete-imported-data actions.

If the provider integration cannot meet these requirements in the release
window, ship `.ics` import rather than a partial two-way calendar editor.

### Explicitly Deferred

- Health records and wearable integrations.
- Email and messaging.
- Finance.
- Browser and app usage surveillance.
- General document or knowledge-base replacement.
- Social or shared workspaces.
- AI-generated medical, mental-health, or performance conclusions.
- Mobile apps and cross-device live sync.
- Two-way calendar editing.
- Plugin marketplace.

## Recommended Information Architecture

```text
Primary navigation
  Today
  Tasks
  Focus
  Timeline

Secondary
  Weekly Review
  Projects
  Search
  Settings
  Integrations
  Archive
```

### Global Interaction Rules

- `Cmd/Ctrl+K`: search and commands.
- `Cmd/Ctrl+N`: quick task capture.
- One persistent focus status control when a session is active.
- Native notification actions for complete, snooze, and start focus.
- No module gets a permanent dashboard card merely because it exists.
- Empty states provide one action, not a feature tour.

### Visual Direction

"Simple and beautiful" needs measurable constraints:

- One neutral surface system with one accent color and semantic status colors.
- One type scale with clear hierarchy; no oversized marketing typography.
- Consistent 4/8-point spacing tokens.
- Compact rows for repeated tasks and timeline items.
- Cards only when grouping or interaction requires a boundary.
- Dark and light themes with WCAG AA contrast.
- Motion limited to state transitions and feedback, with reduced-motion support.
- Icons always have accessible labels or adjacent text.
- Narrow layouts preserve primary actions rather than compressing every panel.

## Target Domain Model

This is a planning model, not a final schema.

### Core Entities

- `Task`: title, notes, status, priority, project ID, due date, scheduled start,
  estimated minutes, completed timestamp, timestamps.
- `Project`: name, color, status, archived timestamp, timestamps.
- `Reminder`: task ID, scheduled timestamp, delivery state, snooze state,
  timestamps.
- `FocusSession`: legacy-compatible timing fields, optional task/project link,
  rating/energy metadata, timestamps.
- `CalendarAccount`: provider, account label, scopes, sync cursor, last status;
  no secret in the domain database.
- `CalendarEventMirror`: provider ID, calendar ID, recurrence metadata,
  start/end, timezone, all-day state, cancellation state, sync timestamps.
- `ActivityEvent`: immutable event type, source entity ID, occurred timestamp,
  compact metadata, provenance.
- `WeeklyReview`: week key, reflection, priorities, generated snapshot metadata.
- `Preference`: namespaced setting and value.
- `MigrationRecord`: schema version, migration name, applied timestamp, result.

### Important Invariants

- Every editable entity has a stable ID and timestamps.
- External records retain provider provenance.
- Timeline events never become an alternate editable copy of source entities.
- Deletion is recoverable for a defined retention period.
- Reminder delivery is idempotent.
- Focus duration cannot become negative after restart or clock change.
- Date-only values and timestamp values are not stored interchangeably.
- User-facing day boundaries use the user's configured timezone.

## Migration Plan

### Phase 0: Freeze and Inventory

- Document version-1 state and every persistence location.
- Capture representative backups: empty, long history, active timer, corrupt
  record, synced state, and legacy timestamps.
- Remove the 600-session and 80-goal truncation from migration paths.
- Decide whether old goals become tasks, projects, or archived legacy goals.

Recommended mapping:

- Incomplete goal -> inbox task with `legacy_goal` provenance.
- Completed goal -> completed task preserving completion time when available.
- Session -> focus session with existing ID and all timing metadata.
- Manual daily minutes -> explicit adjustment records, not synthetic sessions.
- Existing settings -> mapped preference keys.
- Running timer -> recoverable active focus session draft.

### Phase 1: Add the New Store Beside the Old Store

- Create schema and repositories.
- Keep reads on the old store initially.
- Run migration into a temporary/new database.
- Validate counts, IDs, total active milliseconds, and timer state.
- Write a migration receipt and preserve the source.

### Phase 2: Read From the New Store

- Enable the new store behind a feature flag.
- Run old and new summary calculations against fixtures and compare results.
- Disable incompatible legacy sync while the new client is active.
- Make rollback select the untouched old store.

### Phase 3: Commit

- Mark migration complete only after successful startup and persistence checks.
- Keep the old backup for at least one release cycle.
- Provide explicit export in a documented, versioned format.

### Migration Failure Rules

- Never continue with a partially migrated database.
- Never delete a corrupt source automatically.
- Never report success when aggregate duration or entity counts differ.
- Never upload migrated data until local validation succeeds.
- Log migration errors without recording private task or note content.

## Architecture Plan

### Stage A: Contracts Before Screens

- Define shared schemas for IPC requests and responses.
- Validate all renderer input in the main process.
- Introduce repository interfaces for tasks, sessions, reminders, events, and
  activity.
- Add a clock abstraction for deterministic timer/reminder/timezone tests.
- Add a migration runner and backup service.

### Stage B: Shell and Design System

- Build the four-destination shell.
- Establish tokens, typography, focus states, dialogs, menus, list rows, and
  empty states.
- Keep the existing timer available throughout the shell transition.
- Validate light, dark, desktop minimum width, and narrow width before adding
  secondary screens.

### Stage C: Vertical Slices

Implement complete workflows in this order:

1. Create task -> schedule today -> start focus -> finish -> timeline entry.
2. Add reminder -> close app -> reopen -> receive once -> complete task.
3. Import calendar -> show agenda -> link event to new task -> focus.
4. Complete a week -> open review -> edit reflection -> save.

Do not build all database tables, then all pages, then all interactions. Each
slice must include persistence, permissions, failure states, tests, and UI.

### Stage D: Integration Boundary

- Provider adapters expose normalized read-only events.
- OAuth/token handling stays in the main process.
- Tokens stay in OS secure storage.
- Sync uses cursors and idempotent upserts.
- Provider failures are isolated from local data operations.

### Stage E: Release Hardening

- Package and smoke test on every supported OS.
- Validate notification permission and delivery.
- Run migration against all fixtures.
- Verify backup, restore, disconnect, and delete flows.
- Measure startup, query, rendering, and database size.

## Test Gaps and Required Coverage

### Current Gaps

The current model tests are useful but insufficient for the redesign. There is
no meaningful automated coverage for:

- Timer state transitions and restart recovery.
- State normalization and migration.
- Atomic persistence and corruption recovery.
- Folder/MySQL merge conflicts.
- IPC validation and authorization boundaries.
- Credential fallback behavior.
- UI workflows or accessibility.
- Time zones, DST, all-day events, or recurrence.
- Reminder scheduling and duplicate prevention.
- Packaged application behavior.

### Required Unit Tests

- Task and reminder validation.
- Timer state machine using a fake clock.
- Date-only versus timestamp conversion.
- Activity-event derivation and idempotency.
- Calendar normalization, recurrence exceptions, and cancellation.
- Migration field mapping and invariant checks.
- Conflict rules and tombstone handling if sync is retained.
- Focus model compatibility with migrated sessions.

### Required Integration Tests

- Repository CRUD and transactions against a temporary database.
- Main/preload IPC validation, including malformed and oversized payloads.
- Backup/export and restore/import round trips.
- OS credential-store unavailable behavior.
- Native notification scheduling and cancellation adapters.
- Provider token refresh, revoked permission, pagination, and partial failure.

### Required End-to-End Tests

1. First launch -> create task -> focus -> complete -> timeline.
2. Upgrade from version 1 with an active timer and history.
3. Schedule reminder -> restart -> notification delivered exactly once.
4. Calendar offline -> local app remains fully usable.
5. Disconnect calendar -> choose whether mirrored events are deleted.
6. Delete task -> undo -> associated session remains valid.
7. Export -> reset local data -> restore -> aggregates match.
8. Keyboard-only navigation through all first-release workflows.

### Time and Calendar Test Matrix

- User changes timezone.
- DST spring-forward and fall-back.
- Event crosses midnight.
- All-day event.
- Recurring event with moved occurrence.
- Canceled recurring occurrence.
- Reminder scheduled while device sleeps.
- Clock moves backward.
- Week begins Monday versus Sunday.
- Locale uses 12-hour versus 24-hour time.

### Non-Functional Gates

- No task loss after forced process termination during a write.
- No renderer access to raw secrets or unrestricted filesystem APIs.
- No silent migration truncation.
- Today becomes interactive within an agreed budget on representative hardware.
- A multi-year dataset scrolls and searches without loading every row.
- WCAG AA contrast and visible keyboard focus in both themes.
- Reduced-motion mode is respected.
- Packaged builds pass smoke tests, not only `npm start`.

## Delivery Sequence and Gates

### Gate 1: Product Contract

Deliver:

- Final first-release scope and explicit deferrals.
- Information architecture prototype.
- Data ownership table.
- Permission and privacy inventory.

Approve only if five target users can explain the Today screen and complete the
core loop without being shown every module.

### Gate 2: Data Safety

Deliver:

- Versioned local schema.
- Migration runner and fixtures.
- Backup/restore.
- Repository and IPC tests.

Approve only if all legacy invariants survive migration and rollback works.

### Gate 3: Core Loop

Deliver:

- Today, Tasks, Focus, Timeline.
- Local reminders.
- Existing focus analytics compatibility.

Approve only if the full task-to-focus-to-timeline workflow works offline and
through restart.

### Gate 4: Calendar

Deliver:

- One read-only integration path.
- Permissions, provenance, offline behavior, disconnect, and deletion.

Approve only if calendar failure never blocks local startup or task operations.

### Gate 5: Lovability and Release

Deliver:

- Weekly review.
- Keyboard workflow.
- Light/dark/narrow visual validation.
- Accessibility pass.
- Packaged builds and migration release candidate.

Approve only if the app feels calmer than the current tracker despite having
more capability.

## Success Metrics

Use product behavior, not feature count:

- Median time from launch to understanding the next action: under 5 seconds.
- Median time from launch to starting focus: under 10 seconds.
- Task capture completed without leaving the current context.
- At least 95% of completed focus sessions linked or meaningfully titled without
  forced metadata entry.
- Reminder delivery succeeds exactly once in restart/sleep test scenarios.
- Migration preserves 100% of accepted legacy records and duration totals.
- Calendar sync errors do not affect local workflow completion.
- Users can complete the core loop keyboard-only.
- The default Today screen has no abandoned or placeholder modules.

## Final Recommendation

Do not begin by building calendar, health, timeline, reminders, tasks, and
analytics as parallel pages. First establish the data safety and ownership
model, then ship one complete personal execution loop around the proven focus
timer.

The minimum lovable release is **Today + Tasks/Reminders + Focus + derived
Timeline + one read-only calendar path + Weekly Review**. Health and the broader
"everything" ambition should remain roadmap hypotheses until this release is
stable, trusted, and genuinely simpler to use than the current app.
