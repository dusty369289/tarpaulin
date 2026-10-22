import type { FixtureBundle } from '../canvas/transport';
import { plannerItem } from '../test/fixtures';

// Invented data only: two courses and a few pieces of work, with the clock frozen.
export const NOW = new Date('2026-10-22T12:00:00');
const local = (y: number, m: number, d: number, h: number, min: number) =>
  new Date(y, m - 1, d, h, min).toISOString();
const term = {
  id: 1,
  name: 'Fall 2026',
  start_at: '2026-09-01T00:00:00Z',
  end_at: '2026-12-20T00:00:00Z',
};
const course = (id: number, name: string, code: string) => ({
  id,
  name,
  course_code: code,
  workflow_state: 'available',
  term,
});
const planner = (
  id: number,
  courseId: number,
  title: string,
  due: string,
  type = 'assignment',
  submitted = false,
) => plannerItem(new Date(due), { id, courseId, title, type, submitted, contextName: '' });

export const bundle: FixtureBundle = {
  meta: { recordedAt: NOW.toISOString(), baseUrl: 'https://canvas.example.edu' },
  responses: {
    '/api/v1/users/self/profile': { id: 7, name: 'Test Student', short_name: 'Test' },
    '/api/v1/users/self/colors': {
      custom_colors: { course_101: '#2563eb', course_102: '#16a34a' },
    },
    '/api/v1/courses': [
      course(101, 'CS229 Machine Learning (Fall)', 'CS 229'),
      course(102, 'Modern European History', 'HIST 210'),
    ],
    '/api/v1/planner/items': [
      planner(9004, 101, 'Problem set 4', local(2026, 10, 23, 23, 59)),
      planner(9003, 101, 'Problem set 3', local(2026, 10, 15, 23, 59), 'assignment', true),
      planner(9100, 102, 'Essay draft', local(2026, 10, 24, 17, 0)),
      planner(9200, 102, 'Source analysis', local(2026, 11, 12, 17, 0)),
    ],
    // Only read when a To-do widget has loaded it (see TodoWidget below).
    '/api/v1/users/self/todo': [
      {
        type: 'submitting',
        course_id: 102,
        // The same work as the planner's "Essay draft", linked by another id.
        assignment: {
          id: 8100,
          name: 'Essay draft',
          due_at: local(2026, 10, 24, 17, 0),
          html_url: '/courses/102/assignments/8100',
        },
        html_url: '/courses/102/assignments/8100',
      },
      {
        type: 'submitting',
        course_id: 102,
        assignment: {
          id: 8200,
          name: 'Reading response',
          due_at: local(2026, 10, 25, 9, 0),
          html_url: '/courses/102/assignments/8200',
        },
        html_url: '/courses/102/assignments/8200',
      },
    ],
    '/api/v1/announcements': [
      {
        id: 501,
        title: 'Office hours moved',
        message: '<p>Now on Thursdays.</p>',
        posted_at: local(2026, 10, 21, 9, 0),
        context_code: 'course_101',
        html_url: '/courses/101/discussion_topics/501',
      },
    ],
  },
} as unknown as FixtureBundle;
