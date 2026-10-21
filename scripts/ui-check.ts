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

await step('first launch: pick a look (plain by default) and layout', async () => {
  await page.getByRole('heading', { name: 'Make it yours' }).waitFor({ timeout: 20_000 });
  await settled();
  const checked = await page.getByRole('radio', { checked: true }).allTextContents();
  assert(
    checked.some((t) => t.startsWith('Match system')),
    `default look is not plain/system: ${checked}`,
  );
  assert(
    checked.some((t) => t.startsWith('Deadline Focus')),
    'default layout is not Deadline Focus',
  );
  await shot('00-setup');
  // Choices apply live.
  await page.getByRole('radio', { name: /^Dark/ }).click();
  await settled();
  assert(
    (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark',
    'Dark did not apply live',
  );
  await page.getByRole('radio', { name: /^Match system/ }).click();
  await page.getByTestId('look-cork').click();
  await settled();
  assert(
    (await page.evaluate(() => document.documentElement.dataset.background)) === 'cork',
    'Cork board did not apply live',
  );
  await shot('00-setup-cork');
  await page.getByTestId('look-plain').click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await settled();
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('tarpaulin.settings') ?? '{}').state,
  );
  assert(
    saved?.onboarded === true &&
      saved?.theme === 'system' &&
      saved?.background === 'plain' &&
      saved?.widgetStyle === 'card',
    `setup not saved: ${JSON.stringify(saved)}`,
  );
});

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

/** The widget style each widget on screen renders in. */
const skinsOnScreen = () =>
  page
    .locator('[data-widget-id] .skin-root')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.skin));

const LOOKS = [
  ['cork', 'cork', 'postit'],
  ['journal', 'dots', 'journal'],
  ['blueprint', 'blueprint', 'blueprint'],
  ['terminal', 'crt', 'terminal'],
  ['swiss', 'poster', 'swiss'],
  ['arcade', 'night-sky', 'pixel'],
  ['plain', 'plain', 'card'],
] as const;
for (const [look, background, skin] of LOOKS) {
  await step(`look: ${look}`, async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByTestId(`look-${look}`).click();
    await page.getByRole('button', { name: 'Dashboard' }).click();
    await settled();
    const applied = await page.evaluate(() => document.documentElement.dataset.background);
    assert(applied === background, `background is ${applied}`);
    const skins = await skinsOnScreen();
    assert(
      skins.length > 0 && skins.every((s) => s === skin),
      `widgets render as ${[...new Set(skins)]}`,
    );
    await assertGridLayout();
    await shot(`10-look-${look}`);
  });
}

await step('page style: own background, one widget restyled, then applied to all', async () => {
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Style' }).click();
  const drawer = page.getByRole('dialog', { name: /^Style/ });
  await drawer.waitFor();
  await drawer.getByTestId('background-dots').click();
  await settled();
  assert(
    (await page.evaluate(() => document.documentElement.dataset.background)) === 'dots',
    'page background did not apply',
  );
  await page.keyboard.press('Escape');
  await settled();

  const page0 = await activePage();
  const id = page0.layout[0].i;
  await page
    .locator(`[data-widget-id="${id}"]`)
    .getByRole('button', { name: /^Settings for/ })
    .click();
  const panel = page.getByRole('dialog', { name: /settings$/ });
  await panel.waitFor();
  await panel.getByTestId('skin-postit').click();
  await panel.getByRole('radio', { name: 'Pink' }).click();
  await settled();
  const one = page.locator(`[data-widget-id="${id}"] .skin-root`);
  assert(
    (await one.getAttribute('data-skin')) === 'postit' &&
      (await one.getAttribute('data-paper')) === 'pink',
    'widget style did not apply',
  );
  let skins = await skinsOnScreen();
  assert(skins.filter((s) => s === 'postit').length === 1, `others changed too: ${skins}`);
  await shot('11-widget-own-style');
  await panel.getByRole('button', { name: 'Apply to all on this page' }).click();
  await settled();
  skins = await skinsOnScreen();
  assert(
    skins.every((s) => s === 'postit'),
    `not applied to all: ${skins}`,
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Done' }).click();
  await settled();
  await assertGridLayout();
  await shot('12-page-style');
  const stored0 = await activePage();
  assert(
    (stored0 as unknown as { background?: string }).background === 'dots',
    'page background not saved',
  );
});

await step('back to plain everywhere', async () => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('look-plain').click();
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await settled();
  assert(
    (await page.evaluate(() => document.documentElement.dataset.background)) === 'plain',
    'page override survived applying a look',
  );
  const skins = await skinsOnScreen();
  assert(
    skins.every((s) => s === 'card'),
    `widgets still styled: ${skins}`,
  );
});

// ---- Top bar: styles and fold-away -------------------------------------------------------
const bar = () => page.locator('header.app-bar');
const barClip = { x: 0, y: 0, width: 1440, height: 160 };
const barState = () =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('header.app-bar')!;
    const r = el.getBoundingClientRect();
    const { barStyle, fold, folded } = el.dataset;
    return { barStyle, fold, folded, top: r.top, bottom: r.bottom };
  });
