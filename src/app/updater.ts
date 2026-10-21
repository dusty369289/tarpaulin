import { useCallback, useEffect, useState } from 'react';
import { isTauri } from '../canvas/transport';
import { useSettings } from './settingsStore';

// Self-update from GitHub Releases (desktop only). The Rust side verifies signatures; this module
// only drives the flow and reports progress.

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes: string | null;
  date: string | null;
}

type DownloadEvent =
  | { event: 'started'; data: { contentLength: number | null } }
  | { event: 'progress'; data: { chunkLength: number } }
  | { event: 'finished' };

export type UpdateState =
  | { status: 'unsupported' }
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'current'; checkedAt: number }
  | { status: 'available'; update: UpdateInfo }
  | { status: 'downloading'; update: UpdateInfo; received: number; total: number | null }
  | { status: 'installing'; update: UpdateInfo }
  | { status: 'error'; message: string };

const LAST_CHECK_KEY = 'tarpaulin.updates.lastCheck';
const DAY = 24 * 60 * 60_000;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export function appVersion(): Promise<string> {
  return isTauri()
    ? invoke<string>('app_version')
    : Promise.resolve(import.meta.env.VITE_APP_VERSION ?? 'dev');
}

// One shared state for the banner and the settings page.
let state: UpdateState = isTauri() ? { status: 'idle' } : { status: 'unsupported' };
const listeners = new Set<(s: UpdateState) => void>();
function set(next: UpdateState) {
  state = next;
  listeners.forEach((l) => l(state));
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!isTauri()) return state;
  set({ status: 'checking' });
  try {
    const update = await invoke<UpdateInfo | null>('check_update');
    try {
      localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
    } catch {
      /* storage unavailable */
    }
    set(update ? { status: 'available', update } : { status: 'current', checkedAt: Date.now() });
  } catch (e) {
    set({ status: 'error', message: e instanceof Error ? e.message : String(e) });
  }
  return state;
}

export async function installUpdate(): Promise<void> {
  if (state.status !== 'available') return;
  const update = state.update;
  const { Channel } = await import('@tauri-apps/api/core');
  const channel = new Channel<DownloadEvent>();
  let received = 0;
  let total: number | null = null;
  channel.onmessage = (msg) => {
    if (msg.event === 'started') total = msg.data.contentLength;
    if (msg.event === 'progress') received += msg.data.chunkLength;
    set(
      msg.event === 'finished'
        ? { status: 'installing', update }
        : { status: 'downloading', update, received, total },
    );
  };
  set({ status: 'downloading', update, received: 0, total: null });
  try {
    await invoke('install_update', { onEvent: channel }); // restarts the app on success
  } catch (e) {
    set({ status: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}

/** Synchronous state subscription (the hook below is built on it). */
export function subscribeUpdates(listener: (s: UpdateState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useUpdater() {
  const [current, setCurrent] = useState(state);
  useEffect(() => subscribeUpdates(setCurrent), []);
  return {
    state: current,
    check: useCallback(checkForUpdates, []),
    install: useCallback(installUpdate, []),
  };
}

/** Checks at most once a day in the background, if the user hasn't turned it off. */
export function useAutoUpdateCheck() {
  const enabled = useSettings((s) => s.autoCheckUpdates);
  useEffect(() => {
    if (!enabled || !isTauri()) return;
    let last = 0;
    try {
      last = Number(localStorage.getItem(LAST_CHECK_KEY) ?? 0);
    } catch {
      /* storage unavailable */
    }
    if (Date.now() - last < DAY) return;
    const t = setTimeout(() => void checkForUpdates(), 5_000);
    return () => clearTimeout(t);
  }, [enabled]);
}
