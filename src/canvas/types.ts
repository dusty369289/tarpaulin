import { z } from 'zod';

// Raw schemas mirror what Canvas actually returns (checked against a live account with
// `pnpm canvas:smoke`). They are deliberately lenient: almost everything is nullish, IDs may be
// numbers or strings, and unknown fields pass through. Mapped domain types below are what the
// rest of the app uses.

const id = z.union([z.number(), z.string()]).transform(String);
const str = z.string().nullish();
const num = z.number().nullish();
const bool = z.boolean().nullish();

export const RawTerm = z.object({
  id: id.nullish(),
  name: str,
  start_at: str,
  end_at: str,
});

export const RawCourseEnrollment = z.object({
  type: str,
  enrollment_state: str,
  computed_current_score: num,
  computed_current_grade: str,
  computed_final_score: num,
  computed_final_grade: str,
});

export const RawCourse = z.object({
  id,
  name: str,
  course_code: str,
  workflow_state: str,
  start_at: str,
  end_at: str,
  enrollment_term_id: id.nullish(),
  term: RawTerm.nullish(),
  enrollments: z.array(RawCourseEnrollment).nullish(),
  image_download_url: str,
  hide_final_grades: bool,
  time_zone: str,
  /** Always null in practice; real colours come from /users/self/colors. */
  course_color: str,
  /** Set when the user gave the course a nickname in Canvas. */
  original_name: str,
});

export const RawSubmission = z.object({
  workflow_state: str,
  score: num,
  grade: str,
  submitted_at: str,
  late: bool,
  missing: bool,
  excused: bool,
});

export const RawAssignment = z.object({
  id,
  course_id: id.nullish(),
  name: str,
  due_at: str,
  lock_at: str,
  unlock_at: str,
  points_possible: num,
  html_url: str,
  submission_types: z.array(z.string()).nullish(),
  published: bool,
  submission: RawSubmission.nullish(),
  is_quiz_assignment: bool,
  /** HTML. Kept as Canvas sent it; sanitised only when rendered (src/reader/sanitize.ts). */
  description: str,
  allowed_attempts: num,
});

export const RawQuiz = z.object({
  id,
  title: str,
  description: str,
  html_url: str,
  due_at: str,
  lock_at: str,
  unlock_at: str,
  points_possible: num,
  time_limit: num,
  allowed_attempts: num,
  question_count: num,
  assignment_id: id.nullish(),
});

export const RawDiscussionTopic = z.object({
  id,
  title: str,
  message: str,
  posted_at: str,
  html_url: str,
  user_name: str,
  author: z.object({ display_name: str }).passthrough().nullish(),
  assignment_id: id.nullish(),
});

export const RawFile = z.object({
  id,
  display_name: str,
  url: str,
  'content-type': str,
});

/** `submissions` is `false` for announcements and an object for gradeable items. */
export const RawPlannerSubmissions = z.union([
  z.literal(false),
  z.object({
    submitted: bool,
    excused: bool,
    graded: bool,
    late: bool,
    missing: bool,
    needs_grading: bool,
    has_feedback: bool,
    redo_request: bool,
  }),
]);

export const RawPlannerItem = z.object({
  plannable_id: id,
  plannable_type: z.string(),
  plannable_date: str,
  course_id: id.nullish(),
  context_type: str,
  context_name: str,
  html_url: str,
  new_activity: bool,
  submissions: RawPlannerSubmissions.nullish(),
  planner_override: z.object({ marked_complete: bool, dismissed: bool }).passthrough().nullish(),
  plannable: z
    .object({
      id: id.nullish(),
      title: str,
      due_at: str,
      todo_date: str,
      points_possible: num,
      read_state: str,
      start_at: str,
      end_at: str,
      all_day: bool,
      location_name: str,
      assignment_id: id.nullish(),
    })
    .passthrough(),
});

export const RawAnnouncement = z.object({
  id,
  title: str,
  message: str,
  posted_at: str,
  delayed_post_at: str,
  context_code: str,
  html_url: str,
  read_state: str,
  user_name: str,
  author: z.object({ display_name: str }).passthrough().nullish(),
});

export const RawCalendarEvent = z.object({
  id,
  title: str,
  start_at: str,
  end_at: str,
  all_day: bool,
  location_name: str,
  context_code: str,
  context_name: str,
  html_url: str,
  type: str,
  description: str,
});

export const RawEnrollment = z.object({
  id,
  course_id: id,
  type: str,
  enrollment_state: str,
  html_url: str,
  grades: z
    .object({
      html_url: str,
      current_score: num,
      current_grade: str,
      final_score: num,
      final_grade: str,
    })
    .nullish(),
});

