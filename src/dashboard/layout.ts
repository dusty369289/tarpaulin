import type { LayoutItem } from './types';

// Pure layout maths for the grid: vertical compaction (the same rule react-grid-layout applies,
// so a layout from here is already stable when the grid gets it), keyboard moves and resizes,
// and the stacked layout narrow windows show.

const overlaps = (a: LayoutItem, b: LayoutItem) =>
  a.i !== b.i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Pulls every widget up as far as it goes and pushes overlaps down, in reading order. `first`
 * wins ties, so a widget that was just moved keeps the spot it was moved to.
 */
export function compactLayout(layout: LayoutItem[], first?: string): LayoutItem[] {
  const order = [...layout].sort(
    (a, b) => a.y - b.y || Number(b.i === first) - Number(a.i === first) || a.x - b.x,
  );
  const placed: LayoutItem[] = [];
  for (const item of order) {
    const l = { ...item };
    while (l.y > 0 && !placed.some((p) => overlaps({ ...l, y: l.y - 1 }, p))) l.y--;
    for (
      let hit = placed.find((p) => overlaps(l, p));
      hit;
      hit = placed.find((p) => overlaps(l, p))
    )
      l.y = hit.y + hit.h;
    placed.push(l);
  }
  // Keep the caller's order, so only positions change.
  return layout.map((l) => placed.find((p) => p.i === l.i)!);
}

export interface Nudge {
  /** Move: one column sideways, or past the neighbouring widget up or down. */
  dx?: -1 | 0 | 1;
  dy?: -1 | 0 | 1;
  /** Resize by one column or row. */
  dw?: -1 | 0 | 1;
  dh?: -1 | 0 | 1;
}

/**
 * Applies one keyboard move or resize to widget `id`, keeping it inside `cols` and at least
 * `min` big, then compacts. Moving up or down swaps places with the nearest widget in that
 * direction (a one-row step would just compact back). Returns the layout unchanged when the
 * widget can't go further.
 */
export function nudgeLayout(
  layout: LayoutItem[],
  id: string,
  { dx = 0, dy = 0, dw = 0, dh = 0 }: Nudge,
  cols: number,
  min: { w: number; h: number } = { w: 1, h: 1 },
): LayoutItem[] {
  const cur = layout.find((l) => l.i === id);
  if (!cur) return layout;
  const next = { ...cur };
  next.w = Math.max(Math.min(min.w, cols), Math.min(cols - cur.x, cur.w + dw));
  next.h = Math.max(min.h, cur.h + dh);
  next.x = Math.max(0, Math.min(cols - next.w, cur.x + dx));
  const sideBySide = (l: LayoutItem) => l.i !== id && l.x < cur.x + cur.w && cur.x < l.x + l.w;
  if (dy < 0) {
    const above = layout.filter((l) => sideBySide(l) && l.y + l.h <= cur.y);
    if (!above.length) return layout;
    // Take the top of the nearest widget above; winning the tie puts this one first.
    const nearest = Math.max(...above.map((l) => l.y + l.h));
    next.y = Math.min(...above.filter((l) => l.y + l.h === nearest).map((l) => l.y));
  } else if (dy > 0) {
    const below = layout.filter((l) => sideBySide(l) && l.y >= cur.y + cur.h);
    if (!below.length) return layout;
    const nearest = Math.min(...below.map((l) => l.y));
    const target = below.filter((l) => l.y === nearest);
    next.y = Math.max(...target.map((l) => l.y + l.h));
  }
  if (next.x === cur.x && next.y === cur.y && next.w === cur.w && next.h === cur.h) return layout;
  return compactLayout(
    layout.map((l) => (l.i === id ? next : l)),
    id,
  );
}

/** Columns the grid uses below the narrow-window breakpoint. */
export const COMPACT_COLS = 6;

/**
 * The layout a narrow window shows, worked out from the saved 12-column one and never saved:
 * wide widgets take the full width, the rest half of it (left or right by where their middle
 * was), stacked in the same reading order.
 */
export function compactColumns(layout: LayoutItem[], cols = 12): LayoutItem[] {
  const half = COMPACT_COLS / 2;
  const derived = [...layout]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((l) => {
      const full = l.w >= (cols * 2) / 3;
      return {
        ...l,
        w: full ? COMPACT_COLS : half,
        x: full || l.x + l.w / 2 <= cols / 2 ? 0 : half,
      };
    });
  return compactLayout(derived);
}

/** "column 3, row 2, 4 × 6" style description of where a widget is, for screen readers. */
export function describePlace(l: LayoutItem): string {
  return `column ${l.x + 1}, row ${l.y + 1}, ${l.w} columns wide, ${l.h} rows tall`;
}
