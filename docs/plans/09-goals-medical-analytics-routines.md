# Goals, Medical Organizer, Weekly Analytics, and Daily Routines

## Objective

Add four personal operating system capabilities without creating new top-level navigation or weakening the app's local-first privacy model:

1. A real goals system inside Progress.
2. A private medical organizer inside Health.
3. Week-over-week personal analytics and an AI-assisted review inside Insights.
4. Configurable morning and evening routines on Today.

The implementation must remain simple, calm, responsive, keyboard-accessible, and compatible with existing state.

## Product Placement

- **Progress / Goals:** replaces the lightweight Improvements presentation while preserving migrated data.
- **Health / Medical:** fifth Health tab, visually separated from daily wellbeing.
- **Insights / Weekly review:** adds Overview and Weekly review tabs; no new sidebar item.
- **Today / Morning and Evening:** adds an automatic or manually selected daily mode and one compact routine card.
- **Settings / Personal areas:** adds routine timing, weekly review preferences, and medical privacy controls.

## Data Model

Schema version becomes 4.

### Goals

`personalGoals`

- `id`, `title`, `description`, `area`
- `status`: `planned`, `active`, `paused`, `completed`
- `priority`: `low`, `medium`, `high`
- `startDate`, `targetDate`
- `progressMode`: `manual`, `milestones`
- `current`, `target`, `unit`
- `linkedType`, `linkedId`
- `createdAt`, `updatedAt`, `completedAt`, `deletedAt`

`goalMilestones`

- `id`, `goalId`, `title`
- `status`: `pending`, `completed`
- `targetDate`, `order`, `weight`
- `createdAt`, `updatedAt`, `completedAt`, `deletedAt`

Progress is deterministic:

- Manual: `current / target`.
- Milestones: completed milestone weight / total active milestone weight.

Links are references only in v1. Labels are resolved at render time and never persisted on the goal. The source domain remains canonical and missing or excluded links are shown as unavailable. Automatic source-to-goal mutation is explicitly deferred.

### Medical

`medicalAppointments`

- `id`, `title`, `provider`, `location`
- `start`, `end`, `status`
- `reason`, `notes`, `followUpDate`
- `createdAt`, `updatedAt`, `deletedAt`

`medicalRecords`

- `id`, `date`, `kind`
- `title`, `provider`, `summary`
- `referenceLabel`
- `createdAt`, `updatedAt`, `deletedAt`

`emergencyProfiles`

- `id`, `bloodType`, `allergies`, `conditions`, `medications`
- `emergencyContactName`, `emergencyContactPhone`
- `notes`, `createdAt`, `updatedAt`, `deletedAt`

The emergency profile uses the deterministic ID `emergency-profile`, preventing merge duplicates. File contents and filesystem paths are not imported in this release. Document references are optional opaque user-entered labels.

### Daily Routines

`dailyRoutineItems`

- `id`, `period`: `morning`, `evening`
- `title`, `order`, `active`
- `actionPage`, `actionView`
- `createdAt`, `updatedAt`, `deletedAt`

`dailyRoutineLogs`

- `id`, `routineItemId`, `date`
- `status`: `completed`, `skipped`
- `completedAt`, `createdAt`, `updatedAt`, `deletedAt`

`settings.dailyDashboard`

- `mode`: `auto`, `morning`, `day`, `evening`
- `morningStart`, `dayStart`, `eveningStart`
- `showRoutineCard`

Default routine items are created by an explicit first-run bootstrap, not by normalization. Routine log IDs are deterministic from `(routineItemId, local date key)`. Times are validated as ordered, non-overlapping local-time boundaries.

### Weekly Review

No AI-authored record is persisted in v1. A deterministic weekly snapshot is rebuilt from canonical data and can be passed to a dedicated read-only weekly-review request.

`settings.weeklyReview`

- `weekStartsOn`
- `reviewDay`
- `includedDomains`

The snapshot contains:

- Monday/Sunday date range in local time.
- Current and previous week totals.
- Task completion, focus time, habit consistency, and milestone completions.
- Optional counts/totals for nutrition, exercise, finance, and learning.
- Sample size and deterministic data coverage for every metric.
- Explicit limitations and non-causal wording.

The weekly-review request receives only calculated summaries, not normal assistant history/context, raw medical records, journal text, transaction labels, meal notes, or health notes. Its response contract cannot contain actions. It may narrate patterns and ask reflection questions; it must not diagnose, perform arithmetic, or mutate state.

## Migration

