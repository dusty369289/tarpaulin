import { useCallback, useEffect, useState } from 'react';
import { isTauri } from '../canvas/transport';
import { invoke } from './ipc';
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
/** The version the user chose to skip; the banner stays quiet about it. */
const SKIP_KEY = 'tarpaulin.updates.skipped';
/** Written just before installing; read once by the new version when it starts. */
const RESUME_KEY = 'tarpaulin.updates.resume';
const RESUME_MAX_AGE = 30 * 60_000;
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
/** Showing the window again checks if the last check is older than this. */
const SHOW_RECHECK = 6 * HOUR;

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

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage unavailable
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

/** The version the user skipped, if any. */
export const skippedVersion = () => read(SKIP_KEY);

/** Keeps the banner quiet about this version, across restarts; a later one shows again. */
export const skipVersion = (version: string) => write(SKIP_KEY, version);

/**
 * Checks for an update. A check the user asked for (the default) also forgets a skipped
 * version, so the update they went looking for shows.
 */
export async function checkForUpdates({
  manual = true,
}: { manual?: boolean } = {}): Promise<UpdateState> {
  if (!isTauri()) return state;
  if (manual) write(SKIP_KEY, null);
  set({ status: 'checking' });
  try {
    const update = await invoke<UpdateInfo | null>('check_update');
    write(LAST_CHECK_KEY, String(Date.now()));
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
    localStorage.setItem(
      RESUME_KEY,
      JSON.stringify({ hash: location.hash, from: update.currentVersion, at: Date.now() }),
    );
  } catch {
    /* storage unavailable: the new version just opens on the dashboard */
  }
  try {
    await invoke('install_update', { onEvent: channel }); // restarts the app on success
  } catch (e) {
    set({ status: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}

let resumedFrom: string | null = null;

/**
 * Called once at startup, before the app renders: if this launch is the restart after an
 * update, reopen the page that was showing and remember which version we came from.
 */
export function resumeAfterUpdate(): void {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return;
    localStorage.removeItem(RESUME_KEY);
    const r = JSON.parse(raw) as { hash?: string; from?: string; at?: number };
    if (!r.at || Date.now() - r.at > RESUME_MAX_AGE) return;
    if (r.hash && r.hash !== location.hash) location.hash = r.hash;
    resumedFrom = r.from ?? null;
  } catch {
    /* nothing to resume */
  }
}

/** The version this launch updated from, if it's the restart after an update. */
export const updatedFrom = () => resumedFrom;

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

/** A background check is due: the last one is older than `maxAge` and nothing is in flight. */
function checkDue(maxAge: number): boolean {
  if (!['idle', 'current', 'error'].includes(state.status)) return false;
  return Date.now() - Number(read(LAST_CHECK_KEY) ?? 0) >= maxAge;
}

/**
 * Background checks, if the user hasn't turned them off: shortly after startup, then daily
 * while the app stays open (it can live in the tray for weeks), and when the window is shown
 * again after a while. A failed check doesn't count, so it's retried on the next hourly tick.
 */
export function useAutoUpdateCheck() {
  const enabled = useSettings((s) => s.autoCheckUpdates);
  useEffect(() => {
    if (!enabled || !isTauri()) return;
    const checkIf = (maxAge: number) => {
      if (checkDue(maxAge)) void checkForUpdates({ manual: false });
    };
    const first = setTimeout(() => checkIf(DAY), 5_000);
    const hourly = setInterval(() => checkIf(DAY), HOUR);
    const onShow = () => {
      if (document.visibilityState === 'visible') checkIf(SHOW_RECHECK);
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearTimeout(first);
      clearInterval(hourly);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [enabled]);
}
