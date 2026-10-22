// Generates a self-consistent Canvas "world" (user, terms, courses, assignments, submissions,
// announcements, events) for the mock server. All names, people, places and schedules are
// invented. What is real is Canvas's behaviour, which the server and data reproduce:
//   - "active" enrolments include past terms, so a current-term filter matters
//   - course_color is null; colours live in /users/self/colors
//   - computed scores only appear with include[]=total_scores; letter grades are often null
//   - planner `submissions` is `false` for announcements, an object for gradeable items
//   - planner/todo html_url values are relative paths
// Everything is relative to `now` and seeded, so a scenario is deterministic for a given clock.

import { eventDescription, HOSTILE_HTML, workDescription } from './content';

export type Json = Record<string, unknown>;

export interface World {
  name: string;
  now: Date;
  user: Json;
  courses: Json[];
  colors: Record<string, string>;
  /** course id → assignments (each with a `submission`). */
  assignments: Map<string, Json[]>;
  announcements: Json[];
  calendarEvents: Json[];
  /** Planner items that don't come from the collections above (notes, wiki pages, odd types). */
  extraPlanner: Json[];
  /** Per-endpoint failure injection: path regex → status (or a function of request count). */
  failures: Array<{
    match: RegExp;
    status: number | ((n: number) => number | null);
    message: string;
  }>;
}

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const DAY = 86_400_000;
const iso = (t: number) =>
  new Date(Math.round(t / 1000) * 1000).toISOString().replace('.000Z', 'Z');

/**
 * US-style semesters: Fall (late Aug – mid Dec) and Spring (mid Jan – early May). `offset` counts
 * semesters from the current one (-1 is the previous semester).
 */
export function semester(now: Date, offset = 0) {
  const y = now.getUTCFullYear();
  const index = y * 2 + (now.getUTCMonth() >= 7 ? 1 : 0) + offset;
  const year = Math.floor(index / 2);
  return index % 2 === 1
    ? { name: `Fall ${year}`, start: Date.UTC(year, 7, 24, 13), end: Date.UTC(year, 11, 18, 23) }
    : { name: `Spring ${year}`, start: Date.UTC(year, 0, 12, 13), end: Date.UTC(year, 4, 8, 23) };
}

const MODULES = [
  'Algorithms & Data Structures',
  'Database Systems',
  'Operating Systems',
  'Software Engineering',
  'Computer Networks',
  'Machine Learning',
  'Human–Computer Interaction',
  'Discrete Mathematics',
  'Linear Algebra',
  'Probability & Statistics',
  'Cell Biology',
  'Organic Chemistry',
  'Microeconomics',
  'Creative Writing',
  'Digital Ethics',
  'Cloud Computing',
];
const COLOURS = [
  '#3B82F6',
  '#F59E0B',
  '#10B981',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#6366F1',
  '#84CC16',
];
const TASKS = [
  'Problem set',
  'Lab report',
  'Programming assignment',
  'Project milestone',
  'Design document',
  'Code review',
  'Written reflection',
  'Reading quiz',
];
const ROOMS = [
  'Hartley Hall 101',
  'Science Center B12',
  'Engineering Quad 210',
  'Larkin Auditorium',
];

/** @internal */
export interface Builder {
  world: World;
  nextId: () => number;
  r: () => number;
}

function builder(name: string, now: Date, seed: number): Builder {
  let id = 80000;
  const user = {
    id: 336001,
    name: 'Sam Rivera',
    short_name: 'Sam Rivera',
    sortable_name: 'Rivera, Sam',
    first_name: 'Sam',
    last_name: 'Rivera',
    avatar_url: null,
    locale: null,
    effective_locale: 'en-GB',
    time_zone: 'Europe/London',
    login_id: 'sxr001',
    primary_email: 'sam.rivera@example.edu',
    bio: null,
    title: null,
  };
  return {
    world: {
      name,
      now,
      user,
      courses: [],
      colors: { [`user_${user.id}`]: '#A855F7' },
      assignments: new Map(),
      announcements: [],
      calendarEvents: [],
      extraPlanner: [],
      failures: [],
    },
    nextId: () => ++id,
    r: rng(seed),
  };
}

interface CourseOpts {
  name: string | null;
  code?: string | null;
  term: { name: string; start: number | null; end?: number | null } | null;
  score?: number | null;
  startAt?: number | null;
  endAt?: number | null;
  hideFinalGrades?: boolean;
  id?: number | string;
  colour?: string;
}

