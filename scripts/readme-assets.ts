// Renders the README's pictures and its "at a glance" facts from the real app, running against
// the mock Canvas's invented `showcase` term, so no real account ever appears in them.
//
//   pnpm readme:assets               # → .cache/readme/
//
// CI (.github/workflows/readme-assets.yml) runs this on every merge to main and after each
// release, and force-pushes the output to the `readme-assets` branch, which README.md links to.
// Nothing here is committed to main, so a refresh never needs a pull request.
//
// Optional inputs: TEST_COUNT (the number of unit tests, from vitest's JSON report) and GH_TOKEN
// (to read the latest release's installer sizes). Missing ones are left out of the facts.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { launch, startStack } from './browser';
import { findAsset } from './release-files';

const OUT = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1] ?? '.cache/readme';
const RAW = join(OUT, 'raw');
// Tall enough for the showcase pages, with no empty band under them.
const SIZE = { width: 1440, height: 780 };

type Mode = 'light' | 'dark';
interface DemoWindow {
  __tarpaulinDemo: {
    setMode: (theme: Mode) => void;
    applyLook: (id: string) => void;
    setPages: (pages: unknown[]) => void;
  };
}

// Pages laid out to show the dashboard at its best (built like presets, see src/dev/demoHooks.ts).
const PAGES = [
  {
    name: 'This week',
    icon: 'calendar',
    widgets: [
      { type: 'clock', x: 0, y: 0, w: 5, h: 3 },
      { type: 'countdown', x: 5, y: 0, w: 3, h: 3 },
      { type: 'grades', x: 8, y: 0, w: 4, h: 8 },
      { type: 'calendar', x: 0, y: 3, w: 8, h: 11, settings: { view: 'week' } },
      { type: 'due-soon', x: 8, y: 8, w: 4, h: 6, settings: { daysAhead: 7, groupBy: 'none' } },
    ],
  },
  {
    name: 'Month',
    icon: 'sparkles',
    widgets: [
      { type: 'calendar', x: 0, y: 0, w: 8, h: 14, settings: { view: 'month' } },
      { type: 'todo', x: 8, y: 0, w: 4, h: 7, settings: { source: 'both' } },
      { type: 'announcements', x: 8, y: 7, w: 4, h: 7 },
    ],
  },
];

// The looks gallery: each look in the mode it's at its best in.
const LOOKS: [id: string, mode: Mode, name: string][] = [
  ['cork', 'light', 'Cork board'],
  ['journal', 'light', 'Bullet journal'],
  ['blueprint', 'dark', 'Blueprint'],
  ['terminal', 'dark', 'Terminal'],
  ['swiss', 'light', 'Swiss poster'],
  ['arcade', 'dark', 'Arcade'],
];

const ffmpeg = (args: string[]) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);

/** Waits until nothing is loading and two frames have painted. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !document.querySelector('[role="status"] .animate-spin'));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))),
  );
  await page.waitForTimeout(400);
}

async function shot(page: Page, name: string, width: number, quality = 82) {
  const png = join(RAW, `${name}.png`);
  await page.screenshot({ path: png });
  ffmpeg([
    '-i',
    png,
    '-vf',
    `scale=${width}:-1:flags=lanczos`,
    '-quality',
    String(quality),
    join(OUT, `${name}.webp`),
  ]);
  return png;
}

function count(file: string, pattern: RegExp): number {
  return readFileSync(file, 'utf8').match(pattern)?.length ?? 0;
}

/** Installer sizes from the latest release, in MB, or null without a token or network. */
async function installerSize(): Promise<number | null> {
  const token = process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY ?? 'dusty369289/tarpaulin';
  if (!token) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const release = (await res.json()) as { assets: { name: string; size: number }[] };
    const exe = findAsset(release.assets, 'windows-x64-setup.exe');
    return exe ? exe.size / 1024 / 1024 : null;
  } catch {
    return null;
  }
}

