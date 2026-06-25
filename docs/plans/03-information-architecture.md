# Information Architecture and Interaction Model

## Purpose

Focus should feel like one calm personal operating system, not ten small apps
placed beside each other. The desktop experience should answer three questions
quickly:

1. What needs my attention now?
2. What should I do next?
3. How am I doing over time?

The architecture therefore prioritizes daily action first, planning second, and
reflection third. Features share objects and interaction patterns so the user
does not have to relearn the app in each section.

## Product Principles

### One home, not a dashboard of dashboards

Today is the default landing page and the only cross-domain summary. Other
destinations are focused workspaces. Calendar should not contain health charts,
and Health should not repeat the task manager.

### Show actions before analytics

Current commitments, the active focus block, and the next useful action appear
before historical charts. Progress information is available but never competes
with what the user needs to do now.

### Capture once, organize later

A universal add flow accepts natural, incomplete input. The user can type
"Dentist Thursday at 2", "Submit report tomorrow", or "Mood 4/5" and refine the
result only when necessary.

### Prefer views over duplicate data

A task scheduled for today can appear in Today, Tasks, Calendar, Search, and
Timeline, but it remains one object. Editing it in any view updates it
everywhere.

### Progressive disclosure by default

Common controls remain visible. Filters, recurrence rules, metadata, analytics,
integrations, and destructive actions appear in inspectors, menus, or Settings.

### Quiet visual hierarchy

Use typography, spacing, alignment, and one accent color before adding borders
or containers. Avoid card grids where a list, timeline, or split view is
clearer. Empty space is part of the interface.

## Core Object Model

The navigation is organized around user intent, while shared objects connect
the destinations:

| Object | Primary home | Also appears in |
| --- | --- | --- |
| Event | Calendar | Today, Timeline, Search |
| Task | Tasks | Today, Calendar when scheduled, Work, Timeline, Search |
| Reminder | Attached to a task, event, or standalone note | Today, Calendar, Search |
| Focus session | Focus | Today, Progress, Timeline, Work |
| Health entry | Health | Today when actionable, Progress, Timeline |
| Goal | Progress | Today, Focus, Health, Work |
| Project | Work | Tasks, Focus, Progress, Timeline, Search |
| Work artifact | Work | Today when recent, Timeline, Search |
| Timeline entry | Timeline | Search and the originating destination |

A timeline entry is normally derived from another object. It should not create
a second editable copy. Manual timeline notes are the exception.

Tags, people, projects, and dates are shared metadata. They can filter multiple
destinations without becoming top-level navigation.

## Desktop App Shell

The shell has four stable regions.

### 1. Title bar

The compact title bar contains:

- Window controls.
- Back and forward navigation.
- The current destination title.
- A global `+` add button.
- A Search button with the `Cmd/Ctrl+K` hint.
- Optional sync or account status as a quiet icon, only when action is needed.

Do not place page-specific filters in the title bar. They belong in the content
header so the shell stays stable.

### 2. Primary sidebar

The sidebar is always available on standard desktop widths. It uses icons and
labels, supports a compact icon-only mode, and has three visual groups.

**Primary navigation**

1. Today
2. Calendar
3. Tasks
4. Focus
5. Health
6. Progress

These are persistent because they represent frequent daily or weekly actions.
Today is selected on launch unless the user explicitly enables "restore last
view" in Settings.

**Secondary navigation**

1. Timeline
2. Work

These remain visible below a subtle divider but have lower visual emphasis.
They support retrieval and reflection rather than immediate daily action. If
the sidebar is very short, they may sit inside an expanded "More" group, but
they must remain one click away.

**Utilities**

- Search sits near the top as an action, not as a highlighted destination.
- Settings is pinned to the bottom.
- Profile, data status, backup, and integrations are reached through Settings,
  not separate sidebar items.

Navigation labels do not carry counters by default. Show a badge only for an
exception that needs attention, such as an overdue task count or failed sync.
Never show achievement badges, streak flames, or multiple colored dots in the
sidebar.

### 3. Content canvas

Each destination uses one of three reusable layouts:

- **Stream:** a single readable column for Today and Timeline.
- **Split view:** list or calendar on the left, contextual inspector on the
  right for Calendar, Tasks, Health, and Work.
