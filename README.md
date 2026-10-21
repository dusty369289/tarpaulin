# Tarpaulin

A calmer front end for Canvas LMS. Tarpaulin is a desktop app (Tauri) that connects to your Canvas
account and lets you build pages out of widgets, such as what's due soon, a calendar, grades,
announcements and a countdown to your next deadline. Each widget can be dragged, resized and configured.

- **9 widgets**: Due soon, Calendar (month / week / agenda), Grades, Announcements, Courses,
  To-do (Canvas to-dos plus your own checklist), Countdown, Notes (Markdown), Clock & greeting.
- **Pages and presets**: _Deadline Focus_, _Weekly Planner_ and _Minimal_, or build your own.
- **Deep customisation**: every widget has its own settings (course filter, time window, sort,
  grouping and so on) plus shared appearance options (title, accent colour, density, background,
  opacity, corners). Course colours and nicknames are set once and used everywhere.
- **Themes**: light, dark, high contrast and system, with a custom accent, font, text size and corner radius.
- **Export / import** your dashboard as JSON.
- **Read-only by design**: Tarpaulin never submits, edits or marks anything in Canvas. Notes and
  checklists stay on your device.

## Getting started

```sh
pnpm install
pnpm tauri dev      # desktop app
```

On Linux, Tauri needs `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libssl-dev libdbus-1-dev pkg-config`.

When it opens, connect to your Canvas account in one of two ways:

### Personal access token (simplest)

1. In Canvas, open **Account → Settings**.
2. Under **Approved Integrations**, choose **+ New Access Token**, give it a purpose (e.g.
   "Tarpaulin") and generate it.
3. Paste your Canvas address (e.g. `canvas.youruni.edu`) and the token into Tarpaulin, then click **Test & connect**.

The token is stored in your operating system's keychain (macOS Keychain, Windows Credential
Manager, or Secret Service on Linux), never in the app's files or in the web view.

### OAuth ("Sign in with Canvas")

This needs a **developer key** from your institution's Canvas admin:

1. Admin → **Developer Keys** → **+ Developer Key** → **API Key**.
2. Add these **Redirect URIs** (Tarpaulin listens on whichever port is free):
   ```
   http://127.0.0.1:43821/oauth/callback
   http://127.0.0.1:43822/oauth/callback
   http://127.0.0.1:43823/oauth/callback
   ```
3. Save the key, set it to **ON**, and give students the **Client ID** (the number shown in the
   "Details" column) and **Client Secret** (the **Show Key** button).
4. In Tarpaulin choose **Sign in (OAuth)**, enter the address, client ID and secret, and approve
   access in the browser window that opens. Tokens refresh automatically.

## How it's built

```
src-tauri/            Rust shell
  src/canvas.rs       read-only GET under /api/v1/ with Link-header pagination (allowlisted)
  src/auth.rs         keychain credentials, OAuth code exchange and refresh
  src/lib.rs          the only commands JS can call (see capabilities/default.json)
src/
  canvas/
    resources.ts      every Canvas endpoint, declared once (path, query, schema, mapping, cache key)
    models.ts         Course, Grade, Deadline, Announcement… and chainable collections
    hooks.ts          useResource, useCatalog, useDeadlines, useAnnouncements, …
    transport.ts      Tauri (Rust) / dev proxy / recorded fixtures
  widgets/            one file per widget + registry.ts; settings forms are generated from zod
  dashboard/          pages, grid (react-grid-layout), presets, export/import, persisted store
  theme/ onboarding/ app/
mock-canvas/          a local Canvas impersonator used for development and tests
scripts/              smoke test, fixture recorder, widget-lab sweep, UI check
```

- **Security.** All Canvas HTTP happens in Rust. The web view has no HTTP, filesystem or shell
  access, only the six commands Tarpaulin defines. Paths must be under `/api/v1/` on your Canvas
  host, pagination links are checked against that origin, and only links to your Canvas host can
  be opened.
