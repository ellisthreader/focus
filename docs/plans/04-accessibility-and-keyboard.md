# Accessibility and Keyboard Plan

## Purpose

This document defines the accessibility and keyboard contract for the redesigned
Focus Electron application. The product is becoming a personal operating system
covering Today, calendar, tasks, reminders, focus sessions, recent work, health,
improvements, reviews, and a life timeline. Every core workflow must remain
usable without a pointer and understandable without seeing the interface.

This is a product requirement, not a final polish pass.

## Standards Baseline

- Target WCAG 2.2 Level AA for all renderer content.
- Follow WAI-ARIA Authoring Practices only when native HTML cannot express the
  interaction.
- Prefer native HTML elements over custom ARIA widgets.
- Treat WCAG AAA focus appearance and animation guidance as design targets where
  they can be met without making the interface noisy.
- Preserve Electron's context isolation and narrow preload boundary; accessibility
  behavior belongs in the renderer unless it requires a native menu,
  notification, or window operation.
- Test the packaged Electron app, not only a browser preview.

## Non-Negotiable Outcomes

1. Every action is available with a keyboard.
2. Focus is always visible, predictable, and restored after temporary UI closes.
3. Screen reader users receive meaningful names, states, errors, and important
   status changes without constant announcements.
4. Color, motion, position, and charts are never the only way information is
   communicated.
5. Text remains readable at increased zoom and with custom text spacing.
6. Light, dark, high-contrast, and reduced-motion modes preserve all workflows.
7. Accessibility settings are local-first, persisted, and included in backup
   and restore.

## Semantic Application Shell

### Document and window

- Set a concise window title using the current view, for example
  `Today - Focus` or `Calendar - Focus`.
- Set `lang` on the root `html` element and update it if localization is added.
- Use one visible `h1` for the current view. The app brand is not the page
  heading on every view.
- Keep heading levels sequential. Cards and widgets do not receive headings
  solely for visual styling.
- Use DOM order as the reading and keyboard order. CSS must not visually reorder
  content into a sequence that differs from the DOM.

### Landmarks

The main window must expose these landmarks:

```html
<header aria-label="Application">
  <!-- Brand, current context, global actions, native-style window controls -->
</header>
<nav aria-label="Primary">
  <!-- Today, Calendar, Tasks, Focus, Health, Progress, Timeline, Work -->
</nav>
<main id="main-content" tabindex="-1">
  <!-- Active view -->
</main>
<aside aria-label="Upcoming and reminders">
  <!-- Optional contextual content; omit when empty -->
</aside>
```

- Use only one `main` landmark.
- Label repeated `nav`, `aside`, and `form` landmarks uniquely.
- Use a `section` only when it has an accessible heading or label.
- Do not put every dashboard card in a landmark.
- Add a "Skip to main content" link as the first renderer focus target. It may
  appear only on focus.
- If a persistent detail pane is introduced, label it by its visible heading and
  keep it after the main collection in DOM order.
- Use a real `footer` only for persistent application-level information. Do not
  create one for decoration.

### Primary navigation

- Primary destinations use links or buttons with clear text labels. Icons are
  decorative when adjacent text already supplies the accessible name.
- The current destination uses `aria-current="page"`.
- Collapsed navigation retains accessible names and exposes visible tooltips on
  both hover and keyboard focus.
- Tooltips are supplementary; they never contain instructions unavailable
  elsewhere.
- Navigation remains reachable in a logical sequence when the sidebar is
  collapsed or the window is narrow.

### Frameless Electron title bar

- Restrict `app-region: drag` to non-interactive title-bar space.
- Apply `app-region: no-drag` to every control, input, menu trigger, and link.
- Window controls are native buttons with labels such as "Minimize window",
  "Maximize window", "Restore window", and "Close window".
- Update the maximize/restore name and icon when window state changes.
- Preserve platform conventions and ordering. Do not imitate macOS controls on
  Windows or Linux.