- **Focused canvas:** one dominant activity with supporting information for
  Focus and Progress.

Content width should remain comfortable on large monitors. Lists should not
stretch edge to edge merely because space is available.

### 4. Contextual inspector

Selecting an item opens a right-side inspector without leaving the current
view. The inspector supports view and edit states for the selected object.

- It opens over the content at narrower widths and beside it at wider widths.
- `Esc` closes it.
- `Cmd/Ctrl+Enter` saves changes.
- Unsaved changes are preserved while switching inspector tabs.
- Full-page detail is reserved for genuinely complex project or progress
  views; ordinary tasks and events stay in the inspector.

## Navigation Behavior

### Primary navigation

Primary destinations change the central workspace. A destination preserves its
local state during the current session, including scroll position, selected
date, active filter, and selected object.

### Secondary navigation

Timeline and Work behave exactly like primary destinations once opened. Their
lower placement communicates frequency, not reduced capability.

### Back and forward

Back and forward traverse meaningful view changes:

- Destination changes.
- Calendar date changes.
- Search result openings.
- Project detail openings.
- Progress period changes.

They do not record every inspector open, filter toggle, or inline edit.

### Deep links

Every object can be opened from Search, Today, or Timeline in its owning
destination with the correct item selected. The user should always understand
where the object lives.

## Today

### Role

Today is the daily command center. It combines only information that can change
the user's next action. It is not a miniature version of every destination.

### Default structure

The page uses a wide main column and a narrow supporting column.

**Top row**

- Full date and a short contextual greeting.
- Previous day, Today, and next day controls.
- A compact daily progress sentence, such as "3 of 5 priorities complete."
- One primary action: `Start focus` when idle, or the active timer when running.

**Main column**

1. **Now**
   - Active focus session, current calendar event, or the single most relevant
     suggested action.
   - Only one item receives dominant visual treatment.
   - The user can start, pause, finish, join, complete, or defer it in place.

2. **Schedule**
   - A chronological day timeline containing events, scheduled tasks, focus
     blocks, and time-specific reminders.
   - The present-time marker is visible.
   - Completed items collapse visually but remain available.
   - Unscheduled tasks are not mixed into the timeline.

3. **Priorities**
   - Up to three user-pinned priorities.
   - A compact "Other tasks" disclosure shows the remaining due or planned
     tasks.
   - Checking a task off is immediate and supports Undo.

4. **Recent work**
   - At most three recent or resumed project items.
   - Each row shows project, last activity, and one clear resume action.
   - The entire section hides when there is no work history.

**Supporting column**

1. **Quick capture**
   - A single text field with examples in placeholder rotation.
   - `Enter` creates the inferred object.
   - A small type selector appears only when inference is ambiguous.

2. **Reminders**
   - Due and upcoming reminders, ordered by urgency.
   - Dismiss, snooze, or open the related object.
   - The section disappears when empty.

3. **Wellbeing**
   - A lightweight check-in for energy, mood, and optionally sleep.
   - It asks at most one unanswered question at a time.
   - Historical health detail remains in Health.

4. **Day close**
   - Appears near the user's configured end-of-day time.
   - Offers a three-step review: clear overdue items, note a win, and choose
     tomorrow's first priority.
   - It stays collapsed until relevant.

### Today prioritization rules

The suggested Now item is chosen in this order:

1. An active focus session.
2. An in-progress calendar event.
3. An event starting within 15 minutes.
4. A user-pinned priority with a due time.
5. A scheduled focus block.
6. The first incomplete priority.
7. A gentle prompt to plan the day.

The user can dismiss a suggestion for the day. Recommendations must explain
their source in plain language, such as "Due at 3:00 PM," not "AI suggested."

## Calendar

### Role

Calendar owns time-bound commitments and visual time planning.

### Default view

- Open to the current week.
- A segmented control switches Day, Week, and Month.
- A mini date navigator and calendar visibility controls remain in the content
  header.
- Week view is the primary desktop planning surface.

### Content

- Events use filled blocks.
- Scheduled tasks use lighter blocks with checkboxes.
- Focus blocks use the accent color with a distinct focus icon.
- Health logs and completed work do not appear by default.
- All-day items form one compact row and expand only when necessary.

### Interaction

