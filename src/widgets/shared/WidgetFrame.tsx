import { Copy, GripVertical, Settings2, Trash2, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { hexToTriple, readableOn } from '../../lib/color';
import { usePageSkin } from '../../theme/look';
import { tokenStyle } from '../../theme/palette';
import { getSkin, resolveSkin } from '../../theme/skins';
import type { FrameSettings } from './frame';

const RADIUS: Record<FrameSettings['radius'], string> = {
  theme: 'var(--skin-radius, var(--radius))',
  none: '0px',
  small: '6px',
  large: '20px',
};

interface WidgetFrameProps {
  /** Seeds the per-widget paper, tilt and decoration, so they stay put across renders. */
  widgetId: string;
  /** Width in grid columns; wide widgets tilt less, so their far edge doesn't swing out. */
  columns?: number;
  title: string;
  icon: LucideIcon;
  frame: FrameSettings;
  editMode: boolean;
  children: ReactNode;
  onSettings?: () => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
}

/** Marks which edges of a scroll container have more content, for the fade mask in index.css. */
function useScrollEdges() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const top = el.scrollTop > 1;
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      const edges = top && bottom ? 'both' : top ? 'top' : bottom ? 'bottom' : 'none';
      if (el.dataset.scrollEdges !== edges) el.dataset.scrollEdges = edges;
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
  return ref;
}

/**
 * Shared widget chrome: the widget style (skin) with its paper, tilt and decoration, plus header,
 * accent, density, fill, opacity and corner radius.
 */
export function WidgetFrame({
  widgetId,
  columns = 4,
  title,
  icon: Icon,
  frame,
  editMode,
  children,
  onSettings,
  onDuplicate,
  onRemove,
}: WidgetFrameProps) {
  const pageSkin = usePageSkin();
  const look = resolveSkin(getSkin(frame.style || pageSkin), widgetId, {
    paper: frame.paper,
    tilt: frame.tilt,
  });
  const { skin } = look;
  // Skin colours and fonts are CSS variables on the root, so the widget body and the decorations
  // both pick them up, and nothing outside this widget is affected.
  const rootStyle: CSSProperties & Record<string, string> = {
    ...tokenStyle(look.tokens ?? {}),
    '--tilt': `${editMode ? 0 : Math.round(look.tilt * Math.min(1, 4 / columns) * 100) / 100}deg`,
  };
  if (skin.font) rootStyle['--skin-font'] = skin.font;
  if (skin.headingFont) rootStyle['--heading-font'] = skin.headingFont;
  if (skin.displayFont) rootStyle['--display-font'] = skin.displayFont;
  if (skin.glyphWidth) rootStyle['--glyph'] = String(skin.glyphWidth);
  if (skin.scale) rootStyle['--skin-scale'] = String(skin.scale);
  if (skin.radius) rootStyle['--skin-radius'] = skin.radius;

  const accent = frame.accent ? hexToTriple(frame.accent) : null;
  const style: CSSProperties & Record<string, string> = { borderRadius: RADIUS[frame.radius] };
  // Overriding --accent here re-themes everything inside this widget only.
  if (accent) {
    style['--accent'] = accent;
    style['--accent-fg'] = readableOn(frame.accent);
  }
  const alpha = frame.opacity / 100;
  if (frame.background === 'surface') style.backgroundColor = `rgb(var(--surface) / ${alpha})`;
  if (frame.background === 'tinted') style.backgroundColor = `rgb(var(--accent) / ${0.1 * alpha})`;

  const showHeader = frame.showHeader || editMode;
  const bodyRef = useScrollEdges();
  return (
    <div
      className="skin-root"
      data-skin={skin.id}
      data-paper={look.paper ?? undefined}
      data-fill={frame.background}
      data-editing={editMode || undefined}
      style={rootStyle}
    >
      <article
        data-density={frame.density}
        data-testid="widget-frame"
        style={style}
        aria-label={title}
        className={`skin-frame group/frame flex h-full w-full flex-col overflow-hidden ${frame.background === 'transparent' ? '' : 'border border-border'} ${editMode ? 'ring-1 ring-accent/30' : ''}`}
      >
        {showHeader && (
          <header
            className={`skin-header flex min-w-0 shrink-0 items-center gap-1.5 px-[var(--w-pad)] pt-[calc(var(--w-pad)*0.75)] ${editMode ? 'widget-drag-handle cursor-grab active:cursor-grabbing' : ''}`}
          >
            {editMode ? (
              <GripVertical className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            ) : (
              skin.headerIcon && (
                <Icon className="skin-icon h-4 w-4 shrink-0 text-accent" aria-hidden />
              )
            )}
            <h2 className="skin-title min-w-0 flex-1 truncate text-[0.8125rem] font-semibold">
              {title}
            </h2>
            {editMode && (
              <div
                className="flex shrink-0 items-center animate-fade-in"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {onSettings && (
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={onSettings}
                    aria-label={`Settings for ${title}`}
                    title="Settings"
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                )}
                {onDuplicate && (
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={onDuplicate}
                    aria-label={`Duplicate ${title}`}
                    title="Duplicate"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                )}
                {onRemove && (
                  <button
                    type="button"
                    className="btn-icon hover:text-danger"
                    onClick={onRemove}
                    aria-label={`Remove ${title}`}
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </header>
        )}
        <div
          ref={bodyRef}
          data-testid="widget-body"
          className="skin-body scroll-fade scroll-thin min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-[var(--w-pad)] pb-[var(--w-pad)] pt-[calc(var(--w-pad)*0.5)]"
        >
          {children}
        </div>
      </article>
      {look.decor && <span aria-hidden className="skin-decor" data-decor={look.decor} />}
    </div>
  );
}
