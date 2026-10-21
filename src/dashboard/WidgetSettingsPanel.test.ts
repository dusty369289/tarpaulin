import { describe, expect, it } from 'vitest';
import type { Course } from '../canvas/models';
import { courseOptions } from './WidgetSettingsPanel';

const course = (id: string, name: string, term: string | null, code: string) =>
  ({ id, name, color: '#123456', code, term: term ? { name: term } : null }) as unknown as Course;

describe('course picker options', () => {
  it('tells apart courses that share a name by term, or by code within one term', () => {
    const options = courseOptions([
      course('1', 'Cell Biology II', 'Spring 2026', 'BIO202-S'),
      course('2', 'Cell Biology II', 'Autumn 2026', 'BIO202-A'),
      course('3', 'Statistics', 'Autumn 2026', 'STA101'),
      course('4', 'Lab Skills', 'Autumn 2026', 'LAB1-A'),
      course('5', 'Lab Skills', 'Autumn 2026', 'LAB1-B'),
    ]);
    expect(options.map((o) => o.detail)).toEqual([
      'Spring 2026',
      'Autumn 2026',
      undefined,
      'LAB1-A',
      'LAB1-B',
    ]);
    expect(options[2]).toEqual({ id: '3', name: 'Statistics', color: '#123456' });
  });
});