function addCourse(b: Builder, o: CourseOpts): Json {
  const id = o.id ?? b.nextId();
  const enrollment = {
    type: 'student',
    role: 'StudentEnrollment',
    role_id: 116,
    user_id: b.world.user.id,
    enrollment_state: 'active',
    limit_privileges_to_course_section: false,
    computed_current_grade: null,
    computed_current_score: o.score ?? null,
    computed_current_letter_grade: null,
    computed_final_grade: null,
    computed_final_score: o.score ?? null,
  };
  const course: Json = {
    id,
    name: o.name,
    account_id: 412,
    uuid: `mock-${id}`,
    start_at: o.startAt != null ? iso(o.startAt) : null,
    end_at: o.endAt != null ? iso(o.endAt) : null,
    grading_standard_id: null,
    is_public: false,
    created_at: iso(b.world.now.getTime() - 400 * DAY),
    course_code:
      o.code === undefined
        ? `${String(o.name ?? 'COURSE')
            .slice(0, 2)
            .toUpperCase()} ${o.name ?? ''} (${20000 + Number(String(id).slice(-4))})`
        : o.code,
    default_view: 'modules',
    root_account_id: 1,
    enrollment_term_id: o.term ? 300 + (Math.abs(hash(o.term.name)) % 50) : 1,
    license: 'private',
    grade_passback_setting: null,
    public_syllabus: false,
    public_syllabus_to_auth: false,
    storage_quota_mb: 500,
    is_public_to_auth_users: false,
    homeroom_course: false,
    course_color: null,
    friendly_name: null,
    apply_assignment_group_weights: false,
    calendar: { ics: `https://canvas.mock/feeds/calendars/course_${id}.ics` },
    time_zone: 'Europe/London',
    blueprint: false,
    template: false,
    enrollments: [enrollment],
    hide_final_grades: o.hideFinalGrades ?? false,
    workflow_state: 'available',
    restrict_enrollments_to_course_dates: false,
    image_download_url: null,
    term: o.term
      ? {
          id: 300 + (Math.abs(hash(o.term.name)) % 50),
          name: o.term.name,
          start_at: o.term.start != null ? iso(o.term.start) : null,
          end_at: o.term.end != null ? iso(o.term.end) : null,
          created_at: iso(b.world.now.getTime() - 500 * DAY),
          workflow_state: 'active',
          grading_period_group_id: null,
        }
      : null,
  };
  b.world.courses.push(course);
  b.world.assignments.set(String(id), []);
  if (o.colour !== undefined) b.world.colors[`course_${id}`] = o.colour;
  return course;
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

interface AssignmentOpts {
  name: string | null;
  dueAt: number | null;
  points?: number | null;
  quiz?: boolean;
  discussion?: boolean;
  state?: 'unsubmitted' | 'submitted' | 'graded' | 'late' | 'missing' | 'excused';
  score?: number | null;
  types?: string[];
  markedComplete?: boolean;
  /** HTML body; a generated one by default. */
  description?: string | null;
}

function addAssignment(b: Builder, course: Json, o: AssignmentOpts): Json {
  const id = b.nextId();
  const cid = String(course.id);
  const now = b.world.now.getTime();
  const state = o.state ?? (o.dueAt !== null && o.dueAt < now ? 'missing' : 'unsubmitted');
  const submitted = state === 'submitted' || state === 'graded' || state === 'late';
  const a: Json = {
    id,
    name: o.name,
    description:
      o.description !== undefined
        ? o.description
        : workDescription(
            o.quiz ? 'quiz' : o.discussion ? 'discussion' : 'assignment',
            o.name ?? 'Untitled',
            cid,
            id,
          ),
    due_at: o.dueAt !== null ? iso(o.dueAt) : null,
    unlock_at: null,
    lock_at: o.dueAt !== null ? iso(o.dueAt + 7 * DAY) : null,
    points_possible: o.points === undefined ? 100 : o.points,
    grading_type: 'points',
    assignment_group_id: 9000 + Number(String(course.id).replace(/\D/g, '').slice(-3) || 0),
    grading_standard_id: null,
    created_at: iso(now - 60 * DAY),
    updated_at: iso(now - 20 * DAY),
    peer_reviews: false,
    automatic_peer_reviews: false,
    position: 1,
    grade_group_students_individually: false,
    anonymous_peer_reviews: false,
    group_category_id: null,
    post_to_sis: false,
    moderated_grading: false,
    omit_from_final_grade: false,
    intra_group_peer_reviews: false,
    anonymous_instructor_annotations: false,
    anonymous_grading: false,
    graders_anonymous_to_graders: false,
    grader_count: 0,
    grader_comments_visible_to_graders: true,
    final_grader_id: null,
    grader_names_visible_to_final_grader: true,
    allowed_attempts: -1,
    annotatable_attachment_id: null,
    hide_in_gradebook: false,
    secure_params: 'mock',
    lti_context_id: `mock-${id}`,
    course_id: course.id,
    submission_types:
      o.types ??
      (o.quiz ? ['online_quiz'] : o.discussion ? ['discussion_topic'] : ['online_upload']),
    has_submitted_submissions: submitted,
    due_date_required: false,
    max_name_length: 255,
    in_closed_grading_period: false,
    graded_submissions_exist: state === 'graded',
    is_quiz_assignment: Boolean(o.quiz),
    can_duplicate: false,
    original_course_id: null,
    original_assignment_id: null,
    workflow_state: 'published',
    important_dates: false,
    muted: true,
    html_url: `https://canvas.mock/courses/${cid}/assignments/${id}`,
    published: true,
    only_visible_to_overrides: false,
    visible_to_everyone: true,
    locked_for_user: false,
    submissions_download_url: `https://canvas.mock/courses/${cid}/assignments/${id}/submissions?zip=1`,
    post_manually: false,
    anonymize_students: false,
    require_lockdown_browser: false,
    restrict_quantitative_data: false,
    quiz_id: o.quiz ? id + 500000 : undefined,
    submission: {
      id: id + 1_000_000,
      user_id: b.world.user.id,
      assignment_id: id,
      body: null,
      url: null,
      grade: state === 'graded' ? String(o.score ?? 65) : null,
      score: state === 'graded' ? (o.score ?? 65) : null,
      submitted_at: submitted
        ? iso((o.dueAt ?? now) - DAY / 2 + (state === 'late' ? DAY : 0))
        : null,
      attempt: submitted ? 1 : null,
      workflow_state: state === 'graded' ? 'graded' : submitted ? 'submitted' : 'unsubmitted',
      grade_matches_current_submission: true,
      graded_at: state === 'graded' ? iso(now - DAY) : null,
      late: state === 'late',
      missing: state === 'missing',
      excused: state === 'excused' ? true : null,
      late_policy_status: null,
      points_deducted: null,
      seconds_late: state === 'late' ? DAY / 1000 : 0,
      extra_attempts: null,
      posted_at: state === 'graded' ? iso(now - DAY) : null,
      redo_request: false,
      entered_grade: null,
      entered_score: null,
    },
    _plannerType: o.quiz ? 'quiz' : o.discussion ? 'discussion_topic' : 'assignment',
    _markedComplete: Boolean(o.markedComplete),
  };
  b.world.assignments.get(cid)!.push(a);
  return a;
}

function addAnnouncement(
  b: Builder,
  course: Json,
  title: string | null,
  postedAt: number,
  message: string | null,
  read = false,
): Json {
  const id = b.nextId();
  const ann: Json = {
    id,
    title,
    last_reply_at: iso(postedAt),
    created_at: iso(postedAt),
    delayed_post_at: postedAt > b.world.now.getTime() ? iso(postedAt) : null,
    posted_at: iso(postedAt),
    assignment_id: null,
    root_topic_id: null,
    position: id,
    podcast_has_student_posts: false,
    discussion_type: 'threaded',
    lock_at: null,
    allow_rating: false,
    only_graders_can_rate: false,
    sort_by_rating: false,
    is_section_specific: false,
    anonymous_state: null,
    summary_enabled: false,
    sort_order: 'asc',
    sort_order_locked: false,
    expanded: false,
    expanded_locked: false,
    user_name: 'Dr Alex Morgan',
    discussion_subentry_count: 0,
    permissions: {
      attach: false,
      update: false,
      reply: true,
      delete: false,
      manage_assign_to: false,
    },
    require_initial_post: null,
    user_can_see_posts: true,
    podcast_url: null,
    read_state: read ? 'read' : 'unread',
    unread_count: 0,
    subscribed: false,
    attachments: [],
    published: true,
    can_unpublish: false,
    locked: false,
    can_lock: false,
    comments_disabled: false,
    author: {
      id: 5001,
      anonymous_id: 'abc',
      display_name: 'Dr Alex Morgan',
      avatar_image_url: null,
      html_url: 'https://canvas.mock/users/5001',
      pronouns: null,
    },
    html_url: `https://canvas.mock/courses/${course.id}/discussion_topics/${id}`,
    url: `https://canvas.mock/courses/${course.id}/discussion_topics/${id}`,
    pinned: false,
    group_category_id: null,
    can_group: true,
    topic_children: [],
    group_topic_children: [],
    context_code: `course_${course.id}`,
    locked_for_user: false,
    message,
    todo_date: null,
    is_announcement: true,
    ungraded_discussion_overrides: [],
  };
  b.world.announcements.push(ann);
  return ann;
}

function addEvent(
  b: Builder,
  contextCode: string,
  contextName: string,
  title: string | null,
  start: number,
  end: number | null,
  allDay = false,
  location = '',
): Json {
  const id = b.nextId();
  const ev: Json = {
    id,
    title,
    start_at: iso(start),
    end_at: end !== null ? iso(end) : null,
    workflow_state: 'active',
    created_at: iso(start - 30 * DAY),
    updated_at: iso(start - 30 * DAY),
    all_day: allDay,
    all_day_date: allDay ? iso(start).slice(0, 10) : null,
    location_name: location,
    location_address: null,
    context_code: contextCode,
    context_name: contextName,
    context_color: null,
    description: eventDescription(title ?? '', location || null),
    html_url: `https://canvas.mock/calendar?event_id=${id}&include_contexts=${contextCode}`,
    url: `https://canvas.mock/api/v1/calendar_events/${id}`,
    type: 'event',
    important_dates: false,
    hidden: false,
    parent_event_id: null,
    child_events_count: 0,
    child_events: [],
    series_uuid: null,
    rrule: null,
    blackout_date: false,
  };
  b.world.calendarEvents.push(ev);
  return ev;
}

// ---------------------------------------------------------------------------------------------
// Fluent builder: scenarios read as `w.academicTerm(0).course('Databases').assignment(...)`.

export interface When {
  days?: number;
  hours?: number;
  minutes?: number;
}

export class WorldBuilder {
  /** @internal */ readonly b: Builder;

  constructor(name: string, now: Date, seed: number) {
    this.b = builder(name, now, seed);
  }

  get now(): number {
    return this.b.world.now.getTime();
  }
  /** Start of today (UTC), for "at 12:00 in three days" style times. */
  get today(): number {
    return Math.floor(this.now / DAY) * DAY;
  }
  /** A time relative to now. */
  at(w: When): number {
    return this.now + (w.days ?? 0) * DAY + (w.hours ?? 0) * 3_600_000 + (w.minutes ?? 0) * 60_000;
  }
  /** `days` from today at `hour`:00. */
  on(days: number, hour = 12): number {
    return this.today + days * DAY + hour * 3_600_000;
  }
  random(): number {
    return this.b.r();
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.b.r() * items.length)];
  }

  /** A semester term; `offset` 0 is the current semester, -1 the previous one. */
  academicTerm(offset = 0): TermBuilder {
    const t = semester(this.b.world.now, offset);
    return new TermBuilder(this, { name: t.name, start: t.start, end: t.end });
  }
  term(name: string, start: number | null, end: number | null = null): TermBuilder {
    return new TermBuilder(this, { name, start, end });
  }
  /** A course with no term at all. */
  course(name: string | null, opts: Omit<CourseOpts, 'name' | 'term'> = {}): CourseBuilder {
    return new CourseBuilder(this, addCourse(this.b, { ...opts, name, term: null }));
  }
  personalEvent(
    title: string | null,
    start: number,
    end: number | null,
    opts: { allDay?: boolean; location?: string } = {},
  ): this {
    addEvent(
      this.b,
      `user_${this.b.world.user.id}`,
      String(this.b.world.user.name),
      title,
      start,
      end,
      opts.allDay,
      opts.location,
    );
    return this;
  }
  /** A raw planner item that doesn't come from an assignment/announcement/event. */
  plannerItem(raw: Json): this {
    this.b.world.extraPlanner.push({ plannable_id: this.b.nextId(), ...raw });
    return this;
  }
  fail(match: RegExp, status: World['failures'][number]['status'], message: string): this {
    this.b.world.failures.push({ match, status, message });
    return this;
  }
  build(): World {
    return this.b.world;
  }
}