- Click an item to open its inspector.
- Double-click an empty time to create an event.
- Drag empty time to create an event or focus block with a duration.
- Drag an unscheduled task from a small task tray onto the calendar to schedule
  it without changing its type.
- Drag an item to reschedule; show Undo after the drop.
- Resize event and focus blocks from their lower edge.
- Press `T` to return to today.

Month view is for orientation and date selection. It should not attempt to show
full task or event detail in every cell.

## Tasks

### Role

Tasks owns commitments that can be completed. Reminders are a property of a
task unless they have no completion state.

### Default view

The task workspace opens to **My Tasks** with a compact left filter strip:

- Inbox
- Today
- Upcoming
- Anytime
- Waiting
- Completed

Projects and tags are filters below these saved views, not competing navigation
destinations.

### Content

Rows show:

- Completion checkbox.
- Task title.
- Due or scheduled date only when present.
- Project color or name.
- A recurrence or reminder icon only when configured.

Priority, notes, tags, subtasks, and history live in the inspector. Avoid
showing every metadata field in the row.

### Interaction

- `Enter` on a selected row edits the title.
- `Space` completes or reopens the task.
- Dragging reorders tasks within a manual list.
- Multi-select enables complete, move, schedule, and delete.
- A small inline row at the end of each list supports rapid task entry.
- Completed tasks remain visible in a collapsed group for the current day.

Subtasks are limited to one level. Deeper planning belongs in a project note or
separate tasks, not nested trees.

## Focus

### Role

Focus is a distraction-free workspace for starting and completing deliberate
work blocks. It evolves the app's existing timer rather than hiding it inside a
general dashboard.

### Default view

The timer is the dominant element. Before starting, show:

- Task or intention.
- Project, optional.
- Suggested duration.
- Start button.

During a session, reduce the interface to:

- Remaining or elapsed time.
- Current task.
- Pause and Finish controls.
- A quiet progress ring or bar.

Navigation remains available but visually subdued. The active timer persists
across destinations and appears as a compact status control in Today and the
title bar.

### Supporting information

Below or beside the idle timer:

- Recommended next block with a brief explanation.
- Today's focused time and target.
- Recent sessions.
- A collapsed "Session options" area for tags, energy, sounds, and advanced
  timer behavior.

After finishing, use a lightweight completion sheet:

1. Confirm what was completed.
2. Rate focus with one simple scale.
3. Optionally add a note.
4. Start a recommended break or close.

Do not force a rating or reflection before saving the session.

## Health

### Role

Health collects lightweight personal wellbeing data and shows useful patterns
without pretending to provide medical diagnosis.

### Default view

Open to **Check-in**, followed by a seven-day summary. The top of the page asks
only for information not yet logged today:

- Energy.
- Mood.
- Sleep duration or quality.
- Movement.
- Optional freeform note.

Each metric can be disabled in Settings. Health should remain useful with only
one enabled metric.

### Views

- **Check-in:** today's entry and recent entries.
- **Trends:** simple time-series charts and correlations.
- **Routines:** optional recurring wellbeing actions.

Trends use descriptive language such as "Higher focus scores often followed
longer sleep in the last 30 days." Always show sample size and avoid causal or
medical claims.

Sensitive notes are hidden in summaries and require opening the entry.

## Progress

### Role

Progress converts activity into reflection and improvement. It owns goals,
reviews, trends, and focus-pattern insights.

### Default view

Open to the current week with:

1. A plain-language weekly summary.
2. Goal progress.
3. Focus and completion trends.
4. One suggested improvement.
5. Previous review notes.

Avoid a wall of charts. Show at most three charts at once, each answering a
specific question.

### Views

- **Overview:** weekly outcomes and goal status.
- **Goals:** active, paused, and completed goals.
- **Patterns:** focus windows, workload, health relationships, and consistency.
- **Reviews:** daily, weekly, monthly, and custom reflections.

The period switcher supports Week, Month, Quarter, and Year. Comparison to the
previous period is optional and off by default.

Suggested improvements must be small and actionable, for example "Try moving
one demanding block to 10:00 AM." The user can accept it as an experiment,
dismiss it, or ask why it was suggested. Accepted experiments become temporary
goals and are reviewed later.

## Timeline

### Role

Timeline is the chronological memory of the user's days. It answers "What
happened?" rather than "What should I do?"

