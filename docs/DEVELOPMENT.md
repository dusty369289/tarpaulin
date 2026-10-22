# Developing Tarpaulin

How to build, run and test Tarpaulin, and how it's put together. For what the app does and how to
install it, see the [README](../README.md).

## Running it locally

```sh
pnpm install
pnpm tauri dev      # desktop app
```

On Linux, Tauri needs `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libssl-dev libdbus-1-dev pkg-config`.

Then connect a Canvas account in the app (see [Connect your Canvas account](../README.md#connect-your-canvas-account)),
or use the mock Canvas described under [Development without (or with) a Canvas account](#development-without-or-with-a-canvas-account).

## Contributing and CI

Changes go to `main` through pull requests. `.github/workflows/ci.yml` runs on every pull request
into `main` and on every push to `main`: format, lint, typecheck, unit tests, build, the widget
sweeps, the theme sweep, the UI check and the Rust tests. On pull requests the slow parts only
run when they can be affected: the widget and theme sweeps when widget, theme, Canvas-data or
mock code changes, Rust tests when `src-tauri/` changes, and docs-only changes skip it all.
Pushes to `main` always run everything. A final **CI passed** job sums it up, and
`main` requires it, so nothing merges until it's green.

## Cutting a release

```sh
pnpm release:version 0.2.0         # sets the version in package.json, Cargo.toml and tauri.conf.json
git commit -am "Release 0.2.0"     # then merge it into main through a pull request
git tag v0.2.0 origin/main && git push origin v0.2.0
```

Instead of pushing the tag, you can open **Actions › Release › Run workflow** on `main` and enter
`0.2.0`. That run creates the `v0.2.0` tag itself and builds it.

The tag triggers `.github/workflows/release.yml`, which checks that the versions match the tag, runs
the unit tests, builds every platform, publishes the release and uploads `latest.json` for the
updater. It also uploads copies of the installers under names without the version
(`Tarpaulin-windows-x64-setup.exe`, `Tarpaulin-macos-apple-silicon.dmg`, `Tarpaulin-linux-x64.AppImage`
and so on), which the README's download links use through `releases/latest/download/`. It needs a repository secret named `TAURI_SIGNING_PRIVATE_KEY` (and
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
- **Canvas content is untrusted.** Item bodies are stored as Canvas sent them and sanitised
  (DOMPurify, a strict allowlist) every time they're shown: no scripts, styles, forms, frames or
  event handlers survive, and inline styles give way to our CSS. Links are inert until clicked:
  Canvas links open on your Canvas host, other sites only after a prompt. Canvas file images are
  fetched as signed URLs through the API, since their normal URLs need a browser login. The edge
  mock scenario carries a hostile body that the UI check opens to prove nothing runs.
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

| Command                            | Data source                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev:mock`                    | The local mock Canvas (start it with `pnpm canvas:mock`). Pick a dataset with `MOCK_SCENARIO=realistic` (default), `showcase` (a busy, tidy term for demos), `dense`, `edge`, `empty` or `flaky`. Token health: `expiring-10d` (any number of days), `expired` (rejected); the others never expire. It always sends the mock token `mock-<scenario>`, never a `CANVAS_TOKEN` you have exported. |
| `pnpm dev`                         | Your real Canvas through a GET-only dev proxy. Set `CANVAS_BASE_URL` and `CANVAS_TOKEN` (see `.env.example`). The token stays server-side.                                                                                                                                                                                                                                                      |
| `VITE_TRANSPORT=fixtures pnpm dev` | Anonymised recorded responses.                                                                                                                                                                                                                                                                                                                                                                  |

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
pnpm test:ui:passes  # the smallest window, dialogs by keyboard, a flaky or missing network
pnpm test:all        # all of the above
pnpm lint && pnpm typecheck && pnpm build
cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo test
```

`test:ui:passes` marks the checks that wait on a fix still being made as pending, with who owns
it: they run and are reported but don't fail until their note is removed (`--strict` fails them
too).

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
variants), the mode, and everything all styles share: every file the lab page imports (found by
following imports, so new helpers are covered without a list to update), the lab scripts, mock
data and the lockfile (`--inputs` lists them). A pair that passed at its current hash is skipped, so editing one style
re-sweeps only that style, while changing a widget re-sweeps all of them. Passes are kept in
`.cache/theme-sweep.json` locally and in the Actions cache on CI. Use `--all` to ignore the cache
and `--modes=dark` to sweep one mode. The underlying `test:widgets` takes `--modes=light,dark`
(and `--skins=…`), or exact `--pairs=postit:dark,card:dark`; with `--shots`, galleries land in
`screenshots/lab/<scenario>/<style>/<mode>/`. Each style is also checked for text contrast
against the background it actually renders on (WCAG AA, 4.5:1), and for text under 11px
(unless its letters are as tall as 11px Inter's, as with the pixel fonts); any finding fails the
sweep. `test:widgets --contrast` only reports them.

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

## The README's pictures

The screenshots, the looks carousel and the facts row in the README are rendered from the real app
by `pnpm readme:assets` (`scripts/readme-assets.ts`), against the mock Canvas's invented `showcase`
term, into `.cache/readme/`. `.github/workflows/readme-assets.yml` runs it on every merge to `main`
that touches the app, and after every release (for the new version and installer size), and
force-pushes the result to the `readme-assets` branch. That branch only ever holds the latest
render, and the README's images point at it, so refreshing them never needs a pull request.
