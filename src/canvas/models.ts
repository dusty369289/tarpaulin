import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';
import { COURSE_PALETTE } from '../lib/color';
import { toDate } from '../lib/dates';
import { htmlToText } from './client';
import { currentTermCourses, currentTermName } from './terms';
import type {
  AnnouncementData,
  CalendarEventData,
  CourseData,
  EnrollmentData,
  PlannerItemData,
  TermData,
  TodoData,
} from './types';

// Model objects over the plain data that the query cache stores. The cache (and localStorage)
// only ever holds JSON; these classes wrap it at read time so widgets can say
// `deadlines.inCourses(ids).undone().sortByDue()` and `deadline.course?.color`.

const DAY_MS = 86_400_000;

/** Plain-text previews, derived once per cached announcement (the cache only keeps the HTML). */
const previews = new WeakMap<AnnouncementData, string>();

// ---------------------------------------------------------------------------------------------
// Collections

export class Collection<T> implements Iterable<T> {
  constructor(readonly items: readonly T[]) {}

  /** Builds another collection of the same subclass, so chains keep their helpers. */
  protected make(items: T[]): this {
    const Ctor = this.constructor as new (items: T[]) => this;
    return new Ctor(items);
  }

  get length() {
    return this.items.length;
  }
  get isEmpty() {
    return this.items.length === 0;
  }
  get first(): T | undefined {
    return this.items[0];
  }
  [Symbol.iterator]() {
    return this.items[Symbol.iterator]();
  }
  toArray(): T[] {
    return [...this.items];
  }
  filter(fn: (item: T) => boolean): this {
    return this.make(this.items.filter(fn));
  }
  map<U>(fn: (item: T, index: number) => U): U[] {
    return this.items.map(fn);
  }
  find(fn: (item: T) => boolean): T | undefined {
    return this.items.find(fn);
  }
  some(fn: (item: T) => boolean): boolean {
    return this.items.some(fn);
  }
  every(fn: (item: T) => boolean): boolean {
    return this.items.every(fn);
  }
  take(n: number): this {
    return this.make(this.items.slice(0, n));
  }
  /** Stable sort by one or more keys; nulls sort last. */
  sortBy(...keys: Array<(item: T) => number | string | null | undefined>): this {
    const cmp = (a: T, b: T) => {
      for (const key of keys) {
        const x = key(a);
        const y = key(b);
        if (x === y) continue;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : x < y ? -1 : 1;
      }
      return 0;
    };
    return this.make([...this.items].sort(cmp));
  }
  groupBy<K>(fn: (item: T) => K): Map<K, T[]> {
    const groups = new Map<K, T[]>();
    for (const item of this.items) {
      const k = fn(item);
      groups.set(k, [...(groups.get(k) ?? []), item]);
    }
    return groups;
  }
}

interface BelongsToCourse {
  course: Course | null;
  courseId: string | null;
}

export class CourseScoped<T extends BelongsToCourse> extends Collection<T> {
  /** Keeps items in the given courses (plus items not tied to a course). `null` keeps everything. */
  inCourses(ids: Iterable<string> | null): this {
    if (!ids) return this;
    const allowed = new Set(ids);
    return this.filter((i) => !i.courseId || allowed.has(i.courseId));
  }
}

// ---------------------------------------------------------------------------------------------
// Value objects

export class Term {
  readonly name: string;
  readonly startAt: Date | null;
  readonly endAt: Date | null;

  constructor(data: TermData) {
    this.name = data.name;
    this.startAt = toDate(data.startAt);
    this.endAt = toDate(data.endAt);
  }

  hasStarted(now: Date) {
    return !this.startAt || this.startAt <= now;
  }
  hasEnded(now: Date) {
    return Boolean(this.endAt && this.endAt < now);
  }
}

export type GradeDisplay = 'score' | 'grade' | 'both';

export class Grade {
  constructor(
    readonly score: number | null,
    readonly letter: string | null,
    readonly url: string | null,
  ) {}

  get hasValue() {
    return this.score !== null || Boolean(this.letter);
  }
  /** 0–100 for progress bars (extra credit is capped). */
  get barPercent() {
    return Math.max(0, Math.min(100, this.score ?? 0));
  }
  isLow(threshold: number) {
    return this.score !== null && threshold > 0 && this.score < threshold;
  }
  format(display: GradeDisplay = 'score'): string {
    const pct = this.score !== null ? `${this.score.toFixed(1)}%` : null;
    if (display === 'grade') return this.letter ?? pct ?? '—';
    if (display === 'both' && this.letter) return `${this.letter} · ${pct ?? '—'}`;
    return pct ?? '—';
  }
}

