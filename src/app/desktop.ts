import { isTauri } from '../canvas/transport';
import { useSettings } from './settingsStore';
import { checkForUpdates } from './updater';

// Desktop integration (notifications, opening at login, the tray, saving files) through the
// app's own Rust commands. In a browser (dev), notifications fall back to the Web Notifications
// API, saving falls back to a download, and the rest is unavailable.

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export type NotificationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

const webPermission = (): NotificationPermission => {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
};

export async function notificationPermission(): Promise<NotificationPermission> {
  if (isTauri()) return invoke<NotificationPermission>('notification_permission');
  return webPermission();
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (isTauri()) return invoke<NotificationPermission>('request_notification_permission');
  if (typeof Notification === 'undefined') return 'unsupported';
  await Notification.requestPermission();
  return webPermission();
}

/** Shows a system notification; quietly does nothing when not permitted. */
export async function showNotification(title: string, body: string): Promise<void> {
  if (isTauri()) return invoke('notify', { title, body });
  if (webPermission() === 'granted') new Notification(title, { body });
}

export const autostartSupported = () => isTauri();

export async function autostartEnabled(): Promise<boolean> {
  return isTauri() ? invoke<boolean>('autostart_enabled') : false;
}

/** Turns opening at login on or off; resolves to the state the OS reports afterwards. */
export async function setAutostart(enabled: boolean): Promise<boolean> {
  return isTauri() ? invoke<boolean>('set_autostart', { enabled }) : false;
}

let started = false;

/**
 * Called once at startup, after `setCloseToTray`.
 *
 * The shell decides where a launch at login puts the window before this page loads
 * (src-tauri/src/desktop.rs), from its own copy of "start minimised". This keeps that copy
 * current, now and whenever the setting changes; if it was out of date, the shell moves the
 * window to where the setting says. It also starts listening to the tray menu.
 */
export async function startDesktopShell(startMinimized: boolean): Promise<void> {
  if (!isTauri()) return;
  const first = !started;
  started = true;
  if (first)
    useSettings.subscribe((s, prev) => {
      if (s.startMinimized !== prev.startMinimized)
        void invoke('set_start_minimized', { enabled: s.startMinimized }).catch(() => {});
    });
  try {
    await invoke('set_start_minimized', { enabled: startMinimized });
  } finally {
    if (first) await subscribeTray().catch(() => {});
  }
}

/** The name App.tsx still uses for `startDesktopShell`. */
export const backgroundIfLaunchedAtLogin = startDesktopShell;

/** Tells the desktop shell whether closing the window should hide it to the tray. */
export async function setCloseToTray(enabled: boolean): Promise<void> {
  if (isTauri()) await invoke('set_close_to_tray', { enabled });
}

/** Tray menu items the page handles. The shell shows the window first for all but refresh. */
export type TrayAction = 'refresh' | 'settings' | 'check-updates';

let refreshHandler: (() => void) | null = null;

/**
 * What the tray's Refresh does, until the returned function is called. Set by the dashboard,
 * which has the query client; elsewhere (the settings page) Refresh does nothing.
 */
export function onTrayRefresh(handler: () => void): () => void {
  refreshHandler = handler;
  return () => {
    if (refreshHandler === handler) refreshHandler = null;
  };
}

/** A check the user asked for from the tray: say how it went even when there's nothing new. */
async function checkFromTray() {
  const result = await checkForUpdates();
  if (result.status === 'current')
    await showNotification('Tarpaulin is up to date', 'You have the latest version.');
  else if (result.status === 'error')
    await showNotification('Couldn’t check for updates', result.message);
  // Available: the update banner (or the Updates section in Settings) shows it.
}

export function handleTrayAction(action: TrayAction): void {
  if (action === 'settings') location.hash = '/settings';
  else if (action === 'check-updates') void checkFromTray().catch(() => {});
  else if (action === 'refresh') refreshHandler?.();
}

async function subscribeTray() {
  const { Channel } = await import('@tauri-apps/api/core');
  const channel = new Channel<TrayAction>();
  channel.onmessage = handleTrayAction;
  await invoke('subscribe_tray', { onAction: channel });
}

/** Whether `saveExport` can save through the native dialog (desktop only). */
export const nativeSaveSupported = () => isTauri();

/**
 * Asks where to save `contents` with the native save dialog and writes it there. Resolves to
 * the saved path, or null if the user cancelled. Desktop only: check `nativeSaveSupported()`.
 */
export async function saveExport(fileName: string, contents: string): Promise<string | null> {
  return invoke<string | null>('save_export', { fileName, contents });
}
