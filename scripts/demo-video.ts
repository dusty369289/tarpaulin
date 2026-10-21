// Renders the product demo (scripts/demo/story.ts) to video: a student connecting Canvas, then
// using, rearranging, resizing, filtering and theming their dashboard, with captions on top. It
// runs the real app against the mock Canvas (the invented "showcase" term).
//
//   pnpm demo:video                 # → screenshots/demo/tarpaulin-demo.mp4 (30fps)
//   pnpm demo:video --fps=60 --workers=3
//
// How it stays smooth and fast:
//   - Deterministic: the page runs on a virtual clock (scripts/virtual-time.js) that advances
//     exactly one frame per step, and network requests complete in zero video time. Frame
//     pacing is perfect no matter how long a capture takes.
//   - Frames where nothing changed reuse the previous capture.
//   - The pointer is drawn by ffmpeg from logged positions, so pointer-only motion is free.
//   - Several browsers render in parallel: each plays the whole story but only captures its own
//     interleaved chunks, which are stitched back together in order.
import { execFileSync } from 'node:child_process';
import { cpus } from 'node:os';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { Browser, CDPSession, Locator, Page } from 'playwright';
import { launch, startStack } from './browser';
import { story } from './demo/story';

const startedAt = Date.now();
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const FPS = Number(arg('fps') ?? 30);
const FRAME_MS = 1000 / FPS;
const WORKERS = Number(arg('workers') ?? Math.max(1, Math.min(4, cpus().length - 1)));
const CHUNK = FPS * 2; // frames per interleaved chunk
const OUT = 'screenshots/demo';
const SIZE = { width: 1440, height: 900 };
const CURSOR_TIP = 5; // the pointer's tip, in the cursor image

