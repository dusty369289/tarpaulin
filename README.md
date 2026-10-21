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
- **Looks**: seven complete looks (Plain, Cork board, Bullet journal, Blueprint, Terminal, Swiss
  poster, Arcade), each a page background plus a widget style, and each with its own light and
  dark version. Backgrounds and widget styles can also be mixed separately, set per page, and set
  per widget (with paper colours and tilt), with one-click "apply to all on this page / all pages".
- **Themes**: light, dark, high contrast and system, applied to every look, with a custom accent,
  font, text size and corner radius.
- **Notifications**: deadline reminders (1 week to 15 minutes before; pick any), new
  announcements and grades, with quiet hours. Only things that appear after you connect are
  announced, so connecting never floods you, and each reminder fires once.
- **Lives in the tray**: closing the window keeps Tarpaulin running so reminders keep coming
  (switch it off in Settings); quit from the tray icon. It can also open at login, straight to
  the tray.
- **Export / import** your dashboard as JSON.
- **Read-only by design**: Tarpaulin never submits, edits or marks anything in Canvas. Notes and
  checklists stay on your device.
- **Updates itself** from GitHub Releases, with signed updates.

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

## Releases and updates

Prebuilt installers for macOS (Apple silicon and Intel), Windows (x64 `.msi`/`.exe` and arm64 `.exe`)
and Linux (`.deb`, `.rpm` and AppImage, x64 and arm64) are on
the [Releases](https://github.com/dusty369289/tarpaulin/releases) page. Installed copies keep
themselves up to date: Tarpaulin checks GitHub Releases once a day (you can turn this off in
**Settings → Updates**), shows a banner when a new version is out, and installs it with **Update now**: one click,
then Tarpaulin downloads, installs silently, and reopens in the same window position on the same
page with all your data (dashboards, settings and cached Canvas data live in the app's data
folder, which updates don't touch). Updates are only applied if they're signed with the
project's updater key. The version you're on is in Settings › Updates and at the bottom of
Settings.

The builds aren't code-signed with Apple or Microsoft certificates yet, so the first launch shows a
warning. On macOS, right-click the app and choose **Open**. On Windows, choose **More info → Run anyway**.

### Contributing and CI

Changes go to `main` through pull requests. `.github/workflows/ci.yml` runs on every pull request
into `main` and on every push to `main`: format, lint, typecheck, unit tests, build, the widget
sweeps, the theme sweep, the UI check and the Rust tests. Docs-only changes skip the heavy jobs,
and Rust tests only run when `src-tauri/` changes. A final **CI passed** job sums it up, and
`main` requires it, so nothing merges until it's green.

### Cutting a release

```sh
pnpm release:version 0.2.0         # sets the version in package.json, Cargo.toml and tauri.conf.json
git commit -am "Release 0.2.0"     # then merge it into main through a pull request
git tag v0.2.0 origin/main && git push origin v0.2.0
```

Instead of pushing the tag, you can open **Actions › Release › Run workflow** on `main` and enter
`0.2.0`. That run creates the `v0.2.0` tag itself and builds it.

The tag triggers `.github/workflows/release.yml`, which checks that the versions match the tag, runs
the unit tests, builds every platform, publishes the release and uploads `latest.json` for the
updater. It needs a repository secret named `TAURI_SIGNING_PRIVATE_KEY` (and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the key has one) whose public half is `plugins.updater.pubkey`
in `src-tauri/tauri.conf.json`. Generate a new pair with
`pnpm tauri signer generate -w ~/.tauri/tarpaulin.key`. Keep the private key safe: losing it means
existing installs can no longer verify updates.

## How it's built

```
src-tauri/            Rust shell
  src/canvas.rs       read-only GET under /api/v1/ with Link-header pagination (allowlisted)
  src/auth.rs         keychain credentials, OAuth code exchange and refresh
  src/lib.rs          the only commands JS can call (see capabilities/default.json)
  src/desktop.rs      notifications and opening at login
  src/tray.rs         tray icon, close-to-tray
src/
  canvas/
    resources.ts      every Canvas endpoint, declared once (path, query, schema, mapping, cache key)
    models.ts         Course, Grade, Deadline, Announcement… and chainable collections
    hooks.ts          useResource, useCatalog, useDeadlines, useAnnouncements, …
    transport.ts      Tauri (Rust) / dev proxy / recorded fixtures
  widgets/            one file per widget + registry.ts; settings forms are generated from zod
  dashboard/          pages, grid (react-grid-layout), presets, export/import, persisted store
  notifications/      reminder rules (pure, unit-tested) and the hook that runs them
  ui/                 shared controls (Switch, Section/Row, SearchInput, FoldedList): reuse
                      these instead of hand-rolling, so every screen stays consistent
  theme/ onboarding/ app/
mock-canvas/          a local Canvas impersonator used for development and tests
scripts/              smoke test, fixture recorder, widget-lab sweep, UI check
```

- **Security.** All Canvas HTTP happens in Rust. The web view has no HTTP, filesystem or shell
  access, only the commands Tarpaulin defines (Canvas reads, sign-in, opening Canvas links, and the
  update check and install). Paths must be under `/api/v1/` on your Canvas
  host, pagination links are checked against that origin, and only links to your Canvas host can
  be opened.
- **Models over plain data.** Responses are mapped once into plain JSON (which is cached and
  persisted), then wrapped in model classes when read. Widgets read like
  `deadlines.inCourses(ids).undone().sortByDue()` and `course.grade.format('both')`.
- **Caching.** Every resource is cached per account with TanStack Query. It's fresh for the whole
  refresh interval (default 10 minutes, set in Settings), refreshed in the background, and
  persisted to local storage, so the app opens instantly. All planner-based widgets share a single
  window of data, so a whole dashboard makes one request per resource. A test checks this.

### Looks, backgrounds and widget styles

A widget's style comes from the most specific place that sets one: the widget's own settings,
then its page (Edit › Style), then Settings › Look. Backgrounds work the same way per page.

- **Widget styles** (`src/theme/skins/`) are one `.ts` and one `.css` file each: colours as theme
  tokens scoped to the widget (so every widget's content restyles itself), optional paper
  colours, fonts (bundled with Fontsource, so they work offline), tilt, decorations (pins, tape,
  washi) and icon treatment. The CSS does the rest: Terminal's box-drawn headers and `[x]`
  checkboxes, Blueprint's lettered panels, Pixel's stepped borders and blocky icons.
- **Backgrounds** (`src/theme/backgrounds/`) paint the page and bring chrome colours that read on
  them.
- **Looks** (`src/theme/looks.ts`) pair a background with a style.

**Light and dark.** Every style, paper and background has `tokens: { light, dark }` (and a
swatch per mode), picked by Settings › Appearance › Mode, with Match system resolved through
`prefers-color-scheme`. `<html>` and each widget's `.skin-root` carry `data-mode="light|dark"`,
so the CSS textures, rules, glows and decorations switch too (`[data-mode='dark']` selectors or
CSS variables, never a fixed colour). The dark versions have their own character rather than
inverted colours:

| Look           | Light                                        | Dark                                         |
| -------------- | -------------------------------------------- | -------------------------------------------- |
| Plain          | Light theme cards                            | Dark theme cards                             |
| Cork board     | Natural cork, bright Post-its in pencil      | Charred cork, deep muted notes in pale ink   |
| Bullet journal | Cream dot grid, black ink, coral/mint washi  | Charcoal dot grid, pale gel pen, dusty washi |
| Blueprint      | Whiteprint: blue lines, red-pencil markup    | Prussian blue, white lines, yellow pencil    |
| Terminal       | Green-bar printout, ink in green/amber/blue  | Glowing phosphor and scanlines on black      |
| Swiss poster   | Newsprint, black rules, black frame, one red | Black poster, off-white rules, red frame     |
| Arcade         | Daytime sky with clouds, pastel 8-bit panels | Starry night, deep 8-bit panels              |

Index card (a style without its own look) is a white ruled card or a charcoal one with pale
rules. **High contrast** keeps overriding the page chrome (textures give way to black) and drops
each style's colours, so widgets keep their shape, fonts, tilt and decorations but use the
high-contrast palette, with glows and paper textures removed and a solid edge on every widget.

A unit test checks every style, paper and background in both modes for WCAG AA text contrast
(text and secondary text 4.5:1, accent and status colours 3:1, text on the accent 4.5:1).

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

All of the mock data (and the recorded fixtures in `src/canvas/fixtures/`, which are generated
from the mock) is invented. No real accounts, people or courses are in this repository.

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
pnpm test:themes     # the widget sweep in every widget style × light and dark, skipping
                     # unchanged styles
pnpm test:ui         # real UI driven with the mouse: presets, edit, drag, resize, add, settings,
                     # themes, every look in light and dark, page and per-widget styles
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

`test:themes` repeats the sweep in each widget style and each colour mode (on the realistic and
edge-case data). Each style/mode pair has a hash of the style's own files (which hold both its
variants), the mode, and everything all styles share (widgets, frame, global CSS, the lab, mock
data, lockfile). A pair that passed at its current hash is skipped, so editing one style
re-sweeps only that style, while changing a widget re-sweeps all of them. Passes are kept in
`.cache/theme-sweep.json` locally and in the Actions cache on CI. Use `--all` to ignore the cache
and `--modes=dark` to sweep one mode. The underlying `test:widgets` takes `--modes=light,dark`
(and `--skins=…`), or exact `--pairs=postit:dark,card:dark`; with `--shots`, galleries land in
`screenshots/lab/<scenario>/<style>/<mode>/`.

To render the product demo (captioned, human-paced, on the invented `showcase` term):

```sh
pnpm demo:video              # → screenshots/demo/tarpaulin-demo.mp4 (needs ffmpeg)
pnpm demo:video --fps=60 --workers=3
```

Rendering is deterministic rather than screen-recorded. The page runs on a virtual clock
(`scripts/virtual-time.js`) that advances exactly one frame per step, so pacing is perfect
whatever the machine. Unchanged frames are reused, the pointer is drawn by ffmpeg, and several
browsers render interleaved chunks in parallel. An 88-second video takes about 80 seconds.

Against a live account:

```sh
pnpm canvas:smoke    # calls every endpoint, prints counts and field coverage
pnpm canvas:record   # refreshes src/canvas/fixtures/canvas.json (names, emails, ids, codes,
                     # free text and grades are replaced with placeholders)
```
