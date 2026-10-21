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
  caption: (title: string, sub?: string, hold?: number) => Promise<void>;
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
  moveTo,
  caption,
  until,
  settle,
  startRecording,
  widget,
}: Director) {
  const settings = () => click(page.getByRole('button', { name: 'Settings', exact: true }), 350);
  const dashboard = async (hold = 1300) => {
    await click(page.getByRole('button', { name: 'Dashboard' }), 200);
    await settle();
    await pause(hold);
  };
  /** Settings › Appearance: pick a look tile, then show it on the dashboard. */
  const look = async (id: string, hold?: number) => {
    await settings();
    await click(page.getByTestId(`look-${id}`), 250);
    await dashboard(hold);
  };
  type Mode = 'light' | 'dark';
  /** Light ↔ dark as an on-screen effect: every colour cross-fades (see src/dev/demoHooks.ts). */
  const fadeTo = async (mode: Mode, hold = 1400) => {
    await page.evaluate(() => document.documentElement.classList.add('demo-fade'));
    await pause(34);
    await page.evaluate((m) => window.__tarpaulinDemo!.setMode(m), mode);
    await pause(900);
    await page.evaluate(() => document.documentElement.classList.remove('demo-fade'));
    await pause(hold);
  };
  /** A new look (textures can't cross-fade) swapped in behind a brief frosted blur. */
  const dipTo = async (id: string, mode: Mode, hold = 1400) => {
    await page.evaluate(() => document.getElementById('demo-dip')!.classList.add('on'));
    await pause(300);
    await page.evaluate(
      ([l, m]) => {
        window.__tarpaulinDemo!.setMode(m as Mode);
        window.__tarpaulinDemo!.applyLook(l);
      },
      [id, mode],
    );
    await pause(200);
    await page.evaluate(() => document.getElementById('demo-dip')!.classList.remove('on'));
    await pause(380 + hold);
  };

  await page.goto(`${appUrl}/?demo`);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await until(page.getByLabel('Canvas address'));
  await settle();
  startRecording();
  await pause(400);
  await caption(
    'Meet Tarpaulin',
    'A calmer dashboard for Canvas, built from widgets you arrange yourself',
    2000,
  );

  // ── Connect ──────────────────────────────────────────────────────────────────────────────────
  await caption('Connect your Canvas account', 'Your Canvas address and an access token', 400);
  await type(page.getByLabel('Canvas address'), 'canvas.youruni.edu');
  await type(page.getByLabel('Access token'), '7~DemoTokenForTheVideo');
  await caption(
    'The token goes straight into the system keychain',
    'Tarpaulin only ever reads from Canvas. It never submits or changes anything',
    300,
  );
  await click(page.getByRole('button', { name: 'Test & connect' }), 300);
  await until(page.getByRole('heading', { name: 'Make it yours' }));
  await settle();

  // ── First run: looks apply live ─────────────────────────────────────────────────────────────
  await caption('Pick a look', 'Every choice applies live, and can be changed any time', 500);
  await click(page.getByTestId('look-cork'), 1000);
  await click(page.getByTestId('look-terminal'), 1000);
  await click(page.getByTestId('look-plain'), 600);
  await click(page.getByRole('radio', { name: /^Deadline Focus/ }), 400);
  await click(page.getByRole('button', { name: 'Continue' }), 300);
  await until(page.getByRole('tab', { name: /Home/ }));
  await settle();

  // ── At a glance ─────────────────────────────────────────────────────────────────────────────
  await caption(
    'Everything that matters, at a glance',
    'The next deadline, what’s due, your to-dos, calendar and announcements',
    900,
  );
  await point(widget('countdown'), 0.5, 0.45);
  await pause(700);
  await point(page.getByTestId('due-item').first(), 0.3, 0.5);
  await pause(600);

  // ── Reader ──────────────────────────────────────────────────────────────────────────────────
  await caption(
    'Read it without leaving',
    'Assignments and announcements open right here, in Tarpaulin’s own layout',
    300,
  );
  await click(page.getByTestId('due-item').first(), 300);
  await until(page.getByTestId('reader-content'));
  await settle();
  await pause(500);
  await point(page.getByTestId('reader-content'), 0.5, 0.4);
  await scroll(520, 1400);
  await pause(700);
  await scroll(-520, 700);
  await pause(400);
  await caption(
    'Canvas HTML is cleaned up and restyled',
    'Images, tables and files work; outside links ask before opening',
    1400,
  );
  await page.keyboard.press('Escape');
  await settle();

  // ── Layout ──────────────────────────────────────────────────────────────────────────────────
  await caption('Rearrange anything', 'Drag widgets around the grid, and resize them', 300);
  await click(page.getByRole('button', { name: 'Edit', exact: true }), 600);
  await drag(widget('countdown').locator('.widget-drag-handle'), 1060, 0, { x: 0.3, y: 0.5 });
  await settle();
  await drag(widget('calendar').locator('.react-resizable-handle-se'), 230, 170);
  await settle();
  await pause(500);
  await click(page.getByRole('button', { name: 'Done' }), 800);

  await caption(
    'Widgets use the space they’re given',
    'A wide clock puts the greeting beside a time sized to fill its half',
    300,
  );
  await click(page.getByRole('button', { name: 'Add page' }), 600);
  await click(page.getByRole('button', { name: /Minimal/ }), 400);
  await settle();
  await pause(1600);
  await click(page.getByRole('tab', { name: /Home/ }), 300);
  await settle();

  // ── Looks ───────────────────────────────────────────────────────────────────────────────────
  await caption('Light or dark', 'Follows your system, or pick one yourself', 300);
  await fadeTo('dark');
  await fadeTo('light', 900);
  await caption(
    'Seven looks to choose from',
    'Each pairs a background with a widget style and fonts that belong together',
    300,
  );
  await look('cork', 1400);
  await caption('Cork board', 'Pinned post-it notes, in light…', 0);
  await pause(400);
  await caption('Cork board', '…and in dark', 0);
  await fadeTo('dark', 1500);
  await caption('Terminal', 'A green screen, scanlines and all', 0);
  await dipTo('terminal', 'dark', 1700);
  await caption('Blueprint', 'Lettered panels on grid paper', 0);
  await dipTo('blueprint', 'light', 1600);
  await caption('Arcade', 'Pixel windows under a night sky', 0);
  await dipTo('arcade', 'dark', 1700);

  // ── One widget, its own style ───────────────────────────────────────────────────────────────
  await dipTo('plain', 'light', 300);
  await caption(
    'Mix and match',
    'Give one widget its own style, or a page its own background',
    300,
  );
  await click(page.getByRole('button', { name: 'Edit', exact: true }), 500);
  await click(widget('countdown').getByRole('button', { name: /^Settings for/ }), 500);
  const panel = page.getByRole('dialog', { name: /settings$/ });
  await click(panel.getByTestId('skin-postit'), 500);
  await click(panel.getByRole('radio', { name: 'Pink' }), 800);
  await click(panel.getByRole('button', { name: 'Close' }), 400);
  await click(page.getByRole('button', { name: 'Style' }), 500);
  await click(page.getByRole('dialog', { name: /^Style/ }).getByTestId('background-dots'), 900);
  await page.keyboard.press('Escape');
  await settle();
  await click(page.getByRole('button', { name: 'Done' }), 1300);

  // ── Top bar ─────────────────────────────────────────────────────────────────────────────────
  await caption(
    'A top bar that gets out of the way',
    'Frosted glass by default; it can fold away until you need it',
    300,
  );
  await settings();
  const fold = page.getByRole('switch', { name: 'Fold away the top bar' });
  await point(fold);
  await pause(200);
  await fold.setChecked(true, { force: true });
  await pause(500);
  await click(page.getByRole('button', { name: 'Dashboard' }), 300);
  await settle();
  await moveTo(720, 560);
  await pause(1400);
  await caption('Move to the top edge and it slides back in', undefined, 0);
  await moveTo(720, 4);
  await pause(1300);
  await moveTo(720, 560);
  await pause(1200);

  // ── Settings ────────────────────────────────────────────────────────────────────────────────
  await caption(
    'Tuned to how you study',
    'Hide courses, nickname them, and get reminders before deadlines',
    300,
  );
  await moveTo(720, 4);
  await pause(400);
  await settings();
  const search = page.getByRole('searchbox', { name: 'Search courses' });
  await point(search);
  await pause(200);
  await type(search, 'mach');
  await pause(900);
  await click(page.getByRole('button', { name: 'Clear search' }), 400);
  await point(page.getByRole('heading', { name: /Notifications/ }).first());
  await pause(1200);
  await moveTo(720, 4);
  await pause(300);
  await dashboard(600);

  await caption(
    'Tarpaulin',
    'Your Canvas, your way. And it never changes anything in Canvas',
    3200,
  );
  await caption('');
  await pause(600);
}