export class TermBuilder {
  constructor(
    readonly world: WorldBuilder,
    readonly term: { name: string; start: number | null; end?: number | null },
  ) {}

  get name() {
    return this.term.name;
  }
  course(name: string | null, opts: Omit<CourseOpts, 'name' | 'term'> = {}): CourseBuilder {
    return new CourseBuilder(
      this.world,
      addCourse(this.world.b, { ...opts, name, term: this.term }),
    );
  }
}

export type WorkOpts = Omit<AssignmentOpts, 'name' | 'dueAt' | 'quiz' | 'discussion'>;

export class CourseBuilder {
  constructor(
    readonly world: WorldBuilder,
    readonly raw: Json,
  ) {}

  get id(): string {
    return String(this.raw.id);
  }
  get name(): string {
    return String(this.raw.name ?? '');
  }
  assignment(name: string | null, dueAt: number | null, opts: WorkOpts = {}): this {
    addAssignment(this.world.b, this.raw, { ...opts, name, dueAt });
    return this;
  }
  quiz(name: string, dueAt: number, opts: WorkOpts = {}): this {
    addAssignment(this.world.b, this.raw, { points: 10, ...opts, name, dueAt, quiz: true });
    return this;
  }
  discussion(name: string, dueAt: number, opts: WorkOpts = {}): this {
    addAssignment(this.world.b, this.raw, { ...opts, name, dueAt, discussion: true });
    return this;
  }
  announcement(
    title: string | null,
    postedAt: number,
    message: string | null = '<p>Update from your module team.</p>',
    opts: { read?: boolean } = {},
  ): this {
    addAnnouncement(this.world.b, this.raw, title, postedAt, message, opts.read);
    return this;
  }
  event(
    title: string | null,
    start: number,
    end: number | null,
    opts: { allDay?: boolean; location?: string } = {},
  ): this {
    addEvent(
      this.world.b,
      `course_${this.raw.id}`,
      this.name,
      title,
      start,
      end,
      opts.allDay,
      opts.location,
    );
    return this;
  }
}

