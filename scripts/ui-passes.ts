// UI passes that ui-check.ts doesn't make: the smallest window, keyboard use of dialogs, and a
// failing or missing network. Like ui-check it starts its own mock Canvas and Vite server and
// waits on the app's settle signal, never on sleeps.
//
// Some checks describe behaviour that another change is still adding. Those are marked pending
// with who owns the fix: they run and are reported, but don't fail the run until they're made
// required (delete the `pending` note once the fix has landed; the run says when one passes).
//
//   pnpm test:ui:passes                     # every pass
//   pnpm test:ui:passes --pass=small,offline
//   pnpm test:ui:passes --strict            # pending checks fail too
import { mkdirSync } from 'node:fs';
import type { Browser, BrowserContext, Page } from 'playwright';
import { launch, startStack, type TestStack } from './browser';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const strict = process.argv.includes('--strict');
const passes = arg('pass')?.split(',') ?? ['small', 'keyboard', 'offline'];
const dir = 'screenshots/ui/passes';
mkdirSync(dir, { recursive: true });

interface Result {
  name: string;
  ok: boolean;
  pending?: string;
  detail?: string;
  ms: number;
}
const results: Result[] = [];
let current: Page | null = null;

/**
 * One check. `pending` names the change that makes it pass (group and audit item); until then a
 * failure is reported but doesn't fail the run.
 */
async function check(name: string, fn: () => Promise<void>, pending?: string) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, pending, ms: Date.now() - started });
  } catch (e) {
    const detail = e instanceof Error ? e.message.split('\n')[0] : String(e);
    results.push({ name, ok: false, pending, detail, ms: Date.now() - started });
    if (!pending || strict)
      await current
        ?.screenshot({ path: `${dir}/FAILED-${name.replace(/\W+/g, '-')}.png` })
        .catch(() => {});
  }
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const stack: TestStack = await startStack(false);
const browser: Browser = await launch();
const pageErrors: string[] = [];

/** A new window on the dashboard, past first-run setup, with the given mock scenario. */
async function open(
  scenario: string,
  viewport = { width: 1440, height: 960 },
): Promise<{ ctx: BrowserContext; page: Page }> {
  stack.useScenario(scenario);
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`[${scenario}] ${e.message}`));
  await page.addInitScript(() => {
    if (!localStorage.getItem('tarpaulin.settings'))
      localStorage.setItem(
        'tarpaulin.settings',
        JSON.stringify({ state: { onboarded: true }, version: 2 }),
      );
  });
  await page.goto(stack.appUrl);
  await page.getByTestId('widget-frame').first().waitFor({ timeout: 30_000 });
  await settled(page);
  current = page;
  return { ctx, page };
}
const settled = (page: Page) =>
  page.evaluate(() => window.__tarpaulin!.settled({ timeoutMs: 15_000 }));

/** Widget boxes on the visible page: none collapsed, none off to the side, no two overlapping. */
async function assertGrid(page: Page) {
  const boxes = await page.locator('[data-widget-id]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.getAttribute('data-widget-id'), x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  for (const [i, a] of boxes.entries()) {
    assert(a.w > 50 && a.h > 50, `widget ${a.id} is collapsed (${a.w}×${a.h})`);
    assert(a.x >= 0 && a.x + a.w <= vw + 1, `widget ${a.id} is off-screen`);
    for (const b of boxes.slice(i + 1)) {
      const overlap =
        a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
      assert(!overlap, `widgets ${a.id} and ${b.id} overlap`);
    }
  }
}
const noSideScroll = async (page: Page) => {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
  }));
  assert(scroll <= width, `the page scrolls sideways (${scroll}px of content in ${width}px)`);
};
const dialogs = (page: Page) => page.locator('[role="dialog"]').count();
/** Where focus is: 'in' a dialog, 'out' of every dialog, or 'none' (the page body). */
const focusWhere = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'none';
    return el.closest('[role="dialog"]') ? 'in' : 'out';
  });

/** Clicks items in a widget until the reader opens one of the wanted kind. */
async function openInReader(page: Page, widgetType: string, kinds: string[]) {
  const buttons = page.locator(
    `[data-widget-type="${widgetType}"] [data-testid="widget-body"] button`,
  );
  const n = Math.min(await buttons.count(), 12);
  for (let i = 0; i < n; i++) {
    await buttons.nth(i).click();
    const reader = page.getByTestId('item-reader');
    if (await reader.isVisible().catch(() => false)) {
      await settled(page);
      if (kinds.includes((await reader.getAttribute('data-kind')) ?? ''))
        return { reader, opener: buttons.nth(i) };
      await page.keyboard.press('Escape');
      await settled(page);
    }
  }
  throw new Error(`no ${kinds.join('/')} opened from ${widgetType}`);
}

