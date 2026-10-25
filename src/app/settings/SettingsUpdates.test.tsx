import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithCanvas } from '../../test/render';
import { SettingsPage } from './SettingsPage';
import { DEFAULT_SETTINGS, useSettings } from '../settingsStore';

// An update is available, with Markdown release notes.
vi.mock('../updater', async (original) => ({
  ...(await original<typeof import('../updater')>()),
  appVersion: () => Promise.resolve('0.2.0'),
  useUpdater: () => ({
    state: {
      status: 'available',
      update: {
        version: '0.3.0',
        currentVersion: '0.2.0',
        notes: '## Fixes\n\n- **Calendar** keeps all-day events on their day',
        date: null,
      },
    },
    check: vi.fn(),
    install: vi.fn(),
  }),
}));

beforeAll(() => {
  Element.prototype.checkVisibility ??= () => true;
});

beforeEach(() => {
  useSettings.setState(DEFAULT_SETTINGS);
});

describe('SettingsPage updates', () => {
  it('renders the release notes as Markdown behind “What’s new”', async () => {
    renderWithCanvas(<SettingsPage onBack={() => {}} />);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Settings categories' })).getByRole('button', {
        name: 'About',
      }),
    );
    expect(screen.getByText('Version 0.3.0 is available')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText('What’s new'));
    const notes = screen.getByTestId('release-notes');
    expect(notes.querySelector('li')?.textContent).toBe(
      'Calendar keeps all-day events on their day',
    );
    expect(notes.querySelector('strong')?.textContent).toBe('Calendar');
    expect(notes.textContent).not.toMatch(/\*\*|##/);
  });

  it('turns automatic installs off', async () => {
    renderWithCanvas(<SettingsPage onBack={() => {}} />);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Settings categories' })).getByRole('button', {
        name: 'About',
      }),
    );
    const auto = screen.getByRole('switch', { name: 'Install updates automatically' });
    expect(auto).toBeChecked();
    fireEvent.click(auto);
    expect(useSettings.getState().autoInstallUpdates).toBe(false);
  });
});
