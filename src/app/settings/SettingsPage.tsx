import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { SearchInput, SettingsFilter, useNoRows, useSettingsFilter } from '../../ui';
import { isModShortcut, isTyping } from '../../ui/keys';
import { CATEGORIES, type CategoryInfo } from './categories';
import {
  categoryFromHash,
  lastCategory,
  rememberCategory,
  settingsHash,
  type SettingsCategory,
} from '../settingsNav';

// Settings, the way desktop apps lay it out: categories down the left (a row of chips in a
// narrow window), the chosen one on the right. Typing in the search box swaps the category for
// every matching row from all of them. The last category is remembered for the session, and
// `openSettings('account')` (settingsNav) links straight to one.

export function SettingsPage({ onBack }: { onBack: () => void }) {
  const [category, setCategory] = useState<SettingsCategory>(
    () => categoryFromHash() ?? lastCategory(),
  );
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const searching = query.trim() !== '';

  // A deep link (#/settings?category=…) picks the category, now or while Settings is open. The
  // hash is then tidied back to plain #/settings so a later visit opens where the user left off.
  useEffect(() => {
    const take = () => {
      const asked = categoryFromHash();
      if (!asked) return;
      setCategory(asked);
      setQuery('');
      history.replaceState(history.state, '', `#${settingsHash()}`);
    };
    take();
    window.addEventListener('hashchange', take);
    return () => window.removeEventListener('hashchange', take);
  }, []);

  useEffect(() => rememberCategory(category), [category]);

  // Ctrl/⌘+F or "/" jumps to the search box, unless typing somewhere or a dialog is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const find = isModShortcut(e, 'f');
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (!find && !slash) return;
      if (isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (id: SettingsCategory) => {
    setCategory(id);
    setQuery('');
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  };

  const current = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </button>
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>
      <div className="flex min-w-0 flex-col gap-4 min-[760px]:flex-row min-[760px]:items-start min-[760px]:gap-8">
        <aside className="flex min-w-0 flex-col gap-3 min-[760px]:sticky min-[760px]:top-4 min-[760px]:w-56 min-[760px]:shrink-0">
          <SearchInput
            inputRef={searchRef}
            value={query}
            onChange={setQuery}
            placeholder="Search settings"
          />
          <nav aria-label="Settings categories" className="min-w-0">
            <ul className="flex gap-1.5 overflow-x-auto pb-1 min-[760px]:flex-col min-[760px]:gap-0.5 min-[760px]:overflow-visible min-[760px]:pb-0">
              {CATEGORIES.map((c) => (
                <li key={c.id} className="shrink-0">
                  <CategoryButton
                    info={c}
                    active={!searching && c.id === current.id}
                    onPick={() => pick(c.id)}
                  />
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          {searching ? (
            <SettingsFilter query={query}>
              <SearchResults onOpen={pick} />
            </SettingsFilter>
          ) : (
            <CategoryView key={current.id} info={current} />
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryButton({
  info,
  active,
  onPick,
}: {
  info: CategoryInfo;
  active: boolean;
  onPick: () => void;
}) {
  const Icon = info.icon;
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onPick}
      className={`relative flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors min-[760px]:w-full min-[760px]:rounded-md min-[760px]:border-transparent min-[760px]:px-2.5 ${
        active
          ? 'border-accent bg-accent/10 font-medium text-accent'
          : 'border-border text-muted hover:bg-surface-2 hover:text-text'
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 hidden h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent animate-fade-in min-[760px]:block"
        />
      )}
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {info.title}
    </button>
  );
}

function CategoryHeader({ info, id }: { info: CategoryInfo; id: string }) {
  const Icon = info.icon;
  return (
    <header className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-theme bg-accent/10 text-accent">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-semibold leading-tight">
          {info.title}
        </h2>
        <p className="text-sm text-muted">{info.description}</p>
      </div>
    </header>
  );
}

function CategoryView({ info }: { info: CategoryInfo }) {
  const id = useId();
  const { Content } = info;
  return (
    <section
      aria-labelledby={id}
      data-category={info.id}
      className="flex flex-col gap-6 animate-settings-in motion-reduce:animate-none"
    >
      <CategoryHeader info={info} id={id} />
      <Content />
    </section>
  );
}

/** Every category's matching rows, under the category's name; categories with none are left out. */
function SearchResults({ onOpen }: { onOpen: (id: SettingsCategory) => void }) {
  const query = useSettingsFilter();
  const ref = useRef<HTMLDivElement>(null);
  const none = useNoRows(ref);
  return (
    <div ref={ref} className="flex flex-col gap-8" data-testid="settings-results">
      {CATEGORIES.map((c) => (
        <ResultGroup key={c.id} info={c} onOpen={() => onOpen(c.id)} />
      ))}
      {none && (
        <p role="status" className="py-10 text-center text-sm text-muted">
          No settings match “{query}”.
        </p>
      )}
    </div>
  );
}

function ResultGroup({ info, onOpen }: { info: CategoryInfo; onOpen: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const empty = useNoRows(ref);
  const id = useId();
  const { Content, icon: Icon } = info;
  return (
    <section
      ref={ref}
      hidden={empty}
      aria-labelledby={id}
      data-category={info.id}
      className={`${empty ? 'hidden' : 'flex'} flex-col gap-3 animate-settings-in motion-reduce:animate-none`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border pb-1.5">
        <h2 id={id} className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-accent" aria-hidden />
          {info.title}
        </h2>
        <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={onOpen}>
          Open {info.title} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <Content />
    </section>
  );
}
