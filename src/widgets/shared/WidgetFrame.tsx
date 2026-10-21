import { Copy, GripVertical, Settings2, Trash2, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { hexToTriple, readableOn } from '../../lib/color';
import type { FrameSettings } from './frame';

const RADIUS: Record<FrameSettings['radius'], string> = {
  theme: 'var(--radius)',
  none: '0px',
  small: '6px',
  large: '20px',
};

interface WidgetFrameProps {
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

/** Shared widget chrome: header, accent, density, background, opacity and corner radius. */
export function WidgetFrame({
  title,
  icon: Icon,
  frame,
  editMode,
  children,
  onSettings,
  onDuplicate,
  onRemove,
}: WidgetFrameProps) {
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
    <article
      data-density={frame.density}
      data-testid="widget-frame"
      style={style}
      aria-label={title}
      className={`group/frame flex h-full w-full flex-col overflow-hidden ${frame.background === 'transparent' ? '' : 'border border-border'} ${editMode ? 'ring-1 ring-accent/30' : ''}`}
    >
      {showHeader && (
        <header
          className={`flex min-w-0 shrink-0 items-center gap-1.5 px-[var(--w-pad)] pt-[calc(var(--w-pad)*0.75)] ${editMode ? 'widget-drag-handle cursor-grab active:cursor-grabbing' : ''}`}
        >
          {editMode ? (
            <GripVertical className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          ) : (
            <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          )}
          <h2 className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold">{title}</h2>
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
        className="scroll-fade scroll-thin min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-[var(--w-pad)] pb-[var(--w-pad)] pt-[calc(var(--w-pad)*0.5)]"
      >
        {children}
      </div>
    </article>
  );
}
