import { describe, expect, it } from 'vitest';
import { compactColumns, compactLayout, nudgeLayout } from './layout';
import type { LayoutItem } from './types';

const at = (layout: LayoutItem[], i: string) => layout.find((l) => l.i === i)!;
const overlapping = (layout: LayoutItem[]) =>
  layout.some((a) =>
    layout.some(
      (b) =>
        a.i !== b.i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h,
    ),
  );

describe('compactLayout', () => {
  it('pulls widgets up and pushes overlaps down, keeping the input order', () => {
    const out = compactLayout([
      { i: 'b', x: 0, y: 5, w: 4, h: 2 },
      { i: 'a', x: 0, y: 1, w: 4, h: 3 },
      { i: 'c', x: 2, y: 2, w: 4, h: 2 },
    ]);
    expect(out.map((l) => l.i)).toEqual(['b', 'a', 'c']);
    expect(at(out, 'a').y).toBe(0);
    expect(at(out, 'c').y).toBe(3);
    expect(at(out, 'b').y).toBe(5);
    expect(overlapping(out)).toBe(false);
  });
});

describe('nudgeLayout', () => {
  // a over b in the left column, c alone on the right.
  const layout: LayoutItem[] = [
    { i: 'a', x: 0, y: 0, w: 4, h: 3 },
    { i: 'b', x: 0, y: 3, w: 4, h: 5 },
    { i: 'c', x: 6, y: 0, w: 6, h: 4 },
  ];

  it('swaps places with the neighbour below or above', () => {
    const down = nudgeLayout(layout, 'a', { dy: 1 }, 12);
    expect(at(down, 'b').y).toBe(0);
    expect(at(down, 'a').y).toBe(5);
    const up = nudgeLayout(down, 'a', { dy: -1 }, 12);
    expect(at(up, 'a').y).toBe(0);
    expect(at(up, 'b').y).toBe(3);
  });

  it('returns the same layout when the widget is at an edge', () => {
    expect(nudgeLayout(layout, 'a', { dy: -1 }, 12)).toBe(layout);
    expect(nudgeLayout(layout, 'b', { dy: 1 }, 12)).toBe(layout);
    expect(nudgeLayout(layout, 'a', { dx: -1 }, 12)).toBe(layout);
    expect(nudgeLayout(layout, 'c', { dx: 1 }, 12)).toBe(layout);
    expect(nudgeLayout(layout, 'c', { dw: 1 }, 12)).toBe(layout);
  });

  it('moves sideways, pushing what it lands on down', () => {
    const right = nudgeLayout(layout, 'a', { dx: 1 }, 12);
    expect(at(right, 'a')).toMatchObject({ x: 1, y: 0 });
    const far = nudgeLayout(nudgeLayout(right, 'a', { dx: 1 }, 12), 'a', { dx: 1 }, 12);
    expect(at(far, 'a')).toMatchObject({ x: 3, y: 0 });
    expect(at(far, 'c').y).toBeGreaterThanOrEqual(3);
    expect(overlapping(far)).toBe(false);
  });

  it('resizes within the grid and not below the minimum size', () => {
    expect(at(nudgeLayout(layout, 'a', { dw: 1 }, 12), 'a').w).toBe(5);
    expect(at(nudgeLayout(layout, 'a', { dh: 1 }, 12), 'a').h).toBe(4);
    expect(nudgeLayout(layout, 'a', { dw: -1 }, 12, { w: 4, h: 2 })).toBe(layout);
    expect(at(nudgeLayout(layout, 'a', { dh: -1 }, 12, { w: 4, h: 2 }), 'a').h).toBe(2);
  });
});

describe('compactColumns', () => {
  it('stacks a 12-column layout into halves and full widths without overlaps', () => {
    const out = compactColumns([
      { i: 'countdown', x: 0, y: 0, w: 4, h: 4 },
      { i: 'due', x: 4, y: 0, w: 5, h: 12 },
      { i: 'todo', x: 9, y: 0, w: 3, h: 7 },
      { i: 'wide', x: 0, y: 12, w: 12, h: 3 },
    ]);
    expect(at(out, 'countdown')).toMatchObject({ x: 0, w: 3 });
    expect(at(out, 'due')).toMatchObject({ x: 3, w: 3, y: 0 });
    expect(at(out, 'todo')).toMatchObject({ x: 3, w: 3, y: 12 });
    expect(at(out, 'wide')).toMatchObject({ x: 0, w: 6 });
    expect(overlapping(out)).toBe(false);
  });
});
