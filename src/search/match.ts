import { fold } from '../lib/text';

// Quick find's matcher: small, pure and forgiving. "ps4" finds "Problem set 4", "ml" finds
// "Machine Learning", "cs229" finds a course coded "CS 229", and one slipped letter ("probelm")
// still finds "Problem". Results rank by how well they match, then by how soon they are due.

/** Anything that can be searched: a title, plus quieter words (course name, code, type). */
export interface Searchable {
  title: string;
  /** Matched too, but a match here counts for less than one in the title. */
  keywords?: readonly string[];
  /**
   * What it belongs to (its course's name, code and nickname). A match here alone ranks the
   * item below every item matched by its own title, and below the courses themselves.
   */
  context?: readonly string[];
  /** A container (a course): ranked after items that match well by their own title. */
  secondary?: boolean;
  /** Breaks ties: sooner first, then past (most recent first), then undated. */
  due?: Date | null;
}

export interface Ranked<T> {
  item: T;
  score: number;
  /** 0: a good match on the item's own words. 1: courses, and weak own matches. 2: matched
   *  only through its course. Lower bands always rank first. */
  band: Band;
}

export type Band = 0 | 1 | 2;

/** An own-title match at least this good (word start, initials without skips) ranks in band 0. */
const STRONG = 70;

/** How much a match in the keywords counts against the same match in the title. */
const KEYWORD_WEIGHT = 0.8;

const SCORE = {
  /** The token is a whole word ("4" in "Problem set 4"). */
  word: 100,
  /** The token starts the field ("prob" in "Problem set 4"). */
  start: 92,
  /** The token starts a later word ("set" in "Problem set 4"). */
  wordStart: 84,
  /** The token is the first letters of every word ("ml" for "Machine Learning"). Below a
   *  word start, so "ps" finds "Problem set" ahead of "Probability & Statistics". */
  acronym: 80,
  /** The token is spelled by the starts of words, in order ("ps4", "pset4"). */
  initials: 76,
  /** Inside a word ("blem"). */
  inside: 50,
  /** One letter wrong, missing, extra or swapped ("probelm"). */
  typo: 42,
  /** Its letters appear in order, spread out ("pst"); the more spread, the lower. */
  scattered: 28,
} as const;

/**
 * Lower case, accents dropped, words split at spaces, punctuation, camelCase and letter–digit
 * boundaries ("CS-229", "ProblemSet4" and "problem set 4" all become words).
 */
