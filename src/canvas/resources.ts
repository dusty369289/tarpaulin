import type { z } from 'zod';
import { listResource, objectResource, type Urls } from './resource';
import {
  RawAnnouncement,
  RawAssignment,
  RawCalendarEvent,
  RawColors,
  RawCourse,
  RawDiscussionTopic,
  RawEnrollment,
  RawFile,
  RawPlannerItem,
  RawQuiz,
  RawProfile,
  RawTodo,
  type AnnouncementData,
  type AssignmentData,
  type CalendarEventData,
  type CourseData,
  type EnrollmentData,
  type ItemDetail,
  type PlannerItemData,
  type PlannerItemType,
  type TodoData,
  type UserProfile,
} from './types';

// Every Canvas endpoint Tarpaulin reads, declared once. All are GETs under /api/v1/.

/** Canvas ignores context codes past the tenth, so batch requests at 10. */
export const MAX_CONTEXT_CODES = 10;

const courseIdFromContext = (code: string | null | undefined) =>
  code?.startsWith('course_') ? code.slice('course_'.length) : null;

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** One path segment. Ids are digits in practice; anything else must not change the path. */
const seg = (id: string) => encodeURIComponent(id);

const HOUR = 3_600_000;
/** Freshness hints (see `Resource.staleTime`). Lists of work and news use the user's interval. */
export const STALE = { rarely: 12 * HOUR, hourly: HOUR } as const;

