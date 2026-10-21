import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { GRID_MARGIN, ROW_HEIGHT } from '../dashboard/Grid';
import { WidgetHost } from '../dashboard/WidgetHost';
import { GRID_COLS, type WidgetInstance } from '../dashboard/types';
import { waitForSettled } from '../app/settle';
import { SettingsSchema, useSettings } from '../app/settingsStore';
import type { LabCase, LabIssue, LabReport } from './labTypes';
import { defaultSettings, getWidget, widgetRegistry, widgetTypes } from '../widgets/registry';

// Dev-only page for checking every widget at every size. It renders one widget at the exact
// pixel size a grid cell of (w, h) gets on a 1280px-wide dashboard, and exposes an in-page API so
// Playwright can sweep the whole size matrix in a single evaluate() call, waiting only for the
// DOM to settle between sizes.

export const LAB_CONTAINER_WIDTH = 1280;
const colWidth = (LAB_CONTAINER_WIDTH - GRID_MARGIN[0] * (GRID_COLS - 1)) / GRID_COLS;
export const cellPx = (w: number, h: number) => ({
  width: Math.round(w * colWidth + (w - 1) * GRID_MARGIN[0]),
  height: h * ROW_HEIGHT + (h - 1) * GRID_MARGIN[1],
});

export type { LabCase, LabIssue, LabReport };

/** Widgets that are designed to fit their box and should never need to scroll. */
const MUST_FIT = new Set(['clock', 'countdown']);

function describe(el: Element): string {
  const text = (el.textContent ?? '').trim().slice(0, 40);
  return `<${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? ` class="${el.className.slice(0, 60)}"` : ''}>${text}`;
}

const isClipping = (cs: CSSStyleDeclaration) =>
  cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
const ownText = (el: Element) =>
  [...el.childNodes].some(
    (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 1,
  );

/** The elements that reach past the bottom of the body's content box, to show what overflows. */
function overflowing(body: HTMLElement): string {
  const limit =
    body.getBoundingClientRect().bottom - parseFloat(getComputedStyle(body).paddingBottom) + 1;
  const parts = [...body.querySelectorAll('*')]
    .filter((el) => el.getBoundingClientRect().bottom > limit)
    .slice(0, 5)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return `${el.classList[0] ?? el.tagName.toLowerCase()} ${Math.round(r.height)}px +${Math.round(r.bottom - limit + 1)}`;
    });
  return parts.length ? ` (${parts.join(', ')})` : '';
}

