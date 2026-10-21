// Sweeps every widget through a matrix of grid sizes and setting variants, against every mock
// Canvas scenario, and fails on layout problems: horizontal scroll, elements escaping the frame,
// clipped or squashed text, and fit-only widgets (clock, countdown) that need to scroll.
//
// It starts its own mock Canvas and Vite server (no credentials, no network). The whole matrix
// for a scenario runs inside the page in one evaluate() call, waiting on the app's settle signal
// between sizes, so it runs as fast as the browser can lay out — no fixed sleeps.
//
//   pnpm test:widgets                      # all scenarios
//   pnpm test:widgets --scenario=edge      # one scenario
//   pnpm test:widgets --only=calendar      # one widget
//   pnpm test:widgets --shots              # also write galleries to screenshots/lab/<scenario>/
//                                          # (<widget>.png, then <widget>.<n>.png per variant)
//   pnpm test:widgets --live               # use a running `pnpm dev` (real Canvas) instead
//   pnpm test:widgets --font="DejaVu Sans" # force a font, to reproduce another OS's metrics
//   pnpm test:widgets --skins=postit,pixel # sweep in these widget styles (default: card only)
//   pnpm test:widgets --report=out.json    # write {style: failures} for scripts/theme-sweep.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { SCENARIOS } from '../mock-canvas/world';
import type { LabCase, LabReport } from '../src/dev/labTypes';
import { launch, startStack } from './browser';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const shots = process.argv.includes('--shots');
const live = process.argv.includes('--live');
const only = arg('only');
// Force a font (e.g. --font="DejaVu Sans") to reproduce another platform's fallback metrics.
const font = arg('font');
const scenarios: string[] = live
  ? ['live']
  : arg('scenario')
    ? arg('scenario')!.split(',')
    : SCENARIOS;
// Widget styles to sweep. '' is the page default, i.e. the plain card style.
const skins: string[] = arg('skins')?.split(',') ?? [''];
const reportPath = arg('report');
const failuresBySkin: Record<string, number> = Object.fromEntries(
  skins.map((s) => [s || 'card', 0]),
);

const WIDTHS = [2, 3, 4, 5, 6, 8, 10, 12];
const HEIGHTS = [2, 3, 4, 5, 6, 9, 12];

// Settings that change layout substantially get their own sweep.
const VARIANTS: Record<string, Array<Record<string, unknown>>> = {
  calendar: [{ view: 'month' }, { view: 'week' }, { view: 'agenda' }],
  'course-list': [{ layout: 'list', showTerm: true, showScore: true }, { layout: 'tiles' }],
  grades: [{ display: 'both' }, { showBars: false, sortBy: 'score' }],
  'due-soon': [
    {},
    { groupBy: 'course', showPoints: true, density: 'compact' },
    { density: 'spacious', include: 'all', daysAhead: 60 },
  ],
  countdown: [
    {},
    {
      target: 'custom',
      customLabel: 'A very long custom countdown label that keeps going',
      customDate: '2027-06-01T09:00',
      showSeconds: true,
    },
  ],
  clock: [{}, { showSeconds: true, align: 'center', name: 'Bartholomew-Alexandria' }],
  announcements: [{}, { showAuthor: true, previewLines: 6, days: 90 }],
  notes: [{}],
  todo: [{}, { source: 'local' }],
};

const LONG_NOTE =
  '# Week plan\n- [x] Read **chapter 4** of the ridiculously-long-unbroken-reading-list-name-without-spaces\n- [ ] Essay draft\n\nhttps://example.com/a/very/long/url/that/should/wrap/instead/of/spilling/out/of/the/widget\n\n> quote';
const LONG_TODO = {
  items: [
    {
      id: 'a',
      text: 'Email the module lead about the extension request for the comparative essay',
      done: false,
    },
    {
      id: 'b',
      text: 'Supercalifragilisticexpialidocious-unbroken-word-to-test-wrapping',
      done: true,
    },
    { id: 'c', text: 'Print notes', done: false },
  ],
};

const sampleData = (type: string) =>
  type === 'notes' ? { text: LONG_NOTE } : type === 'todo' ? LONG_TODO : undefined;

const stack = await startStack(live);
const browser = await launch();
const page = await browser.newPage({
  viewport: { width: 1400, height: 1100 },
  reducedMotion: 'reduce',
});
const pageErrors: string[] = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

