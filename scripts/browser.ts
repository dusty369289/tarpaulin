import { existsSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';
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