export function measure(root: HTMLElement, type: string): LabIssue[] {
  const issues: LabIssue[] = [];
  const frame = root.querySelector<HTMLElement>('[data-testid="widget-frame"]');
  const body = root.querySelector<HTMLElement>('[data-testid="widget-body"]');
  if (!frame || !body) return [{ kind: 'empty', detail: 'widget frame not rendered' }];
  if (body.scrollWidth > body.clientWidth + 1) {
    issues.push({
      kind: 'horizontal-scroll',
      detail: `content ${body.scrollWidth}px in ${body.clientWidth}px`,
    });
  }
  if (MUST_FIT.has(type) && body.scrollHeight > body.clientHeight + 1) {
    issues.push({
      kind: 'vertical-scroll',
      detail: `content ${body.scrollHeight}px in ${body.clientHeight}px${overflowing(body)}`,
    });
  }
  const fr = frame.getBoundingClientRect();
  const bodyRect = body.getBoundingClientRect();
  const seen = new Set<string>();
  const add = (issue: LabIssue) => {
    if (seen.has(issue.kind)) return;
    seen.add(issue.kind);
    issues.push(issue);
  };
  for (const el of frame.querySelectorAll<HTMLElement>('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const insideBody = body.contains(el) && el !== body;
    // Sideways is always a bug. Below the fold is fine (the body scrolls), but above the top
    // can't be scrolled to — that's what vertically centred content does when it overflows.
    const bottomLimit =
      insideBody && !MUST_FIT.has(type) ? Infinity : (insideBody ? bodyRect.bottom : fr.bottom) + 1;
    const topLimit = (insideBody ? bodyRect.top : fr.top) - 1;
    if (
      r.right > fr.right + 1 ||
      r.left < fr.left - 1 ||
      r.bottom > bottomLimit ||
      r.top < topLimit
    ) {
      add({ kind: 'escapes-frame', detail: describe(el) });
    }
    if (!ownText(el)) continue;
    const cs = getComputedStyle(el);
    if (r.width < 12 && r.top < bodyRect.bottom && cs.display !== 'inline') {
      add({ kind: 'squashed', detail: `${Math.round(r.width)}px wide: ${describe(el)}` });
    }
    // Text cut off inside its own box: a truncating flex child squeezed shorter than its line.
    const lineClamped = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
    if (
      cs.overflowY !== 'visible' &&
      !lineClamped &&
      el.tagName !== 'TEXTAREA' &&
      el.scrollHeight > el.clientHeight + 2
    ) {
      add({
        kind: 'clipped',
        detail: `text ${el.scrollHeight}px tall in ${el.clientHeight}px: ${describe(el)}`,
      });
    }
    // Text cut off by an overflow:hidden ancestor (other than the scrolling body).
    for (let a = el.parentElement; a && a !== body && a !== frame; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (!isClipping(acs)) continue;
      const ar = a.getBoundingClientRect();
      const ellipsis = cs.textOverflow === 'ellipsis';
      // A nested panel that scrolls vertically (the calendar's day list) can be scrolled to.
      const scrollsY = acs.overflowY === 'auto' || acs.overflowY === 'scroll';
      if (
        (!scrollsY && (r.bottom > ar.bottom + 2 || r.top < ar.top - 2)) ||
        (!ellipsis && (r.right > ar.right + 2 || r.left < ar.left - 2))
      ) {
        add({ kind: 'clipped', detail: describe(el) });
      }
      break;
    }
  }
  return issues;
}

export function WidgetLab() {
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState<LabCase>(() => {
    const p = new URLSearchParams(location.hash.split('?')[1] ?? '');
    return {
      type: p.get('type') ?? 'due-soon',
      w: Number(p.get('w') ?? 4),
      h: Number(p.get('h') ?? 8),
    };
  });
  const [gallery, setGallery] = useState<string | null>(() =>
    new URLSearchParams(location.hash.split('?')[1] ?? '').get('gallery'),
  );
  const galleryParams = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const gallerySkin = galleryParams.get('skin') ?? '';
  // `theme=dark` etc. in the URL renders the gallery in that mode (for per-mode screenshots).
  const galleryTheme = galleryParams.get('theme');
  useEffect(() => {
    const parsed = SettingsSchema.shape.theme.safeParse(galleryTheme);
    if (galleryTheme && parsed.success) useSettings.getState().update({ theme: parsed.data });
  }, [galleryTheme]);
  // Optional JSON settings and data for the gallery, so the screenshots can show each variant.
  const galleryCase = JSON.parse(galleryParams.get('case') ?? '{}') as Pick<
    LabCase,
    'settings' | 'data'
  >;

  useEffect(() => {
    const render = async (c: LabCase): Promise<LabReport> => {
      const started = performance.now();
      flushSync(() => setCurrent(c));
      await waitForSettled(queryClient, { quietFrames: 2 });
      const stage = document.getElementById('lab-stage')!;
      return {
        ...c,
        px: cellPx(c.w, c.h),
        issues: measure(stage, c.type),
        settleMs: Math.round(performance.now() - started),
      };
    };
    window.__tarpaulinLab = {
      types: widgetTypes,
      minSize: (type) => getWidget(type)!.minSize,
      render,
      setTheme: async (theme) => {
        useSettings.getState().update({ theme: SettingsSchema.shape.theme.parse(theme) });
        await waitForSettled(queryClient, { quietFrames: 2 });
        return document.documentElement.dataset.mode ?? '';
      },
      sweep: async (cases) => {
        const out: LabReport[] = [];
        for (const c of cases) out.push(await render(c));
        return out;
      },
    };
    return () => {
      delete window.__tarpaulinLab;
    };
  }, [queryClient]);

  const px = cellPx(current.w, current.h);
  const instance: WidgetInstance = {
    type: current.type,
    settings: { ...defaultSettings(current.type), ...current.settings },
    data: current.data,
  };

  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <strong>Widget lab</strong>
        <select
          className="input w-auto"
          value={current.type}
          onChange={(e) => setCurrent({ ...current, type: e.target.value })}
        >
          {widgetTypes.map((t) => (
            <option key={t} value={t}>
              {widgetRegistry[t].name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          w{' '}
          <input
            type="range"
            min={1}
            max={12}
            value={current.w}
            onChange={(e) => setCurrent({ ...current, w: Number(e.target.value) })}
          />{' '}
          {current.w}
        </label>
        <label className="flex items-center gap-1">
          h{' '}
          <input
            type="range"
            min={1}
            max={20}
            value={current.h}
            onChange={(e) => setCurrent({ ...current, h: Number(e.target.value) })}
          />{' '}
          {current.h}
        </label>
        <span className="text-muted">
          {px.width}×{px.height}px
        </span>
        <button
          type="button"
          className="btn"
          onClick={() => setGallery(gallery ? null : current.type)}
        >
          {gallery ? 'Single' : 'Gallery'}
        </button>
      </div>
      {gallery ? (
        <Gallery type={gallery} skin={gallerySkin} {...galleryCase} />
      ) : (
        <div
          id="lab-stage"
          data-testid="lab-stage"
          style={{ width: px.width, height: px.height }}
          className="transition-[width,height] duration-200"
        >
          <WidgetHost
            key={current.type}
            id="lab"
            instance={instance}
            size={{ w: current.w, h: current.h }}
            editMode={Boolean(current.editMode)}
            onData={() => {}}
          />
        </div>
      )}
    </div>
  );
}

/** Wide and short sizes, where a widget has to lay out sideways rather than stack. */
const WIDE_SIZES: Array<[number, number]> = [
  [12, 2],
  [12, 3],
  [8, 3],
  [10, 4],
  [12, 6],
  [8, 6],
];

/** Every interesting size of one widget side by side, for eyeballing and screenshots. */
export function Gallery({
  type,
  skin = '',
  settings,
  data,
}: { type: string; skin?: string } & Pick<LabCase, 'settings' | 'data'>) {
  const def = getWidget(type)!;
  const widths = [2, 3, 4, 6, 8].filter((w) => w >= def.minSize.w);
  const heights = [2, 3, 4, 6, 9].filter((h) => h >= def.minSize.h);
  const rows: Array<Array<[number, number]>> = [
    ...heights.map((h) => widths.map((w): [number, number] => [w, h])),
    ...WIDE_SIZES.filter(([w, h]) => w >= def.minSize.w && h >= def.minSize.h).map((s) => [s]),
  ];
  return (
    <div id="lab-gallery" className="flex flex-col gap-6">
      {rows.map((row) => (
        <div key={row.map((s) => s.join('x')).join()} className="flex flex-wrap items-start gap-3">
          {row.map(([w, h]) => {
            const px = cellPx(w, h);
            return (
              <figure key={`${w}x${h}`} className="flex flex-col gap-1">
                <figcaption className="text-[10px] text-muted">
                  {w}×{h}
                </figcaption>
                <div data-lab-cell={`${w}x${h}`} style={{ width: px.width, height: px.height }}>
                  <WidgetHost
                    id={`g-${w}-${h}`}
                    instance={{
                      type,
                      settings: { ...defaultSettings(type), ...settings, style: skin },
                      data,
                    }}
                    size={{ w, h }}
                    editMode={false}
                    onData={() => {}}
                  />
                </div>
              </figure>
            );
          })}
        </div>
      ))}
    </div>
  );
}