export function words(text: string): string[] {
  return fold(text.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2'))
    .replace(/(\p{L})(\p{N})/gu, '$1 $2')
    .replace(/(\p{N})(\p{L})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** The query's tokens: like `words`, but "ps4" stays one token so it can spell initials. */
export function tokens(query: string): string[] {
  return fold(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Whether `token` can be spelled by prefixes of `ws` taken in order, starting at `from` and
 * using at least two words. Returns how many words were skipped on the way (fewer is better),
 * or -1 when it can't.
 */
function initials(token: string, ws: string[]): number {
  const memo = new Map<string, number>();
  // Fewest skips to spell token[pos..] from word `w` on, with `used` words used so far.
  const go = (pos: number, w: number, used: number): number => {
    if (pos === token.length) return used >= 2 ? 0 : -1;
    const key = `${pos}:${w}:${Math.min(used, 2)}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let fewest = -1;
    for (let j = w; j < ws.length; j++) {
      const word = ws[j];
      for (let len = Math.min(word.length, token.length - pos); len >= 1; len--) {
        if (!token.startsWith(word.slice(0, len), pos)) continue;
        const rest = go(pos + len, j + 1, used + 1);
        if (rest < 0) continue;
        const skips = rest + (used > 0 ? j - w : 0);
        if (fewest < 0 || skips < fewest) fewest = skips;
      }
    }
    memo.set(key, fewest);
    return fewest;
  };
  return go(0, 0, 0);
}

/** At most one edit (insert, delete, replace, or swap two neighbours) apart. */
function oneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // replaced
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // swapped
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i);
}

/** How spread out `token`'s letters are in `text` (1 = together), or 0 when they aren't all there. */
function scattered(token: string, text: string): number {
  let at = text.indexOf(token[0]);
  if (at < 0) return 0;
  const start = at;
  for (let i = 1; i < token.length; i++) {
    at = text.indexOf(token[i], at + 1);
    if (at < 0) return 0;
  }
  return token.length / (at - start + 1);
}

/** How well one query token matches one field (already split into words), 0 for not at all. */
function tokenScore(token: string, ws: string[]): number {
  if (!ws.length) return 0;
  if (ws.includes(token) || ws.join('') === token) return SCORE.word;
  if (ws[0].startsWith(token)) return SCORE.start;
  if (ws.some((w) => w.startsWith(token))) return SCORE.wordStart;
  const skips = initials(token, ws);
  if (skips >= 0) {
    if (ws.length === token.length && ws.every((w, i) => w[0] === token[i])) return SCORE.acronym;
    // Skipping words on the way ("ml" in "MATH 2940 lecture") is a much weaker hint.
    return SCORE.initials - Math.min(skips, 3) * 10;
  }
  if (ws.some((w) => w.includes(token))) return SCORE.inside;
  const joined = ws.join('');
  if (token.length >= 3 && joined.includes(token)) return SCORE.inside;
  if (
    token.length >= 4 &&
    ws.some((w) => oneEdit(token, w.slice(0, token.length)) || oneEdit(token, w))
  )
    return SCORE.typo;
  if (token.length >= 3) {
    const spread = scattered(token, joined);
    if (spread >= 0.4) return Math.round(SCORE.scattered * spread);
  }
  return 0;
}

export interface Match {
  score: number;
  band: Band;
}

/**
 * How well `query` matches `item`: a score from 0 (no match) to about 100, and its band (see
 * `Ranked`). Every token of the query has to match somewhere; the score is their average, with
 * a small lift when the title starts with the whole query.
 */
export function match(query: string, item: Searchable): Match {
  const none: Match = { score: 0, band: 2 };
  const qs = tokens(query);
  if (!qs.length) return none;
  const title = words(item.title);
  const keywords = (item.keywords ?? []).map(words);
  const context = (item.context ?? []).map(words);
  let total = 0;
  let own = 0;
  for (const q of qs) {
    let best = tokenScore(q, title);
    if (best < SCORE.word) {
      for (const k of keywords) best = Math.max(best, tokenScore(q, k) * KEYWORD_WEIGHT);
    }
    if (best > 0) own++;
    else for (const c of context) best = Math.max(best, tokenScore(q, c) * KEYWORD_WEIGHT);
    if (best <= 0) return none;
    total += best;
  }
  let score = total / qs.length;
  const phrase = qs.join(' ');
  if (qs.length > 1 && title.join(' ').startsWith(phrase)) score += 6;
  score = Math.round(score * 10) / 10;
  const band: Band = own === 0 ? 2 : item.secondary || score < STRONG ? 1 : 0;
  return { score, band };
}

/** Just the score of `match`. */
export const matchScore = (query: string, item: Searchable): number => match(query, item).score;

/** Sort key for "how soon": upcoming soonest first, then past most recent first, then undated. */
export function dueOrder(due: Date | null | undefined, now: Date): number {
  if (!due) return Number.MAX_SAFE_INTEGER;
  const t = due.getTime() - now.getTime();
  return t >= 0 ? t : 1e15 - t;
}

/**
 * The items that match `query`: by band (own title matches, then courses, then matches through
 * the course alone), then best match first, then by how soon they are due.
 */
export function rank<T extends Searchable>(
  items: readonly T[],
  query: string,
  now: Date,
): Ranked<T>[] {
  const out: Ranked<T>[] = [];
  for (const item of items) {
    const m = match(query, item);
    if (m.score > 0) out.push({ item, ...m });
  }
  return out.sort(
    (a, b) =>
      a.band - b.band ||
      b.score - a.score ||
      dueOrder(a.item.due, now) - dueOrder(b.item.due, now) ||
      a.item.title.localeCompare(b.item.title),
  );
}