// ---------------------------------------------------------------------------------------------
// Scenarios

/** Past semesters: completed courses with final scores, like a third-year student. */
function history(w: WorldBuilder, semesters: number, perSemester: number) {
  for (let t = semesters; t >= 1; t--) {
    const term = w.academicTerm(-t);
    for (let i = 0; i < perSemester; i++) {
      const score = w.random() < 0.7 ? Math.round(72 + w.random() * 24) : null;
      term.course(`${MODULES[(t * 5 + i) % MODULES.length]}${t > 2 ? ' I' : ' II'}`, {
        score,
        colour: w.pick(COLOURS),
      });
    }
  }
  // Undated institution-wide spaces in the "Default term".
  const shared = w.term('Default term', null);
  shared.course('Student Orientation Hub', { colour: w.pick(COLOURS) });
  shared.course('Writing Center Resources');
}

/** Current-semester courses with a realistic mix of work around `now`. */
function currentTerm(w: WorldBuilder, count: number, density: 'normal' | 'dense'): CourseBuilder[] {
  const term = w.academicTerm(0);
  const dense = density === 'dense';
  const courses = Array.from({ length: count }, (_, i) => {
    const module = `${MODULES[i % MODULES.length]}${i >= MODULES.length ? ` ${Math.floor(i / MODULES.length) + 1}` : ''}`;
    return term.course(module, { code: `CS ${2100 + i * 30}`, colour: w.pick(COLOURS) });
  });

  courses.forEach((course, i) => {
    const n = dense ? 14 : 2 + Math.floor(w.random() * 3);
    for (let k = 0; k < n; k++) {
      const due =
        w.on(dense ? -10 + Math.floor(w.random() * 55) : -21 + Math.floor(w.random() * 70), 23) -
        60_000;
      const roll = w.random();
      const state: AssignmentOpts['state'] =
        due < w.now
          ? roll < 0.55
            ? 'graded'
            : roll < 0.75
              ? 'submitted'
              : roll < 0.85
                ? 'late'
                : 'missing'
          : roll < 0.15
            ? 'submitted'
            : 'unsubmitted';
      const task = TASKS[(i + k) % TASKS.length];
      const title =
        dense && k % 3 === 0
          ? `${course.name}: ${task.toLowerCase()} ${k + 1} with an unusually long descriptive title`
          : `${task} ${k + 1}`;
      course.assignment(title, due, {
        state,
        score: state === 'graded' ? Math.round(70 + w.random() * 28) : null,
      });
    }
    // One course runs weekly Friday lab quizzes.
    if (i === 1 || dense) {
      const friday = 4 - ((new Date(w.today).getUTCDay() + 6) % 7);
      for (let wk = -4; wk <= 6; wk++) {
        const due = w.on(friday + wk * 7, 17);
        course.quiz(`Lab quiz ${wk + 6}`, due, {
          state: due < w.now ? (w.random() < 0.75 ? 'graded' : 'missing') : 'unsubmitted',
          score: 9,
        });
      }
    }
    const titles = [
      'Office hours moved this week',
      'Problem set solutions posted',
      'Lecture recording available',
      'Reminder: lab quiz closes Friday',
      'Project teams announced',
      'Midterm review session',
    ];
    for (let k = 0, n = dense ? 12 : 3 + Math.floor(w.random() * 4); k < n; k++) {
      course.announcement(
        titles[(k + i) % titles.length],
        w.at({ days: -w.random() * 40 }),
        '<p>Hi all,</p><p>Quick update for the course.&nbsp;See the course page for details.</p>',
        { read: w.random() < 0.5 },
      );
    }
  });

  // Lectures on course calendars, plus personal events.
  for (let k = 0, n = dense ? 30 : 6; k < n; k++) {
    const start = w.on(-7 + Math.floor(w.random() * 50), 9 + Math.floor(w.random() * 8));
    if (k % 3 === 0)
      courses[k % courses.length].event('Lecture', start, start + 75 * 60_000, {
        location: w.pick(ROOMS),
      });
    else
      w.personalEvent(k % 2 ? 'Advisor meeting' : 'Study group', start, start + 3_600_000, {
        location: 'Library, Floor 2',
      });
  }
  return courses;
}

