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
  caption,
  until,
  settle,
  startRecording,
  widget,
}: Director) {
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
    'A calmer dashboard for Canvas — built from widgets you arrange yourself',
    2600,
  );

  await caption(
    'Connect your Canvas account',
    'Paste your university’s Canvas address and an access token',
    600,
  );
  await type(page.getByLabel('Canvas address'), 'canvas.youruni.edu');
  await type(page.getByLabel('Access token'), '7~DemoTokenForTheVideo');
  await caption(
    'Your token goes straight into the system keychain',
    'Tarpaulin only ever reads from Canvas — it never submits or changes anything',
    400,
  );
  await click(page.getByRole('button', { name: 'Test & connect' }), 300);
  await until(page.getByRole('heading', { name: 'Make it yours' }));
  await settle();
  await caption(
    'Pick a look and a starting layout',
    'Everything can be fine-tuned later in Settings',
    700,
  );
  await click(page.getByRole('radio', { name: /^Dark/ }), 900);
  await click(page.getByRole('radio', { name: /^Match system/ }), 600);
  await click(page.getByRole('radio', { name: 'Accent #7c3aed' }), 700);
  await click(page.getByRole('radio', { name: /^Weekly Planner/ }), 500);
  await click(page.getByRole('radio', { name: /^Deadline Focus/ }), 600);
  await click(page.getByRole('button', { name: 'Continue' }), 300);
  await until(page.getByRole('tab', { name: /Home/ }));
  await settle();
  await caption(
    'Everything that matters, at a glance',
    'Next deadline, what’s due, your to-dos, calendar and announcements',
    1200,
  );
  await point(widget('countdown'), 0.5, 0.45);
  await pause(900);
  await point(page.getByTestId('due-item').first(), 0.3, 0.5);
  await pause(700);
  await point(page.getByTestId('due-item').nth(2), 0.3, 0.5);
  await pause(900);

  await caption('Rearrange anything', 'Edit mode lets you drag widgets around the grid', 300);
  await click(page.getByRole('button', { name: 'Edit' }), 700);
  await drag(widget('countdown').locator('.widget-drag-handle'), 1060, 0, { x: 0.3, y: 0.5 });
  await settle();
  await pause(500);

  await caption(
    '…and resize them',
    'Widgets adapt their layout to whatever size you give them',
    300,
  );
  await drag(widget('calendar').locator('.react-resizable-handle-se'), 230, 170);
  await settle();
  await caption('A bigger calendar switches to a full month view', undefined, 300);
  await click(widget('calendar').getByRole('button', { name: /^Settings for/ }), 600);
  await page.getByLabel('View').selectOption('month');
  await pause(900);
  await page.keyboard.press('Escape');
  await settle();
  await pause(1400);

  await caption('Add more widgets', 'Grades, courses, notes, a clock — nine to choose from', 300);
  await click(page.getByRole('button', { name: 'Add widget' }), 800);
  await point(page.getByRole('button', { name: /^Grades/ }));
  await pause(500);
  await click(page.getByRole('button', { name: /^Grades/ }), 900);
  await settle();
  await pause(900);

  await caption(
    'Every widget has its own settings',
    'Filter by course, change the time window, group and sort',
    300,
  );
  await click(widget('due-soon').getByRole('button', { name: /^Settings for/ }), 700);
  const panel = page.getByRole('dialog', { name: /settings$/ });
  await type(panel.getByLabel('Title'), 'Databases & ML');
  const slider = panel.getByLabel(/Look ahead/);
  await click(slider, 200);
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('ArrowRight');
    await pause(70);
  }
  await pause(400);
  await point(panel.getByLabel('Group by'));
  await pause(300);
  await panel.getByLabel('Group by').selectOption('course');
  await pause(600);
  await caption('Show only the courses you care about', undefined, 200);
  // Two modules with work coming up, so the filtered list is never empty mid-demo.
  await click(panel.getByRole('checkbox', { name: /Database Systems/ }), 350);
  await click(panel.getByRole('checkbox', { name: /Machine Learning/ }), 350);
  await click(panel.getByLabel('Show points'), 500);
  await pause(800);
  await click(panel.getByRole('button', { name: 'Close' }), 600);
  await settle();
  await pause(1200);

  await caption('Done editing', 'Your layout is saved automatically', 300);
  await click(page.getByRole('button', { name: 'Done' }), 1600);

  await caption(
    'Pages and presets',
    'Start from Deadline Focus, Weekly Planner or Minimal — or a blank page',
    300,
  );
  await click(page.getByRole('button', { name: 'Add page' }), 700);
  await point(page.getByRole('button', { name: /Weekly Planner/ }));
  await pause(600);
  await click(page.getByRole('button', { name: /Weekly Planner/ }), 900);
  await settle();
  await pause(1500);
  await caption('Jot things down too', 'Notes and checklists stay on your device', 300);
  await type(widget('todo').getByLabel('New task'), 'Book a library study room');
  await page.keyboard.press('Enter');
  await pause(500);
  await type(widget('todo').getByLabel('New task'), 'Email tutor about essay feedback');
  await page.keyboard.press('Enter');
  await pause(600);
  await click(widget('todo').getByRole('checkbox', { name: 'Book a library study room' }), 900);

  await caption(
    'Make it yours',
    'Themes, accent colours, fonts, course colours and nicknames',
    300,
  );
  await click(page.getByRole('button', { name: 'Settings', exact: true }), 900);
  await point(page.getByRole('combobox').first());
  await pause(300);
  await page.getByRole('combobox').first().selectOption('dark');
  await pause(1200);
  const nickname = page.getByLabel(/^Nickname for/).first();
  await type(nickname, 'Algorithms');
  await page.keyboard.press('Tab');
  await pause(800);
  await click(page.getByRole('button', { name: 'Dashboard' }), 900);
  await settle();
  await click(page.getByRole('tab', { name: /Home/ }), 1200);
  await settle();
  await caption(
    'Tarpaulin',
    'Your Canvas, your way — and it never changes anything in Canvas',
    3200,
  );
  await caption('');
  await pause(600);
}
