import { existsSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { startMockCanvas, type MockCanvas } from '../mock-canvas/server';

/**
 * Uses the preinstalled Chromium when present (cloud dev box), else Playwright's own. The frame
 * rate is uncapped so requestAnimationFrame-based settle checks run at layout speed, not 60fps.
 */
export function launch({
  uncapped = true,
  args = [],
}: { uncapped?: boolean; args?: string[] } = {}): Promise<Browser> {
  const preinstalled = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';
  return chromium.launch({
    executablePath: existsSync(preinstalled) ? preinstalled : undefined,
    args: [...(uncapped ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : []), ...args],
  });
}

export interface TestStack {
  appUrl: string;
  mock: MockCanvas | null;
  /** Switches the scenario the dev proxy reads (the proxy reads the token per request). */
  useScenario: (scenario: string) => void;
  close: () => Promise<void>;
}

/**
 * Starts a mock Canvas and a Vite dev server whose proxy points at it, so UI checks need no
 * credentials and no network. With `live`, uses an already-running `pnpm dev` at APP_URL.
 */
export async function startStack(live: boolean): Promise<TestStack> {
  if (live) {
    return {
      appUrl: process.env.APP_URL ?? 'http://localhost:1420',
      mock: null,
      useScenario: () => {},
      close: async () => {},
    };
  }
  const mock = await startMockCanvas();
  process.env.CANVAS_BASE_URL = mock.url;
  process.env.CANVAS_TOKEN = 'mock-realistic';
  const vite: ViteDevServer = await createServer({
    configFile: new URL('../vite.config.ts', import.meta.url).pathname,
    server: { port: 0, strictPort: false, hmr: false },
    logLevel: 'error',
  });
  await vite.listen();
  const address = vite.httpServer!.address();
  const port = typeof address === 'object' && address ? address.port : 1420;
  return {
    appUrl: `http://localhost:${port}`,
    mock,
    useScenario: (s) => {
      process.env.CANVAS_TOKEN = `mock-${s}`;
    },
    close: async () => {
      await vite.close();
      await mock.close();
    },
  };
}

// ── Settings ──────────────────────────────────────────────────────────────────────────────────
// Settings shows one category at a time (Appearance, Courses, Calendar & time, Notifications,
// Reading, Startup & tray, Account, Data & backup, About), picked in its sidebar.

/** In Settings: shows `category` and waits for its heading. */
export async function settingsCategory(page: Page, category: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Settings categories' })
    .getByRole('button', { name: category, exact: true })
    .click();
  await page.getByRole('heading', { level: 2, name: category, exact: true }).waitFor();
}

/** From the dashboard: opens Settings on `category`. */
export async function openSettings(page: Page, category: string): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await settingsCategory(page, category);
}

const MODE_NAMES: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'Match system',
  'high-contrast': 'High contrast',
};

/** Settings › Appearance › Mode, a radio group; theme is the stored value ('dark', 'system'…). */
export const modePicker = (page: Page) =>
  page.getByRole('radiogroup', { name: 'Mode', exact: true });

/** In Settings › Appearance: picks a Mode by its stored value. */
export async function pickMode(page: Page, theme: string): Promise<void> {
  await modePicker(page)
    .getByRole('radio', { name: MODE_NAMES[theme] ?? theme, exact: true })
    .click();
}

/** In Settings › Appearance: the Mode picked now, as its stored value. */
export async function currentMode(page: Page): Promise<string> {
  return (await modePicker(page).getByRole('radio', { checked: true }).getAttribute('data-value'))!;
}