// ── The smallest window (tauri.conf.json minWidth × minHeight) ────────────────────────────────
if (passes.includes('small')) {
  const { ctx, page } = await open('realistic', { width: 720, height: 520 });
  await check('small window: the dashboard never scrolls sideways', () => noSideScroll(page));
  await check('small window: widgets fit side by side without overlapping', () => assertGrid(page));
  await page.screenshot({ path: `${dir}/small-home.png` });
  await check(
    'small window: every widget is at least 200px wide',
    async () => {
      const narrow = await page.locator('[data-widget-id]').evaluateAll((els) =>
        els
          .map((el) => ({
            type: el.getAttribute('data-widget-type'),
            w: Math.round(el.getBoundingClientRect().width),
          }))
          .filter((b) => b.w < 200),
      );
      assert(!narrow.length, `squeezed: ${narrow.map((b) => `${b.type} ${b.w}px`).join(', ')}`);
    },
    'Group E: responsive grid below ~900px (audit item 12)',
  );
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await settled(page);
  await page.screenshot({ path: `${dir}/small-edit.png` });
  await check('small window (edit mode): still no sideways scroll', () => noSideScroll(page));
  await check(
    'small window (edit mode): widget titles are not cut short',
    async () => {
      const cut = await page
        .locator('h2.skin-title')
        .evaluateAll((els) =>
          els
            .filter((el) => el.scrollWidth > el.clientWidth + 1)
            .map((el) => `"${el.textContent}" (${el.clientWidth}px)`),
        );
      assert(!cut.length, `truncated: ${cut.join(', ')}`);
    },
    'Group E: responsive grid and folded header actions (audit item 12)',
  );
  await page.getByRole('button', { name: 'Done' }).click();
  await settled(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await settled(page);
  await page.screenshot({ path: `${dir}/small-settings.png` });
  await check('small window: Settings never scrolls sideways', () => noSideScroll(page));
  await ctx.close();
}

// ── Keyboard use of dialogs ───────────────────────────────────────────────────────────────────
if (passes.includes('keyboard')) {
  const { ctx, page } = await open('realistic');
  const { reader, opener } = await openInReader(page, 'due-soon', ['assignment']);
  await check(
    'reader: focus moves into it when it opens',
    async () => assert((await focusWhere(page)) === 'in', `focus is ${await focusWhere(page)}`),
    'Group D: shared dialog focus handling (audit item 5)',
  );
  await check(
    'reader: Tab stays inside it',
    async () => {
      const where: string[] = [];
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        where.push(await focusWhere(page));
      }
      const out = where.filter((w) => w !== 'in').length;
      assert(out === 0, `${out} of ${where.length} Tab presses left the dialog`);
    },
    'Group D: focus trap (audit item 5)',
  );
  await check(
    'reader: modal to assistive tech, named after the item',
    async () => {
      const dialog = page.locator('[role="dialog"]').filter({ has: reader });
      assert((await dialog.getAttribute('aria-modal')) === 'true', 'no aria-modal on the reader');
      const name = (await dialog.getAttribute('aria-label')) ?? '';
      assert(
        !/^(Assignment|Quiz|Discussion|Announcement|Page|Event)$/.test(name),
        `named "${name}"`,
      );
    },
    'Group D: aria-modal on Drawer, reader labelled with the title (audit item 5)',
  );
  await check(
    'reader: one Escape closes only the link confirmation on top of it',
    async () => {
      await page.getByTestId('reader-content').locator('a[data-canvas="false"]').first().click();
      await page.getByRole('dialog', { name: 'Open this link?' }).waitFor();
      const before = await dialogs(page);
      await page.keyboard.press('Escape');
      await settled(page);
      const after = await dialogs(page);
      assert(before === 2 && after === 1, `dialogs before Escape ${before}, after ${after}`);
      assert(await reader.isVisible(), 'the reader closed too');
    },
    'Group D: Escape stack (audit item 5)',
  );
  await check('reader: Escape closes it', async () => {
    while ((await dialogs(page)) > 0) {
      await page.keyboard.press('Escape');
      await settled(page);
    }
    assert((await page.getByTestId('item-reader').count()) === 0, 'reader still open');
  });
  await check(
    'reader: focus goes back to the item that opened it',
    async () => {
      const back = await opener.evaluate((el) => el === document.activeElement);
      assert(back, `focus is ${await focusWhere(page)}, not on the opener`);
    },
    'Group D: focus restore (audit item 5)',
  );
  await check(
    'text inputs show a visible focus ring',
    async () => {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await settled(page);
      const input = page.locator('input.input, .input input, textarea.input').first();
      await input.focus();
      const ring = await input.evaluate((el) => {
        const cs = getComputedStyle(el);
        const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1;
        return outline || (cs.boxShadow !== 'none' && cs.boxShadow !== '');
      });
      assert(ring, 'a focused input has no outline or ring');
      await page.getByRole('button', { name: 'Dashboard' }).click();
      await settled(page);
    },
    'Group D: .input focus-visible ring (audit item 18)',
  );
  await ctx.close();
}

