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
// The mock's student is in London; the same zone here keeps the time-zone note out of the way.
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  ...(stack.mock && { timezoneId: 'Europe/London' }),
});
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
// Stand-in for the browser's notification API: every notification the app shows is recorded
// in localStorage (so the record survives reloads) instead of popping up.
// Plain source text: tsx would otherwise wrap the class in helpers the page doesn't have.
await page.addInitScript(`
  window.Notification = class {
    static permission = 'granted';
    static requestPermission = async () => 'granted';
    constructor(title, opts) {
      const all = JSON.parse(localStorage.getItem('__notes') ?? '[]');
      all.push({ title, body: (opts && opts.body) || '' });
      localStorage.setItem('__notes', JSON.stringify(all));
    }
  };
`);
const notes = () =>
  page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('__notes') ?? '[]') as Array<{ title: string; body: string }>,
  );

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
  // The look tiles and mode previews switch to the dark variants live.
  await page.getByRole('radio', { name: /^Dark/ }).click();
  await settled();
  const tileMode = await page
    .getByTestId('look-cork')
    .locator('[data-mode]')
    .first()
    .getAttribute('data-mode');
  const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert(
    tileMode === 'dark' && body === 'rgb(69, 48, 31)',
    `dark cork not applied in setup: tile ${tileMode}, page ${body}`,
  );
  await shot('00-setup-cork-dark');
  await page.getByRole('radio', { name: /^Match system/ }).click();
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

// Look, its background and widget style, and the page colour each mode paints.
const LOOKS = [
  ['cork', 'cork', 'postit', 'rgb(176, 122, 78)', 'rgb(69, 48, 31)'],
  ['journal', 'dots', 'journal', 'rgb(247, 241, 227)', 'rgb(30, 30, 34)'],
  ['blueprint', 'blueprint', 'blueprint', 'rgb(232, 239, 248)', 'rgb(15, 76, 129)'],
  ['terminal', 'crt', 'terminal', 'rgb(238, 243, 234)', 'rgb(5, 10, 6)'],
  ['swiss', 'poster', 'swiss', 'rgb(242, 239, 232)', 'rgb(17, 17, 17)'],
  ['arcade', 'night-sky', 'pixel', 'rgb(142, 203, 247)', 'rgb(42, 26, 94)'],
  ['plain', 'plain', 'card', 'rgb(244, 245, 247)', 'rgb(15, 17, 23)'],
] as const;

async function setMode(theme: string) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox').first().selectOption(theme);
  await settled();
}

/** What the page and its widgets actually render: html attributes, body colour, widget tokens. */
const rendered = () =>
  page.evaluate(() => {
    const html = document.documentElement;
    const roots = [...document.querySelectorAll<HTMLElement>('[data-widget-id] .skin-root')];
    return {
      theme: html.dataset.theme,
      mode: html.dataset.mode,
      background: html.dataset.background,
      body: getComputedStyle(document.body).backgroundColor,
      widgetModes: [...new Set(roots.map((r) => r.dataset.mode))],
      surfaces: roots.map((r) => getComputedStyle(r).getPropertyValue('--surface').trim()),
    };
  });

// Every look in light and then dark mode: the texture, chrome and widget colours all switch.
const lightSurfaces: Record<string, string[]> = {};
for (const mode of ['light', 'dark'] as const) {
  await step(`mode: ${mode}`, async () => {
    await setMode(mode);
    const r = await rendered();
    assert(r.theme === mode && r.mode === mode, `html is ${r.theme}/${r.mode}`);
    await page.getByRole('button', { name: 'Dashboard' }).click();
    await settled();
  });
  for (const [look, background, skin, lightBg, darkBg] of LOOKS) {
    await step(`look: ${look} (${mode})`, async () => {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      const tile = page.getByTestId(`look-${look}`);
      const swatchModes = await tile
        .locator('[data-mode]')
        .evaluateAll((els) => [...new Set(els.map((el) => (el as HTMLElement).dataset.mode))]);
      assert(
        swatchModes.length === 1 && swatchModes[0] === mode,
        `look tile previews ${swatchModes}`,
      );
      await tile.click();
      await page.getByRole('button', { name: 'Dashboard' }).click();
      await settled();
      const r = await rendered();
      assert(r.background === background, `background is ${r.background}`);
      assert(r.mode === mode, `html data-mode is ${r.mode}`);
      const bg = mode === 'light' ? lightBg : darkBg;
      assert(r.body === bg, `page is ${r.body}, expected ${bg}`);
      const skins = await skinsOnScreen();
      assert(
        skins.length > 0 && skins.every((s) => s === skin),
        `widgets render as ${[...new Set(skins)]}`,
      );
      assert(
        r.widgetModes.length === 1 && r.widgetModes[0] === mode,
        `widgets in ${r.widgetModes}`,
      );
      if (mode === 'light') lightSurfaces[look] = r.surfaces;
      else
        assert(
          r.surfaces.every((s, i) => s !== lightSurfaces[look]?.[i]),
          `widget colours did not change for dark: ${r.surfaces[0]}`,
        );
      await assertGridLayout();
      await shot(`10-look-${look}-${mode}`);
    });
  }
}