### Default view

- Open to Today.
- Group entries by day, then by time.
- Merge related activity into concise clusters, such as one focus session with
  its completed task and work artifact.
- Use a single vertical stream, not a calendar grid.

### Included entries

- Completed and rescheduled tasks.
- Calendar events.
- Focus sessions.
- Health check-ins.
- Goal milestones.
- Work activity.
- Manual notes.

Filters for entry type, project, tag, and date live behind one Filter button.
The default shows all meaningful activity but suppresses low-value system noise
such as every autosave or metadata edit.

Entries are primarily read-only summaries. Opening an entry routes to the
owning object. A manual note can be edited in place.

## Work

### Role

Work organizes projects, outcomes, recent artifacts, and active context. It is
broader than a task list and should help the user resume meaningful work.

### Default view

Open to **Recent**, showing:

- Active projects.
- Recently touched files, links, or notes.
- Current project milestones.
- Tasks grouped by project only when useful.

### Views

- **Recent:** resume the last useful context.
- **Projects:** active, paused, and archived projects.
- **Artifacts:** linked files, URLs, notes, and outputs.

A project detail page contains:

- Outcome and status.
- Next milestone.
- Open tasks.
- Recent focus sessions.
- Artifacts.
- A compact activity timeline.

Project creation asks only for a name. Outcome, deadline, color, tags, and
review cadence are optional inspector fields.

Work does not become a file manager. Artifacts are references that open in the
appropriate external app. The app stores useful metadata and recent access,
not duplicate file contents unless explicitly designed later.

## Search

### Role

Search is a global retrieval and command surface. It is opened as an overlay so
the user's current context remains visible.

### Default state

With no query, show:

- Recent objects.
- Recent searches.
- Quick commands.
- Suggested filters such as "Tasks due this week" or "Work from March."

### Results

Results are grouped by object type but ranked globally. Each result shows:

- Title.
- Object type.
- Relevant date or project.
- A short matching excerpt where useful.

The first result is selected automatically. Arrow keys move selection, `Enter`
opens, and `Cmd/Ctrl+Enter` opens while keeping Search available.

Search syntax supports approachable tokens revealed as suggestions:

- `type:task`
- `project:Focus`
- `before:2026-06-01`
- `after:2026-05-01`
- `status:open`

Users should not need to memorize syntax. Filter chips can create and edit the
same query visually.

Commands appear when the query starts with `>` or matches an action, such as
"Start focus," "Go to Health," or "Export backup."

## Settings

### Role

Settings holds configuration, privacy, integrations, and data management.
Nothing required for normal daily use should be buried here.

### Structure

Use a simple category list with a single settings pane:

1. General
2. Appearance
3. Focus
4. Calendar and reminders
5. Health
6. Notifications
7. Integrations
8. Data and privacy
9. Keyboard shortcuts
10. About

Settings rows use direct controls with short supporting text. Avoid nested
settings pages unless a provider integration has a substantial setup flow.

Destructive data actions sit at the bottom of Data and privacy, separated from
backup and export. Account deletion or full data reset requires explicit
confirmation; ordinary preference changes save immediately.

## Universal Add Flow

### Entry points

The same add flow opens from:

- The global `+` button.
- `Cmd/Ctrl+N`.
- Quick capture on Today.
- Destination-specific add buttons.
- Empty-state actions.

### Quick capture

Quick capture is a small centered composer, not a multi-step modal.

1. The user enters a title or natural-language phrase.
2. The app infers Task, Event, Reminder, Health entry, Focus block, Project, or
   Timeline note from context and language.
3. Parsed date, time, type, and project appear as editable chips.
4. `Enter` saves with sensible defaults.
5. `Tab` or `Cmd/Ctrl+Enter` expands details before saving.

The current destination biases the default type:

| Current destination | Default new object |
| --- | --- |
| Today | Task |
| Calendar | Event |
| Tasks | Task |
| Focus | Focus session or block |
| Health | Health entry |
| Progress | Goal |
| Timeline | Timeline note |
| Work | Project or artifact |

### Expanded details

The expanded composer reveals only fields relevant to the selected type. It
uses a consistent order:

1. Title or value.
2. Date and time.
3. Project or goal.
4. Reminder or recurrence.
5. Notes and tags.

