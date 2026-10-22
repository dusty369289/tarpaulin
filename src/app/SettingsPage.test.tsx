import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { exportDashboard } from '../dashboard/exportImport';
import { useDashboard } from '../dashboard/store';
import { renderWithCanvas } from '../test/render';
import { SettingsPage } from './SettingsPage';
import { DEFAULT_SETTINGS, useSettings } from './settingsStore';

beforeAll(() => {
  Element.prototype.checkVisibility ??= () => true;
});

beforeEach(() => {
  useSettings.setState(DEFAULT_SETTINGS);
});

/** Renders, then lets the version, permission and Canvas lookups settle. */
async function show() {
  renderWithCanvas(<SettingsPage onBack={() => {}} />);
  await act(() => new Promise((r) => setTimeout(r, 50)));
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
    await show();
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
    await show();
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
    await show();
    fireEvent.change(screen.getByTestId('import-file'), {
      target: { files: [new File(['not json'], 'x.json')] },
    });
    expect(await screen.findByText('That file isn’t valid JSON.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('exports with switches for what to include', async () => {
    await show();
    expect(screen.getByRole('switch', { name: 'Include settings' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Include notes and checklists' })).not.toBeChecked();
  });
});
