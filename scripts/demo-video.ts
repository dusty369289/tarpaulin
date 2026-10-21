// Records a product demo: a student connecting Canvas, then using, rearranging, resizing,
// filtering and theming their dashboard, at human speed with short captions on top. It runs the
// real app against the mock Canvas (the dummy "showcase" term), so no personal data appears.
//
//   pnpm demo:video     # → screenshots/demo/tarpaulin-demo.mp4
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { Locator } from 'playwright';
import { launch, startStack } from './browser';

const OUT = 'screenshots/demo';
const SIZE = { width: 1440, height: 900 };

// Visible cursor, click ripple and caption banner (Playwright videos don't show the pointer).
const OVERLAY = () => {
  const install = () => {
    if (document.getElementById('demo-cursor')) return;
    const style = document.createElement('style');
    style.textContent = `
      #demo-cursor{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:transform 40ms linear;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
      .demo-ripple{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #6366f1;z-index:2147483646;pointer-events:none;animation:demo-ripple 450ms ease-out forwards}
      @keyframes demo-ripple{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
      #demo-caption{position:fixed;left:50%;bottom:34px;transform:translate(-50%,8px);z-index:2147483645;pointer-events:none;opacity:0;transition:opacity 300ms ease,transform 300ms ease;
        background:rgba(17,24,39,.88);color:#fff;padding:12px 22px;border-radius:14px;font:600 20px/1.3 ui-sans-serif,system-ui,sans-serif;text-align:center;max-width:780px;box-shadow:0 12px 40px -10px rgba(0,0,0,.5);backdrop-filter:blur(6px)}
      #demo-caption small{display:block;font-weight:400;font-size:15px;opacity:.8;margin-top:3px}
      #demo-caption.show{opacity:1;transform:translate(-50%,0)}`;
    document.head.appendChild(style);
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cursor);
    const caption = document.createElement('div');
    caption.id = 'demo-caption';
    document.body.appendChild(caption);
    document.addEventListener(
      'mousemove',
      (e) => (cursor.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`),
      true,
    );
    document.addEventListener(
      'mousedown',
      (e) => {
        const r = document.createElement('div');
        r.className = 'demo-ripple';
        r.style.left = `${e.clientX}px`;
        r.style.top = `${e.clientY}px`;
        document.body.appendChild(r);
        setTimeout(() => r.remove(), 500);
      },
      true,
    );
    (window as unknown as { __demoCaption: (t: string, s?: string) => void }).__demoCaption = (
      title,
      sub,
    ) => {
      if (!title) return caption.classList.remove('show');
      caption.innerHTML = '';
      caption.append(title);
      if (sub) {
        const small = document.createElement('small');
        small.textContent = sub;
        caption.append(small);
      }
      caption.classList.add('show');
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
};

const stack = await startStack(false);
stack.useScenario('showcase');
const browser = await launch({ uncapped: false });
rmSync(`${OUT}/frames`, { recursive: true, force: true });
mkdirSync(`${OUT}/frames`, { recursive: true });
const context = await browser.newContext({ viewport: SIZE });
// tsx (esbuild keepNames) wraps inner functions in __name(); give the page a no-op for it.
await context.addInitScript({ content: 'window.__name = (f) => f;' });
await context.addInitScript(OVERLAY);
const page = await context.newPage();

// Record with Chrome's screencast: every changed frame arrives with its timestamp, and ffmpeg
// later turns the sequence into constant-frame-rate video with the real timing.
const frames: Array<{ file: string; t: number }> = [];
const cdp = await context.newCDPSession(page);
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const file = `${OUT}/frames/${String(frames.length).padStart(6, '0')}.jpg`;
  writeFileSync(file, Buffer.from(data, 'base64'));
  frames.push({ file, t: metadata.timestamp ?? Date.now() / 1000 });
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
const startRecording = () =>
  cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: SIZE.width,
    maxHeight: SIZE.height,
    everyNthFrame: 1,
  });

// ---- human-speed helpers ---------------------------------------------------------------------
let mouse = { x: SIZE.width / 2, y: SIZE.height / 2 };
const pause = (ms: number) => page.waitForTimeout(ms);
async function moveTo(x: number, y: number) {
  const dist = Math.hypot(x - mouse.x, y - mouse.y);
  const steps = Math.max(6, Math.round(dist / 28));
  for (let i = 1; i <= steps; i++) {
    // Ease in-out so it doesn't look robotic.
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(mouse.x + (x - mouse.x) * e, mouse.y + (y - mouse.y) * e);
    await pause(12);
  }
  mouse = { x, y };
}
async function point(target: Locator, dx = 0.5, dy = 0.5) {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  await moveTo(box.x + box.width * dx, box.y + box.height * dy);
  return box;
}
async function click(target: Locator, wait = 450) {
  await point(target);
  await pause(180);
  await page.mouse.down();
  await pause(70);
  await page.mouse.up();
  await pause(wait);
}
async function type(target: Locator, text: string) {
  await click(target, 150);
  await target.pressSequentially(text, { delay: 42 });
  await pause(300);
}
async function drag(from: Locator, dx: number, dy: number, at = { x: 0.5, y: 0.5 }) {
  const box = await point(from, at.x, at.y);
  const start = { x: box.x + box.width * at.x, y: box.y + box.height * at.y };
  await pause(200);
  await page.mouse.down();
  const steps = 36;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(start.x + dx * e, start.y + dy * e);
    await pause(16);
  }
  mouse = { x: start.x + dx, y: start.y + dy };
  await pause(150);
  await page.mouse.up();
  await pause(700);
}
async function caption(title: string, sub?: string, hold = 0) {
  await page.evaluate(
    ([t, s]) =>
      (window as unknown as { __demoCaption: (t: string, s?: string) => void }).__demoCaption(t, s),
    [title, sub] as const,
  );
  if (hold) await pause(hold);
}
const settled = () => page.evaluate(() => window.__tarpaulin!.settled({ timeoutMs: 15_000 }));
const widget = (type: string) => page.locator(`[data-widget-type="${type}"]`).first();

// ---- the story ---------------------------------------------------------------------------------
await page.goto(`${stack.appUrl}/?demo`);
await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await page.reload();
await page.getByLabel('Canvas address').waitFor();
await startRecording();
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
await page.getByRole('tab', { name: /Home/ }).waitFor();
await settled();
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
await settled();
await pause(500);

await caption('…and resize them', 'Widgets adapt their layout to whatever size you give them', 300);
await drag(widget('calendar').locator('.react-resizable-handle-se'), 230, 170);
await settled();
await caption('A bigger calendar switches to a full month view', undefined, 300);
await click(widget('calendar').getByRole('button', { name: /^Settings for/ }), 600);
await page.getByLabel('View').selectOption('month');
await pause(900);
await page.keyboard.press('Escape');
await settled();
await pause(1400);

await caption('Add more widgets', 'Grades, courses, notes, a clock — nine to choose from', 300);
await click(page.getByRole('button', { name: 'Add widget' }), 800);
await point(page.getByRole('button', { name: /^Grades/ }));
await pause(500);
await click(page.getByRole('button', { name: /^Grades/ }), 900);
await settled();
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
await settled();
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
await settled();
await pause(1500);
await caption('Jot things down too', 'Notes and checklists stay on your device', 300);
await type(widget('todo').getByLabel('New task'), 'Book a library study room');
await page.keyboard.press('Enter');
await pause(500);
await type(widget('todo').getByLabel('New task'), 'Email tutor about essay feedback');
await page.keyboard.press('Enter');
await pause(600);
await click(widget('todo').getByRole('checkbox', { name: 'Book a library study room' }), 900);

await caption('Make it yours', 'Themes, accent colours, fonts, course colours and nicknames', 300);
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
await settled();
await click(page.getByRole('tab', { name: /Home/ }), 1200);
await settled();
await caption('Tarpaulin', 'Your Canvas, your way — and it never changes anything in Canvas', 3200);
await caption('');
await pause(600);

await cdp.send('Page.stopScreencast');
await context.close();
await browser.close();
await stack.close();

// ---- encode ------------------------------------------------------------------------------------
// ffconcat with per-frame durations from the screencast timestamps, resampled to 30fps.
const lines = ['ffconcat version 1.0'];
for (const [i, f] of frames.entries()) {
  const next = frames[i + 1]?.t ?? f.t + 1;
  lines.push(
    `file '${f.file.split('/').pop()}'`,
    `duration ${Math.max(0.001, next - f.t).toFixed(4)}`,
  );
}
lines.push(`file '${frames.at(-1)!.file.split('/').pop()}'`);
writeFileSync(`${OUT}/frames/list.ffconcat`, lines.join('\n'));
execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-f',
  'concat',
  '-safe',
  '0',
  '-i',
  `${OUT}/frames/list.ffconcat`,
  '-vf',
  'fps=30,format=yuv420p',
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  '20',
  '-movflags',
  '+faststart',
  `${OUT}/tarpaulin-demo.mp4`,
]);
rmSync(`${OUT}/frames`, { recursive: true, force: true });
const seconds = frames.at(-1)!.t - frames[0].t;
console.log(`Wrote ${OUT}/tarpaulin-demo.mp4 (${frames.length} frames, ${seconds.toFixed(1)}s)`);
