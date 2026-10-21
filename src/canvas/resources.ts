import type { z } from 'zod';
import { htmlToText } from './client';
import { listResource, objectResource, type Urls } from './resource';
import {
  RawAnnouncement,
  RawAssignment,
  RawCalendarEvent,
  RawColors,
  RawCourse,
  RawEnrollment,
  RawPlannerItem,
  RawProfile,
  RawTodo,
  type AnnouncementData,
  type AssignmentData,
  type CalendarEventData,
  type CourseData,
  type EnrollmentData,
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
  map: (raw): UserProfile => ({
    id: raw.id,
    name: raw.name ?? '',
    shortName: raw.short_name ?? raw.name ?? '',
    avatarUrl: raw.avatar_url ?? null,
    timeZone: raw.time_zone ?? null,
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
    path: `/api/v1/courses/${encodeURIComponent(courseId)}/assignments`,
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
      message: htmlToText(a.message),
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
      location: e.location_name || null,
      courseId: courseIdFromContext(e.context_code),
      contextName: e.context_name ?? '',
      htmlUrl: urls.absolute(e.html_url),
    }),
  });
};

export const Enrollments = listResource({
  key: ['enrollments'],
  path: '/api/v1/users/self/enrollments',
  query: { state: ['active'], type: ['StudentEnrollment'], per_page: 100 },
  schema: RawEnrollment,
  label: 'enrollment',
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
