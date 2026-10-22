import { useSyncExternalStore } from 'react';
import { readJson, writeJson } from '../lib/storage';

// Recent Quick find picks, newest first, kept on this device only. Only ids are kept: a pick is
// shown again only while the thing it names still exists. The palette and every Search widget
// share the list, and each sees a pick made in another at once.

const KEY = 'tarpaulin.quickFind.recent';
export const MAX_RECENT = 8;

export function loadRecent(): string[] {
  return readJson(
    KEY,
    (raw) =>
      Array.isArray(raw)
        ? raw.filter((id): id is string => typeof id === 'string').slice(0, MAX_RECENT)
        : null,
    [],
  );
}

const listeners = new Set<() => void>();
let snapshot: string[] | null = null;

/** Puts `id` first and returns the new list. */
export function rememberPick(id: string): string[] {
  const next = [id, ...loadRecent().filter((r) => r !== id)].slice(0, MAX_RECENT);
  // Without storage, recent picks are remembered until the app closes.
  writeJson(KEY, next);
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
