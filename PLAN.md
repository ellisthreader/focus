# Focus Pattern Tracker Plan

## Product Goal

Build a desktop work time tracker that makes the timer the center of the app, then uses recorded sessions to learn when the user tends to focus best. The app must work locally, persist data on the device, and give practical recommendations without pretending to be a cloud AI system.

## Core Jobs

1. Start, pause, resume, finish, and reset a focused work session.
2. Track active time, paused time, daily totals, and progress toward a configurable daily goal.
3. Capture enough session context to learn patterns: task name, project, tags, energy, focus rating, pauses, start hour, duration, and goal target.
4. Build an on-device model from session history that scores focus quality and predicts useful windows.
5. Show a beautiful desktop dashboard with immediate status, goal controls, session history, charts, and insights.

## Machine Learning Boundary

This app uses local pattern learning rather than a remote ML service. The model should:

- Score each completed session from active ratio, duration stability, pause behavior, user focus rating, and energy.
- Aggregate scores by hour of day and day of week.
- Smooth sparse data so the first-run experience still works.
- Suggest the next likely focus window from learned hourly patterns.
- Recommend a realistic block length based on completed sessions.
- Surface risk hours where focus quality has historically dropped.

This is intentionally explainable. The user should be able to see why the app recommends a time or block length.

## Data Model

Settings:

- dailyGoalMinutes
- blockGoalMinutes
- weeklyGoalHours
- preferredProject
- themeIntensity

Session:

- id
- title
- project
- tags
- startedAt
- endedAt
- durationMs
- activeMs
- pausedMs
- pauseCount
- focusRating
- energy
- goalMinutes

Derived model:

- bestHours
- riskHours
- bestDays
- averageFocusScore
- streakDays
- suggestedGoalMinutes
- generatedAt

## Interface Plan

Top app bar:

- Frameless desktop controls.
- Current date and compact model status.

Main timer area:

- Large digital timer.
- Circular progress visual toward the current block goal.
- Task, project, and tag inputs.
- Start, pause/resume, finish, and reset controls.

Goal and day area:

- Daily goal slider.
- Block length slider.
- Daily active hours.
- Progress ring and remaining time.

Learning area:

- Focus fingerprint canvas by hour.
- Best focus windows.
- Risk windows.
- Day-of-week performance.
- Recommended next block length.

History area:

- Recent sessions list.
- Session score, project, active duration, pause count, and rating.

## Implementation Review

Risk: "machine learning" can become vague marketing copy.

Decision: implement a real deterministic local model with tests, clear inputs, and explainable outputs.

Risk: app depends on package downloads.

Decision: use vanilla Electron/HTML/CSS/JS and the Electron runtime already available in the workspace.

Risk: beautiful UI turns into a decorative landing page.

Decision: make the first screen the actual tool, using charts, controls, and productive density rather than marketing sections.

Risk: timer state can be lost on refresh.

Decision: persist running timer state to localStorage on every meaningful state change.

Risk: recommendations are poor with no data.

Decision: use smoothing, reasonable defaults, and label confidence through sample counts.

## Build Checkpoints

1. Electron shell boots and provides window controls.
2. Timer state machine handles idle, running, paused, and completed states.
3. Sessions persist locally and daily totals update immediately.
4. Goals are adjustable and persisted.
5. Focus model builds from sessions and updates the UI.
6. Charts and recent history render from real data.
7. Syntax checks and model tests pass.