/** A time zone name `Intl` understands, in its canonical spelling, or null. */
export function validTimeZone(zone: string | null | undefined): string | null {
  if (!zone) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

const PLANNER_TYPES: PlannerItemType[] = [
  'assignment',
  'quiz',
  'discussion_topic',
  'announcement',
  'wiki_page',
  'planner_note',
  'calendar_event',
  'assessment_request',
];

export const Profile = objectResource({
  key: ['profile'],
  path: '/api/v1/users/self/profile',
  schema: RawProfile,
  staleTime: STALE.rarely,
  map: (raw): UserProfile => ({
    id: raw.id,
    name: raw.name ?? '',
    shortName: raw.short_name ?? raw.name ?? '',
    avatarUrl: raw.avatar_url ?? null,
    timeZone: validTimeZone(raw.time_zone),
  }),
});

export const Courses = listResource({
  key: ['courses'],
  path: '/api/v1/courses',
  query: {
    enrollment_state: 'active',
    include: ['term', 'total_scores', 'course_image'],
    per_page: 100,
  },
  schema: RawCourse,
  label: 'course',
  // Grades shown come from Enrollments first, which keeps the user's interval.
  staleTime: STALE.hourly,
  map: (c, urls): CourseData | null => {
    if (c.workflow_state === 'deleted') return null;
    const student = c.enrollments?.find((e) => e.type === 'student') ?? c.enrollments?.[0];
    return {
      id: c.id,
      name: c.name || c.course_code || `Course ${c.id}`,
      courseCode: c.course_code ?? '',
      term: c.term
        ? {
            id: c.term.id ?? null,
            name: c.term.name ?? 'Term',
            startAt: c.term.start_at ?? null,
            endAt: c.term.end_at ?? null,
          }
        : null,
      startAt: c.start_at ?? null,
      endAt: c.end_at ?? null,
      imageUrl: c.image_download_url ?? null,
      htmlUrl: `${urls.baseUrl}/courses/${c.id}`,
      currentScore: student?.computed_current_score ?? null,
      currentGrade: student?.computed_current_grade ?? null,
      finalScore: student?.computed_final_score ?? null,
      hideFinalGrades: c.hide_final_grades ?? false,
    };
  },
});

/** Course colours the user picked in Canvas, keyed by course id. */
export const CourseColors = objectResource({
  key: ['colors'],
  path: '/api/v1/users/self/colors',
  schema: RawColors,
  staleTime: STALE.rarely,
  map: (raw) => {
    const out: Record<string, string> = {};
    for (const [code, color] of Object.entries(raw.custom_colors ?? {})) {
      const id = courseIdFromContext(code);
      // Canvas stores whatever was saved; only pass through real hex colours.
      if (id && HEX.test(color)) out[id] = color;
    }
    return out;
  },
});

/** Planner items with a date in [startDate, endDate). Dates are YYYY-MM-DD. */
export const Planner = (startDate: string, endDate: string) =>
  listResource({
    key: ['planner', startDate, endDate],
    path: '/api/v1/planner/items',
    query: { start_date: startDate, end_date: endDate, per_page: 100 },
    schema: RawPlannerItem,
    label: 'planner item',
    map: (p, urls): PlannerItemData => {
      const type = (PLANNER_TYPES as string[]).includes(p.plannable_type)
        ? (p.plannable_type as PlannerItemType)
        : 'other';
      const subs = p.submissions || null;
      return {
        key: `${p.plannable_type}:${p.plannable_id}`,
        id: p.plannable_id,
        type,
        assignmentId: p.plannable.assignment_id ?? null,
        title: p.plannable.title || 'Untitled',
        courseId: p.course_id ?? null,
        contextName: p.context_name ?? '',
        date: p.plannable_date ?? null,
        dueAt: p.plannable.due_at ?? null,
        pointsPossible: p.plannable.points_possible ?? null,
        htmlUrl: urls.absolute(p.html_url),
        gradeable: subs !== null,
        submitted: subs?.submitted ?? false,
        missing: subs?.missing ?? false,
        late: subs?.late ?? false,
        graded: subs?.graded ?? false,
        excused: subs?.excused ?? false,
        markedComplete: p.planner_override?.marked_complete ?? false,
        newActivity: p.new_activity ?? false,
      };
    },
  });

function mapAssignment(
  a: z.output<typeof RawAssignment>,
  courseId: string | null,
  urls: Urls,
): AssignmentData {
  const s = a.submission;
  return {
    id: a.id,
    courseId: a.course_id ?? courseId,
    name: a.name || 'Assignment',
    dueAt: a.due_at ?? null,
    lockAt: a.lock_at ?? null,
    pointsPossible: a.points_possible ?? null,
    htmlUrl: urls.absolute(a.html_url),
    submissionTypes: a.submission_types ?? [],
    submission: s
      ? {
          state: s.workflow_state ?? null,
          score: s.score ?? null,
          grade: s.grade ?? null,
          submittedAt: s.submitted_at ?? null,
          late: s.late ?? false,
          missing: s.missing ?? false,
          excused: s.excused ?? false,
        }
      : null,
  };
}

export const Assignments = (courseId: string) =>
  listResource({
    key: ['assignments', courseId],
    path: `/api/v1/courses/${seg(courseId)}/assignments`,
    query: { include: ['submission'], order_by: 'due_at', per_page: 100 },
    schema: RawAssignment,
    label: 'assignment',
    map: (a, urls) => mapAssignment(a, courseId, urls),
  });

/** `endDate` matters: Canvas otherwise ends the window 28 days after `startDate`. */
export const Announcements = (courseIds: string[], startDate: string, endDate: string) => {
  const ids = [...courseIds].sort();
  return listResource({
    key: ['announcements', ids, startDate, endDate],
    enabled: ids.length > 0,
    path: '/api/v1/announcements',
    query: { start_date: startDate, end_date: endDate, per_page: 50 },
    batch: {
      param: 'context_codes',
      values: ids.map((id) => `course_${id}`),
      size: MAX_CONTEXT_CODES,
    },
    schema: RawAnnouncement,
    label: 'announcement',
    map: (a, urls): AnnouncementData => ({
      id: a.id,
      courseId: courseIdFromContext(a.context_code),
      title: a.title || 'Announcement',
      html: capHtml(a.message),
      postedAt: a.posted_at ?? a.delayed_post_at ?? null,
      author: a.author?.display_name ?? a.user_name ?? '',
      htmlUrl: urls.absolute(a.html_url),
      read: a.read_state === 'read',
    }),
    sort: (a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''),
  });
};

/** Never sends all_events=true: Canvas then ignores the date range. */
export const CalendarEvents = (contextCodes: string[], startDate: string, endDate: string) => {
  const codes = [...contextCodes].sort();
  return listResource({
    key: ['calendar', codes, startDate, endDate],
    enabled: codes.length > 0,
    path: '/api/v1/calendar_events',
    query: { type: 'event', start_date: startDate, end_date: endDate, per_page: 100 },
    batch: { param: 'context_codes', values: codes, size: MAX_CONTEXT_CODES },
    schema: RawCalendarEvent,
    label: 'calendar event',
    map: (e, urls): CalendarEventData => ({
      id: e.id,
      title: e.title || 'Event',
      startAt: e.start_at ?? null,
      endAt: e.end_at ?? null,
      allDay: e.all_day ?? false,
      allDayDate:
        e.all_day && e.all_day_date && DAY_RE.test(e.all_day_date) ? e.all_day_date : null,
      location: e.location_name || null,
      courseId: courseIdFromContext(e.context_code),
      contextName: e.context_name ?? '',
      htmlUrl: urls.absolute(e.html_url),
      description: capHtml(e.description),
    }),
  });
};

export const Enrollments = listResource({
  key: ['enrollments'],
  path: '/api/v1/users/self/enrollments',
  query: { state: ['active'], type: ['StudentEnrollment'], per_page: 100 },
  schema: RawEnrollment,
  label: 'enrollment',
  // No staleTime: course grades (and "your grade changed" notifications) come from here.
  map: (e, urls): EnrollmentData => ({
    id: e.id,
    courseId: e.course_id,
    type: e.type ?? '',
    state: e.enrollment_state ?? '',
    htmlUrl: urls.absolute(e.grades?.html_url ?? e.html_url),
    currentScore: e.grades?.current_score ?? null,
    currentGrade: e.grades?.current_grade ?? null,
    finalScore: e.grades?.final_score ?? null,
    finalGrade: e.grades?.final_grade ?? null,
  }),
});

export const Todo = listResource({
  key: ['todo'],
  path: '/api/v1/users/self/todo',
  query: { per_page: 100 },
  schema: RawTodo,
  label: 'todo',
  map: (t, urls): TodoData => {
    const a = t.assignment;
    return {
      key: `todo:${a?.id ?? t.quiz?.id ?? t.html_url}`,
      kind: t.type === 'submitting' || t.type === 'grading' ? t.type : 'other',
      courseId: t.course_id ?? a?.course_id ?? null,
      contextName: t.context_name ?? '',
      title: a?.name || t.quiz?.title || 'To do',
      dueAt: a?.due_at ?? t.quiz?.due_at ?? null,
      pointsPossible: a?.points_possible ?? null,
      htmlUrl: urls.absolute(a?.html_url ?? t.html_url),
      assignmentId: a?.id ?? null,
      quizId: a ? null : (t.quiz?.id ?? null),
    };
  },
});

export const MissingSubmissions = listResource({
  key: ['missing'],
  path: '/api/v1/users/self/missing_submissions',
  query: { filter: ['submittable'], per_page: 100 },
  schema: RawAssignment,
  label: 'missing submission',
  map: (a, urls) => mapAssignment(a, null, urls),
});

// ---------------------------------------------------------------------------------------------
// Single items, for the reader. Each is fetched when an item is first opened, then cached and
// persisted like the lists, so it reopens instantly (and offline).

/** Bodies over this are cut, so one huge page can't fill local storage. */
export const MAX_HTML = 60_000;
export function capHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html.length > MAX_HTML ? html.slice(0, MAX_HTML) : html;
}

