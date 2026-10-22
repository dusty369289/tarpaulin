import { beforeEach, describe, expect, it } from 'vitest';
import {
  APPEARANCE_KEYS,
  DEFAULT_SETTINGS,
  migrateSettings,
  parseSettings,
  SETTINGS_VERSION,
  useSettings,
} from './settingsStore';

const KEY = 'tarpaulin.settings';

/** Saves `state` as an older (or current) version wrote it, then loads it like a fresh start. */
async function loadSaved(state: Record<string, unknown>, version: number) {
  localStorage.setItem(KEY, JSON.stringify({ state, version }));
  await useSettings.persist.rehydrate();
  return useSettings.getState();
}

beforeEach(() => {
  localStorage.clear();
  useSettings.setState(DEFAULT_SETTINGS);
});

describe('parseSettings', () => {
  it('keeps every valid field when one is invalid', () => {
    const s = parseSettings({
      onboarded: true,
      theme: 'dark',
      font: 'comic-sans', // removed or never valid
      courseColors: { '1': '#ff0000' },
      courseNicknames: { '1': 'Bio' },
    });
    expect(s.font).toBe('system');
    expect(s.onboarded).toBe(true);
    expect(s.theme).toBe('dark');
    expect(s.courseColors).toEqual({ '1': '#ff0000' });
    expect(s.courseNicknames).toEqual({ '1': 'Bio' });
  });

  it('puts an out-of-range number back to its default, not the others', () => {
    const s = parseSettings({ fontScale: 3, refreshMinutes: 0, radius: 4 });
    expect(s.fontScale).toBe(1);
    expect(s.refreshMinutes).toBe(10);
    expect(s.radius).toBe(4);
  });

  it('drops unknown keys and survives junk', () => {
    expect(parseSettings({ retiredOption: 1, theme: 'light' })).not.toHaveProperty('retiredOption');
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('nope')).toEqual(DEFAULT_SETTINGS);
  });
});

describe('migrateSettings', () => {
  it('v1: the old current-term default moves to every course', () => {
    expect(migrateSettings({ courseScope: 'current' }, 1).courseScope).toBe('all');
    expect(migrateSettings({ courseScope: 'current' }, 2).courseScope).toBe('current');
  });

  it('v2 → v3: remote images keep loading and times follow the computer', () => {
    const s = migrateSettings({ theme: 'dark' }, 2);
    expect(s).toMatchObject({ theme: 'dark', loadRemoteImages: true, timesIn: 'device' });
  });
});

describe('the persisted store', () => {
  it('loads a v1 save: migrated, other settings kept', async () => {
    const s = await loadSaved(
      { onboarded: true, courseScope: 'current', theme: 'dark', hiddenCourseIds: ['3'] },
      1,
    );
    expect(s.courseScope).toBe('all');
    expect(s.onboarded).toBe(true);
    expect(s.theme).toBe('dark');
    expect(s.hiddenCourseIds).toEqual(['3']);
    expect(s.loadRemoteImages).toBe(true);
    expect(s.timesIn).toBe('device');
  });

  it('loads a v2 save with one bad field without resetting the rest', async () => {
    const s = await loadSaved(
      {
        onboarded: true,
        theme: 'sepia', // not a theme
        courseNicknames: { '1': 'Bio' },
        closeToTray: false,
        notifications: { ...DEFAULT_SETTINGS.notifications, grades: false },
      },
      2,
    );
    expect(s.theme).toBe('system');
    expect(s.onboarded).toBe(true);
    expect(s.courseNicknames).toEqual({ '1': 'Bio' });
    expect(s.closeToTray).toBe(false);
    expect(s.notifications.grades).toBe(false);
  });

  it('keeps the new keys once they are saved', async () => {
    const s = await loadSaved(
      { onboarded: true, loadRemoteImages: false, timesIn: 'canvas' },
      SETTINGS_VERSION,
    );
    expect(s.loadRemoteImages).toBe(false);
    expect(s.timesIn).toBe('canvas');
  });

  it('a bad value in a new key falls back alone', async () => {
    const s = await loadSaved(
      { onboarded: true, loadRemoteImages: 'sometimes', timesIn: 'mars' },
      SETTINGS_VERSION,
    );
    expect(s.loadRemoteImages).toBe(true);
    expect(s.timesIn).toBe('device');
    expect(s.onboarded).toBe(true);
  });

  it('keeps its actions after loading', async () => {
    const s = await loadSaved({ theme: 'dark' }, SETTINGS_VERSION);
    expect(typeof s.update).toBe('function');
    expect(typeof s.resetAppearance).toBe('function');
  });
});

describe('resetAppearance', () => {
  it('resets the look and courses, and nothing else', () => {
    useSettings.getState().update({
      onboarded: true,
      theme: 'dark',
      fontScale: 1.2,
      timesIn: 'canvas',
      courseColors: { '1': '#123456' },
      hiddenCourseIds: ['2'],
      openItemsIn: 'canvas',
      refreshMinutes: 30,
      loadRemoteImages: false,
      closeToTray: false,
      startMinimized: false,
      autoCheckUpdates: false,
      notifications: { ...DEFAULT_SETTINGS.notifications, enabled: false },
    });
    useSettings.getState().resetAppearance();
    const s = useSettings.getState();
    for (const k of APPEARANCE_KEYS) expect(s[k]).toEqual(DEFAULT_SETTINGS[k]);
    expect(s.onboarded).toBe(true);
    expect(s.openItemsIn).toBe('canvas');
    expect(s.refreshMinutes).toBe(30);
    expect(s.loadRemoteImages).toBe(false);
    expect(s.closeToTray).toBe(false);
    expect(s.startMinimized).toBe(false);
    expect(s.autoCheckUpdates).toBe(false);
    expect(s.notifications.enabled).toBe(false);
  });
});
