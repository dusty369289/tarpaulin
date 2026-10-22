import {
  dueInNextDays,
  GROUP_LABELS,
  GROUP_ORDER,
  type GroupId,
  type SearchEntry,
} from './entries';
import { rank } from './match';
import { MAX_RECENT } from './recent';

export interface Section {
  id: GroupId | 'recent';
  label: string;
  entries: SearchEntry[];
}

/** Results shown per group while searching. */
export const PER_GROUP = 8;
/** How far ahead the empty palette looks for work due. */
export const DUE_AHEAD_DAYS = 3;

/**
 * What the palette lists. With no query: recent picks, then undone work due in the next few days
 * (or, when there's neither, the actions). With a query: matches grouped, the group with the
 * best match first, each group best match first.
 */
export function buildSections(
  entries: SearchEntry[],
  query: string,
  now: Date,
  recentIds: string[],
): Section[] {
  if (!query.trim()) {
    const byId = new Map(entries.map((e) => [e.id, e]));
    const recent = recentIds
      .map((id) => byId.get(id))
      .filter((e): e is SearchEntry => Boolean(e))
      .slice(0, MAX_RECENT);
    const shown = new Set(recent.map((e) => e.id));
    const due = dueInNextDays(entries, now, DUE_AHEAD_DAYS)
      .filter((e) => !shown.has(e.id))
      .slice(0, PER_GROUP);
    const out: Section[] = [];
    if (recent.length) out.push({ id: 'recent', label: GROUP_LABELS.recent, entries: recent });
    if (due.length) out.push({ id: 'due', label: GROUP_LABELS.due, entries: due });
    if (!out.length) {
      const actions = entries.filter((e) => e.group === 'actions');
      if (actions.length)
        out.push({ id: 'actions', label: GROUP_LABELS.actions, entries: actions });
    }
    return out;
  }

  const groups = new Map<GroupId, { best: number; entries: SearchEntry[] }>();
  for (const { item, score } of rank(entries, query, now)) {
    const g = groups.get(item.group) ?? { best: score, entries: [] };
    if (g.entries.length < PER_GROUP) g.entries.push(item);
    groups.set(item.group, g);
  }
  return [...groups]
    .sort(
      ([a, ga], [b, gb]) => gb.best - ga.best || GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b),
    )
    .map(([id, g]) => ({ id, label: GROUP_LABELS[id], entries: g.entries }));
}
