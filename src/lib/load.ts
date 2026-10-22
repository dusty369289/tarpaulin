import { addDays, format, startOfDay } from 'date-fns';
import { PLANNER_TYPES } from '../canvas/kinds';
import type { PlannerItemType } from '../canvas/types';
import { dayKey } from './days';
import { formatPoints } from './text';

// How much work is due on a day or in a week, as one small, explainable number.
//
// - Only unfinished work counts: assignments, quizzes, discussions, peer reviews and anything
//   else you hand in (`isWork`). Announcements, calendar events (lectures, sections), pages and
//   planner notes don't, and neither does anything submitted, graded, excused or marked done.
// - Each item scores 1, plus 1 if it's worth at least twice the course's typical item (the
//   median points of that course's work), or plus 2 if at least four times. A 100-point exam
//   in a course of 10-point quizzes scores 3; an item without points scores 1.
// - A day is light from 1, busy from 3 and heavy from 5. A week is light from 1, busy from 6
//   and heavy from 12, and a week with a heavy day is at least busy.
//
// Shared by the Calendar's shading and week summary and the weekly preview notification.

/** What the load needs from a planner item (a `Deadline` fits). */
export interface LoadSource {
  key: string;
  type: PlannerItemType;
  courseId: string | null;
  date: Date | null;
  points: number | null;
  /** Something you hand in (has a submission). */
  isWork: boolean;
  /** Submitted, graded, excused or marked done. */
  isDone: boolean;
}

export type LoadLevel = 'none' | 'light' | 'busy' | 'heavy';

export interface DayLoad {
  score: number;
  /** Unfinished items due. */
  due: number;
  /** Their points, summed (items without points add nothing). */
  points: number;
  level: LoadLevel;
}

export interface WeekLoad extends DayLoad {
  start: Date;
  /** The day with the highest score (the earliest on a tie); null when nothing is due. */
  heaviest: { day: Date; load: DayLoad } | null;
}

/** Day score thresholds: light from 1, busy from 3, heavy from 5. */
export const DAY_LEVELS = { busy: 3, heavy: 5 } as const;
/** Week score thresholds: light from 1, busy from 6, heavy from 12. */
export const WEEK_LEVELS = { busy: 6, heavy: 12 } as const;

export const EMPTY_LOAD: DayLoad = { score: 0, due: 0, points: 0, level: 'none' };

/** Work that's due (done or not): what the course baseline is built from. */
function isWorkItem(d: LoadSource): boolean {
  // Some types are due work even when Canvas sends no submission for them.
  return d.isWork || PLANNER_TYPES[d.type].dueWork;
}

/** Unfinished work with a due date: what counts toward the load. */
export function countsTowardLoad(d: LoadSource): boolean {
  return d.date !== null && isWorkItem(d) && !d.isDone;
}

/** Each course's typical item: the median points of its work that has points. */
export function courseBaselines(items: Iterable<LoadSource>): Map<string, number> {
  const byCourse = new Map<string, number[]>();
  const seen = new Set<string>();
  for (const d of items) {
    if (seen.has(d.key)) continue;
    seen.add(d.key);
    if (!d.courseId || !isWorkItem(d) || !d.points || d.points <= 0) continue;
    const list = byCourse.get(d.courseId) ?? [];
    list.push(d.points);
    byCourse.set(d.courseId, list);
  }
  const out = new Map<string, number>();
  for (const [id, pts] of byCourse) {
    pts.sort((a, b) => a - b);
    const mid = pts.length >> 1;
    out.set(id, pts.length % 2 ? pts[mid] : (pts[mid - 1] + pts[mid]) / 2);
  }
  return out;
}

/** 1, plus 1 at twice the course's typical points, plus 2 at four times. */
export function itemWeight(d: LoadSource, baselines: Map<string, number>): number {
  const typical = d.courseId ? baselines.get(d.courseId) : undefined;
  if (!typical || !d.points || d.points <= 0) return 1;
  const ratio = d.points / typical;
  return ratio >= 4 ? 3 : ratio >= 2 ? 2 : 1;
}

