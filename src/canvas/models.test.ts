import { describe, expect, it } from 'vitest';
import { Catalog, Deadlines, Grade } from './models';
import type { CalendarEventData, CourseData, PlannerItemData } from './types';

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

describe('CalendarEvent', () => {
  const catalog = new Catalog({ courses: [], prefs, now: NOW });
  const event = (over: Partial<CalendarEventData>): CalendarEventData => ({
    id: 'e',
    title: 'Event',
    startAt: null,
    endAt: null,
    allDay: false,
    location: null,
    courseId: null,
    contextName: '',
    htmlUrl: null,
    ...over,
  });
  const local = (d: number, h = 0) => new Date(2026, 9, d, h);
  const one = (data: CalendarEventData) => catalog.events([data]).first!;

  it('places all-day events on their Canvas date, whatever the device time zone', () => {
    // Midnight in a Canvas zone far ahead of this computer can be the day before here.
    const e = one(
      event({
        allDay: true,
        allDayDate: '2026-10-23',
        startAt: '2026-10-22T10:00:00Z',
        endAt: '2026-10-22T10:00:00Z',
      }),
    );
    expect(e.start).toEqual(local(23));
    expect(e.end).toEqual(local(24));
    expect(e.isMultiDay).toBe(false);
    expect([22, 23, 24].map((d) => e.occursOn(local(d, 12)))).toEqual([false, true, false]);
  });

  it('spreads multi-day events across every day they cover', () => {
    const days = (e: ReturnType<typeof one>) =>
      [21, 22, 23, 24, 25, 26].filter((d) => e.occursOn(local(d, 12)));
    const allDay = one(
      event({
        allDay: true,
        allDayDate: '2026-10-22',
        startAt: '2026-10-21T23:00:00Z',
        endAt: '2026-10-24T23:00:00Z',
      }),
    );
    expect(days(allDay)).toEqual([22, 23, 24]);
    expect(allDay.lastDay).toEqual(local(24));
    // A timed event ending exactly at midnight doesn't spill into that day.
    const timed = one(
      event({ startAt: local(23, 20).toISOString(), endAt: local(25, 0).toISOString() }),
    );
    expect(days(timed)).toEqual([23, 24]);
    expect(timed.isMultiDay).toBe(true);
    const list = catalog.events([allDay.data, timed.data]);
    expect(list.on(local(22)).map((e) => e.data)).toEqual([allDay.data]);
    expect(list.on(local(24)).length).toBe(2);
  });

  it('copes with events cached before allDayDate existed, and with no end', () => {
    const legacy = one(event({ allDay: true, startAt: local(23, 0).toISOString(), endAt: null }));
    expect(legacy.start).toEqual(local(23));
    expect(legacy.end).toEqual(local(24));
    const point = one(event({ startAt: local(23, 9).toISOString() }));
    expect(point.end).toBeNull();
    expect(point.lastDay).toEqual(local(23));
    expect(one(event({})).occursOn(local(23))).toBe(false);
  });
});

describe('Announcement', () => {
  it('derives the preview text from the cached HTML', () => {
    const catalog = new Catalog({ courses: [], prefs, now: NOW });
    const a = catalog.announcements([
      {
        id: '1',
        courseId: null,
        title: 'Hi',
        html: '<p>Hello &amp; welcome</p><script>x()</script><p>Second</p>',
        postedAt: null,
        author: '',
        htmlUrl: null,
        read: false,
      },
    ]).first!;
    expect(a.message).toBe('Hello & welcome\nSecond');
    expect(catalog.announcements([{ ...a.data, html: undefined }]).first!.message).toBe('');
  });
});
