// The demo video's script: what a student does, in order, with the captions shown on top.
// scripts/demo-video.ts renders it; every helper here is measured in video time.
import type { Locator, Page } from 'playwright';

export interface Director {
  page: Page;
  appUrl: string;
  /** Hold the current frame for `ms` of video. */
  pause: (ms: number) => Promise<void>;
  /** Move the pointer onto an element (eased, at hand speed). */
  point: (target: Locator, dx?: number, dy?: number) => Promise<unknown>;
  click: (target: Locator, wait?: number) => Promise<void>;
  type: (target: Locator, text: string) => Promise<void>;
  drag: (from: Locator, dx: number, dy: number, at?: { x: number; y: number }) => Promise<void>;
  /** Scroll whatever is under the pointer by `dy` pixels, eased over `ms`. */
  scroll: (dy: number, ms?: number) => Promise<void>;
  /** Move the pointer to a point on screen (eased). */
  moveTo: (x: number, y: number) => Promise<void>;
  /** Show a caption (empty title hides it); `near` puts it beside that element. */
  caption: (title: string, sub?: string, hold?: number, near?: Locator) => Promise<void>;
  /** Make a change on screen as a cross-fade from the old frame. */
  crossfade: (change: () => Promise<void>, ms?: number) => Promise<void>;
  /** Keep rendering until the element is visible. */
  until: (target: Locator) => Promise<void>;
  /** Let animations finish (a fixed hold, so every render takes identical frames). */
  settle: () => Promise<void>;
  /** Frames before this are rendered but not recorded. */
  startRecording: () => void;
  widget: (type: string) => Locator;
}

