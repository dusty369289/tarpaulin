// Stands in for src/app/desktop in notification tests, recording what would have been shown:
//   vi.mock('../app/desktop', () => import('../test/desktopMock'));

/** Every notification "shown" so far; tests empty it in beforeEach. */
export const shown: { title: string; body: string }[] = [];

export async function showNotification(title: string, body: string) {
  shown.push({ title, body });
}