Advanced recurrence, custom reminders, privacy options, and integration
settings sit behind "More options."

### Post-create behavior

- Keep the user in the current destination.
- Show the created object briefly with an Undo action.
- Open the inspector only when the user chose expanded details or the object
  requires resolution.
- Preserve the last chosen type for repeated entry during the current composer
  session, then return to the destination default.

## Empty States

Empty states should help the user perform the first meaningful action. They
must not fill the canvas with illustrations, lengthy explanations, or multiple
calls to action.

| Surface | Empty-state message | Primary action |
| --- | --- | --- |
| Today, no plan | "A clear day. Choose what matters first." | Add a priority |
| Today, all done | "Today's plan is complete." | Close the day |
| Calendar | "No plans here yet." | Add an event |
| Tasks Inbox | "Nothing waiting to be organized." | Add a task |
| Tasks Today | "No tasks planned for today." | Plan a task |
| Focus history | "Your completed focus sessions will appear here." | Start focus |
| Health | "Start with one quick check-in." | Log energy |
| Progress | "Progress becomes clearer after a few days of activity." | Set one goal |
| Timeline | "Your activity will build a timeline as you use Focus." | Add a note |
| Work | "Create a project to keep tasks and recent work together." | New project |
| Search results | "No results for this search." | Clear filters |

When a filtered view is empty, say that the filter caused the result and offer
`Clear filters`. Do not present onboarding copy again.

Sections on Today should normally disappear when irrelevant instead of showing
several simultaneous empty-state cards.

## Keyboard Model

Shortcuts use `Cmd` on macOS and `Ctrl` on Windows/Linux. Display the correct
platform label in the interface.

