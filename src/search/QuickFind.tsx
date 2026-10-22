import { Search } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { useCanvas } from '../canvas/CanvasProvider';
import { useDialog } from '../ui/useDialog';
import { CourseDot } from '../widgets/shared/ui';
import { useSearchEntries, type EntryActions, type SearchEntry } from './entries';
import { loadRecent, rememberPick } from './recent';
import { buildSections } from './results';
import { isMac, useQuickFind } from './store';
import './quickFind.css';

// Quick find: Ctrl/⌘+K anywhere, or the top bar's search button. A combobox over a grouped
// listbox (the WAI-ARIA pattern): focus stays in the input, the arrows move the active option
// (aria-activedescendant), Enter opens it, Ctrl/⌘+Enter opens it in Canvas instead.

/** Ctrl/⌘+K, without other modifiers. */
const isShortcut = (e: globalThis.KeyboardEvent) =>
  e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;

/**
 * The palette and its shortcut. Mount once, wherever both the dashboard and Settings can reach
 * it (App.tsx). `onOpenSettings` gets the section of a settings entry (see settingsEntries.ts).
 */
export function QuickFind(props: EntryActions) {
  const open = useQuickFind((s) => s.open);
  const setOpen = useQuickFind((s) => s.setOpen);

  // The latest callbacks, behind stable wrappers, so the entries aren't rebuilt every render.
  const latest = useRef(props);
  latest.current = props;
  const actions = useMemo<EntryActions>(
    () => ({
      onOpenSettings: (section) => latest.current.onOpenSettings(section),
      onShowDashboard: () => latest.current.onShowDashboard(),
    }),
    [],
  );

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!isShortcut(e) || e.repeat) return;
      e.preventDefault();
      useQuickFind.getState().toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Closing on unmount too (signing out), so it doesn't pop back up later.
  useEffect(() => () => useQuickFind.getState().setOpen(false), []);

  return open ? <Palette actions={actions} onClose={() => setOpen(false)} /> : null;
}

function Palette({ actions, onClose }: { actions: EntryActions; onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(onClose);
  const { entries, now } = useSearchEntries(actions);
  const { openLink } = useCanvas();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState(loadRecent);
  const [active, setActive] = useState(0);
  const base = useId();
  const listId = `${base}-list`;

  const sections = useMemo(
    () => buildSections(entries, query, now, recent),
    [entries, query, now, recent],
  );
  const options = useMemo(() => sections.flatMap((s) => s.entries), [sections]);
  const optionId = (i: number) => `${base}-opt-${i}`;
  const current = Math.min(active, options.length - 1);

  // A new query starts at the top.
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (current < 0) return;
    document.getElementById(optionId(current))?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const pick = (entry: SearchEntry, inCanvas: boolean) => {
    setRecent(rememberPick(entry.id));
    onClose();
    // After the palette has closed and handed focus back, so the reader (or whatever opens)
    // returns focus there too when it closes.
    setTimeout(() => {
      if (inCanvas && entry.canvasUrl) openLink(entry.canvasUrl);
      else entry.open();
    }, 0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = options.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!n) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((current + step + n) % n);
    } else if ((e.key === 'Home' || e.key === 'End') && (e.ctrlKey || e.metaKey) && n) {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : n - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = options[current];
      if (entry) pick(entry, e.ctrlKey || e.metaKey);
    }
  };

  const mod = isMac() ? '⌘' : 'Ctrl';
  const activeEntry = options[current];
  let index = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] animate-fade-in"
      role="presentation"
      onMouseDown={(e: MouseEvent) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Quick find"
        tabIndex={-1}
        data-testid="quick-find"
        className="card flex max-h-[76vh] w-full max-w-xl flex-col overflow-hidden shadow-2xl outline-none animate-pop-in"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <input
            data-autofocus
            type="text"
            role="combobox"
            aria-label="Quick find"
            aria-autocomplete="list"
            aria-expanded={options.length > 0}
            aria-controls={listId}
            aria-activedescendant={activeEntry ? optionId(current) : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder="Find work, announcements, courses, pages, actions…"
            className="h-12 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-text placeholder:text-muted focus:outline-none focus-visible:outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="qf-kbd">Esc</kbd>
        </div>

        <div
          id={listId}
          role="listbox"
          aria-label="Results"
          className="min-h-0 flex-1 overflow-y-auto p-1.5 scroll-thin"
        >
          {sections.map((section) => {
            const headingId = `${base}-${section.id}`;
            return (
              <div key={section.id} role="group" aria-labelledby={headingId} className="mb-1">
                <div
                  id={headingId}
                  role="presentation"
                  className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted"
                >
                  {section.label}
                </div>
                {section.entries.map((entry) => {
                  const i = ++index;
                  return (
                    <Option
                      key={entry.id}
                      id={optionId(i)}
                      entry={entry}
                      active={i === current}
                      onHover={() => setActive(i)}
                      onPick={(inCanvas) => pick(entry, inCanvas)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
        {!options.length && (
          <p className="px-4 pb-6 pt-4 text-center text-sm text-muted">
            {query.trim() ? `Nothing matches “${query.trim()}”.` : 'Type to find anything.'}
          </p>
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {query.trim() ? `${options.length} ${options.length === 1 ? 'result' : 'results'}` : ''}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 py-2 text-[11px] text-muted">
          <span>
            <kbd className="qf-kbd">↑</kbd> <kbd className="qf-kbd">↓</kbd> move
          </span>
          <span>
            <kbd className="qf-kbd">Enter</kbd> open
          </span>
          <span>
            <kbd className="qf-kbd">{mod}</kbd>+<kbd className="qf-kbd">Enter</kbd> open in Canvas
          </span>
        </div>
      </div>
    </div>
  );
}

function Option({
  id,
  entry,
  active,
  onHover,
  onPick,
}: {
  id: string;
  entry: SearchEntry;
  active: boolean;
  onHover: () => void;
  onPick: (inCanvas: boolean) => void;
}) {
  const Icon = entry.icon;
  return (
    // Options aren't focused (focus stays in the combobox), so keys are handled there; a click
    // picks, with Ctrl/⌘ for Canvas like Ctrl/⌘+Enter.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      id={id}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      data-active={active || undefined}
      className="qf-option"
      onMouseDown={(e) => e.preventDefault()}
      onMouseMove={active ? undefined : onHover}
      onClick={(e) => onPick(e.ctrlKey || e.metaKey)}
    >
      <span className="flex w-2.5 shrink-0 justify-center">
        {entry.color && <CourseDot color={entry.color} />}
      </span>
      <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{entry.title}</span>
        {entry.detail && (
          <span className="block truncate text-xs text-muted">
            <span className="sr-only">{entry.kind}, </span>
            {entry.detail}
          </span>
        )}
      </span>
    </div>
  );
}