await step('high contrast overrides a textured look', async () => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('look-cork').click();
  await page.getByRole('combobox').first().selectOption('high-contrast');
  await settled();
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await settled();
  const r = await rendered();
  assert(
    r.theme === 'high-contrast' && r.mode === 'dark' && r.background === 'plain',
    `html is ${r.theme}/${r.mode}/${r.background}`,
  );
  assert(r.body === 'rgb(0, 0, 0)', `page is ${r.body}`);
  assert(
    r.surfaces.length > 0 && r.surfaces.every((s) => s === '0 0 0'),
    `widgets keep style colours: ${r.surfaces}`,
  );
  const skins = await skinsOnScreen();
  assert(
    skins.every((s) => s === 'postit'),
    `widgets lost their style: ${skins}`,
  );
  await assertGridLayout();
  await shot('10-look-cork-high-contrast');
  await setMode('system');
  await page.getByTestId('look-plain').click();
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await settled();
});

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

await step('settings: course list folds and searches; tray switch is desktop-only', async () => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const list = page.getByRole('list', { name: 'courses' });
  await list.waitFor();
  const folded = await list.getByRole('listitem').count();
  const more = page.getByRole('button', { name: /^Show all \d+ courses/ });
  assert(folded === 5 && (await more.isVisible()), `course list not folded (${folded} rows)`);
  const total = Number((await more.innerText()).match(/Show all (\d+)/)![1]);
  await more.click();
  await settled();
  assert((await list.getByRole('listitem').count()) === total, 'show all did not show all');
  await page.getByRole('button', { name: 'Show fewer courses' }).click();
  const firstName = await list
    .getByRole('listitem')
    .first()
    .locator('.truncate.text-xs')
    .innerText();
  const query = firstName.split(' · ')[0].slice(0, 8);
  await page.getByRole('searchbox', { name: 'Search courses' }).fill(query);
  await settled();
  const hits = await list.getByRole('listitem').count();
  assert(hits >= 1 && hits < total, `search for "${query}" matched ${hits} of ${total}`);
  await page.getByRole('searchbox', { name: 'Search courses' }).fill('zzzz-no-such-course');
  assert(await page.getByText(/No courses match/).isVisible(), 'no empty message');
  await page.getByRole('button', { name: 'Clear search' }).click();
  assert(
    await page.getByRole('switch', { name: 'Keep running in the tray when closed' }).isDisabled(),
    'tray switch should be desktop-only in the browser',
  );
  await settled();
  await shot('13a-settings-courses');
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await settled();
});

