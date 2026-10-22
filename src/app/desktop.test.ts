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
  const desktop = await import('./desktop');
  const { useSettings } = await import('./settingsStore');
  return { desktop, useSettings };
}

const calls = (cmd: string) => invoke.mock.calls.filter(([c]) => c === cmd);
const settle = () => new Promise((r) => setTimeout(r, 0));

/** Starts the shell and returns the tray channel it registered. */
async function start(desktop: typeof import('./desktop')) {
  await desktop.startDesktopShell(true);
  await settle();
  const [[, { onAction }]] = calls('subscribe_tray') as [
    [string, { onAction: FakeChannel<string> }],
  ];
  return onAction;
}

beforeEach(() => {
  invoke.mockReset();
  location.hash = '';
});

describe('desktop shell', () => {
  it('mirrors "start minimised" to the shell, now and on every change', async () => {
    const { desktop, useSettings } = await load();
    await start(desktop);
    expect(calls('set_start_minimized')).toEqual([['set_start_minimized', { enabled: true }]]);
    useSettings.getState().update({ startMinimized: false });
    await settle();
    expect(calls('set_start_minimized').at(-1)).toEqual([
      'set_start_minimized',
      { enabled: false },
    ]);
    useSettings.getState().update({ fontScale: 1.1 }); // unrelated: no call
    await settle();
    expect(calls('set_start_minimized')).toHaveLength(2);
    // A second start doesn't subscribe twice.
    await desktop.startDesktopShell(false);
    useSettings.getState().update({ startMinimized: true });
    await settle();
    expect(calls('set_start_minimized')).toHaveLength(4);
    expect(calls('subscribe_tray')).toHaveLength(1);
  });

  it('handles the tray menu', async () => {
    const { desktop } = await load();
    const channel = await start(desktop);

    channel.onmessage('settings');
    expect(location.hash).toBe('#/settings');

    const refresh = vi.fn();
    const stop = desktop.onTrayRefresh(refresh);
    channel.onmessage('refresh');
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
    channel.onmessage('refresh');
    expect(refresh).toHaveBeenCalledTimes(1);

    // A check from the tray says so even when there's nothing new.
    invoke.mockImplementation(async (cmd: string) => (cmd === 'check_update' ? null : undefined));
    channel.onmessage('check-updates');
    await settle();
    expect(calls('notify')).toEqual([
      ['notify', { title: 'Tarpaulin is up to date', body: 'You have the latest version.' }],
    ]);
  });

  it('saves exports through the native dialog', async () => {
    const { desktop } = await load();
    expect(desktop.nativeSaveSupported()).toBe(true);
    invoke.mockResolvedValueOnce('/home/me/tarpaulin.json');
    expect(await desktop.saveExport('tarpaulin.json', '{}')).toBe('/home/me/tarpaulin.json');
    expect(invoke).toHaveBeenCalledWith('save_export', {
      fileName: 'tarpaulin.json',
      contents: '{}',
    });
    invoke.mockResolvedValueOnce(null);
    expect(await desktop.saveExport('tarpaulin.json', '{}')).toBeNull();
  });
});
