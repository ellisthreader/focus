# Architecture

Focus Pattern Tracker is a local-first Electron desktop app. The renderer owns the timer UI and local interaction state, while the main process provides a small IPC boundary for filesystem persistence, optional folder sync, optional MySQL sync, and native window controls.

## Runtime Boundary

- `main.cjs` creates the frameless Electron window and handles privileged operations.
- `preload.cjs` exposes a narrow `window.focusDesktop` API with context isolation enabled.
- `index.html`, `styles.css`, and `app.js` implement the product UI and timer state machine.
- `focusModel.js` is framework-independent so it can run in both the renderer and Node tests.

## Data Flow

1. The renderer hydrates from the app database through IPC when Electron APIs are available.
2. Browser `localStorage` mirrors state for fast recovery and browser-based previews.
3. Completed sessions are normalized and persisted as structured JSON.
4. The focus model rebuilds from session history on import, sync, and session completion.
5. Optional folder sync and MySQL sync merge imported state rather than replacing local state blindly.

## Model Design

The learning layer is deterministic and explainable. Each session receives a score from active ratio, duration stability, pause count, focus rating, and energy. Aggregates by hour and day power best-window, risk-window, block-length, break-length, and daily-plan recommendations.

## Security Notes

- Node integration is disabled in the renderer.
- The preload script exposes only intentional IPC methods.
- MySQL account passwords are hashed with PBKDF2 before storage.
- Database connection passwords are not committed; local setup reads `FOCUS_MYSQL_PASSWORD`.
