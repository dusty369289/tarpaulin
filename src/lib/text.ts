// Small text helpers shared by search, settings filtering and the wording of counts.

/** Lowercased with accents stripped, so "resume" finds "Résumé". */
export const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase();

/** Whether every word of `query` appears somewhere in `texts` (accent- and case-insensitive). */
export function foldedIncludesAll(query: string, ...texts: (string | null | undefined)[]) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(texts.filter(Boolean).join(' '));
  return words.every((w) => hay.includes(w));
}

/** "1 item", "3 items"; `many` for irregular plurals. */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "10 points" / "1 point", or "10 pts" when `short`. Whole numbers lose their decimals. */
export function formatPoints(n: number, { short = false }: { short?: boolean } = {}) {
  const value = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  return short ? `${value} pts` : `${value} ${n === 1 ? 'point' : 'points'}`;
}