await step('notifications: baseline is quiet, reminders fire once, test works', async () => {
  const first = await notes();
  assert(
    !first.some((n) => n.body.startsWith('New announcement') || n.title.startsWith('Graded')),
    `first look announced existing items: ${JSON.stringify(first)}`,
  );
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('heading', { name: 'Notifications' }).waitFor();
  assert(
    (await page.getByRole('switch', { name: 'Open Tarpaulin when I log in' }).isDisabled()) &&
      (await page.getByText('Available in the desktop app.').first().isVisible()),
    'opening at login should be desktop-only in the browser',
  );
  // A week's lead puts plenty of the mock's deadlines inside the window.
  await page.getByRole('button', { name: '1 week before' }).click();
  await settled();
  const reminded = await notes();
  const due = reminded.slice(first.length);
  assert(
    due.length > 0 && due.every((n) => /^Due in |deadlines coming up$/.test(n.title)),
    `expected deadline reminders, got ${JSON.stringify(due)}`,
  );
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await page.reload();
  await page.getByRole('tab', { name: /Home/ }).waitFor();
  await settled();
  assert((await notes()).length === reminded.length, 'reminders repeated after a reload');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Send a test' }).click();
  await page.getByText('Sent.').waitFor();
  const last = (await notes()).at(-1);
  assert(last?.body === 'Notifications are working.', `test notification: ${JSON.stringify(last)}`);
  await page.getByRole('heading', { name: 'Notifications' }).scrollIntoViewIfNeeded();
  await shot('13-notifications-settings');
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await settled();
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
    await page.screenshot({ path: `${dir}/15-bar-${style}.png`, clip: barClip });
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
  await page.screenshot({ path: `${dir}/16-bar-folded.png`, clip: barClip });

  // Pointer at the top edge brings it back, over the page (nothing below moves).
  await page.mouse.move(720, 3);
  await barFolded(false);
  assert((await widgetTop()) === topFolded, 'the grid jumped when the bar came out');
  await page.screenshot({ path: `${dir}/16-bar-revealed.png`, clip: barClip });
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
  await page.screenshot({ path: `${dir}/16-bar-keyboard.png`, clip: barClip });
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
  await page.screenshot({ path: `${dir}/16-bar-editing.png`, clip: barClip });
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

/** Clicks items in a widget until the reader opens one of the wanted kind. */
async function openInReader(widgetType: string, kinds: string[]) {
  const buttons = page.locator(
    `[data-widget-type="${widgetType}"] [data-testid="widget-body"] button`,
  );
  const n = Math.min(await buttons.count(), 12);
  for (let i = 0; i < n; i++) {
    await buttons.nth(i).click();
    const reader = page.getByTestId('item-reader');
    if (await reader.isVisible().catch(() => false)) {
      await settled();
      if (kinds.includes((await reader.getAttribute('data-kind')) ?? '')) return reader;
      await page.keyboard.press('Escape');
      await settled();
    }
  }
  throw new Error(`no ${kinds.join('/')} opened from ${widgetType}`);
}

await step('reader: an assignment opens in Tarpaulin with its content', async () => {
  const reader = await openInReader('due-soon', ['assignment']);
  const content = page.getByTestId('reader-content');
  await content.waitFor();
  assert((await content.locator('h2', { hasText: 'Overview' }).count()) === 1, 'no body');
  assert((await content.locator('script, iframe, [style]').count()) === 0, 'unsafe markup');
  for (const img of await content.locator('img[data-file-id]').all())
    assert((await img.getAttribute('data-state')) === 'loaded', 'Canvas file image not loaded');
  assert(
    await page.getByRole('button', { name: 'Open in Canvas' }).isVisible(),
    'no Canvas button',
  );
  await shot('14-reader-assignment');
  // Links outside Canvas ask first.
  await content.locator('a[data-canvas="false"]').first().click();
  const confirm = page.getByRole('dialog', { name: 'Open this link?' });
  await confirm.waitFor();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  assert(await reader.isVisible(), 'reader closed with the link prompt');
  await page.keyboard.press('Escape');
  await settled();
  assert((await page.getByTestId('item-reader').count()) === 0, 'reader did not close');
});

await step('reader: announcements open with their body; Canvas mode skips the reader', async () => {
  await openInReader('announcements', ['announcement']);
  await page.getByTestId('reader-content').waitFor();
  await shot('15-reader-announcement');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Clicking an assignment or announcement').selectOption('canvas');
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await settled();
  const popup = page.waitForEvent('popup', { timeout: 5_000 });
  await page
    .locator('[data-widget-type="due-soon"] [data-testid="widget-body"] button')
    .first()
    .click();
  const opened = await popup;
  assert(
    opened.url().includes('canvas.mock') || opened.url().includes('/courses/'),
    `opened ${opened.url()}`,
  );
  await opened.close();
  assert((await page.getByTestId('item-reader').count()) === 0, 'reader opened in Canvas mode');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Clicking an assignment or announcement').selectOption('app');
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await settled();
});

await step('reader: hostile Canvas HTML stays inert (edge data)', async () => {
  stack.useScenario('edge');
  await page.evaluate(() => localStorage.removeItem('tarpaulin.cache'));
  await page.reload();
  await page.getByRole('tab', { name: /Home/ }).waitFor();
  await settled();
  let alerted = false;
  page.on('dialog', (d) => {
    alerted = true;
    void d.dismiss();
  });
  for (const [widget, title] of [
    ['due-soon', 'Hostile description'],
    ['announcements', 'Hostile announcement body'],
  ] as const) {
    await page.locator(`[data-widget-type="${widget}"] button`, { hasText: title }).first().click();
    const content = page.getByTestId('reader-content');
    await content.waitFor();
    await settled();
    assert(
      (await content
        .locator('script, iframe, form, input, object, style, svg, [style], [onerror], [onclick]')
        .count()) === 0,
      `${title}: unsafe markup survived`,
    );
    assert((await content.innerText()).includes('Safe text after'), `${title}: content missing`);
    await page.keyboard.press('Escape');
    await settled();
  }
  const xss = await page.evaluate(() => (window as unknown as { __xss?: string }).__xss);
  assert(xss === undefined && !alerted, `script ran: ${xss ?? 'alert'}`);
  stack.useScenario(scenario);
  await page.evaluate(() => localStorage.removeItem('tarpaulin.cache'));
  await page.reload();
  await page.getByRole('tab', { name: /Home/ }).waitFor();
  await settled();
});

// ---- Edit mode: undo, keyboard moves, narrow windows; calendar keys; time-zone note ---------
const undoToast = page.getByTestId('undo-toast');
const enterEdit = async () => {
  await page.getByRole('tab', { name: /Home/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await settled();
};
const leaveEdit = async () => {
  await page.getByRole('button', { name: 'Done' }).click();
  await settled();
};

await step('undo: a removed widget and a deleted page come back', async () => {
  await enterEdit();
  const before = await activePage();
  const first = before.layout.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0];
  await page
    .locator(`[data-widget-id="${first.i}"]`)
    .getByRole('button', { name: /^Remove / })
    .click();
  await settled();
  assert(!(await activePage()).widgets[first.i], 'widget not removed');
  await undoToast.waitFor({ timeout: 2_000 });
  assert(/^Removed /.test(await undoToast.innerText()), 'toast does not say what was removed');
  await shot('30-undo-toast');
  await undoToast.getByRole('button', { name: 'Undo' }).click();
  await settled();
  const after = await activePage();
  assert(
    JSON.stringify(after.widgets) === JSON.stringify(before.widgets) &&
      JSON.stringify(after.layout) === JSON.stringify(before.layout),
    'undo did not restore the widget where it was',
  );
  // A page: deleted without a confirmation, back with Ctrl+Z.
  const pagesBefore = (await stored()).pages.map((p) => p.id);
  await page.getByRole('tab', { name: /Minimal/ }).click();
  await page.getByRole('button', { name: 'Page options' }).click();
  await page.getByRole('button', { name: 'Delete page' }).click();
  await settled();
  assert((await stored()).pages.length === pagesBefore.length - 1, 'page not deleted');
  await page.locator('body').press('Control+z');
  await settled();
  const back = await stored();
  assert(
    JSON.stringify(back.pages.map((p) => p.id)) === JSON.stringify(pagesBefore),
    'page not back',
  );
  assert(
    await page.getByRole('tab', { name: /Minimal/, selected: true }).isVisible(),
    'restored page not active',
  );
  await leaveEdit();
});

await step('edit mode: arrow keys move a widget, Shift+arrows resize it, announced', async () => {
  await enterEdit();
  const before = await activePage();
  const first = before.layout.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0];
  const grip = page
    .locator(`[data-widget-id="${first.i}"]`)
    .getByRole('button', { name: /^Move / });
  await grip.focus();
  const announcer = page.getByTestId('grid-announcer');
  const placeOf = async () => (await activePage()).layout.find((l) => l.i === first.i)!;
  await page.keyboard.press('ArrowRight');
  await settled();
  let now = await placeOf();
  assert(now.x === first.x + 1, `ArrowRight: x ${first.x} → ${now.x}`);
  assert(
    /moved: column \d+, row \d+/.test((await announcer.textContent()) ?? ''),
    'move not announced',
  );
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  assert((await focused())?.startsWith('Move '), `focus left the grip: ${await focused()}`);
  await page.keyboard.press('Shift+ArrowDown');
  await settled();
  now = await placeOf();
  assert(now.h === first.h + 1, `Shift+ArrowDown: h ${first.h} → ${now.h}`);
  assert(/resized/.test((await announcer.textContent()) ?? ''), 'resize not announced');
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await settled();
  now = await placeOf();
  assert(now.x === first.x && now.h === first.h, `not back: ${JSON.stringify(now)}`);
  await assertGridLayout();
  await leaveEdit();
});

await step('small window: stacked layout, readable titles, ⋯ menu, nothing saved', async () => {
  const saved = JSON.stringify((await activePage()).layout);
  await page.setViewportSize({ width: 720, height: 520 });
  await enterEdit();
  try {
    await smallWindowChecks();
  } finally {
    // Back to the usual window, so a failure here doesn't trip the steps after it.
    await page.setViewportSize({ width: 1440, height: 960 });
    await leaveEdit();
  }
  assert(JSON.stringify((await activePage()).layout) === saved, 'narrow layout was saved');
});
async function smallWindowChecks() {
  assert(
    (await page.locator('[data-grid-cols]').getAttribute('data-grid-cols')) === '6',
    'narrow window still uses 12 columns',
  );
  await page.getByTestId('compact-note').waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert(overflow <= 0, `page scrolls sideways by ${overflow}px`);
  const titles = await page
    .locator('[data-widget-id] h2')
    .evaluateAll((els) =>
      els.map((el) => ({ text: el.textContent, w: el.getBoundingClientRect().width })),
    );
  assert(
    titles.every((t) => t.w >= 80),
    `titles squeezed: ${titles.map((t) => `${t.text} ${Math.round(t.w)}px`).join(', ')}`,
  );
  const handles = page.locator('.react-resizable-handle').filter({ visible: true });
  assert((await handles.count()) === 0, 'resizable while stacked');
  await assertGridLayout();
  await shot('31-small-edit');
  // In between, 12 columns again, and the narrowest headers fold their buttons into a menu.
  await page.setViewportSize({ width: 1000, height: 700 });
  await settled();
  const menu = page.getByRole('button', { name: /^Actions for / }).first();
  await menu.click();
  const remove = page.locator('.bar-menu').getByRole('button', { name: /^Remove / });
  await remove.waitFor();
  assert(
    (await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Settings',
    'menu did not take focus',
  );
  await shot('32-actions-menu');
  await page.keyboard.press('Escape');
  assert((await remove.count()) === 0, 'menu did not close');
  assert(
    (await page.evaluate(() => document.activeElement?.getAttribute('aria-label')))?.startsWith(
      'Actions for',
    ),
    'focus did not return to the menu button',
  );
}

await step('calendar: arrow keys move between days in the month grid', async () => {
  await enterEdit();
  await page.getByRole('button', { name: 'Add widget' }).click();
  await page.getByRole('button', { name: /^Calendar/ }).click();
  await leaveEdit();
  const cal = page.locator('[data-widget-type="calendar"]').last();
  await cal.scrollIntoViewIfNeeded();
  const stops = cal.locator('[data-day][tabindex="0"]');
  assert((await stops.count()) === 1, `month grid has ${await stops.count()} tab stops`);
  const start = (await stops.getAttribute('data-day'))!;
  await stops.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  const day = () => page.evaluate(() => (document.activeElement as HTMLElement).dataset.day);
  const expected = new Date(`${start}T12:00:00Z`);
  expected.setUTCDate(expected.getUTCDate() + 8);
  assert((await day()) === expected.toISOString().slice(0, 10), `landed on ${await day()}`);
  const month = await cal.getByText(/^\w+ \d{4}$/).textContent();
  await page.keyboard.press('PageDown');
  await settled();
  assert((await cal.getByText(/^\w+ \d{4}$/).textContent()) !== month, 'PageDown kept the month');
  assert((await day())?.slice(0, 7) !== start.slice(0, 7), 'focus did not follow the month');
  await shot('33-calendar-keys');
  // Tidy up: the remove is undoable too.
  await enterEdit();
  await cal.getByRole('button', { name: /^Remove / }).click();
  await leaveEdit();
});

if (stack.mock) {
  await step('time zone: a note when the computer and Canvas disagree, dismissible', async () => {
    const storage = await page.evaluate(() => JSON.stringify(localStorage));
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      timezoneId: 'America/New_York',
    });
    await ctx.addInitScript((s) => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      for (const [k, v] of Object.entries(JSON.parse(s) as Record<string, string>))
        localStorage.setItem(k, v);
    }, storage);
    const away = await ctx.newPage();
    await away.goto(stack.appUrl);
    await away.getByRole('tab', { name: /Home/ }).waitFor({ timeout: 20_000 });
    const note = away.getByTestId('time-zone-note');
    await note.waitFor({ timeout: 10_000 });
    const text = await note.innerText();
    assert(
      text.includes('America/New York') && text.includes('Europe/London'),
      `note says: ${text}`,
    );
    await away.screenshot({ path: `${dir}/34-time-zone-note.png` });
    await note.getByRole('button', { name: 'Dismiss time zone note' }).click();
    await away.reload();
    await away.getByRole('tab', { name: /Home/ }).waitFor({ timeout: 20_000 });
    await away.evaluate(() => window.__tarpaulin!.settled({ timeoutMs: 15_000 }));
    assert((await note.count()) === 0, 'note came back after dismissing');
    await ctx.close();
    assert((await page.getByTestId('time-zone-note').count()) === 0, 'note shown in London');
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

// Token health. The sign-in and replace-token screens only exist where the app manages the token
// itself, so these steps use the dev demo transport (`/?demo`): it "connects" with whatever is
// typed and reads the mock through the dev proxy, whose token the stack switches below to play
// the token Canvas now sees. Mock tokens: mock-expired is rejected (401 "Invalid access token."),
// mock-expiring-<n>d expires in n days, and every other mock token never expires.
if (stack.mock) {
  const tokenBanner = page.getByTestId('token-banner');
  const expiryBanner = page.getByTestId('token-expiry-banner');
  const toDashboard = async () => {
    await page.getByRole('tab', { name: /Home/ }).waitFor({ timeout: 20_000 });
    await settled();
  };
  const reloadAs = async (token: string) => {
    stack.useScenario(token);
    await page.reload();
    await toDashboard();
  };
  const setTheme = (theme: string) =>
    page.evaluate((t) => {
      const saved = JSON.parse(localStorage.getItem('tarpaulin.settings') ?? '{}');
      localStorage.setItem(
        'tarpaulin.settings',
        JSON.stringify({ ...saved, state: { ...saved.state, theme: t } }),
      );
    }, theme);
  let layoutBefore = '';

  await step(
    'token help: opens from the sign-in screen and links to the typed Canvas',
    async () => {
      layoutBefore = JSON.stringify((await stored()).pages);
      await page.goto(`${stack.appUrl}/?demo`);
      await page.getByRole('heading', { name: 'Connect to Canvas' }).waitFor({ timeout: 20_000 });
      await settled();
      const toggle = page.getByRole('button', { name: 'How do I get a token?' });
      assert((await toggle.getAttribute('aria-expanded')) === 'false', 'help starts open');
      await toggle.click();
      const help = page.getByTestId('token-help');
      await help.waitFor();
      const text = await help.innerText();
      for (const part of [
        'Account → Settings',
        'Approved Integrations',
        '+ New Access Token',
        'purpose',
        'expiry date',
        'only once',
        'Paste it',
        'Some universities turn access tokens off',
        'system keychain',
        'only ever reads from Canvas',
      ])
        assert(text.includes(part), `help is missing "${part}"`);
      assert(text.includes('Type your Canvas address'), 'no prompt for the address');
      await page.getByLabel('Canvas address').fill('canvas.example.edu');
      const open = help.getByRole('button', { name: /canvas\.example\.edu\/profile\/settings/ });
      await open.waitFor();
      await settled();
      await shot('20-token-help-onboarding');
      // Opened through the transport's web-link opener (open_web_link in the desktop app).
      await page.context().route('https://canvas.example.edu/**', (r) => r.fulfill({ body: 'ok' }));
      const [popup] = await Promise.all([page.waitForEvent('popup'), open.click()]);
      assert(
        popup.url() === 'https://canvas.example.edu/profile/settings',
        `opened ${popup.url()}`,
      );
      await popup.close();
      await toggle.click();
      assert((await help.count()) === 0, 'help did not fold away');
      await page.getByLabel('Access token').fill('mock-realistic');
      await page.getByRole('button', { name: 'Test & connect' }).click();
      await toDashboard();
      assert((await tokenBanner.count()) === 0, 'token banner with a working token');
      assert((await expiryBanner.count()) === 0, 'expiry warning for a token with no expiry');
    },
  );

  await step('expired token: a banner stays up and leads to replacing it in place', async () => {
    await reloadAs('expired');
    await tokenBanner.waitFor({ timeout: 20_000 });
    assert(
      (await tokenBanner.innerText()).includes('expired or been revoked'),
      'banner does not say what happened',
    );
    // Not a flash: still there after the app's own retries and a reload.
    await page.reload();
    await toDashboard();
    await tokenBanner.waitFor();
    for (const theme of ['light', 'dark', 'high-contrast'] as const) {
      await setTheme(theme);
      await page.reload();
      await toDashboard();
      await tokenBanner.waitFor();
      await shot(`21-token-expired-${theme}`);
    }
    await setTheme('system');
    await page.reload();
    await toDashboard();
    await tokenBanner.getByRole('button', { name: 'How to get a token' }).click();
    const dialog = page.getByRole('dialog', { name: 'How to get an access token' });
    await dialog.getByTestId('token-help').waitFor();
    assert(
      (await dialog.getByRole('button', { name: /\/profile\/settings/ }).count()) === 1,
      'no link to the connected Canvas settings page',
    );
    await settled();
    await shot('22-token-help-dialog');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await tokenBanner.getByRole('button', { name: /Paste a new token/ }).click();
    const replace = page.getByRole('dialog', { name: 'Replace your access token' });
    await replace.getByLabel(/New access token/).waitFor();
    await settled();
    await shot('23-token-replace');
    stack.useScenario('realistic'); // the new token, as Canvas sees it
    await replace.getByLabel(/New access token/).fill('mock-new-token');
    await replace.getByRole('button', { name: 'Test & save token' }).click();
    await replace.waitFor({ state: 'detached' });
    await settled();
    assert((await tokenBanner.count()) === 0, 'banner stayed after a working token');
    assert((await page.getByTestId('widget-frame').count()) >= 4, 'widgets are gone');
    assert(
      JSON.stringify((await stored()).pages) === layoutBefore,
      'pages or layout changed while replacing the token',
    );
  });

  await step('expiry warning: 14 days ahead, again at 3 days, date in settings', async () => {
    await reloadAs('expiring-10d');
    await expiryBanner.waitFor({ timeout: 20_000 });
    assert(
      (await expiryBanner.innerText()).includes('expires in 10 days'),
      `banner says: ${await expiryBanner.innerText()}`,
    );
    for (const theme of ['light', 'dark', 'high-contrast'] as const) {
      await setTheme(theme);
      await page.reload();
      await toDashboard();
      await expiryBanner.waitFor();
      await shot(`24-token-expiring-${theme}`);
    }
    await setTheme('system');
    await page.reload();
    await toDashboard();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const status = page.getByTestId('token-status');
    await status.waitFor();
    await settled();
    assert((await status.innerText()).includes('Expires'), 'settings shows no expiry date');
    await page.getByRole('button', { name: 'Dashboard' }).click();
    await toDashboard();
    await expiryBanner.getByRole('button', { name: 'Remind me 3 days before' }).click();
    await settled();
    assert((await expiryBanner.count()) === 0, 'dismiss did not hide the warning');
    await page.reload();
    await toDashboard();
    assert((await expiryBanner.count()) === 0, 'dismissal was not remembered');
    await reloadAs('expiring-2d');
    await expiryBanner.waitFor({ timeout: 20_000 });
    assert(
      (await expiryBanner.innerText()).includes('expires in 2 days'),
      'no second warning at 3 days',
    );
    await expiryBanner.getByRole('button', { name: 'Dismiss' }).click();
    await reloadAs('realistic');
    assert((await expiryBanner.count()) === 0, 'warning for a token with no expiry');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await status.waitFor();
    await settled();
    assert((await status.innerText()).includes('No expiry date'), 'settings: no "no expiry"');
    await page.getByRole('button', { name: 'Dashboard' }).click();
    await page.goto(stack.appUrl);
    await toDashboard();
  });
}

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