// ---------------------------------------------------------------------------------------------
// Entities

export class Course {
  constructor(
    readonly data: CourseData,
    private catalog: Catalog,
  ) {}

  get id() {
    return this.data.id;
  }
  /** The name as Canvas has it. */
  get canvasName() {
    return this.data.name;
  }
  /** The user's nickname if they set one, else the Canvas name. */
  get name() {
    return this.catalog.prefs.courseNicknames[this.id] || this.data.name;
  }
  get code() {
    return this.data.courseCode;
  }
  get url() {
    return this.data.htmlUrl;
  }
  get term(): Term | null {
    return this.data.term ? new Term(this.data.term) : null;
  }
  get color(): string {
    return this.catalog.colorOf(this.id);
  }
  get isHidden() {
    return this.catalog.prefs.hiddenCourseIds.includes(this.id);
  }
  get isInScope() {
    return this.catalog.scopeIds.has(this.id);
  }
  get grade(): Grade {
    const e = this.catalog.enrollmentFor(this.id);
    if (this.data.hideFinalGrades) return new Grade(null, null, e?.htmlUrl ?? null);
    return new Grade(
      e?.currentScore ?? this.data.currentScore,
      e?.currentGrade ?? this.data.currentGrade,
      e?.htmlUrl ?? `${this.data.htmlUrl}/grades`,
    );
  }
}

export class Courses extends Collection<Course> {
  ids(): string[] {
    return this.map((c) => c.id);
  }
  byName(): this {
    return this.sortBy((c) => c.name.toLowerCase());
  }
  withGrades(): this {
    return this.filter((c) => c.grade.hasValue);
  }
}

export type DeadlineStatus =
  | 'excused'
  | 'graded'
  | 'submitted'
  | 'submitted-late'
  | 'done'
  | 'missing'
  | 'overdue'
  | 'due-today'
  | 'upcoming'
  | 'info';

/** Anything on the Canvas planner: assignments, quizzes, discussions, announcements, events. */
export class Deadline implements BelongsToCourse {
  readonly course: Course | null;
  readonly date: Date | null;

  constructor(
    readonly data: PlannerItemData,
    catalog: Catalog,
  ) {
    this.course = catalog.course(data.courseId);
    this.date = toDate(data.dueAt ?? data.date);
  }

  get key() {
    return this.data.key;
  }
  get type() {
    return this.data.type;
  }
  get title() {
    return this.data.title;
  }
  get url() {
    return this.data.htmlUrl;
  }
  get points() {
    return this.data.pointsPossible;
  }
  get courseId() {
    return this.data.courseId;
  }
  get courseName() {
    return this.course?.name ?? this.data.contextName;
  }
  get color() {
    return this.course?.color ?? COURSE_PALETTE[0];
  }
  get isAnnouncement() {
    return this.data.type === 'announcement';
  }
  get isEvent() {
    return this.data.type === 'calendar_event';
  }
  /** Something you hand in (has a submission). */
  get isWork() {
    return this.data.gradeable;
  }
  get isDone() {
    const d = this.data;
    return d.submitted || d.markedComplete || d.excused || d.graded;
  }
  isOverdue(now: Date) {
    return Boolean(this.isWork && this.date && this.date < now && !this.isDone);
  }
  status(now: Date): DeadlineStatus {
    const d = this.data;
    if (!this.isWork) return 'info';
    if (d.excused) return 'excused';
    if (d.graded) return 'graded';
    if (d.submitted) return d.late ? 'submitted-late' : 'submitted';
    if (d.markedComplete) return 'done';
    if (d.missing) return 'missing';
    if (this.isOverdue(now)) return 'overdue';
    if (this.date && differenceInCalendarDays(this.date, now) === 0) return 'due-today';
    return 'upcoming';
  }
}