// Click ripple and caption banner. The pointer itself is drawn by ffmpeg from the logged positions,
// so frames where only the pointer moves don't need re-rendering.
const OVERLAY = () => {
  const install = () => {
    if (document.getElementById('demo-caption')) return;
    const style = document.createElement('style');
    style.textContent = `
      .demo-ripple{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #6366f1;z-index:2147483646;pointer-events:none;animation:demo-ripple 450ms ease-out forwards}
      @keyframes demo-ripple{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
      #demo-caption{position:fixed;left:50%;bottom:34px;transform:translate(-50%,8px);z-index:2147483645;pointer-events:none;opacity:0;transition:opacity 300ms ease,transform 300ms ease;
        background:rgba(17,24,39,.88);color:#fff;padding:12px 22px;border-radius:14px;font:600 20px/1.3 ui-sans-serif,system-ui,sans-serif;text-align:center;max-width:780px;box-shadow:0 12px 40px -10px rgba(0,0,0,.5);backdrop-filter:blur(6px)}
      #demo-caption small{display:block;font-weight:400;font-size:15px;opacity:.8;margin-top:3px}
      #demo-caption.show{opacity:1;transform:translate(-50%,0)}`;
    document.head.appendChild(style);
    const caption = document.createElement('div');
    caption.id = 'demo-caption';
    document.body.appendChild(caption);
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

interface Render {
  total: number;
  /** Captured frames this worker owns (index → JPEG); reused frames share a buffer. */
  frames: Map<number, Buffer>;
  pointer: Array<[number, number]>;
  rendered: number;
}

const owner = (i: number) => Math.floor(i / CHUNK) % WORKERS;

async function render(browser: Browser, appUrl: string, worker: number): Promise<Render> {
  const context = await browser.newContext({ viewport: SIZE });
  // tsx (esbuild keepNames) wraps inner functions in __name(); give the page a no-op for it.
  await context.addInitScript({ content: 'window.__name = (f) => f;' });
  await context.addInitScript({ path: new URL('./virtual-time.js', import.meta.url).pathname });
  await context.addInitScript(OVERLAY);
  const page: Page = await context.newPage();
  const cdp: CDPSession = await context.newCDPSession(page);

  // Network completes in zero video time: before each frame, wait (in real time) for requests
  // in flight, so every worker sees identical frames.
  let inflight = 0;
  page.on('request', () => inflight++);
  page.on('requestfinished', () => inflight--);
  page.on('requestfailed', () => inflight--);
  const networkIdle = async () => {
    while (inflight > 0) await new Promise((r) => setTimeout(r, 2));
  };

  const out: Render = { total: 0, frames: new Map(), pointer: [], rendered: 0 };
  let recording = false;
  let last: Buffer | null = null;
  let mouse = { x: SIZE.width / 2, y: SIZE.height / 2 };

  async function frame() {
    await networkIdle();
    const changed = await page.evaluate(
      (ms) =>
        (window as unknown as { __vt: { tick: (ms: number) => Promise<boolean> } }).__vt.tick(ms),
      FRAME_MS,
    );
    if (!recording) return;
    const i = out.total++;
    out.pointer.push([Math.round(mouse.x), Math.round(mouse.y)]);
    if (owner(i) !== worker) {
      last = null; // the next owned frame must be captured fresh
      return;
    }
    if (changed || !last) {
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 90,
        optimizeForSpeed: true,
      });
      last = Buffer.from(shot.data, 'base64');
      out.rendered++;
    }
    out.frames.set(i, last);
  }
  const frames = (ms: number) => Math.max(1, Math.round(ms / FRAME_MS));
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

  async function pause(ms: number) {
    for (let n = frames(ms); n > 0; n--) await frame();
  }
  async function moveTo(x: number, y: number) {
    const dist = Math.hypot(x - mouse.x, y - mouse.y);
    const n = frames(260 + dist * 0.55); // longer moves take longer, like a hand
    const from = mouse;
    for (let k = 1; k <= n; k++) {
      const e = ease(k / n);
      mouse = { x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e };
      await page.mouse.move(mouse.x, mouse.y);
      await frame();
    }
  }
  async function point(target: Locator, dx = 0.5, dy = 0.5) {
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    await moveTo(box.x + box.width * dx, box.y + box.height * dy);
    return box;
  }
  async function click(target: Locator, wait = 450) {
    await point(target);
    await pause(140);
    await page.mouse.down();
    await pause(70);
    await page.mouse.up();
    await pause(wait);
  }
  async function type(target: Locator, text: string) {
    await click(target, 150);
    for (const ch of text) {
      await page.keyboard.type(ch);
      await pause(45);
    }
    await pause(300);
  }
  async function drag(from: Locator, dx: number, dy: number, at = { x: 0.5, y: 0.5 }) {
    const box = await point(from, at.x, at.y);
    const start = { x: box.x + box.width * at.x, y: box.y + box.height * at.y };
    await pause(200);
    await page.mouse.down();
    const n = frames(1100);
    for (let k = 1; k <= n; k++) {
      const e = ease(k / n);
      mouse = { x: start.x + dx * e, y: start.y + dy * e };
      await page.mouse.move(mouse.x, mouse.y);
      await frame();
    }
    await pause(150);
    await page.mouse.up();
    await pause(700);
  }
  async function caption(title: string, sub?: string, hold = 0) {
    await page.evaluate(
      ([t, s]) =>
        (window as unknown as { __demoCaption: (t: string, s?: string) => void }).__demoCaption(
          t,
          s,
        ),
      [title, sub] as const,
    );
    if (hold) await pause(hold);
  }
  async function until(target: Locator) {
    for (let n = frames(15_000); n > 0; n--) {
      await networkIdle();
      if (await target.isVisible()) return;
      await frame();
    }
    throw new Error(`Timed out waiting for ${target}`);
  }

  await story({
    page,
    appUrl,
    pause,
    point,
    click,
    type,
    drag,
    caption,
    until,
    settle: () => pause(500),
    startRecording: () => {
      recording = true;
    },
    widget: (t) => page.locator(`[data-widget-type="${t}"]`).first(),
  });
  await context.close();
  return out;
}

// ---- run ---------------------------------------------------------------------------------------
const stack = await startStack(false);
stack.useScenario('showcase');
mkdirSync(OUT, { recursive: true });
const browsers = await Promise.all(
  Array.from({ length: WORKERS }, () => launch({ uncapped: true })),
);

