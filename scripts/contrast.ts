// Computed text contrast inside the page, for styles whose colours can't be checked from their
// tokens alone (textured paper, translucent frames, per-note colours). For every visible text
// element under `root` it takes the rendered text colour and the background it actually sits on
// (each ancestor's background colour, translucent ones blended down onto the first opaque one)
// and reports WCAG contrast below 4.5:1 (3:1 for large text) and text smaller than 11px.
//
// Plain source text, not a function: tsx would wrap named inner functions in a helper that
// doesn't exist in the page.

export interface ContrastFinding {
  kind: 'contrast' | 'small';
  text: string;
  /** Contrast ratio, rounded to 2 places. */
  ratio: number;
  /** The ratio this text needs. */
  need: number;
  fontPx: number;
}

export const MIN_FONT_PX = 11;

/** `page.evaluate(contrastProbe('#lab-gallery [data-lab-cell]'))` → ContrastFinding[]. */
export function contrastProbe(rootSelector: string): string {
  return `(() => {
  const MIN_FONT = ${MIN_FONT_PX};
  const parse = (c) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(c || '');
    if (!m) return null;
    const p = m[1].split(/[\\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  });
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const backdrop = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (!c || c.a === 0) continue;
      layers.push(c);
      if (c.a >= 0.99) break;
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    return bg;
  };
  const out = [];
  const seen = new Set();
  for (const root of document.querySelectorAll(${JSON.stringify(rootSelector)})) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const el = node.parentElement;
      const text = node.data.trim();
      if (!el || !text || seen.has(el) || el.closest('[aria-hidden="true"]')) continue;
      seen.add(el);
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const fg = parse(cs.color);
      if (!fg) continue;
      let opacity = 1;
      for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
      const bg = backdrop(el);
      const ink = over({ ...fg, a: fg.a * opacity }, bg);
      const [hi, lo] = [lum(ink), lum(bg)].sort((a, b) => b - a);
      const ratio = Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
      const fontPx = parseFloat(cs.fontSize);
      const large = fontPx >= 24 || (fontPx >= 18.66 && Number(cs.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      const label = text.slice(0, 40);
      if (ratio < need) out.push({ kind: 'contrast', text: label, ratio, need, fontPx });
      if (fontPx < MIN_FONT) out.push({ kind: 'small', text: label, ratio, need, fontPx });
    }
  }
  return out;
})()`;
}
