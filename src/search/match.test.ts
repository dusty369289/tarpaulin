import { describe, expect, it } from 'vitest';
import { dueOrder, matchScore, rank, tokens, words, type Searchable } from './match';

const now = new Date('2026-10-22T12:00:00');
const at = (iso: string) => new Date(iso);
const titles = (rs: { item: Searchable }[]) => rs.map((r) => r.item.title);

describe('words and tokens', () => {
  it('split at punctuation, case and letter–digit boundaries, without accents', () => {
    expect(words('CS-229 ProblemSet4: Café')).toEqual(['cs', '229', 'problem', 'set', '4', 'cafe']);
    expect(tokens('  PS4  ml ')).toEqual(['ps4', 'ml']);
  });
  it('keep letters of any script', () => {
    expect(words('数学 101')).toEqual(['数学', '101']);
  });
});

describe('matchScore', () => {
  const ps4 = { title: 'Problem set 4', keywords: ['Machine Learning', 'CS 229'] };

  it('"ps4" finds "Problem set 4", spelled by the starts of words', () => {
    expect(matchScore('ps4', ps4)).toBeGreaterThan(0);
    expect(matchScore('pset4', ps4)).toBeGreaterThan(0);
    expect(matchScore('ps4', { title: 'Problem set 3' })).toBe(0);
  });

  it('matches course codes and nicknames in the keywords', () => {
    expect(matchScore('cs229', ps4)).toBeGreaterThan(0);
    expect(matchScore('CS 229', ps4)).toBeGreaterThan(0);
    expect(matchScore('ml', ps4)).toBeGreaterThan(0);
    expect(matchScore('machine', ps4)).toBeGreaterThan(0);
    expect(matchScore('ml ps4', ps4)).toBeGreaterThan(0);
    expect(matchScore('history', ps4)).toBe(0);
  });

  it('forgives one slipped letter in longer words', () => {
    expect(matchScore('probelm', ps4)).toBeGreaterThan(0);
    expect(matchScore('problm', ps4)).toBeGreaterThan(0);
    expect(matchScore('xyzzy', ps4)).toBe(0);
  });

  it('is case and accent blind', () => {
    expect(matchScore('ESSAY', { title: 'Résumé essay' })).toBeGreaterThan(0);
    expect(matchScore('resume', { title: 'Résumé essay' })).toBeGreaterThan(0);
  });

  it('every token has to match', () => {
    expect(matchScore('problem banana', ps4)).toBe(0);
  });

  it('ranks closer matches higher', () => {
    const exact = matchScore('quiz', { title: 'Quiz' });
    const start = matchScore('qui', { title: 'Quiz 2' });
    const later = matchScore('qui', { title: 'Weekly quiz' });
    const initials = matchScore('wquiz', { title: 'Weekly quiz' });
    const inside = matchScore('uiz', { title: 'Quiz' });
    const keyword = matchScore('quiz', { title: 'Week 3', keywords: ['Quiz'] });
    expect(exact).toBeGreaterThan(start);
    expect(start).toBeGreaterThan(later);
    expect(later).toBeGreaterThan(initials);
    expect(initials).toBeGreaterThan(inside);
    expect(exact).toBeGreaterThan(keyword);
  });

  it('an empty query matches nothing', () => {
    expect(matchScore('  ', ps4)).toBe(0);
  });
});

describe('rank', () => {
  it('orders by match quality, then by how soon something is due', () => {
    const items: Searchable[] = [
      { title: 'Problem set 5', due: at('2026-10-30T23:59:00') },
      { title: 'Problem set 4', due: at('2026-10-23T23:59:00') },
      { title: 'Problem set 3', due: at('2026-10-15T23:59:00') },
      { title: 'Problem set 6' },
      { title: 'Reading: problems of philosophy', due: at('2026-10-22T13:00:00') },
      { title: 'Lab report' },
    ];
    expect(titles(rank(items, 'problem set', now))).toEqual([
      'Problem set 4',
      'Problem set 5',
      'Problem set 3',
      'Problem set 6',
    ]);
    expect(titles(rank(items, 'ps4', now))).toEqual(['Problem set 4']);
    expect(titles(rank(items, 'problem', now))[0]).toBe('Problem set 4');
    expect(titles(rank(items, 'problem', now)).at(-1)).toBe('Reading: problems of philosophy');
  });

  it('puts a course abbreviation ahead of initials that skip words', () => {
    const items: Searchable[] = [
      { title: 'MATH 2940 lecture', keywords: ['Probability & Statistics'] },
      { title: 'Homework 2', keywords: ['Machine Learning', 'CS 229'] },
      { title: 'Machine Learning', keywords: ['CS 229'] },
      { title: 'Small talk' },
    ];
    expect(titles(rank(items, 'ml', now)).slice(0, 3)).toEqual([
      'Machine Learning',
      'Homework 2',
      'MATH 2940 lecture',
    ]);
  });
});

describe('dueOrder', () => {
  it('upcoming soonest, then past most recent, then undated', () => {
    const order = [
      at('2026-10-21T00:00:00'),
      null,
      at('2026-10-25T00:00:00'),
      at('2026-10-10T00:00:00'),
      at('2026-10-23T00:00:00'),
    ].sort((a, b) => dueOrder(a, now) - dueOrder(b, now));
    expect(order.map((d) => d?.getDate() ?? null)).toEqual([23, 25, 21, 10, null]);
  });
});
