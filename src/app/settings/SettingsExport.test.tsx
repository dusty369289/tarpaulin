import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithCanvas } from '../../test/render';
import { saveExport } from '../desktop';
import { SettingsPage } from './SettingsPage';
import { DEFAULT_SETTINGS, useSettings } from '../settingsStore';

// Export from the desktop app: the native save dialog, not a web download.
vi.mock('../desktop', async (original) => ({
  ...(await original<typeof import('../desktop')>()),
  nativeSaveSupported: () => true,
  saveExport: vi.fn(),
}));

beforeAll(() => {
  Element.prototype.checkVisibility ??= () => true;
});

beforeEach(() => {
  useSettings.setState(DEFAULT_SETTINGS);
  vi.mocked(saveExport).mockReset();
});

async function exportOnce() {
  renderWithCanvas(<SettingsPage onBack={() => {}} />);
  await act(() => new Promise((r) => setTimeout(r, 50)));
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Settings categories' })).getByRole('button', {
      name: 'Data & backup',
    }),
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Export' }));
}

describe('SettingsPage export (desktop)', () => {
  it('saves through the native dialog and says where', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    vi.mocked(saveExport).mockResolvedValue('/home/me/tarpaulin-dashboard.json');
    await exportOnce();
    const [name, json] = vi.mocked(saveExport).mock.calls[0];
    expect(name).toMatch(/^tarpaulin-dashboard-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(json)).toHaveProperty('pages');
    expect(
      await screen.findByText('Exported to /home/me/tarpaulin-dashboard.json.'),
    ).toBeInTheDocument();
    expect(click).not.toHaveBeenCalled(); // no web download
    click.mockRestore();
  });

  it('says nothing when the dialog is cancelled, and reports failures', async () => {
    vi.mocked(saveExport).mockResolvedValueOnce(null);
    await exportOnce();
    expect(saveExport).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Exported/)).toBeNull();

    vi.mocked(saveExport).mockRejectedValueOnce('couldn’t save /x.json: permission denied');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Export' }));
    expect(
      await screen.findByText('Export failed: couldn’t save /x.json: permission denied'),
    ).toBeInTheDocument();
  });
});