- Existing `improvements` become `personalGoals` with stable IDs: `progress -> current`, `metric -> unit`, and legacy complete statuses map to `completed`.
- Existing legacy `source.goals` migrate to tasks when `schemaVersion` is missing or lower than 4.
- Existing `improvements` remain accepted as a compatibility input but are not written in normalized v4 state.
- When both collections exist, `personalGoals` wins by ID and only non-conflicting improvements are migrated.
- New collections use tombstones and participate in merge freshness.
- Existing recognized settings and record extension fields remain preserved.

## Privacy and Storage

Medical is a separate privacy domain, not part of `wellbeing`.

Defaults:

- Desktop local state: included only after a protected-storage capability handshake succeeds.
- Browser fallback: excluded.
- Folder/MySQL sync: excluded.
- Manual export: excluded.
- Search: excluded.
- Timeline: excluded.
- Local/cloud AI: excluded with no UI opt-in in this release.

Desktop persistence uses dedicated versioned `encodeLocalState` and `decodeLocalState` codecs. They store medical collections in a strict `medicalVault` encrypted payload and remove plaintext medical collections from the local JSON envelope. The vault API never falls back to base64. It handles plaintext-v3 migration, atomic save interruption, synchronous shutdown saves, decryption failure, and corruption. Medical controls are disabled until capability is confirmed; medical mutations persist before the editor closes and roll back on failure. This protects data at rest, but it is not an application lock and does not hide data from someone using an unlocked OS account.

Explicit sync/export medical opt-ins are not included in this release. This avoids presenting plaintext remote copies as secure.

Timeline entries gain `entityType` and `privacyDomain`. Privacy projections scrub explicit timeline entries for excluded domains. New medical reducers never append medical details to Timeline.

## UI

### Goals

- Summary: active goals, completed goals, milestones due.
- Goal cards: status, area, due date, progress bar, next milestone.
- Goal detail is disclosed inline to keep the page calm.
- Add/edit goal and add/edit milestone use the shared editor.
- Completing a milestone updates only that milestone; goal progress is derived.

### Medical

- Intro notice: organizer only, not medical advice or emergency services.
- Upcoming appointment card.
- Records list grouped by date.
- Emergency profile in a collapsed details section with a visible last-updated time.
- No dashboard summary, recent-search preview, timeline event, or assistant action.
- Safety copy states that records may be incomplete or outdated and must not be relied on during an emergency.

### Weekly Review

- Overview preserves existing Insights.
- Weekly review shows a compact scorecard, current-versus-previous deltas, data coverage, and evidence counts.
- “Generate AI review” uses the dedicated read-only request and renders its narrative in Insights.
- A reflection button continues to save through the existing journal editor.

### Morning and Evening

- Today shows Morning, Day, and Evening segmented controls.
- Auto mode uses configured local time boundaries.
- Morning card: checklist, next event, top priorities, start focus.
- Evening card: checklist, unfinished priorities, tomorrow preview, reflection.
- Empty routines show a single setup action.
- Settings manages mode times and routine items.

## Implementation Phases

1. Schema v4 normalizers, migration, reducers, merge registration, and privacy projection.
2. Strict encrypted medical vault with capability, migration, corruption, and rollback handling.
3. Shared goal selectors and goal/milestone editors.
4. Progress Goals replacement and Today goal summary.
5. Medical view, editors, Health tab, and Settings storage explanation, enabled only after vault tests pass.
6. Weekly analytics selector, Insights tabs, and dedicated read-only AI request.
7. Daily routine selectors, Today mode/card, Settings forms, and actions.
8. Search and timeline integration for goals/routines only; medical remains excluded.
9. Responsive CSS, keyboard behavior, documentation, screenshots, and tests.

## Test Contract

- Schema v3-to-v4 migration and idempotence.
- Stable improvement-to-goal IDs and legacy goal-to-task gate.
- Tombstone merge behavior for every new collection.
- Goal progress for zero, empty, weighted, manual, and milestone cases.
- Medical exclusion from browser, sync, export, search, timeline, and AI.
- Medical encrypted persistence round trip, no-plaintext assertion, unavailable-backend rejection, corruption handling, rollback, and fail-closed behavior.
- Week boundaries, previous-week comparison, tombstone filtering, excluded finance entries, mixed currencies, data-coverage thresholds, and empty data.
- Routine auto mode at boundaries and per-date completion.
- Accessible roving tabs, labelled panels, textual progress/deltas, focus restoration, editor submission, keyboard navigation, reduced motion, 200% zoom, narrow layout, and empty states.
- Full `npm run check` and `npm test`.

## Non-Goals

- Diagnosis, triage, medication advice, dosage changes, or medical AI.
- Importing or previewing document files.
- Cloud medical sync.
- Automatic goal progress from heterogeneous source domains.
- Background routine notifications and snoozing.
- Claims of causation in analytics.
