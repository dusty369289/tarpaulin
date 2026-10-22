// Recent Quick find picks, newest first, kept on this device only. Only ids are kept: a pick is
// shown again only while the thing it names still exists.

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

/** Puts `id` first and returns the new list. */
export function rememberPick(id: string): string[] {
  const next = [id, ...loadRecent().filter((r) => r !== id)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: recent picks just aren't remembered */
  }
  return next;
}