export class Deadlines extends CourseScoped<Deadline> {
  work(): this {
    return this.filter((d) => d.isWork);
  }
  withoutAnnouncements(): this {
    return this.filter((d) => !d.isAnnouncement);
  }
  undone(): this {
    return this.filter((d) => !d.isDone);
  }
  dated(): this {
    return this.filter((d) => d.date !== null);
  }
  /** Items dated in [from, to). */
  between(from: Date, to: Date): this {
    return this.filter((d) => d.date !== null && d.date >= from && d.date < to);
  }
  sortByDue(): this {
    return this.sortBy((d) => d.date?.getTime());
  }
  /** The soonest piece of unfinished work still in the future. */
  next(now: Date): Deadline | null {
    return (
      this.work()
        .undone()
        .filter((d) => d.date !== null && d.date > now)
        .sortByDue().first ?? null
    );
  }
}

export class Announcement implements BelongsToCourse {
  readonly course: Course | null;
  readonly postedAt: Date | null;

  constructor(
    readonly data: AnnouncementData,
    catalog: Catalog,
  ) {
    this.course = catalog.course(data.courseId);
    this.postedAt = toDate(data.postedAt);
  }
  get id() {
    return this.data.id;
  }
  get title() {
    return this.data.title;
  }
  /** Plain text of the body, for previews. */
  get message(): string {
    let text = previews.get(this.data);
    if (text === undefined) previews.set(this.data, (text = htmlToText(this.data.html)));
    return text;
  }
  get author() {
    return this.data.author;
  }
  get url() {
    return this.data.htmlUrl;
  }
  get isRead() {
    return this.data.read;
  }
  get courseId() {
    return this.data.courseId;
  }
  get courseName() {
    return this.course?.name ?? '';
  }
  get color() {
    return this.course?.color ?? COURSE_PALETTE[0];
  }
}

export class Announcements extends CourseScoped<Announcement> {
  unread(): this {
    return this.filter((a) => !a.isRead);
  }
  newestFirst(): this {
    return this.sortBy((a) => -(a.postedAt?.getTime() ?? 0));
  }
}

export class CalendarEvent implements BelongsToCourse {
  readonly course: Course | null;
  /**
   * When it starts. For an all-day event this is local midnight of its Canvas date, so it lands
   * on the day Canvas shows even when this computer is in another time zone.
   */
  readonly start: Date | null;
  /** When it ends (exclusive). An all-day event ends at local midnight after its last day. */
  readonly end: Date | null;

  constructor(
    readonly data: CalendarEventData,
    catalog: Catalog,
  ) {
    this.course = catalog.course(data.courseId);
    const start = toDate(data.startAt);
    const end = toDate(data.endAt);
    if (data.allDay) {
      // Canvas stores all-day events as midnight in the account's zone, with end_at equal to
      // start_at for a single day. Older cached data has no allDayDate; fall back to start_at.
      const day = toDate(data.allDayDate) ?? (start && startOfDay(start));
      const days =
        start && end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS)) : 1;
      this.start = day;
      this.end = day && addDays(day, days);
    } else {
      this.start = start;
      this.end = end && start && end < start ? start : end;
    }
  }
  get id() {
    return this.data.id;
  }
  get title() {
    return this.data.title;
  }
  get allDay() {
    return this.data.allDay;
  }
  /** The first local calendar day the event touches. */
  get firstDay(): Date | null {
    return this.start && startOfDay(this.start);
  }
  /** The last local calendar day it touches; ending exactly at midnight doesn't count that day. */
  get lastDay(): Date | null {
    if (!this.start) return null;
    if (!this.end || this.end <= this.start) return startOfDay(this.start);
    return startOfDay(new Date(this.end.getTime() - 1));
  }
  get isMultiDay(): boolean {
    const first = this.firstDay;
    const last = this.lastDay;
    return Boolean(first && last && last > first);
  }
  /** True when any part of the event falls on `day` (local). */
  occursOn(day: Date): boolean {
    const first = this.firstDay;
    const last = this.lastDay;
    const d = startOfDay(day);
    return Boolean(first && last && d >= first && d <= last);
  }
  get location() {
    return this.data.location;
  }
  get url() {
    return this.data.htmlUrl;
  }
  get courseId() {
    return this.data.courseId;
  }
  get color() {
    return this.course?.color ?? COURSE_PALETTE[0];
  }
}

export class CalendarEvents extends CourseScoped<CalendarEvent> {
  /** Events covering any part of `day`, multi-day ones on each of their days. */
  on(day: Date): this {
    return this.filter((e) => e.occursOn(day));
  }
}