- Window controls need at least a 24 by 24 CSS pixel target; aim for 44 by 44
  where the title-bar layout permits it.

## Focus Management

### Baseline rules

- Use normal DOM tab order. Positive `tabindex` values are prohibited.
- Non-interactive containers must not be tabbable.
- Use `tabindex="-1"` only for programmatic focus targets such as the active
  view heading, dialog title, or error summary.
- Never remove focus outlines without replacing them with a stronger indicator.
- Pointer activation must not move focus to the page body.
- Disabled controls should normally use the native `disabled` attribute. If the
  user needs to discover why an unavailable action is disabled, keep it
  focusable with `aria-disabled="true"` and explain the requirement nearby.
- Do not automatically focus an input on application launch. Start at the
  document so users can choose navigation, unless they explicitly enabled a
  "focus quick capture on launch" preference.

### Visible focus

- Every interactive element receives a persistent `:focus-visible` indicator.
- Use a solid two-color or high-contrast outline that remains visible on light,
  dark, selected, destructive, and chart backgrounds.
- The indicator should be at least 2 CSS pixels thick with a 2 CSS pixel offset.
- Focus indication must have at least 3:1 contrast against adjacent colors.
- Never rely only on a glow, color fill, underline removal, or subtle shadow.
- Sticky headers, footers, drawers, and toasts must not obscure the focused
  element. Scroll it fully into view when necessary.

### View changes

- When the user activates primary navigation, update the view without a full
  reload, update the document title, then move focus to the new `h1`.
- Do not move focus when background data refreshes.
- Browser-style Back and Forward restore both the previous view and the last
  meaningful focus target in that view when the target still exists.
- Deep links focus the view heading first, not an arbitrary control.
- Loading a view uses `aria-busy="true"` on the affected region and a polite
  status message. When loading ends, announce the result but do not steal focus.

### Dynamic collections

- Adding an item keeps focus on the add control and announces the result, unless
  the user opened an editor specifically to continue editing the new item.
- After deleting an item, focus moves to the next item action, the previous item
  action, or the collection heading when the collection becomes empty.
- After completing a task or reminder, keep focus in the same logical position.
- Filtering or sorting does not move focus. Announce the result count politely.
- Virtualized lists must preserve semantic position using `aria-posinset` and
  `aria-setsize`, or use non-virtualized rendering for manageable personal data.
- Drag and drop is never the only reorder method. Provide "Move up", "Move
  down", or "Move to..." actions with equivalent keyboard operation.

### Popovers and non-modal panels

- A menu trigger exposes `aria-haspopup`, `aria-expanded`, and `aria-controls`.
- Opening a menu moves focus to its first enabled item or the selected item.
- `Escape` closes the topmost popover and returns focus to its trigger.
- Clicking or focusing outside a non-modal popover may close it, but ordinary
  `Tab` navigation must remain predictable.
- A persistent side panel is not a dialog. It belongs in DOM order and has a
  labelled region or complementary landmark.
- A temporary drawer that blocks the rest of the app behaves as a modal dialog.

## Keyboard Model

### General behavior

- `Tab` and `Shift+Tab` move between components and controls.
- Arrow keys operate only inside composite widgets that follow an established
  pattern, such as tabs, menus, calendars, listboxes, radio groups, and grids.
- `Enter` activates links and the default action. `Space` activates buttons,
  checkboxes, and switches without scrolling the page.
- `Escape` dismisses the topmost temporary layer. Repeated presses close layers
  one at a time rather than unexpectedly leaving the current view.
- `F6` cycles through major application regions: primary navigation, main
  content, optional detail pane, and application header. `Shift+F6` reverses.
- Keyboard behavior must not vary based on whether a pointer was used earlier.
- Do not bind unmodified printable character shortcuts. This avoids speech-input
  conflicts and WCAG 2.1.4 failures.
