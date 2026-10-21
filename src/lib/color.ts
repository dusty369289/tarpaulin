/** "#4f46e5" → "79 70 229" (the format our CSS variables use). */
export function hexToTriple(hex: string): string | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Black or white, whichever reads better on the given colour. */
export function readableOn(hex: string): string {
  const triple = hexToTriple(hex);
  if (!triple) return '255 255 255';
  const [r, g, b] = triple.split(' ').map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? '17 24 39' : '255 255 255';
}

/** Distinct, readable defaults for courses without a Canvas colour. */
export const COURSE_PALETTE = [
  '#4f46e5',
  '#0891b2',
  '#059669',
  '#d97706',
  '#dc2626',
  '#c026d3',
  '#2563eb',
  '#65a30d',
  '#ea580c',
  '#7c3aed',
  '#0d9488',
  '#db2777',
];