export class TodoItem implements BelongsToCourse {
  readonly course: Course | null;
  readonly dueAt: Date | null;

  constructor(
    readonly data: TodoData,
    catalog: Catalog,
  ) {
    this.course = catalog.course(data.courseId);
    this.dueAt = toDate(data.dueAt);
  }
  get key() {
    return this.data.key;
  }
  get title() {
    return this.data.title;
  }
  get url() {
    return this.data.htmlUrl;
  }
  get courseId() {
    return this.data.courseId;
  }
  get courseName() {
    return this.course?.name ?? this.data.contextName;
  }
  get color() {
    return this.course?.color ?? COURSE_PALETTE[0];
  }
}

export class TodoItems extends CourseScoped<TodoItem> {}

// ---------------------------------------------------------------------------------------------
// Catalog: the course list plus the user's preferences, and the factory for everything else.

export interface CatalogPrefs {
  courseScope: 'current' | 'all';
  hiddenCourseIds: string[];
  courseColors: Record<string, string>;
  courseNicknames: Record<string, string>;
}

export interface CatalogInput {
  courses: CourseData[];
  enrollments?: EnrollmentData[];
  canvasColors?: Record<string, string>;
  prefs: CatalogPrefs;
  now?: Date;
}

export class Catalog {
  readonly prefs: CatalogPrefs;
  readonly now: Date;
  /** Every active course Canvas returned. */
  readonly all: Courses;
  /** Courses the scope (current term / all) allows, including ones the user hid. */
  readonly scoped: Courses;
  /** Courses the scope allows and the user hasn't hidden. */
  readonly inScope: Courses;
  readonly scopeIds: Set<string>;
  readonly currentTerm: string | null;
  private byId: Map<string, Course>;
  private order: Map<string, number>;
  private enrollments: Map<string, EnrollmentData>;
  private canvasColors: Record<string, string>;

  constructor(input: CatalogInput) {
    this.prefs = input.prefs;
    this.now = input.now ?? new Date();
    this.canvasColors = input.canvasColors ?? {};
    this.enrollments = new Map((input.enrollments ?? []).map((e) => [e.courseId, e]));
    const courses = input.courses.map((c) => new Course(c, this));
    this.all = new Courses(courses);
    this.byId = new Map(courses.map((c) => [c.id, c]));
    this.order = new Map(courses.map((c, i) => [c.id, i]));
    this.currentTerm = currentTermName(input.courses, this.now);
    const scoped =
      this.prefs.courseScope === 'current'
        ? new Set(currentTermCourses(input.courses, this.now).map((c) => c.id))
        : null;
    const hidden = new Set(this.prefs.hiddenCourseIds);
    this.scoped = this.all.filter((c) => !scoped || scoped.has(c.id));
    this.inScope = this.scoped.filter((c) => !hidden.has(c.id));
    this.scopeIds = new Set(this.inScope.ids());
  }

  course(id: string | null | undefined): Course | null {
    return (id && this.byId.get(id)) || null;
  }

  enrollmentFor(id: string): EnrollmentData | undefined {
    return this.enrollments.get(id);
  }

  colorOf(id: string | null | undefined): string {
    if (!id) return COURSE_PALETTE[0];
    return (
      this.prefs.courseColors[id] ||
      this.canvasColors[id] ||
      COURSE_PALETTE[(this.order.get(id) ?? 0) % COURSE_PALETTE.length]
    );
  }

  /** A widget's course filter on top of the global scope; empty means "everything in scope". */
  resolveCourseIds(selected: string[]): string[] {
    const ids = this.inScope.ids();
    return selected.length ? ids.filter((id) => selected.includes(id)) : ids;
  }

  deadlines(items: PlannerItemData[]): Deadlines {
    return new Deadlines(items.map((d) => new Deadline(d, this)));
  }
  announcements(items: AnnouncementData[]): Announcements {
    return new Announcements(items.map((a) => new Announcement(a, this)));
  }
  events(items: CalendarEventData[]): CalendarEvents {
    return new CalendarEvents(items.map((e) => new CalendarEvent(e, this)));
  }
  todos(items: TodoData[]): TodoItems {
    return new TodoItems(items.map((t) => new TodoItem(t, this)));
  }
}
