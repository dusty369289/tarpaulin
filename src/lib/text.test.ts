import { describe, expect, it } from 'vitest';
import { fold, foldedIncludesAll, formatPoints, plural } from './text';

describe('text helpers', () => {
  it('folds case and accents', () => {
    expect(fold('Résumé ÜBER')).toBe('resume uber');
    expect(foldedIncludesAll('resume ub', 'Résumé', 'Über')).toBe(true);
    expect(foldedIncludesAll('resume x', 'Résumé')).toBe(false);
    expect(foldedIncludesAll('  ', 'anything')).toBe(true);
  });

  it('words counts and points', () => {
    expect(plural(1, 'item')).toBe('1 item');
    expect(plural(2, 'item')).toBe('2 items');
    expect(plural(2, 'quiz', 'quizzes')).toBe('2 quizzes');
    expect(formatPoints(1)).toBe('1 point');
    expect(formatPoints(12.5)).toBe('12.5 points');
    expect(formatPoints(10, { short: true })).toBe('10 pts');
  });
});