- While focus is in a text-editing control, app shortcuts are suspended except
  `Escape`, native editing commands, and explicitly documented global commands
  that cannot alter the field.

### App-scoped shortcuts

Shortcuts operate only while Focus is active. Display platform-correct labels,
using `Command` on macOS and `Ctrl` elsewhere.

| Action | Accelerator | Notes |
| --- | --- | --- |
| Open command palette | `CmdOrCtrl+K` | Focuses a searchable command list |
| Quick capture | `CmdOrCtrl+N` | Opens one compact add-item dialog |
| Open settings | `CmdOrCtrl+,` | Mirrors the native application menu |
| Today | `CmdOrCtrl+1` | Primary destination |
| Calendar | `CmdOrCtrl+2` | Primary destination |
| Tasks | `CmdOrCtrl+3` | Primary destination |
| Focus | `CmdOrCtrl+4` | Primary destination |
| Health | `CmdOrCtrl+5` | Primary destination |
| Progress | `CmdOrCtrl+6` | Includes habits, reviews, and improvements |
| Timeline | `CmdOrCtrl+7` | Secondary destination |
| Work | `CmdOrCtrl+8` | Secondary destination |
| Start or pause focus timer | `CmdOrCtrl+Shift+Space` | State-dependent label |
| Finish active focus session | `CmdOrCtrl+Shift+Enter` | Confirms if ending early |
| Search current view | `CmdOrCtrl+F` | Uses an in-app search field |
| Show keyboard shortcuts | `CmdOrCtrl+/` | Opens the shortcut reference |
| Cycle major regions | `F6` / `Shift+F6` | Renderer regions, not controls |
| Close top layer | `Escape` | Menu, popover, dialog, then drawer |

- Mirror all major shortcuts in the Electron native application menu so they are
  discoverable and exposed through operating-system accessibility APIs.
- Validate accelerators by platform and avoid overriding reserved operating
  system or assistive-technology commands.
- Do not use Electron `globalShortcut` by default. An optional system-wide timer
  shortcut must be off by default, configurable, conflict-checked, and easy to
  disable.
- Give users a shortcut settings screen with restore-default controls.
- Reject duplicate assignments and explain the conflict in text.
- Any user-remappable shortcut must require a modifier unless it is a function
  or navigation key.

### Command palette

- Implement as a labelled dialog containing a combobox and listbox.
- Focus enters the search input on open.
- `Down Arrow` and `Up Arrow` move through results; `Home` and `End` move to the
  first and last result.
- `Enter` runs the active result.
- `Escape` clears the query first only when that behavior is visibly explained;
  otherwise it closes the palette immediately.
- Announce result count politely after a short debounce.
- Each result includes its action name, destination or consequence, and shortcut
  where applicable.

## Component Keyboard Contracts

### Tabs

- Use tabs only for switching related panels within one view, not for primary
  application navigation.
- Apply `tablist`, `tab`, and `tabpanel` semantics with complete
  `aria-controls` and `aria-labelledby` relationships.
- Only the active tab is in the tab order.
- `Left Arrow` and `Right Arrow` move between horizontal tabs; `Up Arrow` and
  `Down Arrow` move between vertical tabs.
- `Home` and `End` move to the first and last tab.
- Use automatic activation only when panels are already loaded and switch
  instantly. Otherwise use `Enter` or `Space` for manual activation.

### Menus

- Use menus for compact action sets, not for navigation that should remain
  visible.
- `Up Arrow` and `Down Arrow` move among enabled items.
- `Home` and `End` move to the first and last enabled item.
- `Enter` or `Space` activates an item.
- `Escape` closes the menu and restores focus to the trigger.
- Do not place arbitrary form layouts inside a `menu`; use a popover or dialog.

### Calendar

- Provide agenda/list view as a complete alternative to the visual month grid.
- The month calendar is one tab stop with roving focus among dates.
- Arrow keys move by day or week.
- `Home` and `End` move to the start and end of the week.
- `Page Up` and `Page Down` move by month; adding `Shift` moves by year.
- `Enter` or `Space` selects a date and opens its day details.
- Announce the newly focused date, selected state, event count, reminder count,
  and whether it is today.