function edgeCases(w: WorldBuilder) {
  history(w, 1, 2);
  const term = w.academicTerm(0);
  const xss = '<img src=x onerror="alert(1)"><script>alert("xss")</script>';

  const ethics = term.course('Éŧhiçs & Lógic — 日本語の授業 🧠', { colour: '#0EA5E9' });
  ethics
    .assignment('Essay: “Can machines think?” — 2,000 words ✍️', w.at({ hours: 2 }))
    .assignment(`Title with markup ${xss}`, w.at({ hours: 26 }))
    .assignment('Due right now', w.now)
    .assignment('Due in five minutes', w.at({ minutes: 5 }))
    .assignment('Due at 23:59 tonight', w.today + DAY - 60_000)
    .assignment('Due at midnight', w.today + DAY)
    .announcement(
      `Announcement with markup ${xss}`,
      w.at({ hours: -1 }),
      `<p>Hello &amp; welcome&nbsp;to <b>week 5</b>!</p>${xss}<p>Line two</p>`,
    )
    .announcement(null, w.at({ hours: -2 }), null)
    .assignment('Hostile description', w.at({ days: 2 }), { description: HOSTILE_HTML })
    .assignment('No description at all', w.at({ days: 4 }), { description: null })
    .announcement('Hostile announcement body', w.at({ hours: -3 }), HOSTILE_HTML)
    .event(`Seminar ${xss}`, w.on(1, 14), w.on(1, 15), { location: `Room ${'Z'.repeat(80)}` });

  term
    .course('علم البيانات — Data Science (RTL)', { colour: '#22C55E' })
    .assignment('مشروع: تحليل البيانات المفتوحة للمدينة', w.at({ days: 3 }))
    .assignment('Undated reflective journal', null)
    .announcement(
      'تحديث: تغيير موعد المختبر يوم الخميس',
      w.at({ days: -1 }),
      '<p dir="rtl">سيكون المختبر في القاعة الجديدة هذا الأسبوع.</p>',
    );

  term
    // An invalid saved colour must not reach the UI.
    .course(
      `Interdisciplinary Perspectives on ${'Very '.repeat(20)}Long Course Names (${'X'.repeat(40)})`,
      { colour: '#zzzzzz' },
    )
    .assignment(
      'Supercalifragilisticexpialidocious_unbroken_identifier_assignment_name_without_any_spaces_at_all_v2_FINAL_final',
      w.at({ days: 4 }),
    )
    .assignment(
      'A really long assignment title that keeps going '.repeat(6).trim(),
      w.at({ days: 5 }),
      { points: 12.5 },
    )
    .announcement(
      'Very long body',
      w.at({ days: -2 }),
      `<p>${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(60)}</p>`,
    )
    .announcement(
      'Scheduled for next week (delayed post)',
      w.at({ days: 7 }),
      '<p>Not yet visible.</p>',
    );

  term
    .course(null, { code: 'NONAME101' })
    .assignment(null, w.at({ days: 6 }), { points: null })
    .assignment('', w.at({ days: 6 }), { points: 0 });

  term
    .course('String-ID Course', { id: '7777777', colour: '#A855F7' })
    .assignment('Excused task', w.at({ days: -2 }), { state: 'excused' })
    .assignment('Submitted late', w.at({ days: -3 }), { state: 'late' })
    .quiz('Missing quiz', w.at({ days: -1 }), { state: 'missing' })
    .assignment('Marked done in planner', w.at({ days: 1 }), { markedComplete: true })
    .discussion('Graded discussion', w.at({ days: 2 }))
    .announcement('', w.at({ days: -3 }), '<p></p>');

  term
    .course('Hidden Final Grades', { score: 71, hideFinalGrades: true })
    .assignment('Paper submission (no online upload)', w.at({ days: -4 }), { types: ['on_paper'] });
  term.course('Extra Credit Course', { score: 104.5, colour: '#D946EF' });
  term.course('Zero Score Course', { score: 0 });
  // In the current term but the course itself has ended.
  term.course('Ended Early Course', { startAt: w.at({ days: -60 }), endAt: w.at({ days: -1 }) });
  // An open-ended rolling term (no end date) that started mid-semester: it must not be mistaken
  // for the current semester.
  w.term('Rolling enrolment', w.at({ days: -20 }), null).course('Lab Safety Training (self-paced)');
  // A term that hasn't started yet.
  w.academicTerm(1).course('Next Year Module');
  // No term, but the course's own dates cover today, so it still counts as current.
  w.course('Short Course With Own Dates', {
    startAt: w.at({ days: -10 }),
    endAt: w.at({ days: 10 }),
  })
    .assignment('Far future capstone', w.at({ days: 300 }))
    .assignment('Overdue a long time ago', w.at({ days: -200 }));

  w.personalEvent('All-day reading week', w.on(2, 0), w.on(3, 0), { allDay: true })
    .personalEvent('Multi-day field trip', w.on(4, 8), w.on(7, 18))
    .personalEvent('Late-night lab crossing midnight', w.on(0, 22), w.on(1, 2))
    .personalEvent(null, w.on(1, 10), null);
  for (let k = 0; k < 9; k++)
    w.personalEvent(`Back-to-back slot ${k + 1}`, w.on(3, 8 + k), w.on(3, 9 + k));

  // Planner-only items, including types the app doesn't know and a malformed one.
  w.plannerItem({
    plannable_type: 'planner_note',
    plannable_date: iso(w.at({ days: 1 })),
    course_id: null,
    context_type: 'User',
    context_name: null,
    html_url: null,
    new_activity: false,
    submissions: false,
    planner_override: null,
    plannable: { id: 1, title: 'My own planner note', todo_date: iso(w.at({ days: 1 })) },
  })
    .plannerItem({
      plannable_type: 'wiki_page',
      plannable_date: iso(w.at({ days: 2 })),
      course_id: ethics.raw.id,
      context_type: 'Course',
      context_name: ethics.name,
      html_url: '/courses/1/pages/week-5',
      new_activity: false,
      submissions: false,
      planner_override: null,
      plannable: { id: 2, title: 'Week 5 page (to-do date)', todo_date: iso(w.at({ days: 2 })) },
    })
    .plannerItem({
      plannable_type: 'some_future_type',
      plannable_date: iso(w.at({ days: 3 })),
      course_id: null,
      context_type: 'User',
      context_name: null,
      html_url: '/whatever/1',
      new_activity: true,
      submissions: false,
      planner_override: null,
      plannable: { id: 3, title: 'Unknown plannable type' },
    })
    .plannerItem({
      plannable_id: undefined,
      plannable_type: 'assignment',
      plannable_date: null,
      course_id: null,
      context_type: 'Course',
      context_name: null,
      html_url: null,
      new_activity: false,
      submissions: { submitted: false },
      planner_override: null,
      plannable: { title: 'Malformed item with no id or date' },
    });
}

