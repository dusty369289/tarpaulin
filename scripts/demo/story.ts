// The demo video's script: what a student does, in order, with the captions shown on top.
// scripts/demo-video.ts renders it; every helper here is measured in video time.
import type { Locator, Page } from 'playwright';

/** The dev-only hooks the app exposes in demo mode (src/dev/demoHooks.ts). */
type DemoWindow = {
  __tarpaulinDemo: {
    setMode: (theme: 'light' | 'dark') => void;
    applyLook: (id: string) => void;
    setPages: (pages: unknown[]) => void;
  };
};

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
  /**
   * Show a caption (an empty title hides it). `near` puts it beside that element; it keeps clear
   * of `near`, of everything in `avoid` (what's about to be typed in or clicked) and of the pointer.
   */
  caption: (
    title: string,
    sub?: string,
    hold?: number,
    near?: Locator,
    avoid?: Locator[],
  ) => Promise<void>;
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
  drag,
  scroll,
  caption,
  crossfade,
  until,
  settle,
  startRecording,
  widget,
}: Director) {
  type Mode = 'light' | 'dark';
  /** Light ↔ dark as an on-screen effect (see src/dev/demoHooks.ts). */
  const fadeTo = async (mode: Mode, hold = 1400) => {
    await crossfade(() =>
      page.evaluate((m) => (window as unknown as DemoWindow).__tarpaulinDemo.setMode(m), mode),
    );
    await pause(hold);
  };
  /** Another look (and mode), dissolved in. */
  const dipTo = async (id: string, mode: Mode, hold = 1400) => {
    await crossfade(() =>
      page.evaluate(
        ([l, m]) => {
          (window as unknown as DemoWindow).__tarpaulinDemo.setMode(m as Mode);
          (window as unknown as DemoWindow).__tarpaulinDemo.applyLook(l);
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
    [page.getByLabel('Access token'), page.getByRole('button', { name: 'Test & connect' })],
  );
  await type(page.getByLabel('Canvas address'), 'canvas.uni.edu');
  await type(page.getByLabel('Access token'), '7~a8Kd2');
  await caption(
    'Read-only, and the token stays in your keychain',
    'It never changes anything in Canvas',
    1300,
    page.getByRole('button', { name: 'Test & connect' }),
    [page.getByLabel('Access token'), page.getByLabel('Canvas address')],
  );
  await click(page.getByRole('button', { name: 'Test & connect' }), 300);
  await caption('');
  await until(page.getByRole('heading', { name: 'Make it yours' }));
  await settle();

  // ── First run ───────────────────────────────────────────────────────────────────────────────
  await caption('Pick a look', 'It applies live', 200, page.getByTestId('look-cork'), [
    page.getByTestId('look-plain'),
  ]);
  await click(page.getByTestId('look-cork'), 1000);
  await click(page.getByTestId('look-plain'), 300);
  await click(page.getByRole('button', { name: 'Continue' }), 300);
  await until(page.getByRole('tab', { name: /Home/ }));
  await settle();
  await crossfade(async () => {
    await page.evaluate(
      (pages) => (window as unknown as DemoWindow).__tarpaulinDemo.setPages(pages),
      PAGES,
    );
    await settle();
  });

  // ── The week ────────────────────────────────────────────────────────────────────────────────
  await caption(
    'Your week at a glance',
    'Classes, deadlines and events together',
    300,
    widget('calendar'),
    [widget('calendar').getByRole('button', { name: 'Next' })],
  );
  await point(widget('calendar'), 0.35, 0.4);
  await pause(600);
  await click(widget('calendar').getByRole('button', { name: 'Next' }), 900);
  await click(widget('calendar').getByRole('button', { name: 'Previous' }), 500);

  // ── Reader ──────────────────────────────────────────────────────────────────────────────────
  await caption(
    'Open anything without leaving',
    'Assignments and announcements open in Tarpaulin',
    200,
    page.getByTestId('due-item').first(),
  );
  await click(page.getByTestId('due-item').first().getByRole('button').first(), 300);
  await until(page.getByTestId('reader-content'));
  await settle();
  await point(page.getByTestId('reader-content'), 0.5, 0.4);
  await scroll(420, 1000);
  await pause(300);
  await page.keyboard.press('Escape');
  await settle();

  // ── The month ───────────────────────────────────────────────────────────────────────────────
  await click(page.getByRole('tab', { name: /Month/ }), 300);
  await settle();
  const busyDay = widget('calendar').getByRole('button', { name: /, [1-9]\d* items?$/ });
  await caption(
    'Or the whole month',
    'Pick a day to see everything on it',
    300,
    widget('calendar'),
    [busyDay.nth(3), busyDay.nth(6)],
  );
  await click(busyDay.nth(3), 800);
  await click(busyDay.nth(6), 900);

  // ── Build a page ────────────────────────────────────────────────────────────────────────────
  const addWidget = page.getByRole('button', { name: 'Add widget' });
  const add = async (name: RegExp) => {
    await click(addWidget, 350);
    await click(page.getByRole('button', { name }), 150);
    await pause(350);
  };
  await click(page.getByRole('button', { name: 'Add page' }), 500);
  await click(page.getByRole('button', { name: /Blank page/ }), 400);
  await settle();
  await click(page.getByRole('button', { name: 'Edit', exact: true }), 300);
  await caption('Build your own pages', 'Pick from nine widgets', 200, addWidget);
  await add(/^Clock/);
  await add(/^Countdown/);
  await add(/^Grades/);

  // Lay them out in a row: each goes beside the clock.
  const frame = (type: string) => widget(type);
  const clockBox = (await frame('clock').boundingBox())!;
  const gap = 12;
  await caption('Drag them where you want', undefined, 200, frame('countdown'), [frame('clock')]);
  {
    const box = (await frame('countdown').boundingBox())!;
    await drag(
      frame('countdown').locator('.widget-drag-handle'),
      clockBox.x + clockBox.width + gap - box.x,
      clockBox.y - box.y,
      { x: 0.25, y: 0.5 },
    );
    await settle();
  }
  {
    const box = (await frame('grades').boundingBox())!;
    await drag(
      frame('grades').locator('.widget-drag-handle'),
      (clockBox.width + gap) * 2 + clockBox.x - box.x,
      clockBox.y - box.y,
      { x: 0.25, y: 0.5 },
    );
    await settle();
  }
  await caption('Resize them, and the content adapts', undefined, 200, frame('clock'));
  await drag(frame('clock').locator('.react-resizable-handle-se'), 0, 150);
  await settle();
  await pause(500);

  await caption(
    'Every widget has its own settings',
    'Here, the countdown shows seconds',
    200,
    frame('countdown'),
  );
  await click(frame('countdown').getByRole('button', { name: /^Settings for/ }), 500);
  const panel = page.getByRole('dialog', { name: /settings$/ });
  await click(panel.getByLabel('Show seconds'), 700);
  await click(panel.getByRole('button', { name: 'Close' }), 300);
  await pause(900);
  await click(page.getByRole('button', { name: 'Done' }), 300);
  await click(page.getByRole('tab', { name: /This week/ }), 300);
  await settle();

  // ── Looks ───────────────────────────────────────────────────────────────────────────────────
  await caption('Light or dark', undefined, 0);
  await fadeTo('dark', 900);
  await fadeTo('light', 300);
  await caption('Seven looks', 'Cork board, in light…', 0);
  await dipTo('cork', 'light', 900);
  await caption('Seven looks', '…and in dark', 0);
  await fadeTo('dark', 900);
  await caption('Terminal', undefined, 0);
  await dipTo('terminal', 'dark', 1000);
  await caption('Blueprint', undefined, 0);
  await dipTo('blueprint', 'light', 1000);
  await caption('Arcade', undefined, 0);
  await dipTo('arcade', 'dark', 1000);
  await caption('');
  await dipTo('plain', 'light', 300);

  await caption('Tarpaulin', 'Your Canvas, your way', 2400);
  await caption('');
  await pause(500);
}