### Global

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+K` | Open Search and commands |
| `Cmd/Ctrl+N` | Open universal add |
| `Cmd/Ctrl+,` | Open Settings |
| `Cmd/Ctrl+1` | Today |
| `Cmd/Ctrl+2` | Calendar |
| `Cmd/Ctrl+3` | Tasks |
| `Cmd/Ctrl+4` | Focus |
| `Cmd/Ctrl+5` | Health |
| `Cmd/Ctrl+6` | Progress |
| `Cmd/Ctrl+7` | Timeline |
| `Cmd/Ctrl+8` | Work |
| `Cmd/Ctrl+[` | Back |
| `Cmd/Ctrl+]` | Forward |
| `Cmd/Ctrl+Shift+F` | Start or open Focus |
| `Esc` | Close topmost overlay or inspector |
| `?` | Show shortcut reference when not typing |

### Lists and inspectors

| Shortcut | Action |
| --- | --- |
| `J` / `K` or arrows | Move selection down/up |
| `Enter` | Open or edit selected item |
| `Space` | Toggle task completion |
| `E` | Edit selected item |
| `D` | Set or change date |
| `R` | Add or change reminder |
| `Cmd/Ctrl+Enter` | Save |
| `Delete/Backspace` | Move selected item to trash after confirmation rules |
| `Cmd/Ctrl+Z` | Undo the last reversible action |

Single-letter shortcuts are disabled while typing and can be turned off in
Settings. Tooltips reveal shortcuts after a brief hover. The shortcut reference
is searchable.

## Progressive Disclosure

The app has four disclosure levels.

### Level 1: Immediate

Always show what is required for the current job:

- The next action on Today.
- Time blocks in Calendar.
- Task title and due state in Tasks.
- Timer and controls in Focus.
- Today's unanswered check-in in Health.
- Weekly outcome in Progress.

### Level 2: Context

Selection opens supporting information without navigation:

- Task notes and project.
- Event details.
- Session rating.
- Health-entry detail.
- Timeline source.

This lives in the inspector or an inline expansion.

### Level 3: Organize and analyze

Filters, bulk actions, chart detail, comparisons, saved views, and advanced
project organization appear after an explicit Filter, Select, or Analyze
action. They do not occupy permanent space.

### Level 4: Configure

Defaults, integrations, notification rules, health metrics, data controls, and
appearance live in Settings.

### Disclosure rules

- Do not hide the primary action behind a menu.
- Do not show disabled advanced controls before they are relevant.
- Prefer a single `...` menu for rare item actions.
- Preserve the user's expanded state during a session, but start new users with
  the simplest state.
- Reveal complexity in place before navigating to a new page.
- Explain why unavailable actions are disabled.

## Common Interaction Rules

### Selection and editing

- Single click selects.
- Double click opens direct edit only in dense planning surfaces such as the
  calendar.
- Inline edit is used for titles and simple values.
- The inspector handles structured edits.
- Changes save automatically when low risk; explicit Save is used for composed
  notes, integration credentials, and multi-field create flows.

### Undo and confirmation

Use Undo for reversible actions:

- Completing a task.
- Moving or rescheduling an item.
- Archiving a project.
- Dismissing a reminder.
- Deleting an ordinary object into trash.

Use confirmation only for:

- Permanently deleting data.
- Discarding unsaved long-form text.
- Resetting history.
- Disconnecting an integration when data may be removed.
- Ending an active focus session early when meaningful time could be lost.

### Notifications

Notifications are tied to explicit reminders or configured routines. The app
must not create motivational notifications by default. Clicking a notification
opens the related object in context.

### Drag and drop

Drag and drop is an accelerator, never the only method. Every drag action also
has a keyboard or inspector equivalent. Show a clear insertion or time target
before committing the move.

### Loading, offline, and sync

- Local content renders immediately.
- Sync status stays quiet unless delayed, offline, or failed.
- Failed sync never blocks local capture.
- Conflicts are resolved at the object level and shown only when automatic
  merging would lose meaningful edits.

## Visual and Motion Guidance

- Use one neutral background, one elevated surface, and one accent color per
  theme.
- Reserve strong accent treatment for the current action, active timer, and
  selected navigation item.
- Use semantic colors sparingly for overdue, success, and warnings.
- Keep list rows compact and aligned to a consistent rhythm.
- Prefer 8-12 px corner radii; avoid turning every region into a rounded card.
- Use a single icon family with labels in navigation and ambiguous actions.
- Motion should explain continuity: inspector slide, item relocation, timer
  state, and Undo. Keep transitions around 120-200 ms.
- Respect reduced-motion settings and never animate health or productivity
  charts merely for decoration.
- Light and dark themes should preserve hierarchy rather than invert colors
  mechanically.

## Accessibility

- All actions are reachable by keyboard in a predictable order.
- Focus indicators remain visible against both themes.
- Text and essential controls meet WCAG AA contrast.
- Color never carries status alone.
- Calendar items expose title, time, type, and state to assistive technology.
- Charts provide a short text summary and accessible data table.
- Timer updates do not announce every second; announce meaningful state changes
  and user-selected intervals.
- Hit targets are at least 32 px on desktop, with 40 px preferred for primary
  controls.

## Desktop Window Adaptation

### Wide: 1280 px and above

- Full labeled sidebar.
- Main content and inspector can appear side by side.
- Today uses main and supporting columns.

### Standard: 900-1279 px

- Sidebar may use compact labels.
- Inspector overlays or reduces the content width.
- Today keeps two columns while space permits.

### Narrow: below 900 px

- Sidebar collapses to icons or a temporary drawer.
- Today becomes one ordered column: Now, Schedule, Priorities, Reminders,
  Wellbeing, Recent work.
- Inspectors become full-height overlays.
- No functionality depends on hover.

The desktop app does not need to imitate a mobile bottom tab bar.

## Recommended First-Run Experience

First run should create value in under one minute:

1. Ask what the user wants to focus on today.
2. Create the first task from that answer.
3. Offer to start a focus block for it.
4. After completion, show the first Timeline entry and Today progress.

Calendar connection, health tracking, goals, work projects, and notification
permissions are introduced contextually after the core loop works. Do not show
a multi-page feature tour.

## Simplicity Review

This architecture deliberately avoids:

- A separate Home and Today destination.
- Separate navigation for reminders, goals, habits, reports, notes, or inbox.
- A customizable widget dashboard in the first release.
- Deeply nested task trees.
- Multiple creation modals for each object type.
- Permanent chart controls on daily action screens.
- Gamification that competes with meaningful progress.
- A standalone AI chat destination.

The central loop remains:

1. Capture.
2. Decide when or what matters.
3. Focus.
4. Complete or record.
5. Reflect in Progress and Timeline.

Every proposed feature should strengthen that loop or remain outside the
primary interface.
