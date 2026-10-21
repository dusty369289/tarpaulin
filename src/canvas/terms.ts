import type { CourseData } from './types';

// Canvas's "active" enrolments include every past term the student is still enrolled in, and
// many terms have no end date. So "current" means: of the dated terms that have started and not
// ended, the one with the most courses (latest start breaks ties, so a small rolling term can't
// hijack the semester), plus any course whose own dates cover today.

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

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
    if (!Number.isNaN(end) && end < t) continue;
    const entry = active.get(c.term.name) ?? { start, count: 0 };
    entry.count++;
    active.set(c.term.name, entry);
  }
  let best: [string, { start: number; count: number }] | null = null;
  for (const entry of active) {
    if (
      !best ||
      entry[1].count > best[1].count ||
      (entry[1].count === best[1].count && entry[1].start > best[1].start)
    )
      best = entry;
  }
  return best?.[0] ?? null;
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