- Mark today and selected date independently. Neither state may rely on color.
- Events in a day are reachable from day details rather than creating dozens of
  tab stops inside the month grid.

### Task, reminder, and recent-work lists

- Use semantic lists with a heading and item count.
- Each completion checkbox has a label that includes the item name.
- Keep visible item actions concise. Put rare actions in a labelled menu.
- When keyboard focus enters an item action group, the item name remains in the
  accessible context through `aria-labelledby` or visible text.
- Reordering supports explicit move commands and announces the new position.
- Bulk selection uses real checkboxes and reports the selected count.
- An empty state has a heading, plain explanation, and one clear next action.

### Timeline

- Default to an ordered semantic list grouped by labelled date headings.
- A visual axis is decorative and hidden from assistive technology.
- Filters use native controls and announce the resulting entry count.
- Infinite loading is discouraged. Prefer bounded date ranges or a "Load older"
  button that preserves focus.
- Entries expose date, category, title, summary, and relevant actions in reading
  order.

### Sliders and numeric controls

- Prefer native number inputs or select controls when exact values matter.
- Sliders require a visible label, current value, unit, minimum, and maximum.
- Arrow keys change by one step; `Page Up` and `Page Down` use a larger step;
  `Home` and `End` move to minimum and maximum.
- Pair a slider with an editable numeric value when precise entry is useful.
- Timer duration controls announce human-readable values such as "45 minutes",
  not raw numbers.

### Disclosures

- Use a button with `aria-expanded` and `aria-controls`.
- `Enter` and `Space` toggle it.
- Keep collapsed content out of both the visual and accessibility trees.
- Expanding a disclosure does not move focus.

## Dialogs and Confirmations

### Modal dialog contract

- Prefer the native `dialog` element when it behaves consistently in the
  supported Electron version; otherwise implement the APG dialog pattern.
- The container has `role="dialog"` and `aria-modal="true"` when native
  semantics are not sufficient.
- Label every dialog from a visible title.
- Use `aria-describedby` only for short, simple descriptions. For structured or
  lengthy content, focus the title and let the user navigate the content.
- On open, save the invoking element and move focus inside.
- Trap `Tab` and `Shift+Tab` within the modal.
- Make the rest of the renderer inert, not merely visually dimmed.
- Provide a visible Close or Cancel button.
- `Escape` closes cancellable dialogs.
- On close, return focus to the invoker or the nearest logical surviving target.
- Never stack ordinary dialogs. Replace the current step or use a single
  multi-step dialog.

### Initial focus

- Simple add/edit dialog: focus the first required field.
- Long informational dialog: focus the title with `tabindex="-1"`.
- Destructive confirmation: focus Cancel or the least destructive action.
- Success dialog with one continuation: focus the continuation button.
- Do not place initial focus on Delete, Reset, Sign out, or irreversible actions.

### Confirmation policy

- Confirm destructive actions that cannot be quickly undone.
- Prefer an undo status message for low-risk deletion rather than repeated
  confirmation dialogs.
- Confirmation text names the item and consequence.
- Buttons use explicit verbs: "Delete session" and "Cancel", not "Yes" and "No".
- Use `alertdialog` only for urgent decisions that interrupt the workflow.

## Timers, Reminders, and Announcements

### Timer semantics

- The visible countdown has an accessible name such as "Focus time remaining".
- Use `role="timer"` or an equivalent labelled output, but keep its live setting
  off during normal per-second updates.
- Do not announce every tick. Visual updates may occur each second while
  assistive output remains quiet.
- Keep the timer operable when the window is zoomed, minimized, backgrounded, or
  restored.
- Starting, pausing, resuming, finishing, and resetting are explicit buttons
  whose names and disabled states match the timer state.
