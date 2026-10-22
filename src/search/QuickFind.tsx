import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Backdrop } from '../ui/Backdrop';
import { Kbd } from '../ui/Kbd';
import { isModShortcut, modKeyLabel } from '../ui/keys';
import { useDialog } from '../ui/useDialog';
import { useSearchEntries, type EntryActions } from './entries';
import { comboboxProps, ResultList, resultCount, useResultList } from './ResultList';
import { usePageCommands } from './pages';
import { useQuickFind } from './store';
import './quickFind.css';

// Quick find: Ctrl/⌘+K anywhere, or the top bar's search button. A combobox over a grouped
// listbox (the WAI-ARIA pattern): focus stays in the input, the arrows move the active option
// (aria-activedescendant), Enter opens it, Ctrl/⌘+Enter opens it in Canvas instead.

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

  usePageCommands(actions.onShowDashboard);

  useEffect(() => {
    useQuickFind.setState({ appActions: actions });
    return () =>
      useQuickFind.setState({ appActions: { onOpenSettings() {}, onShowDashboard() {} } });
  }, [actions]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!isModShortcut(e, 'k') || e.repeat) return;
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
  const [query, setQuery] = useState('');
  const list = useResultList({
    entries,
    now,
    query,
    onPick: (open) => {
      onClose();
      // After the palette has closed and handed focus back, so the reader (or whatever opens)
      // returns focus there too when it closes.
      setTimeout(open, 0);
    },
  });
  const n = list.options.length;

  return (
    <Backdrop onClose={onClose} align="top">
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
            {...comboboxProps(list, n > 0, 'Quick find')}
            placeholder="Find work, announcements, courses, pages, actions…"
            className="h-12 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-text placeholder:text-muted focus:outline-none focus-visible:outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={list.onKeyDown}
          />
          <Kbd>Esc</Kbd>
        </div>

        <ResultList list={list} className="min-h-0 flex-1 overflow-y-auto p-1.5 scroll-thin" />
        {!n && (
          <p className="px-4 pb-6 pt-4 text-center text-sm text-muted">
            {query.trim() ? `Nothing matches “${query.trim()}”.` : 'Type to find anything.'}
          </p>
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {query.trim() ? resultCount(n) : ''}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 py-2 text-[11px] text-muted">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> move
          </span>
          <span>
            <Kbd>Enter</Kbd> open
          </span>
          <span>
            <Kbd>{modKeyLabel()}</Kbd>+<Kbd>Enter</Kbd> open in Canvas
          </span>
        </div>
      </div>
    </Backdrop>
  );
}
