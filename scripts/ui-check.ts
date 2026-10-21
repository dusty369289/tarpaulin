// End-to-end UI check: presets, edit mode, drag, resize, adding a widget, widget settings and
// themes, driven through the real UI with the mouse and keyboard. Every step waits on the app's
// settle signal instead of sleeping, and screenshots land in screenshots/ui/<scenario>/.
//
//   pnpm test:ui                      # mock Canvas (realistic), no credentials needed
//   pnpm test:ui --scenario=dense
//   pnpm test:ui --live               # against a running `pnpm dev` (real Canvas)
import { mkdirSync } from 'node:fs';
import type { Page } from 'playwright';
import { launch, startStack } from './browser';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const live = process.argv.includes('--live');
const scenario = live ? 'live' : (arg('scenario') ?? 'realistic');
const dir = `screenshots/ui/${scenario}`;
mkdirSync(dir, { recursive: true });

const stack = await startStack(live);
stack.useScenario(scenario);
const browser = await launch();
// Real motion preferences here: one of the checks is that animations actually run.
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));

let failures = 0;
const results: string[] = [];
async function step(name: string, fn: () => Promise<void>) {
  const started = Date.now();
  try {
    await fn();
    results.push(`✔ ${name} (${Date.now() - started}ms)`);
  } catch (e) {
    failures++;
    results.push(`✘ ${name}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    await page
      .screenshot({ path: `${dir}/FAILED-${name.replace(/\W+/g, '-')}.png` })
      .catch(() => {});
  }
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const settled = (p: Page = page) =>
  p.evaluate(() => window.__tarpaulin!.settled({ timeoutMs: 15_000 }));
const shot = (name: string) => page.screenshot({ path: `${dir}/${name}.png` });
const stored = () =>
  page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('tarpaulin.dashboard') ?? '{}').state as {
        pages: Array<{
          id: string;
          name: string;
          layout: Array<{ i: string; x: number; y: number; w: number; h: number }>;
          widgets: Record<string, { type: string; settings: Record<string, unknown> }>;
        }>;
        activePageId: string;
      },
  );
const activePage = async () => {
  const s = await stored();
  return s.pages.find((p) => p.id === s.activePageId)!;
};
/** Fails if any two widgets on the visible page overlap or any widget is off-screen to the side. */
async function assertGridLayout() {
  const boxes = await page.locator('[data-widget-id]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.getAttribute('data-widget-id'), x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  const vw = await page.evaluate(() => window.innerWidth);
  for (const [i, a] of boxes.entries()) {
    assert(
      a.w > 50 && a.h > 50,
      `widget ${a.id} is collapsed (${Math.round(a.w)}×${Math.round(a.h)})`,
    );
    assert(a.x >= 0 && a.x + a.w <= vw + 1, `widget ${a.id} is off-screen`);
    for (const b of boxes.slice(i + 1)) {
      const overlap =
        a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
      assert(!overlap, `widgets ${a.id} and ${b.id} overlap`);
    }
  }
}

/** Records whether any CSS transition/animation starts while `fn` runs. */
async function animates(fn: () => Promise<void>): Promise<number> {
  await page.evaluate(() => {
    (window as unknown as { __anim: number }).__anim = 0;
    document.addEventListener(
      'transitionstart',
      () => (window as unknown as { __anim: number }).__anim++,
      { capture: true },
    );
    document.addEventListener(
      'animationstart',
      () => (window as unknown as { __anim: number }).__anim++,
      { capture: true },
    );
  });
  await fn();
  return page.evaluate(() => (window as unknown as { __anim: number }).__anim);
}

await page.goto(stack.appUrl);
await page.evaluate(() => localStorage.clear());
await page.reload();

await step('dashboard loads with data', async () => {
  await page.getByRole('tab', { name: /Home/ }).waitFor({ timeout: 20_000 });
  await settled();
  const frames = await page.getByTestId('widget-frame').count();
  assert(frames >= 4, `expected the starter widgets, found ${frames}`);
  assert((await page.getByRole('status').count()) === 0, 'still loading');
  await assertGridLayout();
  await shot('01-home');
});

for (const [i, preset] of ['Deadline Focus', 'Weekly Planner', 'Minimal'].entries()) {
  await step(`preset: ${preset}`, async () => {
    await page.getByRole('button', { name: 'Add page' }).click();
    await page.getByRole('button', { name: new RegExp(preset) }).click();
    await settled();
    assert(
      await page.getByRole('tab', { name: new RegExp(preset), selected: true }).isVisible(),
      'preset tab not selected',
    );
    assert(
      (await page.getByText(/hit a problem|Couldn’t load/).count()) === 0,
      'a widget shows an error',
    );
    await assertGridLayout();
    await shot(`0${i + 2}-preset-${preset.toLowerCase().replace(/ /g, '-')}`);
  });
}

await step('edit mode shows handles and controls', async () => {
  await page.getByRole('tab', { name: /Home/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await settled();
  assert((await page.locator('.widget-drag-handle').count()) >= 4, 'no drag handles');
  assert((await page.locator('.react-resizable-handle').count()) >= 4, 'no resize handles');
  assert(
    await page.getByRole('button', { name: 'Add widget' }).isVisible(),
    'no Add widget button',
  );
  await shot('05-edit-mode');
});

await step('drag a widget to a new spot (animated)', async () => {
  const before = await activePage();
  const first = before.layout.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0];
  const handle = page.locator(`[data-widget-id="${first.i}"] .widget-drag-handle`);
  const box = (await handle.boundingBox())!;
  const count = await animates(async () => {
    await page.mouse.move(box.x + 30, box.y + box.height / 2);
    await page.mouse.down();
    for (let k = 1; k <= 12; k++)
      await page.mouse.move(box.x + 30 + k * 45, box.y + box.height / 2 + k * 30);
    await page.mouse.up();
    await settled();
  });
  const after = (await activePage()).layout.find((l) => l.i === first.i)!;
  assert(after.x !== first.x || after.y !== first.y, `widget did not move (${first.x},${first.y})`);
  assert(count > 0, 'no transition ran while widgets reflowed');
  await assertGridLayout();
  await shot('06-after-drag');
});

let midDragSelection = '';
await step('resize a widget (animated)', async () => {
  const before = await activePage();
  const target = before.layout[0];
  const handle = page.locator(`[data-widget-id="${target.i}"] .react-resizable-handle-se`);
  const box = (await handle.boundingBox())!;
  const count = await animates(async () => {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(box.x + k * 22, box.y + k * 18);
    // Text selection shows up mid-drag (and clears on release), so check before letting go.
    midDragSelection = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    await page.mouse.up();
    await settled();
  });
  const after = (await activePage()).layout.find((l) => l.i === target.i)!;
  assert(after.w > target.w || after.h > target.h, `size unchanged (${target.w}×${target.h})`);
  assert(count > 0, 'no transition ran on resize');
  assert(midDragSelection === '', `resizing selected text: "${midDragSelection.slice(0, 40)}"`);
  await assertGridLayout();
  await shot('07-after-resize');
});

await step('add a widget from the picker (pops in)', async () => {
  const before = Object.keys((await activePage()).widgets).length;
  await page.getByRole('button', { name: 'Add widget' }).click();
  await page.getByRole('dialog', { name: 'Add a widget' }).waitFor();
  const count = await animates(async () => {
    await page.getByRole('button', { name: /^Notes/ }).click();
    await settled();
  });
  const widgets = (await activePage()).widgets;
  assert(Object.keys(widgets).length === before + 1, 'widget count did not increase');
  assert(
    Object.values(widgets).some((w) => w.type === 'notes'),
    'no notes widget',
  );
  assert(count > 0, 'new widget did not animate in');
  await assertGridLayout();
});

await step('change a widget setting from its panel', async () => {
  const page0 = await activePage();
  const id = Object.entries(page0.widgets).find(([, w]) => w.type === 'due-soon')![0];
  await page
    .locator(`[data-widget-id="${id}"]`)
    .getByRole('button', { name: /^Settings for/ })
    .click();
  const panel = page.getByRole('dialog', { name: /settings$/ });
  await panel.waitFor();
  await panel.getByLabel('Title').fill('This fortnight');
  await panel.getByLabel('Group by').selectOption('course');
  await settled();
  await shot('08-settings-panel');
  await page.keyboard.press('Escape');
  await settled();
  const w = (await activePage()).widgets[id];
  assert(
    w.settings.title === 'This fortnight' && w.settings.groupBy === 'course',
    'settings not saved',
  );
  assert(
    await page.locator(`[data-widget-id="${id}"] h2`, { hasText: 'This fortnight' }).isVisible(),
    'title not shown',
  );
});

await step('leave edit mode', async () => {
  await page.getByRole('button', { name: 'Done' }).click();
  await settled();
  assert((await page.locator('.widget-drag-handle').count()) === 0, 'handles still visible');
});

for (const theme of ['dark', 'high-contrast', 'light'] as const) {
  await step(`theme: ${theme}`, async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('combobox').first().selectOption(theme);
    await settled();
    const applied = await page.evaluate(() => document.documentElement.dataset.theme);
    assert(applied === theme, `theme is ${applied}`);
    await page.getByRole('button', { name: 'Dashboard' }).click();
    await settled();
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert(theme !== 'dark' || bg === 'rgb(15, 17, 23)', `dark background is ${bg}`);
    await shot(`09-theme-${theme}`);
  });
}

await step('layout survives a reload', async () => {
  const before = await activePage();
  await page.reload();
  await page.getByRole('tab', { name: /Home/ }).waitFor();
  await settled();
  const after = await activePage();
  assert(
    JSON.stringify(after.layout) === JSON.stringify(before.layout),
    'layout changed after reload',
  );
});

if (stack.mock) {
  await step('read-only: no writes reached Canvas', async () => {
    assert(stack.mock!.writes.length === 0, JSON.stringify(stack.mock!.writes));
  });
}
await step('no page errors', async () => assert(errors.length === 0, errors.join(' | ')));

console.log(results.join('\n'));
console.log(
  failures ? `\n${failures} step(s) failed` : `\nAll steps passed. Screenshots in ${dir}/`,
);
await browser.close();
await stack.close();
process.exit(failures ? 1 : 0);
