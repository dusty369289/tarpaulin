import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { exportDashboard } from '../dashboard/exportImport';
import { useDashboard } from '../dashboard/store';
import { renderWithCanvas } from '../test/render';
import { openSettings } from './settingsNav';
import { SettingsPage } from './SettingsPage';
import { DEFAULT_SETTINGS, useSettings } from './settingsStore';

beforeAll(() => {
  Element.prototype.checkVisibility ??= () => true;
});

beforeEach(() => {
  useSettings.setState(DEFAULT_SETTINGS);
  sessionStorage.clear();
  history.replaceState(null, '', '/');
});

const settle = () => act(() => new Promise((r) => setTimeout(r, 50)));

/** Renders, lets the version, permission and Canvas lookups settle, then opens `category`. */
async function show(category?: string) {
  renderWithCanvas(<SettingsPage onBack={() => {}} />);
  await settle();
  if (category) await goTo(category);
}

/** Clicks a category in the sidebar. */
async function goTo(category: string) {
  const nav = screen.getByRole('navigation', { name: 'Settings categories' });
  fireEvent.click(within(nav).getByRole('button', { name: category }));
  await settle();
}

describe('SettingsPage', () => {
  it('resets look and courses only, after asking', async () => {
    const user = userEvent.setup();
    useSettings.getState().update({
      onboarded: true,
      theme: 'dark',
      fontScale: 1.2,
      courseNicknames: { '1': 'Bio' },
      hiddenCourseIds: ['2'],
      openItemsIn: 'canvas',
      refreshMinutes: 30,
      closeToTray: false,
      notifications: { ...DEFAULT_SETTINGS.notifications, enabled: false },
    });
    await show('Data & backup');
    await user.click(screen.getByRole('button', { name: /Reset…/ }));
    const dialog = screen.getByRole('alertdialog', { name: 'Reset look and courses?' });
    expect(dialog).toHaveTextContent('notifications, startup and tray settings');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useSettings.getState().theme).toBe('dark');

    await user.click(screen.getByRole('button', { name: /Reset…/ }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    const s = useSettings.getState();
    expect(s.theme).toBe('system');
    expect(s.fontScale).toBe(1);
    expect(s.courseNicknames).toEqual({});
    expect(s.hiddenCourseIds).toEqual([]);
    // Left alone: first-run state, behaviour, notifications and desktop settings.
    expect(s.onboarded).toBe(true);
    expect(s.openItemsIn).toBe('canvas');
    expect(s.refreshMinutes).toBe(30);
    expect(s.closeToTray).toBe(false);
    expect(s.notifications.enabled).toBe(false);
  });

  it('imports only after a choice: replace, add alongside, or cancel', async () => {
    const user = userEvent.setup();
    const before = useDashboard.getState().pages.length;
    const file = new File(
      [exportDashboard(useDashboard.getState().pages.slice(0, 1), null)],
      'mine.json',
      { type: 'application/json' },
    );
    await show('Data & backup');
    const input = screen.getByTestId('import-file');

    fireEvent.change(input, { target: { files: [file] } });
    const dialog = await screen.findByRole('alertdialog', { name: 'Import dashboard' });
    expect(dialog).toHaveTextContent('“mine.json” has 1 page.');
    await user.keyboard('{Escape}');
    expect(useDashboard.getState().pages).toHaveLength(before);

    fireEvent.change(input, { target: { files: [file] } });
    await user.click(await screen.findByRole('button', { name: 'Add alongside' }));
    await waitFor(() => expect(useDashboard.getState().pages).toHaveLength(before + 1));
    expect(screen.getByRole('status')).toHaveTextContent('Imported 1 page.');

    fireEvent.change(input, { target: { files: [file] } });
    await user.click(await screen.findByRole('button', { name: 'Replace my pages' }));
    await waitFor(() => expect(useDashboard.getState().pages).toHaveLength(1));
  });

  it('reports a bad file without asking anything', async () => {
    await show('Data & backup');
    fireEvent.change(screen.getByTestId('import-file'), {
      target: { files: [new File(['not json'], 'x.json')] },
    });
    expect(await screen.findByText('That file isn’t valid JSON.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('exports with switches for what to include', async () => {
    await show('Data & backup');
    expect(screen.getByRole('switch', { name: 'Include settings' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Include notes and checklists' })).not.toBeChecked();
  });
});

describe('SettingsPage layout', () => {
  const heading = (name: string) => screen.queryByRole('heading', { level: 2, name });
  const navButton = (name: string) =>
    within(screen.getByRole('navigation', { name: 'Settings categories' })).getByRole('button', {
      name,
    });

  it('shows one category at a time, marks it in the sidebar and remembers it', async () => {
    await show();
    expect(heading('Appearance')).toBeInTheDocument();
    expect(navButton('Appearance')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('radiogroup', { name: 'Look' })).toBeInTheDocument();
    expect(screen.queryByTestId('import-file')).toBeNull();

    await goTo('Data & backup');
    expect(heading('Data & backup')).toBeInTheDocument();
    expect(heading('Appearance')).toBeNull();
    expect(navButton('Data & backup')).toHaveAttribute('aria-current', 'page');
    expect(navButton('Appearance')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('import-file')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Look' })).toBeNull();

    // Opening Settings again in the same session comes back to it.
    cleanup();
    await show();
    expect(heading('Data & backup')).toBeInTheDocument();
  });

  it('lists the categories in order', async () => {
    await show();
    const nav = screen.getByRole('navigation', { name: 'Settings categories' });
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Appearance',
      'Courses',
      'Calendar & time',
      'Notifications',
      'Reading',
      'Startup & tray',
      'Account',
      'Data & backup',
      'About',
    ]);
  });

  it('picks the mode with a segmented control', async () => {
    await show();
    const mode = screen.getByRole('radiogroup', { name: 'Mode' });
    expect(within(mode).getByRole('radio', { name: 'Match system' })).toBeChecked();
    fireEvent.click(within(mode).getByRole('radio', { name: 'Dark' }));
    expect(useSettings.getState().theme).toBe('dark');
    expect(within(mode).getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  it('keeps the rarer styling folded away under “More styling”', async () => {
    await show();
    const more = screen.getByRole('button', { name: 'More styling' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Top bar style')).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Background' })).toBeNull();

    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('radiogroup', { name: 'Background' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Widget style' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Corner radius' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Top bar style'), { target: { value: 'basic' } });
    expect(useSettings.getState().barStyle).toBe('basic');
    fireEvent.click(screen.getByRole('switch', { name: 'Fold away the top bar' }));
    expect(useSettings.getState().barFoldAway).toBe(true);
  });

  it('searches every category by label and help, and Escape clears it', async () => {
    const user = userEvent.setup();
    await show();
    const search = screen.getByRole('searchbox', { name: 'Search settings' });
    await user.type(search, 'time');
    const results = screen.getByTestId('settings-results');
    // From Calendar & time (its label) and Notifications (quiet hours), under their categories.
    expect(within(results).getByRole('combobox', { name: 'Show times in' })).toBeInTheDocument();
    expect(within(results).getByRole('switch', { name: 'Quiet hours' })).toBeInTheDocument();
    expect(within(results).getByRole('heading', { name: 'Calendar & time' })).toBeVisible();
    expect(within(results).getByRole('heading', { name: 'Notifications' })).toBeVisible();
    // Rows that don't match are gone, and so are categories with nothing left.
    expect(screen.queryByRole('combobox', { name: 'Font' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Look' })).toBeNull();
    expect(within(results).queryByRole('heading', { name: 'Appearance' })).toBeNull();
    expect(navButton('Appearance')).not.toHaveAttribute('aria-current');

    // Search looks inside "More styling" without it being opened.
    await user.clear(search);
    await user.type(search, 'top bar');
    expect(screen.getByLabelText('Top bar style')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Fold away the top bar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More styling' })).toBeNull();

    // Help text counts too: only Load images from other sites says "placeholder".
    await user.clear(search);
    await user.type(search, 'placeholder');
    expect(screen.getByRole('switch', { name: 'Load images from other sites' })).toBeVisible();
    expect(screen.queryByRole('combobox', { name: 'Show times in' })).toBeNull();

    await user.clear(search);
    await user.type(search, 'zzzz no such setting');
    expect(screen.getByText('No settings match “zzzz no such setting”.')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(search).toHaveValue('');
    expect(screen.queryByTestId('settings-results')).toBeNull();
    expect(heading('Appearance')).toBeInTheDocument();
  });

  it('opens a category from a search result', async () => {
    const user = userEvent.setup();
    await show();
    await user.type(screen.getByRole('searchbox', { name: 'Search settings' }), 'clock');
    await user.click(screen.getByRole('button', { name: /Open Calendar & time/ }));
    expect(heading('Calendar & time')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search settings' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Week starts on' })).toBeInTheDocument();
  });

  it('focuses search on “/” and Ctrl+F, but not while typing in a field', async () => {
    const user = userEvent.setup();
    await show('Courses');
    const search = screen.getByRole('searchbox', { name: 'Search settings' });
    await user.keyboard('/');
    expect(search).toHaveFocus();
    expect(search).toHaveValue('');
    search.blur();
    await user.keyboard('{Control>}f{/Control}');
    expect(search).toHaveFocus();
    search.blur();

    const courses = screen.getByRole('searchbox', { name: 'Search courses' });
    await user.click(courses);
    await user.keyboard('a/b');
    expect(courses).toHaveFocus();
    expect(courses).toHaveValue('a/b');
  });

  it('opens on the category a deep link names, then forgets the link', async () => {
    history.replaceState(null, '', '/#/settings?category=account');
    await show();
    expect(heading('Account')).toBeInTheDocument();
    expect(location.hash).toBe('#/settings');

    // And while open: openSettings switches category.
    openSettings('about');
    await waitFor(() => expect(heading('About')).toBeInTheDocument());
    expect(screen.getByText(/by Ethan Wright/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Source code and license' })).toBeInTheDocument();
    expect(location.hash).toBe('#/settings');
  });
});
