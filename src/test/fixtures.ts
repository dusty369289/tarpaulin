import { accountScope } from '../canvas/account';
import type { FixtureBundle } from '../canvas/transport';
import type { LoadSource } from '../lib/load';
import { EMPTY_PLAN, type Plan } from '../planner/store';
import { fixtureBundle } from './render';

// Builders for made-up data, shared by tests.

/** The recorded account's scope (its profile id is 1001). */
export const FIXTURE_ACCOUNT = accountScope(fixtureBundle.meta.baseUrl, '1001');

/** The recorded fixtures with some responses replaced. */
export const bundleWith = (
  responses: Record<string, unknown>,
  base: FixtureBundle = fixtureBundle,
): FixtureBundle => ({ ...base, responses: { ...base.responses, ...responses } });

/** A plan changed just now. */
export const plan = (over: Partial<Plan> = {}): Plan => ({
  ...EMPTY_PLAN,
  updatedAt: Date.now(),
  ...over,
});

let loadId = 0;
/** One unfinished 10-point assignment for the load, with its own key. */
export const loadSource = (over: Partial<LoadSource> = {}): LoadSource => ({
  key: `assignment:${++loadId}`,
  type: 'assignment',
  courseId: 'c1',
  date: null,
  points: 10,
  isWork: true,
  isDone: false,
  ...over,
});

let plannerId = 0;
/**
 * A raw /planner/items entry as Canvas sends it: unsubmitted 10-point work due at `due` in
 * course 1031 ("Course B1"), with a fresh id from 5001. Events and announcements come without
 * a submission or due date.
 */
export function plannerItem(
  due: Date,
  opts: {
    id?: number;
    type?: string;
    points?: number | null;
    submitted?: boolean;
    title?: string;
    courseId?: number;
    contextName?: string;
  } = {},
) {
  const id = opts.id ?? 5000 + ++plannerId;
  const when = due.toISOString();
  const type = opts.type ?? 'assignment';
  const courseId = opts.courseId ?? 1031;
  const gradeable = type !== 'calendar_event' && type !== 'announcement';
  return {
    context_type: 'Course',
    course_id: courseId,
    plannable_id: id,
    planner_override: null,
    plannable_type: type,
    new_activity: false,
    submissions: gradeable
      ? {
          submitted: opts.submitted ?? false,
          excused: false,
          graded: false,
          late: false,
          missing: false,
          needs_grading: false,
          has_feedback: false,
          redo_request: false,
        }
      : false,
    plannable_date: when,
    plannable: {
      id,
      title: opts.title ?? `Item ${id}`,
      points_possible: opts.points === undefined ? 10 : opts.points,
      due_at: gradeable ? when : null,
      start_at: gradeable ? null : when,
    },
    html_url: `/courses/${courseId}/assignments/${id}`,
    context_name: opts.contextName ?? 'Course B1',
  };
}