/** A row of figures, drawn as SVG so the README can swap it for the reader's theme. */
function factsSvg(facts: [string, string][], mode: Mode): string {
  const ink = mode === 'dark' ? '#e6e8ee' : '#1b1f2a';
  const muted = mode === 'dark' ? '#9aa1b2' : '#5b6275';
  const line = mode === 'dark' ? '#303648' : '#d9dce5';
  const cell = 168;
  const width = cell * facts.length;
  const cells = facts
    .map(([value, label], i) => {
      const x = i * cell + cell / 2;
      const divider = i
        ? `<line x1="${i * cell}" y1="18" x2="${i * cell}" y2="78" stroke="${line}"/>`
        : '';
      return `${divider}<text x="${x}" y="52" text-anchor="middle" font-size="30" font-weight="700" fill="${ink}">${value}</text>
<text x="${x}" y="76" text-anchor="middle" font-size="13" fill="${muted}">${label}</text>`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="96" viewBox="0 0 ${width} 96" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif">
<title>${facts.map(([v, l]) => `${v} ${l}`).join(', ')}</title>
${cells}
</svg>
`;
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(RAW, { recursive: true });

  const stack = await startStack(false);
  stack.useScenario('showcase');
  const browser = await launch({ uncapped: false });
  try {
    const context = await browser.newContext({
      viewport: SIZE,
      deviceScaleFactor: 2,
      timezoneId: 'Europe/London',
      colorScheme: 'light',
    });
    const page = await context.newPage();
    const setMode = (mode: Mode) =>
      page.evaluate((m) => (window as unknown as DemoWindow).__tarpaulinDemo.setMode(m), mode);

    // Connect and get through first-run setup, as a new user would.
    await page.goto(`${stack.appUrl}/?demo`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByLabel('Canvas address').fill('canvas.uni.edu');
    await page.getByLabel('Access token').fill('showcase');
    await page.getByRole('button', { name: 'Test & connect' }).click();
    await page.getByRole('heading', { name: 'Make it yours' }).waitFor();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('tab', { name: /Home/ }).waitFor();
    await page.evaluate(
      (pages) => (window as unknown as DemoWindow).__tarpaulinDemo.setPages(pages),
      PAGES,
    );
    await page.evaluate(() =>
      Promise.all([...document.fonts].map((f) => f.load().catch(() => {}))),
    );
    await settle(page);

    // The hero, in both modes.
    for (const mode of ['light', 'dark'] as const) {
      await setMode(mode);
      await settle(page);
      await shot(page, `hero-${mode}`, 1600);
    }

    // Reading an assignment without leaving the app.
    await setMode('light');
    await settle(page);
    await page.getByTestId('due-item').first().getByRole('button').first().click();
    await page.getByTestId('reader-content').waitFor();
    await settle(page);
    await shot(page, 'reader', 1200);
    await page.keyboard.press('Escape');

    // The month, with a busy day picked.
    await page.getByRole('tab', { name: /Month/ }).click();
    await settle(page);
    // The busiest day of this month (day buttons are labelled "Thursday 22 October, 4 items").
    const busiest = await page.evaluate(() => {
      const month = new Date().toLocaleDateString('en-GB', { month: 'long' });
      let best: { label: string; n: number } | null = null;
      for (const b of document.querySelectorAll('[data-widget-type="calendar"] [data-day]')) {
        const label = b.getAttribute('aria-label') ?? '';
        const n = Number(label.match(/, (\d+) items?$/)?.[1] ?? 0);
        if (label.includes(month) && (!best || n > best.n)) best = { label, n };
      }
      return best?.label;
    });
    if (busiest) await page.getByRole('button', { name: busiest, exact: true }).click();
    await settle(page);
    await shot(page, 'month', 1200);
    await page.getByRole('tab', { name: /This week/ }).click();

    // Every look, as stills and as one looping carousel.
    const frames: string[] = [];
    for (const [id, mode] of LOOKS) {
      await page.evaluate(
        ([l, m]) => {
          const d = (window as unknown as DemoWindow).__tarpaulinDemo;
          d.setMode(m as Mode);
          d.applyLook(l);
        },
        [id, mode],
      );
      await settle(page);
      frames.push(await shot(page, `look-${id}`, 960));
    }
    carousel(frames, join(OUT, 'looks.webp'));
  } finally {
    await browser.close();
    await stack.close();
  }

  // Facts, from the source and (where available) CI and the latest release.
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  const widgets = count('src/widgets/registry.ts', /^\s{2}[A-Z]\w+,$/gm);
  const looks = count('src/theme/looks.ts', /^\s+id: '/gm);
  const facts: [string, string][] = [
    [`v${pkg.version}`, 'latest version'],
    [String(widgets), 'widgets'],
    [String(looks), 'looks, light and dark'],
    ['6', 'platform builds'],
  ];
  const mb = await installerSize();
  if (mb) facts.push([`${mb.toFixed(1)} MB`, 'Windows installer']);
  if (process.env.TEST_COUNT)
    facts.push([Number(process.env.TEST_COUNT).toLocaleString('en'), 'unit tests']);
  for (const mode of ['light', 'dark'] as const)
    writeFileSync(join(OUT, `facts-${mode}.svg`), factsSvg(facts, mode));

  rmSync(RAW, { recursive: true, force: true });
  console.log(`README assets in ${OUT}: ${facts.map(([v, l]) => `${v} ${l}`).join(' · ')}`);
}

/** Holds each frame, dissolves into the next, and loops: an animated WebP. */
function carousel(frames: string[], out: string) {
  const HOLD = 2.2;
  const FADE = 0.6;
  const inputs = frames.flatMap((f) => ['-loop', '1', '-t', String(HOLD + FADE), '-i', f]);
  // Back to the first frame at the end, so the loop has no jump.
  inputs.push('-loop', '1', '-t', String(HOLD), '-i', frames[0]);
  const n = frames.length + 1;
  const scale = [...Array(n).keys()].map(
    (i) => `[${i}:v]scale=960:-1:flags=lanczos,fps=12,format=yuv420p[s${i}]`,
  );
  const fades: string[] = [];
  let prev = 's0';
  // Each dissolve starts HOLD seconds after the previous one: every clip adds HOLD of its own.
  for (let i = 1; i < n; i++) {
    const label = i === n - 1 ? 'out' : `x${i}`;
    fades.push(
      `[${prev}][s${i}]xfade=transition=fade:duration=${FADE}:offset=${(HOLD * i).toFixed(2)}[${label}]`,
    );
    prev = label;
  }
  ffmpeg([
    ...inputs,
    '-filter_complex',
    [...scale, ...fades].join(';'),
    '-map',
    '[out]',
    '-loop',
    '0',
    '-quality',
    '70',
    '-compression_level',
    '6',
    out,
  ]);
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
