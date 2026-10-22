import { RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useDashboard } from './store';

/** How long the toast stays up, unless the pointer or focus is on it. */
const SHOW_MS = 8000;

const editable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * "Removed To-do · Undo" after each destructive change (store.ts records them). It waits while
 * hovered or focused, and Ctrl/⌘+Z undoes the newest change whenever focus isn't in a text field.
 */
export function UndoToast() {
  const entry = useDashboard((s) => s.undoStack[0]);
  const undo = useDashboard((s) => s.undo);
  const [hidden, setHidden] = useState<number | null>(null);
  const [held, setHeld] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const visible = entry && entry.id !== hidden && (held || Date.now() - entry.at < SHOW_MS);

  useEffect(() => {
    if (!visible || held) return;
    const t = setTimeout(() => setHidden(entry.id), SHOW_MS - (Date.now() - entry.at));
    return () => clearTimeout(t);
  }, [visible, held, entry]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey)
        return;
      if (editable(e.target) || !useDashboard.getState().undoStack.length) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  // Stays up while hovered or focused, even past its time; goes once both have left.
  const leave = () => {
    if (!root.current?.matches(':hover, :focus-within')) setHeld(false);
  };
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      {visible && (
        <div
          ref={root}
          data-testid="undo-toast"
          className="card pointer-events-auto flex max-w-md items-center gap-3 py-2 pl-4 pr-2 text-sm shadow-2xl animate-pop-in"
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={leave}
          onFocus={() => setHeld(true)}
          onBlur={() => requestAnimationFrame(leave)}
        >
          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
          <button
            type="button"
            className="btn btn-ghost shrink-0 px-2 py-1 font-semibold text-accent"
            onClick={() => {
              undo();
              setHeld(false);
            }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden /> Undo
          </button>
          <button
            type="button"
            className="btn-icon shrink-0"
            aria-label="Dismiss"
            onClick={() => {
              setHidden(entry.id);
              setHeld(false);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