/** Waits until the bar is (or isn't) folded and has finished sliding. */
async function barFolded(folded: boolean) {
  await page.waitForFunction(
    (want) => {
      const el = document.querySelector<HTMLElement>('header.app-bar');
      if (!el || el.dataset.folded !== String(want)) return false;
      const r = el.getBoundingClientRect();
      return want ? r.bottom <= 0 : r.top >= 0;
    },
    folded,
    { timeout: 5_000 },
  );
  await settled();
}
async function setBar(patch: { style?: 'frosted' | 'basic'; fold?: boolean }) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  if (patch.style) await page.getByLabel('Top bar style').selectOption(patch.style);
  if (patch.fold !== undefined) {
    const sw = page.getByRole('switch', { name: 'Fold away the top bar' });
    await sw.setChecked(patch.fold, { force: true });
  }
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await page.getByRole('tab', { name: /Home/ }).waitFor();
  await settled();
}

await step('top bar: frosted and basic both render', async () => {
  for (const style of ['basic', 'frosted'] as const) {
    await setBar({ style });
    const s = await barState();
    assert(s.barStyle === style, `bar style is ${s.barStyle}`);
    const blur = await bar()
      .locator('.app-bar-surface')
      .evaluate((el) => getComputedStyle(el).backdropFilter);
    assert(
      style === 'frosted' ? blur.includes('blur') : blur === 'none',
      `${style} bar backdrop is ${blur}`,
    );
    for (const name of ['Edit', 'Refresh from Canvas', 'Settings'])
      assert(
        await page.getByRole('button', { name, exact: true }).isVisible(),
        `${name} not visible`,
      );
    await page.screenshot({ path: `${dir}/13-bar-${style}.png`, clip: barClip });
  }
});

await step('top bar: fold away hides, reveals on pointer, focus and edit mode', async () => {
  await setBar({ fold: true });
  const widgetTop = () =>
    page
      .locator('[data-widget-id]')
      .evaluateAll((els) => Math.min(...els.map((el) => el.getBoundingClientRect().top)));
  // Folded: out of view, and the grid has the room the bar used to take.
  await page.mouse.move(720, 600);
  await barFolded(true);
  const topFolded = await widgetTop();
  assert(topFolded < 40, `grid did not take the freed space (first widget at ${topFolded}px)`);
  await page.screenshot({ path: `${dir}/14-bar-folded.png`, clip: barClip });

  // Pointer at the top edge brings it back, over the page (nothing below moves).
  await page.mouse.move(720, 3);
  await barFolded(false);
  assert((await widgetTop()) === topFolded, 'the grid jumped when the bar came out');
  await page.screenshot({ path: `${dir}/14-bar-revealed.png`, clip: barClip });
  // It stays while the pointer is on it, then folds once the pointer leaves.
  await page.mouse.move(720, 30);
  await page.waitForTimeout(900);
  assert((await barState()).folded === 'false', 'bar folded while the pointer was on it');
  await page.mouse.move(720, 600);
  await barFolded(true);

  // Keyboard: Tab from the top of the page lands in the bar and brings it out.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Tab');
  await barFolded(false);
  assert(
    await page.evaluate(() => !!document.activeElement?.closest('header.app-bar')),
    'Tab did not land in the bar',
  );
  await page.screenshot({ path: `${dir}/14-bar-keyboard.png`, clip: barClip });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await barFolded(true);

  // Edit mode keeps it out.
  await page.mouse.move(720, 3);
  await barFolded(false);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(720, 600);
  await page.waitForTimeout(1_000);
  assert((await barState()).folded === 'false', 'bar folded away in edit mode');
  assert(
    await page.getByRole('button', { name: 'Add widget' }).isVisible(),
    'Add widget not reachable in edit mode',
  );
  await page.screenshot({ path: `${dir}/14-bar-editing.png`, clip: barClip });
  await page.getByRole('button', { name: 'Done' }).click();
  await page.mouse.move(720, 600);
  await barFolded(true);

  // The Settings button is reachable from a folded bar (reveal first), and turning it off
  // puts the bar back in the flow.
  await page.mouse.move(720, 3);
  await barFolded(false);
  await setBar({ fold: false });
  const s = await barState();
  assert(s.fold === 'off' && s.folded === 'false', `bar still folding: ${JSON.stringify(s)}`);
});

await step('top bar: touch screens never fold it', async () => {
  const touch = await browser.newContext({
    viewport: { width: 900, height: 700 },
    hasTouch: true,
    isMobile: true,
  });
  const p = await touch.newPage();
  await p.goto(stack.appUrl);
  await p.evaluate(() =>
    localStorage.setItem(
      'tarpaulin.settings',
      JSON.stringify({ state: { onboarded: true, barFoldAway: true }, version: 1 }),
    ),
  );
  await p.reload();
  await p.getByRole('tab', { name: /Home/ }).waitFor({ timeout: 20_000 });
  await settled(p);
  const fold = await p.evaluate(
    () => document.querySelector<HTMLElement>('header.app-bar')?.dataset.fold,
  );
  await touch.close();
  assert(fold === 'off', `fold-away is ${fold} on a touch screen`);
});

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