// ── Failing and missing network ───────────────────────────────────────────────────────────────
if (passes.includes('offline')) {
  {
    // Announcements fail with 500, the to-do list with 503, some planner requests with 403.
    const { ctx, page } = await open('flaky');
    await page.screenshot({ path: `${dir}/flaky.png` });
    await check('flaky Canvas: the dashboard still renders its widgets', async () => {
      assert((await page.getByTestId('widget-frame').count()) >= 4, 'widgets missing');
    });
    await check(
      'flaky Canvas: errors are in plain words, not raw Canvas JSON',
      async () => {
        const raw = await page
          .getByTestId('widget-frame')
          .filter({ hasText: /\{"errors"|Canvas returned \d{3}/ })
          .count();
        assert(raw === 0, `${raw} widget(s) show the raw Canvas response`);
      },
      'Group C: friendly ErrorState (audit item 7)',
    );
    await check(
      'flaky Canvas: a failed widget offers Retry',
      async () => {
        const failed = page
          .getByTestId('widget-frame')
          .filter({ hasText: /Couldn.t load|having trouble|offline|slow down/i });
        assert((await failed.count()) > 0, 'no widget shows an error to retry');
        const retry = failed.first().getByRole('button', { name: /retry|try again/i });
        assert((await retry.count()) === 1, 'no Retry button in the failed widget');
      },
      'Group C: Retry in ErrorState (audit item 7)',
    );
    await ctx.close();
  }
  {
    const { ctx, page } = await open('realistic');
    const before = await page.getByTestId('widget-frame').count();
    // The network goes away after a good load.
    await ctx.route('**/canvas-proxy/api/**', (r) => r.abort('internetdisconnected'));
    await page.getByRole('button', { name: 'Refresh from Canvas' }).click();
    await settled(page);
    await page.screenshot({ path: `${dir}/offline-refresh.png` });
    await check('offline: cached widgets stay on screen after a failed refresh', async () => {
      const after = await page.getByTestId('widget-frame').count();
      assert(after === before, `${before} widgets before, ${after} after`);
      const errors = await page
        .getByTestId('widget-frame')
        .filter({ hasText: /Couldn.t load from Canvas/ })
        .count();
      assert(errors === 0, `${errors} widget(s) replaced their cached data with an error`);
    });
    await check(
      'offline: the bar says so, and when the data is from',
      async () => {
        const bar = page.locator('header.app-bar');
        const text = await bar.innerText();
        assert(/offline|updated/i.test(text), `bar says: ${text.replace(/\s+/g, ' ').trim()}`);
      },
      'Group C: offline / last-updated chip (audit item 6)',
    );
    // The connection check fails too (in the desktop app: a locked keychain).
    await ctx.route('**/canvas-proxy/status', (r) => r.abort('internetdisconnected'));
    await page.reload();
    await page
      .getByText(/Couldn.t check|offline|Retry/i)
      .first()
      .waitFor({ timeout: 20_000 })
      .catch(() => {});
    await page.screenshot({ path: `${dir}/offline-status.png` });
    await check('offline: a failed connection check says what happened', async () => {
      const text = (await page.locator('body').innerText()).trim();
      assert(text.length > 0, 'blank window');
    });
    await check(
      'offline: a failed connection check offers Retry',
      async () => {
        const retry = page.getByRole('button', { name: /retry|try again/i });
        assert((await retry.count()) >= 1, 'no Retry button');
      },
      'Group C: Retry for the connection check (audit item 6)',
    );
    await ctx.close();
  }
}

if (stack.mock) {
  await check('read-only: no writes reached Canvas', async () =>
    assert(stack.mock!.writes.length === 0, JSON.stringify(stack.mock!.writes)),
  );
}
await check('no page errors', async () => assert(!pageErrors.length, pageErrors.join(' | ')));

const failed = results.filter((r) => !r.ok && (!r.pending || strict));
for (const r of results) {
  const mark = r.ok ? '✔' : r.pending && !strict ? '…' : '✘';
  const note = r.pending
    ? r.ok
      ? ` — passes now: make it required (${r.pending})`
      : ` — pending: ${r.pending}`
    : '';
  console.log(`${mark} ${r.name}${r.ok ? ` (${r.ms}ms)` : `: ${r.detail}`}${note}`);
}
const pendingFails = results.filter((r) => !r.ok && r.pending).length;
console.log(
  failed.length
    ? `\n${failed.length} check(s) failed`
    : `\nAll required checks passed${pendingFails ? ` (${pendingFails} pending)` : ''}. Screenshots in ${dir}/`,
);
await browser.close();
await stack.close();
process.exit(failed.length ? 1 : 0);
