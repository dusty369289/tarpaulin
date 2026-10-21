import type { CourseData } from './types';

// Canvas's "active" enrolments include every past term the student is still enrolled in, and
// many terms have no end date or end long after teaching does (resits, an academic year that
// runs to the next summer). So "current" means: of the terms that have started and not ended,
// the one that started most recently. A term with no end date counts as over a year after it
// started, and a term with a single course (a rolling, self-paced enrolment) only wins when
// there's nothing else. Courses whose own dates cover today count too.

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const YEAR_MS = 366 * 24 * 60 * 60_000;

function coversNow(start: string | null, end: string | null, now: number) {
  const s = time(start);
  const e = time(end);
  if (Number.isNaN(s) && Number.isNaN(e)) return false;
  return (Number.isNaN(s) || s <= now) && (Number.isNaN(e) || e >= now);
}

export function currentTermName(courses: CourseData[], now: Date = new Date()): string | null {
  const t = now.getTime();
  const active = new Map<string, { start: number; count: number }>();
  for (const c of courses) {
    const start = time(c.term?.startAt);
    if (!c.term || Number.isNaN(start) || start > t) continue;
    const end = time(c.term.endAt);
    if (Number.isNaN(end) ? t - start > YEAR_MS : end < t) continue;
    const entry = active.get(c.term.name) ?? { start, count: 0 };
    entry.count++;
    active.set(c.term.name, entry);
  }
  const terms = [...active];
  const substantial = terms.filter(([, e]) => e.count > 1);
  const pool = substantial.length ? substantial : terms;
  pool.sort((a, b) => b[1].start - a[1].start || b[1].count - a[1].count);
  return pool[0]?.[0] ?? null;
}

export function currentTermCourses(courses: CourseData[], now: Date = new Date()): CourseData[] {
  const term = currentTermName(courses, now);
  const t = now.getTime();
  return courses.filter((c) => {
    const ended = !Number.isNaN(time(c.endAt)) && time(c.endAt) < t;
    if (ended) return false;
    if (term && c.term?.name === term) return true;
    return coversNow(c.startAt, c.endAt, t);
  });
}