export async function story({
  page,
  appUrl,
  pause,
  point,
  click,
  type,
  scroll,
  moveTo,
  caption,
  crossfade,
  until,
  settle,
  startRecording,
  widget,
}: Director) {
  const settings = () => click(page.getByRole('button', { name: 'Settings', exact: true }), 350);
  type Mode = 'light' | 'dark';
  /** Light ↔ dark as an on-screen effect (see src/dev/demoHooks.ts). */
  const fadeTo = async (mode: Mode, hold = 1400) => {
    await crossfade(() => page.evaluate((m) => window.__tarpaulinDemo!.setMode(m), mode));
    await pause(hold);
  };
  /** Another look (and mode), dissolved in. */
  const dipTo = async (id: string, mode: Mode, hold = 1400) => {
    await crossfade(() =>
      page.evaluate(
        ([l, m]) => {
          window.__tarpaulinDemo!.setMode(m as Mode);
          window.__tarpaulinDemo!.applyLook(l);
        },
        [id, mode],
      ),
    );
    await pause(hold);
  };

  // Two pages laid out to show the dashboard at its best (built like presets, see demoHooks).
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

  await page.goto(`${appUrl}/?demo`);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await until(page.getByLabel('Canvas address'));
  // Every look's fonts, loaded up front so none swaps in mid-scene.
  await page.evaluate(() => Promise.all([...document.fonts].map((f) => f.load().catch(() => {}))));
  await settle();
  startRecording();
  await pause(300);
  await caption('Meet Tarpaulin', 'A calmer dashboard for Canvas', 1200);

  // ── Connect ──────────────────────────────────────────────────────────────────────────────────
  await caption(
    'Connect your Canvas account',
    'Your Canvas address and an access token',
    200,
    page.getByLabel('Canvas address'),
  );
  await type(page.getByLabel('Canvas address'), 'canvas.youruni.edu');
  await type(page.getByLabel('Access token'), '7~DemoToken');
  await caption(
    'Read-only, and the token stays in your keychain',
    'Tarpaulin never submits or changes anything in Canvas',
    1700,
    page.getByRole('button', { name: 'Test & connect' }),
  );
  await click(page.getByRole('button', { name: 'Test & connect' }), 300);
  await caption('');
  await until(page.getByRole('heading', { name: 'Make it yours' }));
  await settle();

  // ── First run ───────────────────────────────────────────────────────────────────────────────
  await caption('Pick a look', 'It applies live', 300, page.getByTestId('look-cork'));
  await click(page.getByTestId('look-cork'), 900);
  await click(page.getByTestId('look-terminal'), 900);
  await click(page.getByTestId('look-plain'), 400);
  await click(page.getByRole('button', { name: 'Continue' }), 300);
  await until(page.getByRole('tab', { name: /Home/ }));
  await settle();
  await crossfade(async () => {
    await page.evaluate((pages) => window.__tarpaulinDemo!.setPages(pages), PAGES);
    await settle();
  });

  // ── The week ────────────────────────────────────────────────────────────────────────────────
  await caption(
    'Your week at a glance',
    'Classes, deadlines and events in one calendar',
    300,
    widget('calendar'),
  );
  await point(widget('calendar'), 0.35, 0.4);
  await pause(600);
  await click(widget('calendar').getByRole('button', { name: 'Next' }), 900);
  await click(widget('calendar').getByRole('button', { name: 'Previous' }), 500);
  await caption(
    'Widgets fit the space you give them',
    'A wide clock sits beside its greeting; grades get bars',
    300,
    widget('clock'),
  );
  await point(widget('clock'), 0.6, 0.5);
  await pause(700);
  await point(widget('grades'), 0.5, 0.3);
  await pause(800);

  // ── Reader ──────────────────────────────────────────────────────────────────────────────────
  await caption(
    'Open anything without leaving',
    'Assignments and announcements, in Tarpaulin’s own layout',
    200,
    page.getByTestId('due-item').first(),
  );
  await click(page.getByTestId('due-item').first().getByRole('button').first(), 300);
  await until(page.getByTestId('reader-content'));
  await settle();
  await point(page.getByTestId('reader-content'), 0.5, 0.4);
  await scroll(480, 1200);
  await pause(500);
  await page.keyboard.press('Escape');
  await settle();

  // ── The month ───────────────────────────────────────────────────────────────────────────────
  await click(page.getByRole('tab', { name: /Month/ }), 300);
  await settle();
  await caption(
    'Or the whole month',
    'Pick a day to see everything on it',
    300,
    widget('calendar'),
  );
  const busyDay = widget('calendar').getByRole('button', { name: /, [1-9]\d* items?$/ });
  await click(busyDay.nth(3), 1100);
  await click(busyDay.nth(6), 1100);

  // ── Edit ────────────────────────────────────────────────────────────────────────────────────
  await click(page.getByRole('button', { name: 'Edit', exact: true }), 300);
  await caption(
    'Make it your own',
    'Drag, resize, and add from nine widgets',
    300,
    page.getByRole('button', { name: 'Add widget' }),
  );
  await click(page.getByRole('button', { name: 'Add widget' }), 1300);
  await page.keyboard.press('Escape');
  await settle();
  await click(page.getByRole('button', { name: 'Done' }), 300);
  await click(page.getByRole('tab', { name: /This week/ }), 300);
  await settle();

  // ── Looks ───────────────────────────────────────────────────────────────────────────────────
  await caption('Light or dark', undefined, 0);
  await fadeTo('dark', 1100);
  await fadeTo('light', 500);
  await caption('Seven looks', 'Cork board, in light…', 0);
  await dipTo('cork', 'light', 1100);
  await caption('Seven looks', '…and in dark', 0);
  await fadeTo('dark', 1100);
  await caption('Terminal', undefined, 0);
  await dipTo('terminal', 'dark', 1200);
  await caption('Blueprint', undefined, 0);
  await dipTo('blueprint', 'light', 1200);
  await caption('Arcade', undefined, 0);
  await dipTo('arcade', 'dark', 1200);
  await caption('');
  await dipTo('plain', 'light', 300);

  // ── Top bar ─────────────────────────────────────────────────────────────────────────────────
  await settings();
  const fold = page.getByRole('switch', { name: 'Fold away the top bar' });
  // Scroll it into view with an eased wheel, rather than a jump.
  await moveTo(720, 520);
  await scroll(((await fold.boundingBox())?.y ?? 400) - 420, 700);
  await point(fold);
  await fold.setChecked(true, { force: true });
  await pause(300);
  await click(page.getByRole('button', { name: 'Dashboard' }), 300);
  await settle();
  await moveTo(720, 560);
  await caption(
    'A top bar that folds away',
    'Move to the top edge to bring it back',
    900,
    widget('clock'),
  );
  await moveTo(720, 4);
  await pause(1100);
  await moveTo(720, 520);
  await pause(400);

  await caption('Tarpaulin', 'Your Canvas, your way', 2400);
  await caption('');
  await pause(500);
}
