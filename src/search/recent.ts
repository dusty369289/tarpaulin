import { useSyncExternalStore } from 'react';

// Recent Quick find picks, newest first, kept on this device only. Only ids are kept: a pick is
// shown again only while the thing it names still exists. The palette and every Search widget
// share the list, and each sees a pick made in another at once.

const KEY = 'tarpaulin.quickFind.recent';
export const MAX_RECENT = 8;

export function loadRecent(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter((id): id is string => typeof id === 'string').slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

const listeners = new Set<() => void>();
let snapshot: string[] | null = null;

/** Puts `id` first and returns the new list. */
export function rememberPick(id: string): string[] {
  const next = [id, ...loadRecent().filter((r) => r !== id)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: recent picks are remembered until the app closes */
  }
  snapshot = next;
  for (const l of listeners) l();
  return next;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** The recent picks, kept up to date. Read afresh from storage on first use after mounting. */
export function useRecent(): string[] {
  return useSyncExternalStore(subscribe, () => (snapshot ??= loadRecent()));
}

/** Forgets the in-memory copy, so the next read comes from storage (tests clear storage). */
export function resetRecentCache() {
  snapshot = null;
}