- A single Start/Pause shortcut may be state-dependent, but its visible command
  and native menu label must update to the current action.

### Announcement policy

Use one persistent polite status region and one narrowly used urgent alert
region. Insert complete messages into an existing region rather than creating a
new live region at announcement time.

| Event | Announcement |
| --- | --- |
| Timer started | "Focus timer started for 45 minutes." |
| Timer paused | "Focus timer paused. 18 minutes remaining." |
| Timer resumed | "Focus timer resumed. 18 minutes remaining." |
| Five minutes remaining | Polite, enabled by default |
| One minute remaining | Polite, configurable |
| Focus timer complete | Assertive once, plus visible message |
| Break complete | Assertive once, plus visible message |
| Session saved | Polite success status |
| Reminder snoozed | Polite result with the new time |
| Sync started or completed | Polite only when user initiated |
| Background autosave | No announcement unless it fails |

- Timer milestones are configurable and can be turned off.
- Never repeat the same completion announcement on every render.
- Audio alarms have equivalent visible text and assistive announcements.
- Alarm volume, sound, vibration where supported, system notification, and spoken
  milestones are separately configurable.
- A completion alert does not steal renderer focus. The next logical action is
  available in place and through the native notification.
- Do not use flashing. No content may flash more than three times per second.
- A shaking timer is prohibited. Use a static state change in reduced-motion
  mode and a restrained non-essential effect otherwise.

### Time limits

- User-created focus durations are not treated as expiring forms.
- Draft task, journal, health, or review data is never discarded because a timer
  or session ended.
- Any inactivity lock warns the user, allows extension, and preserves local
  drafts.
- Snooze and dismiss actions are keyboard accessible from both in-app and native
  notifications where the platform permits.

## Forms and Data Entry

### Labels and instructions

- Every input has a persistent visible label.
- Placeholder text may provide an example but never serves as the label.
- Group related fields with `fieldset` and `legend`.
- Required fields are identified in text and programmatically.
- Put format, unit, privacy, and range instructions before the field or connect
  them with `aria-describedby`.
- Use native input types and useful `autocomplete` tokens where appropriate.
- Do not disable paste in password, date, health, or profile fields.
- Changes on input or focus never submit, navigate, or open another context.

### Validation

- Validate on submit and, when useful, after a field loses focus. Do not announce
  errors on every keystroke.
- Preserve all entered values after a validation failure.
- Mark invalid controls with `aria-invalid="true"`.
- Connect field errors using `aria-describedby` or `aria-errormessage`.
- Put a visible error summary at the start of the form, focus it after failed
  submission, and link each error to its field.
- Error text explains the problem and correction. Do not use color or an icon
  alone.
- Clear the error state and stale description after correction.
- Successful save uses a polite status message and does not unexpectedly move
  focus.

### Dates, times, and duration

- Support typed date and time entry in addition to any picker.
- Display the expected format and respect locale in presentation.
- Store absolute timestamps separately from display formatting.
- Always include units in duration and measurement labels.
- Health measurements include unit selection where multiple systems are common.
- Ambiguous natural-language input is confirmed before saving.

### Sensitive and health data

- Explain locally stored versus synced data in plain language.
- Password visibility toggles are real buttons with current state in their name.
- Health charts and insights avoid diagnostic claims and communicate uncertainty
  in text.
- Privacy, export, deletion, and sync controls are fully keyboard accessible and
  do not depend on hidden gestures.

## Charts, Progress, and Data Visualizations

### Required alternatives

- No chart may be canvas-only.
- Every chart includes:
  - a visible title;
  - a short text summary of the important trend;
  - the date range and units;
  - a semantic table or structured list containing the underlying values;
  - a way to reveal the data alternative without pointer hover.
- Progress rings have adjacent text such as "90 of 120 focus minutes complete".
- Decorative chart paths, grid lines, and gradients are hidden from assistive
  technology.