const blankDetail = {
  dueAt: null,
  lockAt: null,
  unlockAt: null,
  pointsPossible: null,
  postedAt: null,
  author: null,
  submissionTypes: [],
  allowedAttempts: null,
  submission: null,
  timeLimitMinutes: null,
  questionCount: null,
} satisfies Partial<ItemDetail>;

export const AssignmentDetail = (courseId: string, id: string) =>
  objectResource({
    key: ['assignment', courseId, id],
    path: `/api/v1/courses/${seg(courseId)}/assignments/${seg(id)}`,
    query: { include: ['submission'] },
    schema: RawAssignment,
    map: (a, urls): ItemDetail => {
      const s = a.submission;
      return {
        ...blankDetail,
        kind: 'assignment',
        title: a.name || 'Assignment',
        html: capHtml(a.description),
        htmlUrl: urls.absolute(a.html_url),
        dueAt: a.due_at ?? null,
        lockAt: a.lock_at ?? null,
        unlockAt: a.unlock_at ?? null,
        pointsPossible: a.points_possible ?? null,
        submissionTypes: a.submission_types ?? [],
        allowedAttempts: a.allowed_attempts && a.allowed_attempts > 0 ? a.allowed_attempts : null,
        submission: s
          ? {
              state: s.workflow_state ?? null,
              score: s.score ?? null,
              grade: s.grade ?? null,
              submittedAt: s.submitted_at ?? null,
              late: s.late ?? false,
              missing: s.missing ?? false,
              excused: s.excused ?? false,
            }
          : null,
      };
    },
  });

export const QuizDetail = (courseId: string, id: string) =>
  objectResource({
    key: ['quiz', courseId, id],
    path: `/api/v1/courses/${seg(courseId)}/quizzes/${seg(id)}`,
    schema: RawQuiz,
    map: (q, urls): ItemDetail => ({
      ...blankDetail,
      kind: 'quiz',
      title: q.title || 'Quiz',
      html: capHtml(q.description),
      htmlUrl: urls.absolute(q.html_url),
      dueAt: q.due_at ?? null,
      lockAt: q.lock_at ?? null,
      unlockAt: q.unlock_at ?? null,
      pointsPossible: q.points_possible ?? null,
      allowedAttempts: q.allowed_attempts && q.allowed_attempts > 0 ? q.allowed_attempts : null,
      timeLimitMinutes: q.time_limit ?? null,
      questionCount: q.question_count ?? null,
    }),
  });

export const DiscussionDetail = (courseId: string, id: string) =>
  objectResource({
    key: ['discussion', courseId, id],
    path: `/api/v1/courses/${seg(courseId)}/discussion_topics/${seg(id)}`,
    schema: RawDiscussionTopic,
    map: (d, urls): ItemDetail => ({
      ...blankDetail,
      kind: 'discussion',
      title: d.title || 'Discussion',
      html: capHtml(d.message),
      htmlUrl: urls.absolute(d.html_url),
      postedAt: d.posted_at ?? null,
      author: d.author?.display_name ?? d.user_name ?? null,
    }),
  });

/**
 * A Canvas file's download URL. Images in Canvas content point at pages that need a browser
 * login; the API hands out a signed URL that works with just the token. Signed URLs expire, so
 * this is cached briefly (see useFileUrl).
 */
export const FileUrl = (fileId: string) =>
  objectResource({
    key: ['file-url', fileId],
    path: `/api/v1/files/${seg(fileId)}`,
    schema: RawFile,
    map: (f) => ({
      url: f.url ?? null,
      name: f.display_name ?? null,
      type: f['content-type'] ?? null,
    }),
  });