export const RawTodo = z.object({
  type: str,
  course_id: id.nullish(),
  context_name: str,
  html_url: str,
  assignment: RawAssignment.nullish(),
  quiz: z.object({ id, title: str, due_at: str, html_url: str }).passthrough().nullish(),
});

export const RawProfile = z.object({
  id,
  name: str,
  short_name: str,
  avatar_url: str,
  time_zone: str,
  locale: str,
});

export const RawColors = z.object({ custom_colors: z.record(z.string()).nullish() });

// ---------------------------------------------------------------------------------------------
// Domain types

export interface TermData {
  id: string | null;
  name: string;
  startAt: string | null;
  endAt: string | null;
}

export interface CourseData {
  id: string;
  name: string;
  courseCode: string;
  term: TermData | null;
  startAt: string | null;
  endAt: string | null;
  imageUrl: string | null;
  htmlUrl: string;
  currentScore: number | null;
  currentGrade: string | null;
  finalScore: number | null;
  hideFinalGrades: boolean;
}

export interface SubmissionData {
  state: string | null;
  score: number | null;
  grade: string | null;
  submittedAt: string | null;
  late: boolean;
  missing: boolean;
  excused: boolean;
}

export interface AssignmentData {
  id: string;
  courseId: string | null;
  name: string;
  dueAt: string | null;
  lockAt: string | null;
  pointsPossible: number | null;
  htmlUrl: string | null;
  submissionTypes: string[];
  submission: SubmissionData | null;
}

export type PlannerItemType =
  | 'assignment'
  | 'quiz'
  | 'discussion_topic'
  | 'announcement'
  | 'wiki_page'
  | 'planner_note'
  | 'calendar_event'
  | 'assessment_request'
  | 'other';

export interface PlannerItemData {
  /** Unique across types (`assignment:123`). */
  key: string;
  id: string;
  type: PlannerItemType;
  /** For quizzes and graded discussions: the assignment behind them. */
  assignmentId?: string | null;
  title: string;
  courseId: string | null;
  contextName: string;
  /** The date Canvas files the item under: due date for work, post date for announcements. */
  date: string | null;
  dueAt: string | null;
  pointsPossible: number | null;
  htmlUrl: string | null;
  /** True for items students hand in (assignments, quizzes, graded discussions). */
  gradeable: boolean;
  submitted: boolean;
  missing: boolean;
  late: boolean;
  graded: boolean;
  excused: boolean;
  markedComplete: boolean;
  newActivity: boolean;
}

export interface AnnouncementData {
  id: string;
  courseId: string | null;
  title: string;
  /** Plain text, for previews. */
  message: string;
  /** The body as Canvas sent it (HTML, capped). Only ever rendered through the sanitiser. */
  html?: string;
  postedAt: string | null;
  author: string;
  htmlUrl: string | null;
  read: boolean;
}

export interface CalendarEventData {
  id: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  courseId: string | null;
  contextName: string;
  htmlUrl: string | null;
  /** HTML description, capped; only ever rendered through the sanitiser. */
  description?: string;
}

export interface EnrollmentData {
  id: string;
  courseId: string;
  type: string;
  state: string;
  htmlUrl: string | null;
  currentScore: number | null;
  currentGrade: string | null;
  finalScore: number | null;
  finalGrade: string | null;
}

export interface TodoData {
  key: string;
  kind: 'submitting' | 'grading' | 'other';
  courseId: string | null;
  contextName: string;
  title: string;
  dueAt: string | null;
  pointsPossible: number | null;
  htmlUrl: string | null;
  assignmentId?: string | null;
  quizId?: string | null;
}

export interface UserProfile {
  id: string;
  name: string;
  shortName: string;
  avatarUrl: string | null;
  timeZone: string | null;
}

export interface ConnectionInfo {
  connected: boolean;
  baseUrl: string | null;
  method: 'token' | 'oauth' | 'dev-proxy' | 'fixtures' | null;
  userName: string | null;
}

/** What the reader shows for one item, fetched when it's opened and cached like everything else. */
export interface ItemDetail {
  kind: 'assignment' | 'quiz' | 'discussion' | 'announcement' | 'event';
  title: string;
  /** Raw HTML (capped); sanitised when rendered. */
  html: string;
  htmlUrl: string | null;
  dueAt: string | null;
  lockAt: string | null;
  unlockAt: string | null;
  pointsPossible: number | null;
  postedAt: string | null;
  author: string | null;
  /** Assignment facts. */
  submissionTypes: string[];
  allowedAttempts: number | null;
  submission: SubmissionData | null;
  /** Quiz facts. */
  timeLimitMinutes: number | null;
  questionCount: number | null;
}