- Charts use color plus labels, patterns, shapes, or line styles.
- Legends are text and remain readable at high zoom.

### Interaction

- Prefer a non-interactive chart with a data table over many focusable points.
- If point exploration is necessary, the chart is one tab stop and uses arrow
  keys to move through points.
- Announce series, timestamp/category, value, and comparison for the active point.
- `Home` and `End` move to the first and last point.
- `Page Up` and `Page Down` may move by a meaningful larger interval.
- `Escape` exits chart exploration and returns focus to the chart container.
- Tooltips also appear on keyboard focus and are dismissible with `Escape`.
- Hover-only detail is prohibited.

### Tables

- Use native `table`, `caption`, `th`, and `scope` for read-only data.
- Do not use an ARIA grid for a static report.
- Sorting controls are buttons inside column headers and expose
  `aria-sort` on the active column.
- Responsive presentation must retain header relationships.
- Large datasets provide filters and pagination rather than an unbounded tab
  sequence.

## Motion, Audio, and Visual Design

### Reduced motion

- Respect `prefers-reduced-motion: reduce` at first render.
- Provide an in-app motion preference with `System`, `Reduced`, and `Full`
  options. `System` is the default.
- Reduced mode removes shake, bounce, parallax, animated counting, orbiting
  decoration, large sliding panels, and smooth scrolling.
- Essential state changes occur instantly or use a short opacity transition.
- No workflow depends on observing an animation.
- JavaScript animation code checks the same resolved preference as CSS.
- Changing the setting applies immediately and does not require restart.

Suggested baseline:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Component code should still avoid starting unnecessary animation; CSS duration
overrides are a fallback, not the entire implementation.

### Contrast and color

- Normal text has at least 4.5:1 contrast.
- Large text has at least 3:1 contrast.
- Controls, boundaries needed to identify controls, selected states, chart
  marks, and focus indicators have at least 3:1 contrast.
- Disabled controls remain legible even though disabled content is exempt from
  strict contrast requirements.
- Test every semantic token in light and dark themes. Do not approve colors by
  visual judgment alone.
- Status categories use icon, text, or pattern in addition to color.
- Links are identifiable without color alone in surrounding body text.
- Support Windows forced-colors mode. Do not suppress system colors or focus
  indicators with `forced-color-adjust: none` unless a specific control has a
  tested replacement.
- User theme choice must not override operating-system high contrast.

### Typography and layout

- Default body text is at least 16 CSS pixels; compact metadata may be smaller
  only when it remains readable and non-essential.
- Use relative units for text and spacing.
- Support 200% text zoom without clipped controls or lost content.
- Support 400% browser zoom with a single-column reflow where practical.
- Avoid two-dimensional scrolling except for data that inherently requires it,
  such as a wide data table with its own labelled scroll region.
- Content remains usable with WCAG text-spacing overrides.
- Truncation never hides the only copy of essential information. Provide a
  focusable or expanded full-text presentation.

### Target size

- Meet WCAG 2.2 AA target-size requirements: at least 24 by 24 CSS pixels or
  enough spacing to prevent adjacent target overlap.
- Aim for 44 by 44 CSS pixels for primary controls, touch-capable devices, and
  timer actions.
- Small icon buttons require an accessible name and visible tooltip.
- Avoid tightly packed destructive and primary actions.

## Accessibility Preferences

Store these settings locally and include them in export/import:

- Motion: System, Reduced, Full.
- Theme: System, Light, Dark.
- Contrast: System or Enhanced.
- Text scale within the app, while still respecting Electron/browser zoom.
- Timer milestone announcements.
- Alarm sound and volume.
- Native system notifications.
- Optional system-wide timer shortcut.
- Shortcut remapping and restore defaults.
- Week start and date/time format where locale does not settle the preference.

Changing an accessibility preference must not reset the current view, timer, or
unsaved form state.

## Electron-Specific Requirements

- Keep Electron accessibility support enabled through its standard automatic
  behavior. Do not force accessibility mode in production without evidence that
  a supported assistive technology requires it.
