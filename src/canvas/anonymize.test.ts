import { describe, expect, it } from 'vitest';
import { Anonymizer, PLACEHOLDER_ORIGIN } from './anonymize';
import fixtures from './fixtures/canvas.json';

// Every "real" value here is invented for the test.
describe('Anonymizer', () => {
  const raw = [
    {
      id: 700123,
      name: 'BIO 1010 Introduction to Botany (40021)',
      course_code: 'BIO 1010',
      enrollment_term_id: 555,
      enrollments: [{ type: 'student', user_id: 900456, computed_current_score: 81 }],
      term: { name: 'Fall 2026', start_at: '2026-08-24T13:00:00Z', end_at: null },
      html_url: 'https://canvas.example-university.edu/courses/700123',
      uuid: 'abc-secret',
    },
    {
      context_name: 'BIO 1010 Introduction to Botany (40021)',
      user_name: 'Dr Priya Natarajan',
      primary_email: 'p.natarajan@example-university.edu',
      message: '<p>Contact me at p.natarajan@example-university.edu</p>',
      context_code: 'course_700123',
      asset_string: 'discussion_topic_801234',
      posted_at: '2026-10-09T15:12:00Z',
    },
  ];
  const anon = new Anonymizer('https://canvas.example-university.edu');
  const out = anon.value(raw) as Array<Record<string, unknown>>;
  const json = JSON.stringify(out);

  it('removes names, emails, codes, hosts and real ids', () => {
    for (const leak of [
      'Botany',
      'Priya',
      'Natarajan',
      'example-university',
      '700123',
      '900456',
      '801234',
      'abc-secret',
      '40021',
    ]) {
      expect(json).not.toContain(leak);
    }
  });

  it('keeps dates, term names and cross-references consistent', () => {
    expect(out[0].term).toMatchObject({ name: 'Fall 2026', start_at: '2026-08-24T13:00:00Z' });
    expect(out[1].posted_at).toBe('2026-10-09T15:12:00Z');
    expect(out[1].context_name).toBe(out[0].name); // same course, same placeholder
    expect(out[1].context_code).toBe(`course_${out[0].id}`);
    expect(out[0].html_url).toBe(`${PLACEHOLDER_ORIGIN}/courses/${out[0].id}`);
  });

  it('the committed fixtures contain no email addresses', () => {
    expect(JSON.stringify(fixtures)).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });
});