- **Models over plain data.** Responses are mapped once into plain JSON (which is cached and
  persisted), then wrapped in model classes when read. Widgets read like
  `deadlines.inCourses(ids).undone().sortByDue()` and `course.grade.format('both')`.
- **Caching.** Every resource is cached per account with TanStack Query. It's fresh for the whole
  refresh interval (default 10 minutes, set in Settings), refreshed in the background, and
  persisted to local storage, so the app opens instantly. All planner-based widgets share a single
  window of data, so a whole dashboard makes one request per resource. A test checks this.

### Adding a widget

Create `src/widgets/MyWidget.tsx` with `defineWidget({ type, name, icon, defaultSize, minSize,
settingsSchema, Component })` and add it to the list in `src/widgets/registry.ts`. Give each
setting a default and a label with `field(z…, { label })`, and the settings panel is generated for you.

## Development without (or with) a Canvas account

| Command                            | Data source                                                                                                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev:mock`                    | The local mock Canvas (start it with `pnpm canvas:mock`). Pick a dataset with `CANVAS_TOKEN=mock-realistic` (default), `mock-showcase` (a busy, tidy term for demos), `mock-dense`, `mock-edge`, `mock-empty` or `mock-flaky`. |
| `pnpm dev`                         | Your real Canvas through a GET-only dev proxy. Set `CANVAS_BASE_URL` and `CANVAS_TOKEN` (see `.env.example`). The token stays server-side.                                                                                     |
| `VITE_TRANSPORT=fixtures pnpm dev` | Anonymised recorded responses.                                                                                                                                                                                                 |

The **mock Canvas** (`mock-canvas/`) implements the endpoints Tarpaulin reads, with Canvas's
behaviour: bearer auth, `Link` pagination (10 per page by default), date filtering, and the quirks
observed on a live instance (the 28-day announcement window, `all_events` ignoring dates, only ten
context codes honoured, `submissions: false` on announcements, relative planner URLs). It also
implements the OAuth endpoints (`mock-client` / `mock-secret`) and records any write attempt.
Scenarios are written with a fluent builder:
`w.academicTerm(0).course('Politics').assignment('Essay', w.at({ days: 3 }))`.

## Testing

```sh
pnpm test            # unit tests (Vitest): client vs mock Canvas, models, widgets vs recorded
                     # fixtures, store migrations, export/import, settings form, anonymiser
pnpm test:widgets    # every widget × 7 widths × 7 heights × setting variants × 5 mock scenarios
pnpm test:ui         # real UI driven with the mouse: presets, edit, drag, resize, add, settings, themes
pnpm test:all        # all of the above
pnpm lint && pnpm typecheck && pnpm build
cd src-tauri && cargo test
```

`test:widgets` and `test:ui` start their own mock Canvas and Vite server, so they need no
credentials or network. Add `--live` to run them against a `pnpm dev` connected to real Canvas,
and `--shots` (widgets) to save screenshot galleries. They never sleep: the app exposes
`window.__tarpaulin.settled()`, which resolves when no requests are in flight, no animations are
running and the DOM has stopped changing. Chromium runs with an uncapped frame rate, so a full
sweep of about 3,600 renders takes around a minute.

The widget sweep fails on horizontal scrolling, elements escaping the widget, text clipped or
squashed by its container, and fit-to-box widgets (clock, countdown) that would need to scroll.
Every run also asserts that no request tried to write to Canvas.

To record the product demo (human-paced, with captions, on the dummy `showcase` term):

```sh
pnpm demo:video      # → screenshots/demo/tarpaulin-demo.mp4 (needs ffmpeg)
```

Against a live account:

```sh
pnpm canvas:smoke    # calls every endpoint, prints counts and field coverage
pnpm canvas:record   # refreshes src/canvas/fixtures/canvas.json (names, emails, ids, codes,
                     # free text and grades are replaced with placeholders)
```