export function dayLevel(score: number): LoadLevel {
  if (score <= 0) return 'none';
  if (score >= DAY_LEVELS.heavy) return 'heavy';
  if (score >= DAY_LEVELS.busy) return 'busy';
  return 'light';
}

export function weekLevel(score: number, heaviestDay: LoadLevel = 'none'): LoadLevel {
  if (score <= 0) return 'none';
  if (score >= WEEK_LEVELS.heavy) return 'heavy';
  if (score >= WEEK_LEVELS.busy || heaviestDay === 'heavy') return 'busy';
  return 'light';
}

/** The load of every day that has something due, by `yyyy-MM-dd`. */
export type LoadByDay = Map<string, DayLoad>;

/**
 * Scores `items` by day. `baselineFrom` sets each course's typical points (defaults to `items`);
 * pass a wider window so a quiet week's items are still compared with the whole course.
 */
export function loadByDay(
  items: Iterable<LoadSource>,
  baselineFrom: Iterable<LoadSource> = items,
): LoadByDay {
  const list = [...items];
  const baselines = courseBaselines(baselineFrom === items ? list : baselineFrom);
  const out: LoadByDay = new Map();
  const seen = new Set<string>();
  for (const d of list) {
    if (!countsTowardLoad(d) || seen.has(d.key)) continue;
    seen.add(d.key);
    const k = dayKey(d.date!);
    const prev = out.get(k) ?? EMPTY_LOAD;
    const score = prev.score + itemWeight(d, baselines);
    out.set(k, {
      score,
      due: prev.due + 1,
      points: prev.points + (d.points && d.points > 0 ? d.points : 0),
      level: dayLevel(score),
    });
  }
  return out;
}

export function dayLoad(byDay: LoadByDay, day: Date): DayLoad {
  return byDay.get(dayKey(day)) ?? EMPTY_LOAD;
}

/** The seven days from `start`. */
export function weekLoad(byDay: LoadByDay, start: Date): WeekLoad {
  const first = startOfDay(start);
  let score = 0;
  let due = 0;
  let points = 0;
  let heaviest: WeekLoad['heaviest'] = null;
  for (let i = 0; i < 7; i++) {
    const day = addDays(first, i);
    const load = dayLoad(byDay, day);
    score += load.score;
    due += load.due;
    points += load.points;
    if (load.score > 0 && (!heaviest || load.score > heaviest.load.score)) heaviest = { day, load };
  }
  return {
    start: first,
    score,
    due,
    points,
    level: weekLevel(score, heaviest?.load.level),
    heaviest,
  };
}

const LEVEL_NAMES: Record<LoadLevel, string> = {
  none: 'Quiet',
  light: 'Light',
  busy: 'Busy',
  heavy: 'Heavy',
};

/** "Quiet", "Light", "Busy", "Heavy". */
export const levelName = (level: LoadLevel) => LEVEL_NAMES[level];

/**
 * "busy: 3 due, 120 points" ("Busy: …" with `capitalise`, to stand on its own); null when nothing
 * is due.
 */
export function describeLoad(
  load: DayLoad,
  { capitalise = false }: { capitalise?: boolean } = {},
): string | null {
  if (load.due === 0) return null;
  const pts = load.points > 0 ? `, ${formatPoints(load.points)}` : '';
  const level = capitalise ? levelName(load.level) : load.level;
  return `${level}: ${load.due} due${pts}`;
}

/**
 * "Busy week · 7 due · heaviest Thu"; a light week stays short ("Light week · 2 due"); null when
 * nothing is due. `thisWeek` words it for the month view, which shows the current week's.
 */
export function summariseWeek(week: WeekLoad, thisWeek = false): string | null {
  if (week.due === 0) return null;
  const level = levelName(week.level);
  const head = thisWeek ? `This week: ${level.toLowerCase()}` : `${level} week`;
  const parts = [head, `${week.due} due`];
  if (week.level !== 'light' && week.heaviest)
    parts.push(`heaviest ${format(week.heaviest.day, 'EEE')}`);
  return parts.join(' · ');
}
