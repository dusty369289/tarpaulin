// Virtual time for frame-perfect recording (injected before the app by scripts/demo-video.ts).
//
// Timers, Date, performance.now and requestAnimationFrame only move when the recorder calls
// window.__vt.tick(ms). CSS animations and transitions are paused when first seen and then
// positioned explicitly each tick, so every captured frame shows exactly ms of motion, no matter
// how long the capture itself took. Plain JS on purpose: it is injected as source text.
(() => {
  const RealDate = Date;
  // The recorder passes one start time to all its parallel browsers, so clocks agree.
  const epoch = window.__vtEpoch || RealDate.now();
  let now = 0;

  let nextTimer = 1;
  const timers = new Map(); // id -> { at, fn, args, every }
  let frameCallbacks = new Map();
  let nextFrame = 1;

  performance.now = () => now;
  class VirtualDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(epoch + now);
      else super(...args);
    }
    static now() {
      return epoch + now;
    }
  }
  window.Date = VirtualDate;

  // Seeded randomness: the parallel recorders each play the whole story, so anything random
  // (widget ids, and the post-it tilt and pins derived from them) must come out the same in all.
  let seed = 0x5eed1234;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = random;
  if (window.crypto) {
    const hex = (n) =>
      Array.from({ length: n }, () => Math.floor(random() * 16).toString(16)).join('');
    crypto.randomUUID = () => `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(12)}`;
    crypto.getRandomValues = (array) => {
      for (let i = 0; i < array.length; i++) array[i] = Math.floor(random() * 256);
      return array;
    };
  }

  const schedule = (fn, ms, args, every) => {
    const id = nextTimer++;
    timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, args, every });
    return id;
  };
  window.setTimeout = (fn, ms, ...args) => schedule(fn, ms, args, 0);
  window.setInterval = (fn, ms, ...args) => schedule(fn, ms, args, Math.max(1, Number(ms) || 0));
  window.clearTimeout = (id) => timers.delete(id);
  window.clearInterval = (id) => timers.delete(id);
  window.requestAnimationFrame = (fn) => {
    const id = nextFrame++;
    frameCallbacks.set(id, fn);
    return id;
  };
  window.cancelAnimationFrame = (id) => frameCallbacks.delete(id);

  // Let React's scheduler (MessageChannel tasks) and promise chains run to completion.
  const settleTasks = () =>
    new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(0);
    });

  let dirty = true;
  const reasons = new Map();
  const note = (r) => reasons.set(r, (reasons.get(r) || 0) + 1);
  const describe = (n) => {
    const el = n && n.nodeType === 1 ? n : n && n.parentElement;
    if (!el) return '?';
    return (
      el.tagName.toLowerCase() +
      (el.id ? '#' + el.id : '') +
      (typeof el.className === 'string' && el.className
        ? '.' + el.className.split(' ').slice(0, 2).join('.')
        : '')
    );
  };
  const watch = () =>
    new MutationObserver((records) => {
      dirty = true;
      if (window.__vtDebug)
        for (const r of records.slice(0, 3))
          note('mutation ' + r.type + ' ' + (r.attributeName || '') + ' ' + describe(r.target));
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  if (document.documentElement) watch();
  else document.addEventListener('readystatechange', watch, { once: true });

  const born = new WeakMap(); // animation -> virtual time it was first seen
  let lastHover = null;

  window.__vt = {
    now: () => now,
    reasons: () => [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 12),
    /** Advances virtual time by `ms`; resolves true if anything on screen may have changed. */
    async tick(ms) {
      const target = now + ms;
      for (;;) {
        let due = null;
        for (const entry of timers)
          if (entry[1].at <= target && (!due || entry[1].at < due[1].at)) due = entry;
        if (!due) break;
        const [id, t] = due;
        now = Math.max(now, t.at);
        if (t.every) t.at += t.every;
        else timers.delete(id);
        try {
          if (typeof t.fn === 'function') t.fn(...t.args);
        } catch (e) {
          console.error(e);
        }
        await settleTasks();
      }
      now = target;
      const callbacks = frameCallbacks;
      frameCallbacks = new Map();
      for (const fn of callbacks.values()) {
        try {
          fn(now);
        } catch (e) {
          console.error(e);
        }
      }
      await settleTasks();
      await settleTasks();

      let moving = false;
      for (const animation of document.getAnimations()) {
        if (!born.has(animation)) {
          born.set(animation, now);
          animation.pause();
        }
        const timing = animation.effect && animation.effect.getComputedTiming();
        const end = timing ? timing.endTime : 0;
        const t = now - born.get(animation);
        if (Number.isFinite(end) && t >= end) {
          animation.finish();
        } else {
          animation.currentTime = t;
          moving = true;
          if (window.__vtDebug)
            note(
              'anim ' +
                (animation.animationName || animation.transitionProperty || 'js') +
                ' ' +
                describe(animation.effect && animation.effect.target),
            );
        }
      }
      // Hover styles change without DOM mutations, so a new element under the pointer counts too.
      const hovered = document.querySelectorAll(':hover');
      const top = hovered[hovered.length - 1] || null;
      if (top !== lastHover) {
        lastHover = top;
        dirty = true;
        if (window.__vtDebug) note('hover ' + describe(top));
      }
      const changed = dirty || moving;
      dirty = false;
      return changed;
    },
  };
})();