/**
 * A busy, believable semester for demos and screenshots: six courses with a weekly timetable, a
 * steady stream of coursework at normal title lengths, current grades and plausible announcements.
 */
function showcase(w: WorldBuilder) {
  // Two finished semesters with final scores.
  const past = [
    ['Intro to Programming', 94],
    ['Calculus I', 87],
    ['Writing Seminar', 91],
    ['Object-Oriented Design', 89],
    ['Calculus II', 82],
    ['Physics: Mechanics', 85],
  ] as const;
  past.forEach(([name, score], i) =>
    w
      .academicTerm(i < 3 ? -2 : -1)
      .course(name, { score, colour: COLOURS[(i + 4) % COLOURS.length] }),
  );
  w.term('Default term', null).course('Student Orientation Hub', { colour: '#64748B' });

  const term = w.academicTerm(0);
  const monday = -((new Date(w.today).getUTCDay() + 6) % 7); // days from today to this week's Monday
  const weekday = (week: number, dow: number, hour: number) => w.on(monday + week * 7 + dow, hour);
  /** Due-state for a deadline relative to now: mostly done in the past, a few slips. */
  const stateFor = (due: number, seed: number) =>
    due >= w.now
      ? seed % 7 === 0
        ? 'submitted'
        : 'unsubmitted'
      : seed % 9 === 0
        ? 'missing'
        : seed % 4 === 0
          ? 'submitted'
          : 'graded';

  type Course = {
    name: string;
    code: string;
    colour: string;
    score: number;
    lecture: [dow: number, hour: number];
    section: [dow: number, hour: number];
    room: string;
    work: Array<[title: string, week: number, dow: number, hour: number, points: number]>;
    news: string[];
  };
  const catalogue: Course[] = [
    {
      name: 'Algorithms & Data Structures',
      code: 'CS 2110',
      colour: '#3B82F6',
      score: 88.2,
      lecture: [0, 10],
      section: [2, 14],
      room: 'Hartley Hall 101',
      work: [
        ['Problem set 4: graph search', 0, 3, 23, 50],
        ['Problem set 5: dynamic programming', 2, 3, 23, 50],
        ['Midterm project: route planner', 4, 4, 17, 100],
      ],
      news: [
        'Problem set 3 solutions posted',
        'Extra office hours before the midterm',
        'Lecture 12 slides are up',
      ],
    },
    {
      name: 'Database Systems',
      code: 'CS 3320',
      colour: '#F59E0B',
      score: 91.5,
      lecture: [1, 9],
      section: [3, 11],
      room: 'Science Center B12',
      work: [
        ['Schema design document', 1, 1, 17, 30],
        ['Query optimisation lab report', 3, 4, 17, 60],
      ],
      news: [
        'Lab quiz 5 is open until Friday 5pm',
        'Postgres workshop recording available',
        'TA office hours moved to Thursday',
      ],
    },
    {
      name: 'Machine Learning',
      code: 'CS 4780',
      colour: '#8B5CF6',
      score: 84.7,
      lecture: [1, 13],
      section: [4, 10],
      room: 'Larkin Auditorium',
      work: [
        ['Homework 3: logistic regression', 0, 4, 23, 40],
        ['Kaggle mini-challenge write-up', 3, 2, 23, 50],
      ],
      news: ['Guest talk next Tuesday on model evaluation', 'GPU cluster accounts are ready'],
    },
    {
      name: 'Human–Computer Interaction',
      code: 'INFO 3450',
      colour: '#EC4899',
      score: 93.1,
      lecture: [2, 11],
      section: [3, 15],
      room: 'Engineering Quad 210',
      work: [
        ['Usability study plan', -1, 3, 17, 20],
        ['Prototype critique (1,500 words)', 3, 4, 17, 80],
      ],
      news: ['Studio teams have been posted', 'Prototype critique prompts released'],
    },
    {
      name: 'Probability & Statistics',
      code: 'MATH 2940',
      colour: '#10B981',
      score: 79.6,
      lecture: [3, 9],
      section: [4, 13],
      room: 'Hartley Hall 204',
      work: [
        ['Worksheet 7: conditional probability', 0, 1, 23, 15],
        ['Problem set 6', 2, 1, 23, 50],
        ['Group project: final presentation', 5, 3, 14, 60],
      ],
      news: ['Group project teams confirmed', 'Feedback on worksheet 6 is now available'],
    },
    {
      name: 'Digital Ethics',
      code: 'PHIL 2620',
      colour: '#F97316',
      score: 95.0,
      lecture: [0, 14],
      section: [1, 11],
      room: 'Larkin Auditorium',
      work: [
        ['Position paper: data privacy', 1, 3, 17, 40],
        ['Case study discussion lead', 4, 2, 11, 25],
      ],
      news: ['Debate this Friday — sign-ups open', 'Reading list updated for weeks 8–10'],
    },
  ];

  catalogue.forEach((c, ci) => {
    const course = term.course(c.name, { code: c.code, colour: c.colour, score: c.score });
    // Weekly discussion posts in half the courses, due the night before section.
    for (let wk = -4; wk <= 5 && ci % 2 === 0; wk++) {
      const due = weekday(wk, Math.max(0, c.section[0] - 1), 23) - 60_000;
      course.discussion(`Week ${wk + 8} discussion post`, due, {
        points: 5,
        state: stateFor(due, ci * 13 + wk + 20),
        score: 5,
      });
    }
    for (const [title, wk, dow, hour, points] of c.work) {
      const due = weekday(wk, dow, hour) - (hour === 23 ? 60_000 : 0);
      course.assignment(title, due, {
        points,
        state: stateFor(due, ci * 7 + wk + 30),
        score: Math.round(points * (0.82 + (ci % 3) * 0.05)),
      });
    }
    // Friday lab quizzes in Database Systems.
    if (ci === 1) {
      for (let wk = -4; wk <= 5; wk++) {
        const due = weekday(wk, 4, 17);
        course.quiz(`Lab quiz ${wk + 6}`, due, { state: stateFor(due, wk + 40), score: 9 });
      }
    }
    // Timetable.
    for (let wk = -5; wk <= 6; wk++) {
      course.event(
        `${c.code} lecture`,
        weekday(wk, c.lecture[0], c.lecture[1]),
        weekday(wk, c.lecture[0], c.lecture[1]) + 75 * 60_000,
        { location: c.room },
      );
      course.event(
        `${c.code} section`,
        weekday(wk, c.section[0], c.section[1]),
        weekday(wk, c.section[0], c.section[1]) + 50 * 60_000,
        { location: c.room },
      );
    }
    c.news.forEach((title, k) => {
      course.announcement(
        title,
        w.at({ days: -(k * 5 + ci * 0.7 + 0.3) }),
        `<p>Hi everyone,</p><p>${title}. Details are on the course page.</p><p>— Prof. Okafor</p>`,
        { read: k > 0 && (k + ci) % 2 === 0 },
      );
    });
  });

  w.personalEvent('Advisor meeting', w.on(2, 15), w.on(2, 15) + 30 * 60_000, {
    location: 'Gates Hall 312',
  })
    .personalEvent('Career fair', w.on(6, 10), w.on(6, 16), { location: 'Student Union Ballroom' })
    .personalEvent('Study group: Algorithms', w.on(1, 18), w.on(1, 20), {
      location: 'Library, Floor 2',
    })
    .personalEvent('Hackathon', w.on(9, 0), w.on(11, 0), { allDay: true })
    .personalEvent('Fall break', w.on(monday + 14, 0), w.on(monday + 16, 0), { allDay: true });
}

