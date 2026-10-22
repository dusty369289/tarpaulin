import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// The desktop app, with the Rust commands stubbed. Set before the updater module loads.
const invoke = vi.hoisted(() => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  return vi.fn();
});
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

const { UpdateBanner } = await import('./UpdateBanner');
const { checkForUpdates, skippedVersion } = await import('./updater');

const update = {
  version: '0.3.0',
  currentVersion: '0.2.0',
  notes: '## Fixes\n- **Calendar** shows multi-day events',
  date: null,
};

function show() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <UpdateBanner />
    </QueryClientProvider>,
  );
}

describe('UpdateBanner', () => {
  it('shows release notes, and skipping a version lasts until a check by hand', async () => {
    const user = userEvent.setup();
    invoke.mockResolvedValue(update);
    localStorage.clear();
    await act(() => checkForUpdates({ manual: false }));
    const { unmount } = show();
    expect(screen.getByTestId('update-banner')).toHaveTextContent('Tarpaulin 0.3.0 is available');

    const whatsNew = screen.getByRole('button', { name: 'What’s new' });
    expect(whatsNew).toHaveAttribute('aria-expanded', 'false');
    await user.click(whatsNew);
    expect(whatsNew).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('release-notes')).toHaveTextContent(
      'Calendar shows multi-day events',
    );
    expect(screen.getByText('Calendar').tagName).toBe('STRONG');

    await user.click(screen.getByRole('button', { name: 'Skip this version' }));
    expect(screen.queryByTestId('update-banner')).toBeNull();
    expect(skippedVersion()).toBe('0.3.0');

    // Still skipped after a restart and a background check…
    unmount();
    await act(() => checkForUpdates({ manual: false }));
    show();
    expect(screen.queryByTestId('update-banner')).toBeNull();
    // …but a check the user asks for shows it again.
    await act(() => checkForUpdates());
    expect(screen.getByTestId('update-banner')).toBeInTheDocument();
  });

  it('"Remind me later" hides the banner until the next check', async () => {
    const user = userEvent.setup();
    invoke.mockResolvedValue(update);
    localStorage.clear();
    await act(() => checkForUpdates({ manual: false }));
    show();
    await user.click(screen.getByRole('button', { name: 'Remind me later' }));
    expect(screen.queryByTestId('update-banner')).toBeNull();
    expect(skippedVersion()).toBeNull();
    await act(() => checkForUpdates({ manual: false }));
    expect(screen.getByTestId('update-banner')).toBeInTheDocument();
  });
});
