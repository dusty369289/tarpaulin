import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSettings } from '../app/settingsStore';
import './appBar.css';

/** How close to the top edge (px) the pointer has to come to bring a folded bar back. */
const HOT_ZONE = 10;
/** Grace period before a bar the pointer has left folds away again. */
const HIDE_DELAY = 650;

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/**
 * Whether a fold-away bar is showing. It comes out when the pointer nears the top edge, while
 * the pointer is over it, while anything in it has keyboard focus, and whenever `pinned` (edit
 * mode, or a menu or dialog of the bar is open). Devices without a hovering pointer never fold.
 */
function useFoldAway(enabled: boolean, pinned: boolean, bar: React.RefObject<HTMLElement | null>) {
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const active = enabled && canHover;
  const [near, setNear] = useState(false);
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(true);
  const want = !active || pinned || near || focused;

  // Pointer: in the hot zone at the top, or over the bar (plus a little slack) once it is out.
  useEffect(() => {
    if (!active) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      const rect = bar.current?.getBoundingClientRect();
      const overBar = rect ? e.clientY <= rect.bottom + 6 : false;
      setNear(e.clientY <= HOT_ZONE || (overBar && barOut(bar.current)));
    };
    const onLeave = () => setNear(false);
    document.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [active, bar]);

  // Keyboard focus inside the bar (not a mouse click, which leaves focus on the tab it hit).
  useEffect(() => {
    const el = bar.current;
    if (!active || !el) return;
    const onIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (t.matches(':focus-visible') || t.tagName === 'INPUT') setFocused(true);
    };
    const onOut = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node | null)) setFocused(false);
    };
    el.addEventListener('focusin', onIn);
    el.addEventListener('focusout', onOut);
    return () => {
      el.removeEventListener('focusin', onIn);
      el.removeEventListener('focusout', onOut);
    };
  }, [active, bar]);

  // Come out at once; fold back after a short grace period, so a pointer that slips off the
  // bar on its way to a button doesn't chase it away.
  useEffect(() => {
    if (want) {
      setShown(true);
      return;
    }
    const t = window.setTimeout(() => setShown(false), HIDE_DELAY);
    return () => window.clearTimeout(t);
  }, [want]);

  return { active, hidden: active && !shown };
}

const barOut = (el: HTMLElement | null) => el?.dataset.folded === 'false';

/**
 * The dashboard's top bar. `frosted` is a floating pane of glass over the page; `basic` is a
 * quiet solid strip. With fold-away on it overlays the page (the grid keeps the full height)
 * and slides out of view until wanted.
 */
export function AppBar({
  editing,
  pinned,
  children,
}: {
  editing: boolean;
  pinned: boolean;
  children: ReactNode;
}) {
  const barStyle = useSettings((s) => s.barStyle);
  const foldAway = useSettings((s) => s.barFoldAway);
  const ref = useRef<HTMLElement>(null);
  const { active, hidden } = useFoldAway(foldAway, pinned, ref);

  return (
    <>
      <header
        ref={ref}
        className="app-header app-bar"
        data-bar-style={barStyle}
        data-fold={active ? 'on' : 'off'}
        data-folded={hidden ? 'true' : 'false'}
        data-editing={editing || undefined}
      >
        <div className="app-bar-surface">{children}</div>
      </header>
      {active && <div className="app-bar-peek" data-shown={hidden || undefined} aria-hidden />}
    </>
  );
}
