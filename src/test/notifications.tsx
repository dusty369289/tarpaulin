import { act } from '@testing-library/react';
import type { Transport } from '../canvas/transport';
import { NotificationRunner } from '../notifications/useNotifications';
import { renderWithCanvas } from './render';

/** Mounts the notification runner, waits for the fixtures to load and a run to happen, and
 *  unmounts it again (so each call is one app session). Mock the desktop first (desktopMock). */
export async function runNotifications(transport?: Transport) {
  const view = renderWithCanvas(<NotificationRunner />, transport);
  for (let i = 0; i < 20; i++) await act(() => new Promise((r) => setTimeout(r, 20)));
  view.unmount();
}
