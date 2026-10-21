# Tarpaulin — MVP build plan

## Context
Students find Canvas's UI cluttered and miss deadlines. Tarpaulin is a desktop app (Tauri) that connects to a student's Canvas account and lets them build pages out of widgets (due soon, calendar, grades, etc.), with presets and deep per-widget customisation. The repo (`dusty369289/tarpaulin`, branch `claude/bold-tesla-veqhqj`) is empty, so this is a greenfield scaffold.

Decisions you made: **Tauri desktop**, **token + OAuth2 auth**, **localStorage layouts with JSON export/import**, **solid MVP scope**.

## Stack
- **Tauri 2** (Rust) shell. All Canvas HTTP goes through Rust (`reqwest`), which avoids CORS and keeps tokens out of JS.
- **Frontend:** React 18 + TypeScript + Vite, Tailwind with CSS-variable theme tokens, `react-grid-layout` for drag/resize, TanStack Query for fetching and caching, Zustand (with `persist` → localStorage) for layout and settings state, `zod` for schemas, `date-fns`, and `lucide-react` icons.
- **Tests:** Vitest + React Testing Library on the frontend, `cargo test` for Rust.

## Architecture

```
src-tauri/
  src/main.rs, lib.rs        – register commands and plugins
  src/canvas.rs              – canvas_request(path, query): GET with bearer token, follows Link-header pagination
  src/auth.rs                – save/load/clear credentials in the OS keychain (`keyring` crate);
                               OAuth: start a loopback server (tauri-plugin-oauth), open the browser to
                               {base}/login/oauth2/auth, exchange the code at /login/oauth2/token, refresh on 401
  tauri.conf.json, capabilities/default.json
src/
  canvas/
    types.ts                 – Course, Assignment, Submission, Announcement, PlannerItem, CalendarEvent, Enrollment, Todo
    transport.ts             – Transport interface; TauriTransport (invoke) and MockTransport (fixtures)
    client.ts                – typed endpoints: courses, assignments (with submission), planner items,
                               announcements, calendar events, enrollments/grades, todo, user profile
    hooks.ts                 – TanStack Query hooks (useUpcoming, useCourses, useGrades, …)
    fixtures/                – anonymised snapshots recorded from your live account; used only by the automated unit tests
  widgets/
    registry.ts              – WidgetDefinition { type, name, icon, defaultSize, minSize, settingsSchema (zod), defaults, Component }
    settings/SettingsForm.tsx – auto-generates the settings panel from the zod schema (text, number, select, toggle, color, course multi-select)
    shared/WidgetFrame.tsx   – shared chrome: title, accent colour, density, background/opacity, border radius
    DueSoon, Calendar (month/week/agenda), Grades, Announcements, CourseList,
    Todo (Canvas todo + local checklist), Countdown (next deadline), Notes (local markdown), Clock/Greeting
  dashboard/
    store.ts                 – Zustand: pages[], each { id, name, icon, layout[], widgets{id: {type, settings}} }; versioned persist with migrations
    Grid.tsx                 – react-grid-layout wrapper with view and edit modes
    EditToolbar.tsx, WidgetPicker.tsx, PageTabs.tsx
    presets.ts               – 3 presets: "Deadline Focus", "Weekly Planner", "Minimal"
    exportImport.ts          – JSON export/import validated with zod
  theme/                     – theme tokens (light, dark, high-contrast, + custom accent/font/radius), ThemeProvider
  onboarding/                – connect screen: Canvas URL + token, or OAuth (client id/secret per institution); test connection
  app/App.tsx, routes        – Onboarding → Dashboard; Settings page (account, theme, refresh interval, data)
```

### Key design points
- **Widget contract:** every widget is `(props: { settings, size, editMode }) => JSX`, with settings validated by its zod schema. Settings can be global (title, accent, density) or widget-specific (course filter, time window, sort, show completed, grouping, colour per course). Adding a widget means adding one file plus one registry entry.
- **Course colours/nicknames** are a global setting that all widgets reuse.
- **Data freshness:** a configurable background refetch interval (default 10 min), manual refresh, and query cache that persists to localStorage so the app opens instantly.
- **Security:** tokens are kept only in the OS keychain and the frontend never sees them. Tauri capabilities are restricted to the commands we define; there is no generic HTTP access from JS. `canvas_request` only allows paths under `/api/v1/` on the configured base URL.
- **Transports:** the Tauri build talks to Canvas through Rust (`TauriTransport`). In development, a plain browser (`pnpm dev`) talks to Canvas through the dev proxy (`DevProxyTransport`). The automated tests use recorded fixtures (`FixtureTransport`).

