import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, useSettings } from '../app/settingsStore';
import { fixtureBundle, renderWithCanvas } from '../test/render';
import { EMPTY_STATE, type NotifyState } from './rules';
import { notifyStorageKey, NotificationRunner } from './useNotifications';

const shown = vi.hoisted(() => [] as { title: string; body: string }[]);
vi.mock('../app/desktop', () => ({
  showNotification: async (title: string, body: string) => void shown.push({ title, body }),
}));

const BASE = fixtureBundle.meta.baseUrl;
/** A couple of days after the newest recorded announcements, so they still count as fresh. */
const NOW = new Date('2026-10-19T12:00:00Z');
const announcementNotes = () => shown.filter((n) => /announcement/i.test(n.body + n.title));
const saved = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null') as NotifyState;

/** Renders the runner and waits for the fixtures to load and a run to happen. */
async function run() {
  renderWithCanvas(<NotificationRunner />);
  for (let i = 0; i < 20; i++) await act(() => new Promise((r) => setTimeout(r, 20)));
}

/** The fixture account's storage key (its profile id comes from the recorded profile). */
function ownKey(): string {
  const key = Object.keys(localStorage).find((k) => k.startsWith(`tarpaulin.notifications:`));
  if (!key) throw new Error('the runner saved nothing');
  return key;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  shown.length = 0;
  useSettings.setState(DEFAULT_SETTINGS);
});
afterEach(() => vi.useRealTimers());

describe('NotificationRunner', () => {
  it('takes a quiet first look for a new account and saves it under that account', async () => {
    await run();
    expect(announcementNotes()).toEqual([]);
    const key = ownKey();
    expect(key.startsWith(`tarpaulin.notifications:${BASE}|`)).toBe(true);
    expect(saved(key).seenAnnouncements).not.toBeNull();
  });

  it("doesn't use another account's state", async () => {
    // Another account had seen nothing yet; were it read here, every announcement would be new.
    localStorage.setItem(
      notifyStorageKey('https://other.example.edu', '1'),
      JSON.stringify({ ...EMPTY_STATE, seenAnnouncements: [] }),
    );
    await run();
    expect(announcementNotes()).toEqual([]);
    expect(saved(notifyStorageKey('https://other.example.edu', '1')).seenAnnouncements).toEqual([]);
  });

  it('reports announcements new since its own last look', async () => {
    await run();
    const key = ownKey();
    expect(saved(key).seenAnnouncements?.length).toBeGreaterThan(0);
    // Pretend the recent announcements arrived after the last look.
    localStorage.setItem(key, JSON.stringify({ ...saved(key), seenAnnouncements: [] }));
    shown.length = 0;
    await run();
    expect(announcementNotes().length).toBeGreaterThan(0);
  });

  it('adopts the state saved before it was kept per account', async () => {
    await run();
    const key = ownKey();
    const state = saved(key);
    localStorage.clear();
    localStorage.setItem(
      'tarpaulin.notifications',
      JSON.stringify({ ...state, seenAnnouncements: [] }),
    );
    shown.length = 0;
    await run();
    expect(announcementNotes().length).toBeGreaterThan(0);
    expect(localStorage.getItem('tarpaulin.notifications')).toBeNull();
    expect(saved(key).seenAnnouncements).toEqual(state.seenAnnouncements);
  });

  it('stays quiet with notifications off', async () => {
    useSettings.setState({ notifications: { ...DEFAULT_SETTINGS.notifications, enabled: false } });
    localStorage.setItem(
      'tarpaulin.notifications',
      JSON.stringify({ ...EMPTY_STATE, seenAnnouncements: [], seenGraded: [] }),
    );
    await run();
    expect(shown).toEqual([]);
  });
});
