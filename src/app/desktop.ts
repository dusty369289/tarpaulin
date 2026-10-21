import { isTauri } from '../canvas/transport';

// Desktop integration (notifications, opening at login) through the app's own Rust commands.
// In a browser (dev), notifications fall back to the Web Notifications API and opening at login
// is unavailable.

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

/** Minimises the window when the OS opened the app at login and the user wants that. */
export async function minimizeIfLaunchedAtLogin(startMinimized: boolean): Promise<void> {
  if (!isTauri() || !startMinimized) return;
  if (await invoke<boolean>('launched_at_login')) await invoke('minimize_window');
}