export type ScenarioName =
  'realistic' | 'dense' | 'edge' | 'empty' | 'flaky' | 'throttled' | 'showcase';
export const SCENARIOS: ScenarioName[] = [
  'realistic',
  'dense',
  'edge',
  'empty',
  'flaky',
  'throttled',
  'showcase',
];

export function buildWorld(name: ScenarioName, now = new Date()): World {
  const w = new WorldBuilder(name, now, 1234 + name.length);
  switch (name) {
    case 'empty':
      break;
    case 'realistic':
      history(w, 3, 8);
      currentTerm(w, 8, 'normal');
      break;
    case 'flaky':
      history(w, 3, 8);
      currentTerm(w, 8, 'normal');
      w.fail(/^\/api\/v1\/announcements$/, 500, 'Internal server error')
        .fail(/^\/api\/v1\/users\/self\/todo$/, 503, 'Service unavailable')
        // Canvas throttles with 403 "Rate Limit Exceeded"; every 5th planner request is throttled.
        .fail(
          /^\/api\/v1\/planner\/items$/,
          (n) => (n % 5 === 0 ? 403 : null),
          'Rate Limit Exceeded',
        );
      break;
    case 'throttled':
      // The realistic world behind a busy rate limiter: every fourth request to an endpoint is
      // throttled, the way Canvas does (403 "Rate Limit Exceeded") or a proxy might (429). The
      // client's retries should hide all of it.
      history(w, 3, 8);
      currentTerm(w, 8, 'normal');
      w.fail(
        /^\/api\/v1\/planner\/items$/,
        (n) => (n % 4 === 1 ? 429 : null),
        'Too Many Requests',
      ).fail(/^\/api\/v1\//, (n) => (n % 4 === 1 ? 403 : null), 'Rate Limit Exceeded');
      break;
    case 'dense':
      history(w, 1, 6);
      currentTerm(w, 10, 'dense');
      break;
    case 'showcase':
      showcase(w);
      break;
    case 'edge':
      edgeCases(w);
      break;
  }
  return w.build();
}
