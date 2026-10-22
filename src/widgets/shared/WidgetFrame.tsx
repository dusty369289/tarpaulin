import { Copy, Ellipsis, GripVertical, Settings2, Trash2, type LucideIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { Nudge } from '../../dashboard/layout';
import { useDismiss } from '../../dashboard/useDismiss';
import { hexToTriple, readableOn } from '../../lib/color';
import { usePageSkin } from '../../theme/look';
import { useResolvedTheme } from '../../theme/mode';
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
  /** Keyboard move/resize from the grip (edit mode); absent where the layout can't change. */
  onNudge?: (nudge: Nudge) => void;
}

/** Below this header width the edit buttons fold into a "⋯" menu, so the title stays readable. */
const NARROW_HEADER_PX = 240;

const KEY_NUDGES: Record<string, [Nudge, Nudge]> = {
  // [move, resize with Shift]
  ArrowLeft: [{ dx: -1 }, { dw: -1 }],
  ArrowRight: [{ dx: 1 }, { dw: 1 }],
  ArrowUp: [{ dy: -1 }, { dh: -1 }],
  ArrowDown: [{ dy: 1 }, { dh: 1 }],
};

/**
 * Marks which edges of a scroll container have more content, for the fade mask in index.css.
 * While it scrolls it is also a Tab stop (a labelled region), so the keyboard can scroll it even
 * when nothing inside is focusable.
 */
function useScrollEdges(label: string) {
  const ref = useRef<HTMLDivElement>(null);
  const labelRef = useRef(label);
  labelRef.current = label;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const top = el.scrollTop > 1;
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      const edges = top && bottom ? 'both' : top ? 'top' : bottom ? 'bottom' : 'none';
      if (el.dataset.scrollEdges !== edges) el.dataset.scrollEdges = edges;
      if (edges === 'none') {
        el.removeAttribute('tabindex');
        el.removeAttribute('role');
        el.removeAttribute('aria-label');
      } else if (!el.hasAttribute('tabindex')) {
        el.tabIndex = 0;
        el.setAttribute('role', 'region');
        el.setAttribute('aria-label', labelRef.current);
      }
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
  useEffect(() => {
    if (ref.current?.hasAttribute('aria-label')) ref.current.setAttribute('aria-label', label);
  }, [label]);
  return ref;
}

/** True while the element is narrower than `px`. */
function useNarrow(px: number) {
  // A callback ref: the header comes and goes with edit mode.
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.getBoundingClientRect().width < px));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, px]);
  return [setEl, narrow] as const;
}

interface FrameAction {
  label: string;
  /** Accessible name, naming the widget. */
  name: string;
  icon: LucideIcon;
  onClick: () => void;
  danger?: boolean;
}

/**
 * The edit buttons folded into one "⋯" menu for narrow widgets. The menu is portalled to the
 * body: the frame clips its overflow and the grid item is transformed, so it can't drop from
 * inside.
 */
