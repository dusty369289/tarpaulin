import { describe, expect, it } from 'vitest';
import { Catalog, Deadlines, Grade } from './models';
import type { CourseData, PlannerItemData } from './types';

const NOW = new Date('2026-10-21T12:00:00Z');
const prefs = {
  courseScope: 'current' as const,
  hiddenCourseIds: [],
  courseColors: {},
  courseNicknames: {},
};

function course(id: string, over: Partial<CourseData> = {}): CourseData {
  return {
    id,
    name: `Course ${id}`,
    courseCode: `C${id}`,
    term: {
      id: 't',
      name: 'Fall 2026',
      startAt: '2026-08-24T13:00:00Z',
      endAt: '2026-12-18T23:00:00Z',
    },
    startAt: null,
    endAt: null,
    imageUrl: null,
    htmlUrl: `https://c.edu/courses/${id}`,
    currentScore: null,
    currentGrade: null,
    finalScore: null,
    hideFinalGrades: false,
    ...over,
  };
}

function item(key: string, over: Partial<PlannerItemData> = {}): PlannerItemData {
  return {
    key,
    id: key,
    type: 'assignment',
    title: key,
    courseId: '1',
    contextName: 'Course 1',
    date: '2026-10-22T12:00:00Z',
    dueAt: '2026-10-22T12:00:00Z',
    pointsPossible: 10,
    htmlUrl: null,
    gradeable: true,
    submitted: false,
    missing: false,
    late: false,
    graded: false,
    excused: false,
    markedComplete: false,
    newActivity: false,
    ...over,
  };
}

const past = {
  id: 'p',
  name: 'Spring 2026',
  startAt: '2026-01-12T13:00:00Z',
  endAt: '2026-05-08T23:00:00Z',
};

describe('Catalog', () => {
  const catalog = new Catalog({
    courses: [
      course('1'),
      course('2', { term: past, currentScore: 64 }),
      course('3'),
      course('4', { endAt: '2026-10-01T00:00:00Z' }),
    ],
    canvasColors: { '1': '#0EA5E9' },
    prefs: {
      ...prefs,
      hiddenCourseIds: ['3'],
      courseNicknames: { '1': 'Politics' },
      courseColors: { '3': '#000000' },
    },
    now: NOW,
  });

  it('scopes to the current term, drops ended and hidden courses', () => {
    expect(catalog.currentTerm).toBe('Fall 2026');
    expect(catalog.scoped.ids()).toEqual(['1', '3']);
    expect(catalog.inScope.ids()).toEqual(['1']);
  });

  it('applies nicknames and colours (local > Canvas > palette)', () => {
    expect(catalog.course('1')!.name).toBe('Politics');
    expect(catalog.course('1')!.canvasName).toBe('Course 1');
    expect(catalog.course('1')!.color).toBe('#0EA5E9');
    expect(catalog.course('3')!.color).toBe('#000000');
    expect(catalog.course('2')!.color).toMatch(/^#/);
  });

  it('resolves a widget course filter within scope', () => {
    expect(catalog.resolveCourseIds([])).toEqual(['1']);
    expect(catalog.resolveCourseIds(['2'])).toEqual([]);
  });

  it('wraps planner items with course relations', () => {
    const [d] = catalog.deadlines([item('a')]);
    expect(d.course?.name).toBe('Politics');
    expect(d.courseName).toBe('Politics');
    expect(d.color).toBe('#0EA5E9');
  });
});

describe('Deadline status', () => {
  const catalog = new Catalog({ courses: [course('1')], prefs, now: NOW });
  const status = (over: Partial<PlannerItemData>) =>
    catalog.deadlines([item('x', over)]).first!.status(NOW);

  it.each([
    [{ excused: true }, 'excused'],
    [{ graded: true }, 'graded'],
    [{ submitted: true }, 'submitted'],
    [{ submitted: true, late: true }, 'submitted-late'],
    [{ markedComplete: true }, 'done'],
    [{ missing: true }, 'missing'],
    [{ dueAt: '2026-10-20T12:00:00Z', date: '2026-10-20T12:00:00Z' }, 'overdue'],
    [{ dueAt: '2026-10-21T18:00:00Z', date: '2026-10-21T18:00:00Z' }, 'due-today'],
    [{}, 'upcoming'],
    [{ type: 'announcement' as const, gradeable: false }, 'info'],
  ])('%o → %s', (over, expected) => expect(status(over)).toBe(expected));
});

describe('Deadlines collection', () => {
  const catalog = new Catalog({ courses: [course('1'), course('2')], prefs, now: NOW });
  const list = catalog.deadlines([
    item('late', { dueAt: '2026-10-25T12:00:00Z', date: '2026-10-25T12:00:00Z' }),
    item('soon', { dueAt: '2026-10-22T09:00:00Z', date: '2026-10-22T09:00:00Z', courseId: '2' }),
    item('done', { submitted: true }),
    item('news', { type: 'announcement', gradeable: false }),
    item('note', {
      type: 'planner_note',
      gradeable: false,
      courseId: null,
      date: null,
      dueAt: null,
    }),
  ]);

  it('chains filters and keeps its subclass', () => {
    const chained = list.work().undone().sortByDue();
    expect(chained).toBeInstanceOf(Deadlines);
    expect(chained.map((d) => d.key)).toEqual(['soon', 'late']);
  });
  it('filters by course but keeps items with no course', () => {
    expect(list.inCourses(['2']).map((d) => d.key)).toEqual(['soon', 'note']);
    expect(list.inCourses(null).length).toBe(5);
  });
  it('finds the next deadline', () => {
    expect(list.next(NOW)?.key).toBe('soon');
  });
  it('groups', () => {
    expect([
      ...list
        .withoutAnnouncements()
        .groupBy((d) => d.courseId ?? 'none')
        .keys(),
    ]).toEqual(['1', '2', 'none']);
  });
});

describe('Grade', () => {
  it('formats and flags low scores', () => {
    expect(new Grade(64.25, null, null).format()).toBe('64.3%');
    expect(new Grade(64, 'B', null).format('both')).toBe('B · 64.0%');
    expect(new Grade(null, null, null).format()).toBe('—');
    expect(new Grade(30, null, null).isLow(40)).toBe(true);
    expect(new Grade(30, null, null).isLow(0)).toBe(false);
    expect(new Grade(104.5, null, null).barPercent).toBe(100);
  });
  it('hides grades when the course hides them', () => {
    const catalog = new Catalog({
      courses: [course('1', { currentScore: 70, hideFinalGrades: true })],
      prefs,
      now: NOW,
    });
    expect(catalog.course('1')!.grade.hasValue).toBe(false);
  });
});
