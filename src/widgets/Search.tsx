import { Search as SearchIcon } from 'lucide-react';
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { z } from 'zod';
import { useSearchEntries, type GroupId } from '../search/entries';
import {
  comboboxProps,
  ResultList,
  resultCount,
  useResultList,
  type ResultListState,
} from '../search/ResultList';
import { useQuickFind } from '../search/store';
import '../search/quickFind.css';
import { Kbd } from '../ui/Kbd';
import { shortcutLabel } from '../ui/keys';
import { field } from './settings/fields';
import { EmptyState } from './shared/ui';
import { defineWidget } from './types';

// Quick find as a widget: the palette's entries, matcher and result list, in the dashboard.
// Short (a row or two of field): a search bar whose results drop down in a popover above the
// grid. Taller: the field on top and the results listed inside, scrolling in the widget body.

const schema = z.object({
  work: field(z.boolean().default(true), { label: 'Search work (assignments, quizzes, to-dos)' }),
  announcements: field(z.boolean().default(true), { label: 'Search announcements' }),
  events: field(z.boolean().default(true), { label: 'Search calendar events' }),
  courses: field(z.boolean().default(true), { label: 'Search courses' }),
  pages: field(z.boolean().default(true), { label: 'Search dashboard pages' }),
  actions: field(z.boolean().default(true), { label: 'Search app actions' }),
  dueWhenEmpty: field(z.boolean().default(true), { label: 'Show due soon when empty' }),
});
type SearchSettings = z.infer<typeof schema>;

/** At or under this many rows the widget is just the field, with a dropdown. */
export const COMPACT_ROWS = 3;
/** From this many columns the inline results put each group's label in its own column. */
const WIDE_COLUMNS = 8;

const GROUP_SETTINGS: Array<[keyof SearchSettings, GroupId]> = [
  ['work', 'due'],
  ['announcements', 'announcements'],
  ['events', 'events'],
  ['courses', 'courses'],
  ['pages', 'pages'],
  ['actions', 'actions'],
];

export const Search = defineWidget({
  type: 'search',
  name: 'Search',
  description: 'Find work, announcements, courses, pages and actions as you type.',
  icon: SearchIcon,
  defaultSize: { w: 4, h: 8 },
  minSize: { w: 2, h: 2 },
  settingsSchema: schema,
  Component: function SearchWidget({ settings, size }) {
    const actions = useQuickFind((s) => s.appActions);
    const { entries, now } = useSearchEntries(actions);
    const [query, setQuery] = useState('');
    const compact = size.h <= COMPACT_ROWS;
    const [open, setOpen] = useState(false);
    const [focused, setFocused] = useState(false);

    const fieldRef = useRef<HTMLDivElement>(null);
    // As a string, so the set (and the results) are only rebuilt when the choice changes.
    const groupKey = GROUP_SETTINGS.filter(([key]) => settings[key])
      .map(([, g]) => g)
      .join(',');
    const groups = useMemo(
      () => new Set(groupKey.split(',').filter(Boolean) as GroupId[]),
      [groupKey],
    );
    const options = useMemo(
      () => ({ groups, dueWhenEmpty: settings.dueWhenEmpty, actionsWhenEmpty: false }),
      [groups, settings.dueWhenEmpty],
    );
    const list = useResultList({
      entries,
      now,
      query,
      options,
      onPick: (openIt) => {
        setOpen(false);
        openIt();
      },
    });

    if (!groups.size) {
      return <EmptyState>Pick what to search in this widget’s settings.</EmptyState>;
    }

    const n = list.options.length;
    const showPopover = compact && open && (n > 0 || Boolean(query.trim()));
    const expanded = compact ? showPopover && n > 0 : n > 0;

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        if (compact && showPopover) setOpen(false);
        else if (query) setQuery('');
        else return;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (compact && !open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (compact && !showPopover && e.key === 'Enter') return;
      list.onKeyDown(e);
    };

    const input = (
      <div ref={fieldRef} className="sw-field relative shrink-0">
        <SearchIcon
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          type="text"
          {...comboboxProps(list, expanded, settings.title || 'Search')}
          placeholder="Search…"
          className="input pl-8 pr-14"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setOpen(false);
          }}
          onKeyDown={onKeyDown}
        />
        <Kbd className="sw-chip pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
          {shortcutLabel('K', ' ')}
        </Kbd>
      </div>
    );
    const status = (
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {query.trim() ? resultCount(n) : ''}
      </p>
    );

    if (compact) {
      return (
        <div className="sw flex h-full flex-col justify-center">
          {input}
          {showPopover && <Dropdown anchor={fieldRef} list={list} query={query} />}
          {status}
        </div>
      );
    }
    return (
      <div className="sw flex h-full min-h-0 flex-col gap-1.5">
        {input}
        {n > 0 ? (
          <ResultList
            list={list}
            wide={size.w >= WIDE_COLUMNS}
            showActive={focused}
            className="sw-results -mx-1 min-h-0 flex-1 overflow-y-auto px-1 scroll-thin"
          />
        ) : (
          // Keeps the input's aria-controls pointing at the (empty) listbox.
          <>
            <ResultList list={list} className="hidden" />
            <p className="px-1 py-2 text-center text-sm text-muted">
              {query.trim() ? `Nothing matches “${query.trim()}”.` : 'Type to find anything.'}
            </p>
          </>
        )}
        {status}
      </div>
    );
  },
});

/**
 * The compact widget's results, portalled to the body and placed under the field (or over it,
 * when there's more room above): the frame clips its overflow and the grid item is transformed,
 * so nothing can drop out of the widget itself. It follows the field while the page scrolls.
 */
function Dropdown({
  anchor,
  list,
  query,
}: {
  anchor: React.RefObject<HTMLDivElement | null>;
  list: ResultListState;
  query: string;
}) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    let frame = 0;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const gap = 6;
      const width = Math.min(Math.max(r.width, 320), window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const below = window.innerHeight - r.bottom - gap - 8;
      const above = r.top - gap - 8;
      const up = below < 220 && above > below;
      const maxHeight = Math.min(420, up ? above : below);
      setStyle(
        up
          ? { left, width, maxHeight, bottom: window.innerHeight - r.top + gap }
          : { left, width, maxHeight, top: r.bottom + gap },
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
    };
  }, [anchor]);

  return createPortal(
    // A press anywhere in it keeps focus in the field (and the dropdown open).
    <div
      role="presentation"
      data-testid="search-dropdown"
      className="card fixed z-40 flex flex-col overflow-hidden shadow-2xl animate-pop-in"
      style={style}
      onMouseDown={(e) => e.preventDefault()}
    >
      {list.options.length > 0 ? (
        <ResultList list={list} className="min-h-0 flex-1 overflow-y-auto p-1.5 scroll-thin" />
      ) : (
        <p className="px-4 py-4 text-center text-sm text-muted">
          Nothing matches “{query.trim()}”.
        </p>
      )}
    </div>,
    document.body,
  );
}