- Define application menus and accelerators in the main process so commands are
  discoverable through native menus.
- Renderer controls remain the source of accessible names and states; IPC only
  performs privileged actions.
- Native file dialogs use clear titles and filters. Return focus to the invoking
  control when they close.
- Native notifications contain a useful title and body without relying on the
  Focus icon.
- System tray actions, if added, duplicate essential timer controls but never
  become their only location.
- BrowserWindow minimum dimensions must still allow the renderer to reflow under
  text zoom. Do not lock users to a fixed pixel layout.
- Preserve keyboard access when DevTools is closed and in the packaged build.
- Avoid intercepting browser zoom accelerators. Support `CmdOrCtrl++`,
  `CmdOrCtrl+-`, and `CmdOrCtrl+0`.

## Implementation Structure

Keep accessibility behavior centralized without creating a large framework:

- `focusManager`: view transitions, focus restoration, top-layer stack, and F6
  region cycling.
- `announcer`: one polite status region, one urgent region, deduplication, and
  timer milestone throttling.
- `shortcuts`: platform accelerators, conflict detection, editing-field guards,
  and user remapping.
- Reusable helpers for dialogs, menus, tabs, calendar grid navigation, and
  roving `tabindex`.
- Theme tokens for text, surfaces, controls, focus, status, charts, and forced
  colors.
- Unit tests for state logic and DOM-focused integration tests for keyboard and
  focus behavior.

Do not solve accessibility by scattering one-off keydown handlers and ARIA
attributes throughout view rendering.

## Delivery Sequence

### Phase 1: Foundation

- Add semantic landmarks, heading rules, skip link, and current-page state.
- Add global focus styling and forced-colors support.
- Add persistent polite and urgent announcers.
- Establish native menu commands and the shortcut registry.
- Add automated accessibility checks to the Electron test harness.

### Phase 2: Navigation and overlays

- Implement view-transition focus management.
- Implement command palette, menus, dialogs, popovers, and drawers.
- Add route history focus restoration and F6 region cycling.
- Verify frameless title-bar and window controls.

### Phase 3: Core personal-OS workflows

- Apply form and validation contracts to quick capture, task editing, reminders,
  health entry, and reviews.
- Implement calendar keyboard navigation and agenda alternative.
- Apply list behavior to tasks, recent work, and timeline.
- Add timer semantics, throttled announcements, and notification preferences.

### Phase 4: Data and visual refinement

- Replace canvas-only charts with accessible SVG or paired semantic data.
- Add summaries and tables for focus, health, and improvement trends.
- Verify contrast tokens in all themes.
- Complete reduced-motion and high-zoom behavior.

### Phase 5: Assistive-technology verification

- Test the packaged app on supported operating systems.
- Resolve high-impact failures before visual polish defects.
- Record keyboard and screen reader behavior in release test cases.
- Include accessibility checks in the release checklist.

## Testing Checklist

### Automated on every pull request

- [ ] HTML has one `main`, one current `h1`, and valid landmark labels.
- [ ] No duplicate IDs or broken ARIA references.
- [ ] Every form control has an accessible name.
- [ ] Every icon-only button has an accessible name.
- [ ] No positive `tabindex`.
- [ ] Dialogs have names, modal semantics, and focus tests.
- [ ] Automated axe checks report no serious or critical violations.
- [ ] Contrast tests cover semantic light and dark theme tokens.
- [ ] Unit tests cover shortcut conflicts and editing-field suppression.
- [ ] Timer announcement tests prove per-second updates are not live.
- [ ] View navigation tests prove focus reaches the new heading.
- [ ] Overlay tests prove focus containment and restoration.

### Keyboard-only manual test

- [ ] Launch and reach every primary view without a pointer.
- [ ] Use the skip link and F6 region cycling.
- [ ] Confirm focus is always visible and never hidden beneath sticky UI.
- [ ] Complete quick capture, task editing, reminder creation, health entry, and
      a weekly review.
