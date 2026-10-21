import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pretend to be the desktop app and stub the Rust commands.
const invoke = vi.fn();
class FakeChannel<T> {
  onmessage: (msg: T) => void = () => {};
}
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...a: unknown[]) => invoke(...a),
  Channel: FakeChannel,
}));

async function load() {
  vi.resetModules();
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  return import('./updater');
}

beforeEach(() => invoke.mockReset());

describe('updater', () => {
  it('reports up to date', async () => {
    const u = await load();
    invoke.mockResolvedValueOnce(null);
    expect((await u.checkForUpdates()).status).toBe('current');
    expect(invoke).toHaveBeenCalledWith('check_update', undefined);
  });

  it('downloads with progress and installs', async () => {
    const u = await load();
    const update = { version: '0.2.0', currentVersion: '0.1.0', notes: 'New themes', date: null };
    invoke.mockResolvedValueOnce(update);
    expect(await u.checkForUpdates()).toMatchObject({ status: 'available', update });

    const { result } = renderHook(() => u.useUpdater());
    const seen: unknown[] = [];
    const stop = u.subscribeUpdates((st) => seen.push(st));
    invoke.mockImplementationOnce(async (_cmd: string, args: { onEvent: FakeChannel<unknown> }) => {
      args.onEvent.onmessage({ event: 'started', data: { contentLength: 100 } });
      args.onEvent.onmessage({ event: 'progress', data: { chunkLength: 40 } });
      args.onEvent.onmessage({ event: 'progress', data: { chunkLength: 60 } });
      args.onEvent.onmessage({ event: 'finished' });
    });
    await act(() => u.installUpdate());
    stop();
    expect(invoke).toHaveBeenLastCalledWith('install_update', { onEvent: expect.any(FakeChannel) });
    expect(seen).toMatchObject([
      { status: 'downloading', received: 0, total: null },
      { status: 'downloading', received: 0, total: 100 },
      { status: 'downloading', received: 40, total: 100 },
      { status: 'downloading', received: 100, total: 100 },
      { status: 'installing', update },
    ]);
    expect(result.current.state).toMatchObject({ status: 'installing', update });
  });

  it('surfaces errors', async () => {
    const u = await load();
    invoke.mockRejectedValueOnce(new Error('signature mismatch'));
    expect(await u.checkForUpdates()).toEqual({ status: 'error', message: 'signature mismatch' });
  });

  it('remembers the page before installing and reopens it after the restart', async () => {
    const u = await load();
    invoke.mockResolvedValueOnce({
      version: '0.2.0',
      currentVersion: '0.1.0',
      notes: null,
      date: null,
    });
    await u.checkForUpdates();
    location.hash = '#/settings';
    invoke.mockResolvedValueOnce(undefined); // install_update (the real one restarts the app)
    await u.installUpdate();
    location.hash = '';
    // The "new version" starts:
    const next = await load();
    next.resumeAfterUpdate();
    expect(location.hash).toBe('#/settings');
    expect(next.updatedFrom()).toBe('0.1.0');
    // Only once.
    location.hash = '';
    const again = await load();
    again.resumeAfterUpdate();
    expect(location.hash).toBe('');
    expect(again.updatedFrom()).toBeNull();
  });

  it('ignores a stale resume record', async () => {
    localStorage.setItem(
      'tarpaulin.updates.resume',
      JSON.stringify({ hash: '#/settings', from: '0.0.9', at: Date.now() - 60 * 60_000 }),
    );
    location.hash = '';
    const u = await load();
    u.resumeAfterUpdate();
    expect(location.hash).toBe('');
    expect(u.updatedFrom()).toBeNull();
  });
});