function ActionsMenu({ title, actions }: { title: string; actions: FrameAction[] }) {
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setAt(null), []);
  useDismiss(at !== null, panel, close, trigger);
  useEffect(() => {
    if (!at) return;
    panel.current?.querySelector('button')?.focus();
    // The grid moves under a fixed menu when the page scrolls, so close it instead.
    window.addEventListener('scroll', close, { capture: true, once: true });
    return () => window.removeEventListener('scroll', close, { capture: true });
  }, [at, close]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="btn-icon"
        aria-label={`Actions for ${title}`}
        aria-expanded={at !== null}
        title="Actions"
        onClick={() => {
          if (at) return close();
          const r = trigger.current!.getBoundingClientRect();
          setAt({ top: r.bottom + 4, right: window.innerWidth - r.right });
        }}
      >
        <Ellipsis className="h-4 w-4" />
      </button>
      {at &&
        createPortal(
          <div
            ref={panel}
            className="bar-menu w-44 animate-pop-in"
            style={{ position: 'fixed', top: at.top, right: at.right }}
          >
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                className={`bar-menu-item ${a.danger ? 'text-danger hover:!bg-danger/10' : ''}`}
                aria-label={a.name}
                onClick={() => {
                  close();
                  a.onClick();
                }}
              >
                <a.icon className={`h-4 w-4 ${a.danger ? '' : 'text-muted'}`} aria-hidden />
                {a.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
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
  onNudge,
}: WidgetFrameProps) {
  const pageSkin = usePageSkin();
  const theme = useResolvedTheme();
  const look = resolveSkin(getSkin(frame.style || pageSkin), widgetId, {
    paper: frame.paper,
    tilt: frame.tilt,
    theme,
  });
  const { skin } = look;
  // Skin colours and fonts are CSS variables on the root, so the widget body and the decorations
  // both pick them up, and nothing outside this widget is affected.
  const rootStyle: CSSProperties & Record<string, string> = {
    ...tokenStyle(look.tokens),
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
  const bodyRef = useScrollEdges(title);
  const [headerRef, narrow] = useNarrow(NARROW_HEADER_PX);
  const hintId = useId();
  const actions: FrameAction[] = [
    onSettings && {
      label: 'Settings',
      name: `Settings for ${title}`,
      icon: Settings2,
      onClick: onSettings,
    },
    onDuplicate && {
      label: 'Duplicate',
      name: `Duplicate ${title}`,
      icon: Copy,
      onClick: onDuplicate,
    },
    onRemove && {
      label: 'Remove',
      name: `Remove ${title}`,
      icon: Trash2,
      onClick: onRemove,
      danger: true,
    },
  ].filter((a): a is FrameAction => Boolean(a));
  const onGripKey = (e: KeyboardEvent) => {
    const nudge = KEY_NUDGES[e.key]?.[e.shiftKey ? 1 : 0];
    if (!nudge || !onNudge) return;
    e.preventDefault();
    onNudge(nudge);
  };
  return (
    <div
      className="skin-root"
      data-skin={skin.id}
      data-paper={look.paper ?? undefined}
      data-mode={look.mode}
      data-fill={frame.background}
      data-editing={editMode || undefined}
      style={rootStyle}
    >
      <article
        data-density={frame.density}
        data-testid="widget-frame"
        style={style}
        aria-label={title}
        className={`skin-frame group/frame flex h-full w-full flex-col overflow-hidden outline-2 outline-offset-2 outline-accent has-[.skin-body:focus-visible]:outline has-[textarea:focus-visible]:outline ${frame.background === 'transparent' ? '' : 'border border-border'} ${editMode ? 'ring-1 ring-accent/30' : ''}`}
      >
        {showHeader && (
          <header
            ref={headerRef}
            className={`skin-header flex min-w-0 shrink-0 items-center gap-1.5 px-[var(--w-pad)] pt-[calc(var(--w-pad)*0.75)] ${editMode ? 'widget-drag-handle cursor-grab active:cursor-grabbing' : ''}`}
          >
            {editMode ? (
              onNudge ? (
                <button
                  type="button"
                  className="widget-move btn-icon -ml-1.5 h-6 w-6 shrink-0 cursor-grab active:cursor-grabbing"
                  aria-label={`Move ${title}`}
                  aria-describedby={hintId}
                  title="Drag to move, or use the arrow keys (Shift resizes)"
                  onKeyDown={onGripKey}
                >
                  <GripVertical className="h-4 w-4" aria-hidden />
                  <span id={hintId} className="sr-only">
                    Arrow keys move it, Shift with the arrow keys resizes it.
                  </span>
                </button>
              ) : (
                <GripVertical className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              )
            ) : (
              skin.headerIcon && (
                <Icon className="skin-icon h-4 w-4 shrink-0 text-accent" aria-hidden />
              )
            )}
            <h2 className="skin-title min-w-0 flex-1 truncate text-[0.8125rem] font-semibold">
              {title}
            </h2>
            {editMode && actions.length > 0 && (
              // Layout only, so role="presentation": the mousedown handler just keeps a press on
              // the actions (or the gaps between them) from starting a drag of the header.
              <div
                role="presentation"
                className="flex shrink-0 items-center animate-fade-in"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {narrow ? (
                  <ActionsMenu title={title} actions={actions} />
                ) : (
                  actions.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      className={`btn-icon ${a.danger ? 'hover:text-danger' : ''}`}
                      onClick={a.onClick}
                      aria-label={a.name}
                      title={a.label}
                    >
                      <a.icon className="h-4 w-4" />
                    </button>
                  ))
                )}
              </div>
            )}
          </header>
        )}
        <div
          ref={bodyRef}
          data-testid="widget-body"
          className="skin-body scroll-fade scroll-thin focus-visible:outline-none min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-[var(--w-pad)] pb-[var(--w-pad)] pt-[calc(var(--w-pad)*0.5)]"
        >
          {children}
        </div>
      </article>
      {look.decor && <span aria-hidden className="skin-decor" data-decor={look.decor} />}
    </div>
  );
}