- [ ] Start, pause, resume, finish, reset, and save a focus session.
- [ ] Navigate the month calendar and switch to agenda view.
- [ ] Operate every menu, disclosure, tab set, popover, drawer, and dialog.
- [ ] Close nested temporary UI with `Escape` in a predictable order.
- [ ] Delete, undo, reorder, filter, and sort collection items.
- [ ] Confirm focus lands logically after item deletion and dialog close.
- [ ] Confirm app shortcuts do not fire while typing in editable fields.
- [ ] Confirm native menu labels match the current timer command and shortcut.
- [ ] Confirm no keyboard trap exists, including chart exploration.

### Screen reader test

- [ ] Windows: current NVDA with the supported Electron/Chromium build.
- [ ] macOS: current VoiceOver in the packaged application.
- [ ] Linux: Orca for supported Linux distributions when Linux is a release
      target.
- [ ] Landmarks, headings, current navigation, control names, states, and values
      are announced correctly.
- [ ] View changes announce the new heading once.
- [ ] Dialog title, purpose, initial focus, tab containment, and return focus are
      correct.
- [ ] Timer announces actions and selected milestones without reading every
      second.
- [ ] Form errors are announced and can be navigated from the summary.
- [ ] Calendar dates include date, state, and item count.
- [ ] Charts have useful summaries and complete data alternatives.
- [ ] Autosave, filtering, sync, and reminder statuses are informative but not
      repetitive.

### Visual and cognitive test

- [ ] Light and dark themes meet text and non-text contrast requirements.
- [ ] Windows forced-colors mode preserves controls, states, charts, and focus.
- [ ] Reduced motion removes non-essential movement and timer shake.
- [ ] 200% text zoom has no clipping or loss of operation.
- [ ] 400% zoom reflows essential workflows without two-dimensional page scroll.
- [ ] Increased text spacing does not overlap or truncate essential content.
- [ ] Status is understandable in grayscale and without icons.
- [ ] Instructions avoid jargon and destructive actions state consequences.
- [ ] Empty, loading, error, offline, and synced states are distinguishable.

### Timer and notification test

- [ ] Completion has visible, audible if enabled, assistive, and native
      notification equivalents.
- [ ] Muting sound does not suppress visible or screen reader status.
- [ ] Disabling milestone speech does not suppress timer control state.
- [ ] Completion does not steal focus.
- [ ] Duplicate completion events are deduplicated.
- [ ] Background and restored-window states preserve timer accuracy.
- [ ] Reduced motion prevents shake or pulsing completion effects.

### Release gate

A release is blocked by:

- an unreachable core action;
- a keyboard trap;
- missing or invisible focus;
- an unnamed control;
- focus escaping a modal dialog;
- destructive focus loss;
- inaccessible validation;
- timer announcements on every tick;
- a chart with no text/data equivalent;
- failure of normal-text or essential-control contrast;
- essential information communicated only by color, sound, motion, or position.

Minor wording improvements and non-core tooltip issues may be scheduled only when
they do not obscure an action, state, instruction, or consequence.

## Definition of Done

The accessibility work for a feature is complete only when:

1. Native semantics are used wherever possible.
2. Keyboard operation and focus behavior match this document.
3. Names, roles, states, values, errors, and status changes are exposed.
4. Light, dark, forced-color, reduced-motion, and zoom behavior are verified.
5. Automated checks pass.
6. The workflow is manually completed with keyboard only.
7. At least one target screen reader is tested for new interaction patterns.
8. Any new shortcut is documented in the native menu and shortcut reference.
9. Charts or visual indicators include equivalent text and data.
10. No temporary exception removes access to a core personal-OS workflow.

## References

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [APG Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [APG Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- [WCAG Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages)
- [Electron Accessibility](https://www.electronjs.org/docs/latest/tutorial/accessibility/)
