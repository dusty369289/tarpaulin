import { describe, expect, it } from 'vitest';
import { currentTermCourses, currentTermName } from './terms';
import type { CourseData } from './types';

const NOW = new Date('2026-10-21T12:00:00Z');
let n = 0;
function course(
  term: { name: string; startAt: string | null; endAt: string | null } | null,
  own: Partial<CourseData> = {},
): CourseData {
  n++;
  return {
    id: String(n),
    name: `Course ${n}`,
    courseCode: `C${n}`,
    term: term && { id: term.name, ...term },
    startAt: null,
    endAt: null,
    ...own,
  } as unknown as CourseData;
}
const many = (k: number, term: Parameters<typeof course>[0]) =>
  Array.from({ length: k }, () => course(term));

describe('current term', () => {
  it('prefers the newer academic year even when the old one has more courses and no end', () => {
    // The real-world trap: last year's term never got an end date and has more modules.
    const old = { name: '25/26', startAt: '2025-09-01T00:00:00Z', endAt: null };
    const current = { name: '26/27', startAt: '2026-09-01T00:00:00Z', endAt: null };
    expect(currentTermName([...many(9, old), ...many(6, current)], NOW)).toBe('26/27');
  });

  it('prefers the newer term when the old one ends late (resits)', () => {
    const old = { name: '25/26', startAt: '2025-09-01T00:00:00Z', endAt: '2027-01-31T00:00:00Z' };
    const current = {
      name: '26/27',
      startAt: '2026-09-01T00:00:00Z',
      endAt: '2027-08-31T00:00:00Z',
    };
    expect(currentTermName([...many(9, old), ...many(6, current)], NOW)).toBe('26/27');
  });

  it('does not let a single rolling enrolment hijack the semester', () => {
    const fall = {
      name: 'Fall 2026',
      startAt: '2026-08-24T00:00:00Z',
      endAt: '2026-12-18T00:00:00Z',
    };
    const rolling = { name: 'Rolling', startAt: '2026-10-01T00:00:00Z', endAt: null };
    expect(currentTermName([...many(6, fall), course(rolling)], NOW)).toBe('Fall 2026');
    expect(currentTermName([course(rolling)], NOW)).toBe('Rolling');
  });

  it('ignores ended and future terms, and keeps courses whose own dates cover today', () => {
    const spring = {
      name: 'Spring 2026',
      startAt: '2026-01-12T00:00:00Z',
      endAt: '2026-05-08T00:00:00Z',
    };
    const next = { name: 'Spring 2027', startAt: '2027-01-12T00:00:00Z', endAt: null };
    const own = course(null, { startAt: '2026-10-01T00:00:00Z', endAt: '2026-11-01T00:00:00Z' });
    const all = [...many(3, spring), ...many(3, next), own];
    expect(currentTermName(all, NOW)).toBeNull();
    expect(currentTermCourses(all, NOW)).toEqual([own]);
  });
});