// The pointer image, rendered once with a transparent background.
const CURSOR_PNG = `${OUT}/.cursor.png`;
{
  const p = await browsers[0].newPage();
  await p.setContent(
    `<div id="c" style="width:34px;height:34px;padding:2px"><svg viewBox="0 0 24 24" width="24" height="24" style="filter:drop-shadow(0 2px 2px rgba(0,0,0,.4))"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></div>`,
  );
  await p.locator('#c').screenshot({ path: CURSOR_PNG, omitBackground: true });
  await p.close();
}

const renders = await Promise.all(browsers.map((b, w) => render(b, stack.appUrl, w)));
await Promise.all(browsers.map((b) => b.close()));
await stack.close();
const renderedAt = Date.now();

// Every worker must have played the identical story.
const total = renders[0].total;
if (renders.some((r) => r.total !== total)) {
  throw new Error(
    `Workers disagree on length (${renders.map((r) => r.total).join(', ')} frames); rerun with --workers=1`,
  );
}

// One encode: the stitched frames, with the pointer drawn on at its logged positions.
const CMDS = `${OUT}/.pointer.cmd`;
const lines: string[] = [];
let prev = '';
renders[0].pointer.forEach(([x, y], i) => {
  const pos = `${x - CURSOR_TIP} ${y - CURSOR_TIP}`;
  if (pos === prev) return;
  prev = pos;
  lines.push(
    `${(i / FPS).toFixed(4)} overlay@pointer x ${x - CURSOR_TIP}, overlay@pointer y ${y - CURSOR_TIP};`,
  );
});
writeFileSync(CMDS, lines.join('\n'));
// Each run of identical frames is written once with its duration, so ffmpeg decodes ~1 image per
// change instead of one per frame; the fps filter turns it back into constant 30fps.
const FRAMES_DIR = `${OUT}/.frames`;
rmSync(FRAMES_DIR, { recursive: true, force: true });
mkdirSync(FRAMES_DIR, { recursive: true });
const list = ['ffconcat version 1.0'];
let file = '';
for (let i = 0, n = 0; i < total; n++) {
  const buf = renders[owner(i)].frames.get(i)!;
  let run = 1;
  while (i + run < total && renders[owner(i + run)].frames.get(i + run) === buf) run++;
  file = `${String(n).padStart(5, '0')}.jpg`;
  writeFileSync(`${FRAMES_DIR}/${file}`, buf);
  list.push(`file '${file}'`, `duration ${(run / FPS).toFixed(6)}`);
  i += run;
}
list.push(`file '${file}'`); // the concat demuxer needs the last file repeated
writeFileSync(`${FRAMES_DIR}/list.ffconcat`, list.join('\n'));
execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-f',
  'concat',
  '-safe',
  '0',
  '-i',
  `${FRAMES_DIR}/list.ffconcat`,
  '-loop',
  '1',
  '-framerate',
  String(FPS),
  '-i',
  CURSOR_PNG,
  '-filter_complex',
  `[0:v]fps=${FPS},sendcmd=f=${CMDS}[v];[v][1:v]overlay@pointer=x=-100:y=-100:eval=frame:shortest=1,format=yuv420p[out]`,
  '-map',
  '[out]',
  '-frames:v',
  String(total),
  '-c:v',
  'libx264',
  '-preset',
  'superfast',
  '-crf',
  '19',
  '-movflags',
  '+faststart',
  `${OUT}/tarpaulin-demo.mp4`,
]);
rmSync(FRAMES_DIR, { recursive: true, force: true });
for (const f of [CMDS, CURSOR_PNG]) rmSync(f, { force: true });

const rendered = renders.reduce((n, r) => n + r.rendered, 0);
console.log(
  `Wrote ${OUT}/tarpaulin-demo.mp4: ${(total / FPS).toFixed(1)}s at ${FPS}fps — ${total} frames ` +
    `(${rendered} rendered, ${total - rendered} reused) on ${WORKERS} workers; ` +
    `render ${((renderedAt - startedAt) / 1000).toFixed(1)}s + encode ${((Date.now() - renderedAt) / 1000).toFixed(1)}s`,
);
