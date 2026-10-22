import { describe, expect, it } from 'vitest';
import { SETTINGS_CATEGORIES } from '../app/settingsNav';
import { SETTINGS_ENTRIES } from './settingsEntries';

describe('settings entries in Quick find', () => {
  it('has one entry for every Settings category, and nothing else', () => {
    const sections = SETTINGS_ENTRIES.flatMap((e) => (e.section ? [e.section] : []));
    expect([...sections].sort()).toEqual([...SETTINGS_CATEGORIES].sort());
    expect(new Set(SETTINGS_ENTRIES.map((e) => e.id)).size).toBe(SETTINGS_ENTRIES.length);
  });
});
