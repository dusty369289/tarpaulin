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
const EPOCH = Date.now(); // every browser's virtual clock starts here

// Click ripple and caption banner. The pointer itself is drawn by ffmpeg from the logged positions,
// so frames where only the pointer moves don't need re-rendering.
interface DemoCaptionApi {
  __demoCaptionSet: (title: string, sub?: string) => { w: number; h: number };
  __demoCaptionMove: (left: number, top: number, animate: boolean) => void;
  __demoCaptionShow: (show: boolean) => void;
}

const OVERLAY = () => {
  const install = () => {
    if (document.getElementById('demo-caption')) return;
    const style = document.createElement('style');
    style.textContent = `
      .demo-ripple{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #6366f1;z-index:2147483646;pointer-events:none;animation:demo-ripple 450ms ease-out forwards}
      @keyframes demo-ripple{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
      #demo-caption{position:fixed;left:0;top:0;z-index:2147483645;pointer-events:none;opacity:0;transform:translateY(6px);transition:opacity 280ms ease,transform 280ms ease,left 420ms cubic-bezier(.45,0,.55,1),top 420ms cubic-bezier(.45,0,.55,1);
        background:rgba(17,24,39,.9);color:#fff;padding:12px 20px;border-radius:14px;font:600 19px/1.3 ui-sans-serif,system-ui,sans-serif;text-align:center;max-width:540px;box-shadow:0 12px 40px -10px rgba(0,0,0,.5);backdrop-filter:blur(6px)}
      #demo-caption small{display:block;font-weight:400;font-size:15px;opacity:.82;margin-top:3px}
      #demo-caption.show{opacity:1;transform:none}
      #demo-caption.jump{transition:opacity 280ms ease,transform 280ms ease}
      html{scroll-behavior:auto!important}
      #demo-xfade{position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483640;pointer-events:none}`;
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
    const api = window as unknown as DemoCaptionApi;
    /** Sets the text (hidden until shown) and returns the caption's size. */
    api.__demoCaptionSet = (title, sub) => {
      caption.innerHTML = '';
      caption.append(title);
      if (sub) {
        const small = document.createElement('small');
        small.textContent = sub;
        caption.append(small);
      }
      const r = caption.getBoundingClientRect();
      return { w: Math.ceil(r.width), h: Math.ceil(r.height) };
    };
    api.__demoCaptionMove = (left, top, animate) => {
      caption.classList.toggle('jump', !animate);
      caption.style.left = `${left}px`;
      caption.style.top = `${top}px`;
      void caption.offsetWidth;
    };
    api.__demoCaptionShow = (show) => caption.classList.toggle('show', show);
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
  // The mock student's time zone, so the "your clock differs from Canvas" note stays out of it.
  const context = await browser.newContext({ viewport: SIZE, timezoneId: 'Europe/London' });
  // tsx (esbuild keepNames) wraps inner functions in __name(); give the page a no-op for it.
  await context.addInitScript({ content: 'window.__name = (f) => f;' });
  await context.addInitScript({ content: `window.__vtEpoch = ${EPOCH};` });
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
  let videoMs = 0;
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
    videoMs += FRAME_MS;
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
  // Human pointer motion, after the motor-control literature: a Fitts's-law duration, a
  // minimum-jerk speed profile that peaks a little before halfway, a gently curved path, and on
  // long moves a slight overshoot with a corrective sub-movement. Seeded, so every worker draws
  // the same path.
  let seed = 0x2f6b7a1d;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = (lo: number, hi: number) => lo + (hi - lo) * rand();
  /** Roughly normal, mostly within ±1. */
  const jitter = () => (rand() + rand() + rand() - 1.5) / 1.5;
  const minJerk = (t: number) => t * t * t * (10 - 15 * t + 6 * t * t);

  async function stroke(x: number, y: number, ms: number, bow: number) {
    const from = mouse;
    const len = Math.hypot(x - from.x, y - from.y);
    // Perpendicular unit vector, for the arc's bow.
    const nx = len ? -(y - from.y) / len : 0;
    const ny = len ? (x - from.x) / len : 0;
    const n = frames(ms);
    for (let k = 1; k <= n; k++) {
      const s = minJerk((k / n) ** 0.88); // skewed: quicker start, longer homing in
      const arc = 4 * s * (1 - s) * bow;
      mouse = {
        x: from.x + (x - from.x) * s + nx * arc,
        y: from.y + (y - from.y) * s + ny * arc,
      };
      await page.mouse.move(mouse.x, mouse.y);
      await frame();
    }
  }
  /** Moves the pointer to (x, y); `size` is the target's smaller side, for Fitts's law. */
  async function moveTo(x: number, y: number, size = 40) {
    const dist = Math.hypot(x - mouse.x, y - mouse.y);
    if (dist < 2) return;
    await clearPath(x, y);
    const ms = (180 + 150 * Math.log2(dist / Math.max(8, size) + 1)) * between(0.9, 1.12);
    const bow = dist * between(0.03, 0.09) * (rand() < 0.5 ? -1 : 1);
    if (dist < 260) return stroke(x, y, ms, bow);
    const over = Math.min(16, dist * between(0.02, 0.045));
    const ux = (x - mouse.x) / dist;
    const uy = (y - mouse.y) / dist;
    await stroke(x + ux * over + jitter() * 3, y + uy * over + jitter() * 3, ms * 0.85, bow);
    await stroke(x, y, between(120, 190), 0);
  }
  async function point(target: Locator, dx = 0.5, dy = 0.5) {
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    // People land near the middle of what they aim at, not on its exact centre.
    const spreadX = Math.min(6, box.width * 0.08);
    const spreadY = Math.min(4, box.height * 0.12);
    await moveTo(
      box.x + box.width * dx + jitter() * spreadX,
      box.y + box.height * dy + jitter() * spreadY,
      Math.min(box.width, box.height),
    );
    return box;
  }
  async function click(target: Locator, wait = 450) {
    await point(target);
    await pause(between(90, 210));
    await page.mouse.down();
    await pause(between(60, 110));
    await page.mouse.up();
    await pause(wait);
  }
  async function type(target: Locator, text: string) {
    await click(target, between(120, 220));
    for (const ch of text) {
      await page.keyboard.type(ch);
      // Uneven keystrokes, with a beat at word breaks.
      await pause(ch === ' ' || ch === '.' ? between(90, 160) : between(35, 95));
    }
    await pause(300);
  }
  async function drag(from: Locator, dx: number, dy: number, at = { x: 0.5, y: 0.5 }) {
    await point(from, at.x, at.y);
    const start = { ...mouse };
    await pause(between(160, 260));
    await clearPath(start.x + dx, start.y + dy);
    await page.mouse.down();
    const len = Math.hypot(dx, dy);
    await stroke(start.x + dx, start.y + dy, between(950, 1200), len * between(0.02, 0.05));
    await pause(between(120, 200));
    await page.mouse.up();
    await pause(700);
  }
  // Captions stay up long enough to read (about 0.9s plus 0.28s a word) before the next one
  // replaces them. They sit beside the element the action is on, placed to keep clear of it, of
  // anything the story says is about to be used, of the pointer, and of the pointer's next path:
  // when a move would cross the caption, it slides out of the way first.
  type Rect = { x: number; y: number; width: number; height: number };
  const inflate = (r: Rect, m: number): Rect => ({
    x: r.x - m,
    y: r.y - m,
    width: r.width + 2 * m,
    height: r.height + 2 * m,
  });
  const overlap = (a: Rect, b: Rect) =>
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  /** Small boxes along the straight path from the pointer to (x, y), for clearance checks. */
  const pathBoxes = (x: number, y: number): Rect[] => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x - mouse.x, y - mouse.y) / 40));
    return Array.from({ length: steps + 1 }, (_, k) => ({
      x: mouse.x + ((x - mouse.x) * k) / steps - 36,
      y: mouse.y + ((y - mouse.y) * k) / steps - 36,
      width: 72,
      height: 72,
    }));
  };
  let cap: {
    size: { w: number; h: number };
    near?: Locator;
    avoid: Locator[];
    rect: Rect | null;
  } | null = null;
  let captionDue = 0;
  const api = () => page.evaluate.bind(page);

  async function placeCaption(extra: Rect[], animate: boolean) {
    if (!cap) return;
    const { w, h } = cap.size;
    const near = cap.near ? await cap.near.boundingBox().catch(() => null) : null;
    const clear: Rect[] = [{ x: mouse.x - 30, y: mouse.y - 30, width: 60, height: 60 }, ...extra];
    if (near) clear.push(near);
    for (const l of cap.avoid) {
      const b = await l.boundingBox().catch(() => null);
      if (b) clear.push(b);
    }
    const keep = clear.map((r) => inflate(r, 12));
    const M = 16;
    const G = 18;
    const spots: Array<[number, number]> = [];
    if (near) {
      const cy = near.y + near.height / 2;
      for (const x of [near.x + near.width / 2 - w / 2, near.x, near.x + near.width - w]) {
        spots.push([x, near.y - h - G], [x, near.y + near.height + G]);
      }
      spots.push([near.x + near.width + G, cy - h / 2], [near.x - w - G, cy - h / 2]);
    }
    spots.push([SIZE.width / 2 - w / 2, SIZE.height - h - 30], [SIZE.width / 2 - w / 2, 86]);
    let best: Rect | null = null;
    let bestScore = Infinity;
    for (const [sx, sy] of spots) {
      const x = Math.min(Math.max(M, sx), SIZE.width - w - M);
      if (sy < M || sy + h > SIZE.height - M) continue;
      const r = { x, y: sy, width: w, height: h };
      const covered = keep.reduce((sum, k) => sum + overlap(r, k), 0);
      const dist = near
        ? Math.hypot(x + w / 2 - (near.x + near.width / 2), sy + h / 2 - (near.y + near.height / 2))
        : sy < SIZE.height / 2
          ? 60
          : 0;
      const score = covered * 20 + dist;
      if (score < bestScore) {
        bestScore = score;
        best = r;
      }
    }
    best ??= { x: SIZE.width / 2 - w / 2, y: SIZE.height - h - 30, width: w, height: h };
    if (cap.rect && Math.abs(cap.rect.x - best.x) < 4 && Math.abs(cap.rect.y - best.y) < 4) return;
    cap.rect = best;
    await api()(([l, t, a]) => (window as unknown as DemoCaptionApi).__demoCaptionMove(l, t, a), [
      best.x,
      best.y,
      animate,
    ] as const);
  }
  /** Before the pointer heads to (x, y): move the caption if it's in the way. */
  async function clearPath(x: number, y: number) {
    if (!cap?.rect) return;
    const path = pathBoxes(x, y);
    const hit = inflate(cap.rect, 8);
    if (path.some((p) => overlap(p, hit) > 0)) {
      await placeCaption(path, true);
      await pause(160);
    }
  }
  async function caption(
    title: string,
    sub?: string,
    hold = 0,
    near?: Locator,
    avoid: Locator[] = [],
  ) {
    if (process.env.DEMO_TIMES && worker === 0) console.log((videoMs / 1000).toFixed(1), title);
    if (videoMs < captionDue) await pause(captionDue - videoMs);
    if (cap) {
      await api()(() => (window as unknown as DemoCaptionApi).__demoCaptionShow(false));
      cap = null;
      if (title) await pause(260);
    }
    captionDue = 0;
    if (!title) return;
    const size = await api()(
      ([t, s]) => (window as unknown as DemoCaptionApi).__demoCaptionSet(t, s),
      [title, sub] as const,
    );
    cap = { size, near, avoid, rect: null };
    await placeCaption([], false);
    await api()(() => (window as unknown as DemoCaptionApi).__demoCaptionShow(true));
    const words = `${title} ${sub ?? ''}`.trim().split(/\s+/).length;
    captionDue = videoMs + 900 + 280 * words;
    if (hold) await pause(hold);
  }
  /** Change the screen (a mode, a look) as a cross-fade: the old frame dissolves into the new. */
  async function crossfade(change: () => Promise<void>, ms = 850) {
    await networkIdle();
    // Snapshot without the caption, so it isn't doubled while fading.
    await page.evaluate(() =>
      document.getElementById('demo-caption')!.style.setProperty('visibility', 'hidden'),
    );
    const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
    await page.evaluate(() =>
      document.getElementById('demo-caption')!.style.removeProperty('visibility'),
    );
    await page.evaluate(async (src) => {
      const img = document.createElement('img');
      img.id = 'demo-xfade';
      img.src = src;
      document.body.appendChild(img);
      await img.decode();
    }, `data:image/jpeg;base64,${shot.data}`);
    await change();
    await pause(200); // the new look renders under the snapshot
    await page.evaluate((d) => {
      const img = document.getElementById('demo-xfade')!;
      img.style.transition = `opacity ${d}ms cubic-bezier(.45,0,.55,1)`;
      void img.offsetWidth;
      img.style.opacity = '0';
    }, ms);
    await pause(ms + 40);
    await page.evaluate(() => document.getElementById('demo-xfade')?.remove());
  }
  async function scroll(dy: number, ms = 900) {
    const n = frames(ms);
    for (let k = 1; k <= n; k++) {
      await page.mouse.wheel(0, dy * (ease(k / n) - ease((k - 1) / n)));
      await frame();
    }
  }
  async function until(target: Locator) {
    for (let n = frames(15_000); n > 0; n--) {
      await networkIdle();
      if (await target.isVisible()) return;
      await frame();
    }
    await cdp
      .send('Page.captureScreenshot', { format: 'png' })
      .then((s) => writeFileSync(`${OUT}/.timeout.png`, Buffer.from(s.data, 'base64')));
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
    scroll,
    moveTo,
    caption,
    crossfade,
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
  // Smooth scrolling runs on real time, which the parallel recorders don't share.
  Array.from({ length: WORKERS }, () =>
    launch({ uncapped: true, args: ['--disable-smooth-scrolling'] }),
  ),
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