let failed = 0;
for (const scenario of scenarios) {
  stack.useScenario(scenario);
  // Fresh storage per scenario so the persisted query cache can't leak between them.
  await page.goto(`${stack.appUrl}/#/lab`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__tarpaulinLab), null, { timeout: 30_000 });
  if (font)
    await page.addStyleTag({ content: `:root, body, * { font-family: "${font}" !important; }` });

  const types = (await page.evaluate(() => window.__tarpaulinLab!.types)).filter(
    (t) => !only || t === only,
  );
  for (const skin of skins) {
    const name = skin || 'card';
    const label = skins.length > 1 || skin ? `${scenario}/${name}` : scenario;
    const cases: LabCase[] = [];
    for (const type of types) {
      const min = await page.evaluate((t: string) => window.__tarpaulinLab!.minSize(t), type);
      for (const variant of VARIANTS[type] ?? [{}]) {
        const settings = skin ? { ...variant, style: skin } : variant;
        for (const w of WIDTHS.filter((w) => w >= min.w)) {
          for (const h of HEIGHTS.filter((h) => h >= min.h)) {
            cases.push({ type, w, h, settings, data: sampleData(type) });
          }
        }
      }
      // Edit-mode header (grip + three buttons) at the smallest width.
      cases.push({
        type,
        w: min.w,
        h: Math.max(min.h, 3),
        editMode: true,
        settings: skin ? { style: skin } : undefined,
      });
    }

    const started = Date.now();
    const reports: LabReport[] = await page.evaluate((c) => window.__tarpaulinLab!.sweep(c), cases);
    const elapsed = Date.now() - started;
    const failures = reports.filter((r) => r.issues.length);
    failed += failures.length;
    failuresBySkin[name] += failures.length;
    for (const r of failures) {
      const variant =
        r.settings && Object.keys(r.settings).length ? ` ${JSON.stringify(r.settings)}` : '';
      console.log(`✘ [${label}] ${r.type} ${r.w}×${r.h}${r.editMode ? ' (edit)' : ''}${variant}`);
      for (const i of r.issues) console.log(`    ${i.kind}: ${i.detail}`);
    }
    const settle = reports.map((r) => r.settleMs).sort((a, b) => a - b);
    console.log(
      `${failures.length ? '✘' : '✔'} ${label}: ${reports.length} renders, ${failures.length} with issues, ${elapsed}ms ` +
        `(settle median ${settle[Math.floor(settle.length / 2)]}ms, p95 ${settle[Math.floor(settle.length * 0.95)]}ms)`,
    );

    if (shots) {
      const dir = `screenshots/lab/${scenario}${skin ? `/${skin}` : ''}`;
      mkdirSync(dir, { recursive: true });
      for (const type of types) {
        // <type>.png with default settings, then <type>.<n>.png for each other swept variant.
        const variants = (VARIANTS[type] ?? [{}]).filter((v) => Object.keys(v).length);
        for (const [i, settings] of [{}, ...variants].entries()) {
          const data = sampleData(type);
          const lab = new URLSearchParams({ gallery: type, skin });
          if (i > 0 || data) lab.set('case', JSON.stringify({ settings, data }));
          await page.goto(`${stack.appUrl}/?gallery=${type}&v=${i}#/lab?${lab}`);
          await page.waitForSelector('#lab-gallery');
          await page.evaluate(() => window.__tarpaulin!.settled());
          await page
            .locator('#lab-gallery')
            .screenshot({ path: `${dir}/${type}${i ? `.${i}` : ''}.png` });
        }
      }
      await page.goto(`${stack.appUrl}/#/lab`);
      await page.waitForFunction(() => Boolean(window.__tarpaulinLab), null, { timeout: 30_000 });
      if (font)
        await page.addStyleTag({
          content: `:root, body, * { font-family: "${font}" !important; }`,
        });
    }
  }
}
if (reportPath) writeFileSync(reportPath, JSON.stringify(failuresBySkin, null, 2));

if (stack.mock) {
  const writes = stack.mock.writes;
  console.log(
    writes.length
      ? `✘ ${writes.length} write request(s) reached Canvas: ${JSON.stringify(writes)}`
      : `✔ read-only: ${stack.mock.requests.length} requests, none of them writes`,
  );
  if (writes.length) failed++;
}
if (pageErrors.length) {
  console.log(`✘ ${pageErrors.length} page error(s):\n  ${[...new Set(pageErrors)].join('\n  ')}`);
  failed++;
}

await browser.close();
await stack.close();
process.exit(failed ? 1 : 0);