## Implementation order
1. Scaffold the Vite+React+TS app and Tauri 2 (`src-tauri`), plus Tailwind, ESLint/Prettier, Vitest, `.gitignore`, and a README.
2. Check the live connection (variables set, host reachable, `GET /api/v1/users/self` works). Then build the GET-only dev proxy, run the smoke script, and derive the Canvas types from real responses. After that: client, hooks, and the fixture recorder.
3. Rust: keychain auth, `canvas_request` with pagination, and OAuth loopback flow with token refresh.
4. Dashboard store and grid with edit mode, widget picker, and pages/tabs.
5. Widget registry, auto settings form, WidgetFrame, and the 9 widgets.
6. Themes, presets, export/import, onboarding, and settings page.
7. Tests, README (how to get a Canvas token, how to register an OAuth developer key), commit, and push to `claude/bold-tesla-veqhqj`.

## Live Canvas testing during development
- **Credentials:** set `CANVAS_BASE_URL` (e.g. `https://canvas.youruni.edu`) and `CANVAS_TOKEN` (a personal access token) as environment variables or network secrets in this cloud environment's settings. Never paste them into chat. A new session picks them up.
- **Network:** add your Canvas host to the environment's allowed domains, or use a broader access level.
- **Dev proxy:** add a dev-only Vite middleware (`vite.config.ts` → `/canvas-proxy/api/v1/*`) that adds the `Authorization: Bearer $CANVAS_TOKEN` header server-side. This lets `pnpm dev` in a plain browser (and Playwright) hit real Canvas. Also add a third transport, `DevProxyTransport`, used when `VITE_TRANSPORT=live`. The proxy only runs in dev builds and is GET-only, so it is read-only and never writes to Canvas.
- **Smoke script:** `pnpm canvas:smoke` (Node) calls each client endpoint against the live account and prints counts and shapes. This catches real-world field differences that mocks miss.
- **Fixture recorder:** `pnpm canvas:record` snapshots real responses into `src/canvas/fixtures/`, with names, emails, IDs and course codes replaced by placeholders. Mocks then match real shapes, and no personal data gets committed.
- **Live data from the start.** Development uses your real Canvas data from day one; there's no mock-first phase. Before any code is written I'll check that both variables are set and the host is reachable. If either is missing, I'll stop and tell you rather than fall back to fake data.
- **Read-only, enforced in code:** every Canvas call is a GET under `/api/v1/`, enforced by an allowlist in the dev proxy, the smoke script and the Rust `canvas_request`. Nothing posts, edits, marks items done or submits. Widgets' local features (checklists, notes) are stored in localStorage only and are never written back to Canvas.

## Verification
- `pnpm test`: unit tests for the client (pagination, mapping), store migrations and export/import round-trip, settings-schema form generation, and widget rendering against fixtures (e.g. DueSoon sorts and filters correctly).
- `pnpm build` and `pnpm lint` / `tsc --noEmit` should pass.
- `cargo test` / `cargo check` in `src-tauri`: needs the `libwebkit2gtk-4.1-dev` and `libgtk-3-dev` system packages, which aren't installed in this container yet. I'll try to apt-install them; if that's blocked, Rust gets verified with `cargo check` on the non-UI modules only, and I'll tell you.
- Run `pnpm dev` against your live account and use Playwright (Chromium is pre-installed) to screenshot each preset and edit mode, checking that drag/resize, adding a widget, changing settings and switching themes all work.
- Live: once the credentials are set, run `pnpm canvas:smoke` and screenshot the presets with `VITE_TRANSPORT=live` showing your real courses and deadlines. You'd still test the final Tauri path (keychain + Rust HTTP) locally with `pnpm tauri dev`.
