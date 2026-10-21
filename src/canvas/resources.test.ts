// @vitest-environment node
// Runs the real client and resources against the local mock Canvas (no network, no credentials).
import { addDays, formatISO, subDays } from 'date-fns';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMockCanvas, type MockCanvas } from '../../mock-canvas/server';
import { CanvasClient } from './client';
import { fetchAllPages, toQueryPairs, type Query } from './http';
import * as R from './resources';
import { currentTermCourses } from './terms';
import type { Transport } from './transport';

const NOW = new Date('2026-10-21T14:00:00Z');
const day = (d: Date) => formatISO(d, { representation: 'date' });
let mock: MockCanvas;

function clientFor(scenario: string) {
  const transport = {
    get: (path: string, query?: Query) =>
      fetchAllPages(mock.url, `mock-${scenario}`, path, toQueryPairs(query)),
  } as Transport;
  return new CanvasClient(transport, mock.url);
}

beforeAll(async () => {
  mock = await startMockCanvas({ now: NOW });
});
afterAll(async () => {
  expect(mock.writes).toEqual([]); // nothing the client does may write to Canvas
  await mock.close();
});

describe('against the mock Canvas', () => {
  it('follows pagination across many small pages', async () => {
    const all = await fetchAllPages(mock.url, 'mock-realistic', '/api/v1/courses', [
      ['per_page', '5'],
    ]);
    expect(Array.isArray(all) && all.length).toBe(34);
    expect(mock.requests.filter((r) => r.path === '/api/v1/courses').length).toBe(7);
  });

  it('rejects bad tokens like Canvas does', async () => {
    await expect(fetchAllPages(mock.url, 'wrong', '/api/v1/courses', [])).rejects.toThrow('401');
  });

  it('maps courses and finds the current term (past years stay "active")', async () => {
    const courses = await clientFor('realistic').fetch(R.Courses);
    expect(courses).toHaveLength(34);
    const current = currentTermCourses(courses, NOW);
    expect(current).toHaveLength(8);
    expect(new Set(current.map((c) => c.term?.name))).toEqual(new Set(['Fall 2026']));
  });

  it('batches announcements past the 10-context-code limit and passes end_date', async () => {
    const client = clientFor('realistic');
    const courses = await client.fetch(R.Courses);
    const ids = courses.map((c) => c.id);
    const before = mock.requests.length;
    const all = await client.fetch(
      R.Announcements(ids, day(subDays(NOW, 60)), day(addDays(NOW, 1))),
    );
    const calls = mock.requests.slice(before).filter((r) => r.path === '/api/v1/announcements');
    expect(calls).toHaveLength(Math.ceil(ids.length / R.MAX_CONTEXT_CODES));
    expect(calls.every((c) => c.query.includes('end_date'))).toBe(true);
    // Every announcement from the last 60 days comes back, newest first.
    expect(all.length).toBe(
      mock
        .world('realistic')
        .announcements.filter(
          (a) =>
            Date.parse(String(a.posted_at)) >= subDays(NOW, 60).getTime() &&
            Date.parse(String(a.posted_at)) <= NOW.getTime(),
        ).length,
    );
    expect([...all].sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))).toEqual(
      all,
    );
  });

  it('batches calendar events (Canvas silently ignores codes past the tenth)', async () => {
    const client = clientFor('dense');
    const courses = await client.fetch(R.Courses);
    const codes = courses.map((c) => `course_${c.id}`);
    expect(codes.length).toBeGreaterThan(10);
    const events = await client.fetch(
      R.CalendarEvents(codes, day(subDays(NOW, 30)), day(addDays(NOW, 60))),
    );
    const expected = mock
      .world('dense')
      .calendarEvents.filter(
        (e) =>
          codes.includes(String(e.context_code)) &&
          Date.parse(String(e.start_at)) >= subDays(NOW, 30).setUTCHours(0, 0, 0, 0) &&
          Date.parse(String(e.start_at)) < addDays(NOW, 60).setUTCHours(0, 0, 0, 0),
      );
    expect(events.length).toBe(expected.length);
  });

  describe('edge-case data', () => {
    const client = () => clientFor('edge');

    it('drops invalid saved colours', async () => {
      const colors = await client().fetch(R.CourseColors);
      expect(Object.values(colors).every((c) => /^#[0-9a-f]{3,6}$/i.test(c))).toBe(true);
    });

    it('falls back for nameless courses and handles string ids', async () => {
      const courses = await client().fetch(R.Courses);
      expect(courses.find((c) => c.courseCode === 'NONAME101')?.name).toBe('NONAME101');
      expect(courses.find((c) => c.id === '7777777')?.name).toBe('String-ID Course');
    });

    it('keeps odd planner items, skips malformed ones, absolutises URLs', async () => {
      const items = await client().fetch(R.Planner(day(subDays(NOW, 7)), day(addDays(NOW, 30))));
      expect(items.find((i) => i.title === 'Unknown plannable type')?.type).toBe('other');
      expect(items.find((i) => i.title === 'My own planner note')?.type).toBe('planner_note');
      expect(items.some((i) => i.title.includes('Malformed'))).toBe(false);
      expect(items.every((i) => !i.htmlUrl || i.htmlUrl.startsWith(mock.url))).toBe(true);
      expect(items.find((i) => i.title === 'Excused task')?.excused).toBe(true);
    });

    it('never passes markup through in announcement text', async () => {
      const courses = await client().fetch(R.Courses);
      const anns = await client().fetch(
        R.Announcements(
          courses.map((c) => c.id),
          day(subDays(NOW, 30)),
          day(addDays(NOW, 1)),
        ),
      );
      const markup = anns.find((a) => a.title.startsWith('Announcement with markup'))!;
      expect(markup.message).toContain('Hello & welcome to week 5!');
      expect(markup.message).not.toMatch(/<script|onerror|<img/);
      // Delayed posts aren't visible yet; empty/null titles get a fallback.
      expect(anns.some((a) => a.title.includes('delayed post'))).toBe(false);
      expect(anns.filter((a) => a.title === 'Announcement').length).toBeGreaterThan(0);
    });
  });

  describe('item details for the reader', () => {
    const client = () => clientFor('realistic');
    async function plannerItems() {
      return client().fetch(R.Planner(day(subDays(NOW, 30)), day(addDays(NOW, 30))));
    }

    it('fetches an assignment with its body and submission', async () => {
      const item = (await plannerItems()).find((p) => p.type === 'assignment' && p.courseId)!;
      const detail = await client().fetch(R.AssignmentDetail(item.courseId!, item.id));
      expect(detail).toMatchObject({ kind: 'assignment', title: item.title });
      expect(detail.html).toContain('<h2>Overview</h2>');
      expect(detail.submissionTypes.length).toBeGreaterThan(0);
      expect(detail.htmlUrl).toMatch(/^https?:\/\//);
      expect(detail.submission).not.toBeNull();
    });

    it('fetches quizzes and discussions by their planner ids', async () => {
      const items = await plannerItems();
      const quiz = items.find((p) => p.type === 'quiz' && p.courseId)!;
      const q = await client().fetch(R.QuizDetail(quiz.courseId!, quiz.id));
      expect(q).toMatchObject({ kind: 'quiz', timeLimitMinutes: 30, questionCount: 10 });
      expect(q.html).toContain('30 minutes');
      const showcase = clientFor('showcase');
      const disc = (
        await showcase.fetch(R.Planner(day(subDays(NOW, 30)), day(addDays(NOW, 30))))
      ).find((p) => p.type === 'discussion_topic' && p.courseId)!;
      const d = await showcase.fetch(R.DiscussionDetail(disc.courseId!, disc.id));
      expect(d.kind).toBe('discussion');
      expect(d.html).toContain('<blockquote>');
    });

    it('keeps announcement and event bodies for the reader', async () => {
      const courses = await client().fetch(R.Courses);
      const anns = await client().fetch(
        R.Announcements(
          courses.map((c) => c.id),
          day(subDays(NOW, 30)),
          day(addDays(NOW, 1)),
        ),
      );
      expect(anns.some((a) => (a.html ?? '').includes('<p>'))).toBe(true);
    });

    it('resolves Canvas file ids to a signed URL', async () => {
      const file = await client().fetch(R.FileUrl('700002'));
      expect(file.url).toMatch(/^data:image\/svg\+xml/);
    });

    it('caps huge bodies', () => {
      expect(R.capHtml('x'.repeat(R.MAX_HTML + 10)).length).toBe(R.MAX_HTML);
      expect(R.capHtml(null)).toBe('');
    });
  });

  it('surfaces failures from the flaky scenario', async () => {
    await expect(clientFor('flaky').fetch(R.Todo)).rejects.toThrow('503');
  });
});
