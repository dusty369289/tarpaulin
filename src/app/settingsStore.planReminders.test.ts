import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, SETTINGS_VERSION, useSettings } from './settingsStore';

// Its own file, so other new settings keys can add tests without a merge conflict.
describe('planReminders setting', () => {
  it('defaults on, and loads from settings saved before it existed, with no version bump', async () => {
    expect(DEFAULT_SETTINGS.planReminders).toBe(true);
    expect(parseSettings({ theme: 'dark' })).toMatchObject({ theme: 'dark', planReminders: true });
    expect(parseSettings({ planReminders: 'yes', theme: 'dark' })).toMatchObject({
      theme: 'dark',
      planReminders: true,
    });
    expect(parseSettings({ planReminders: false }).planReminders).toBe(false);
    expect(SETTINGS_VERSION).toBe(3);

    // A store saved at the current version, before the key existed.
    localStorage.setItem(
      'tarpaulin.settings',
      JSON.stringify({ state: { theme: 'dark' }, version: SETTINGS_VERSION }),
    );
    await useSettings.persist.rehydrate();
    expect(useSettings.getState()).toMatchObject({ theme: 'dark', planReminders: true });
  });
});
