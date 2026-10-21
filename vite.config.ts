/// <reference types="vitest/config" />
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';
import {
  CanvasHttpError,
  fetchAllPages,
  normalizeBaseUrl,
  validateApiPath,
} from './src/canvas/http';
import {
  isCredentialRejection,
  readTokenExpiry,
  tokenHint,
  tokenLookupPath,
} from './src/canvas/token';

const PROXY_PREFIX = '/canvas-proxy';

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * Dev-only, GET-only proxy so `pnpm dev` in a plain browser can read real Canvas data. The token
 * comes from the server's environment and is attached here; the browser never sees it.
 */
function canvasDevProxy(): Plugin {
  return {
    name: 'tarpaulin-canvas-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(PROXY_PREFIX, (req: IncomingMessage, res: ServerResponse) => {
        const baseUrl = process.env.CANVAS_BASE_URL;
        const token = process.env.CANVAS_TOKEN;
        const url = new URL(req.url ?? '/', 'http://proxy.local');

        if (req.method !== 'GET')
          return send(res, 405, { error: 'The Canvas dev proxy is read-only.' });
        if (url.pathname === '/status') {
          return send(res, 200, {
            connected: Boolean(baseUrl && token),
            baseUrl: baseUrl ? normalizeBaseUrl(baseUrl) : null,
            method: 'dev-proxy',
            userName: null,
          });
        }
        if (!baseUrl || !token) {
          return send(res, 503, {
            error: 'Set CANVAS_BASE_URL and CANVAS_TOKEN to use live data.',
          });
        }
        if (url.pathname === '/token-expiry') {
          // Same lookup as the desktop app's token_expiry command (src-tauri/src/lib.rs).
          const hint = tokenHint(token);
          if (!hint) return send(res, 200, { status: 'unknown' });
          return void fetchAllPages(baseUrl, token, tokenLookupPath(hint), [])
            .then((body) => send(res, 200, readTokenExpiry(body, hint)))
            .catch((e: unknown) => {
              if (!(e instanceof CanvasHttpError))
                return send(res, 502, { error: e instanceof Error ? e.message : String(e) });
              if (isCredentialRejection(e.status, e.message))
                return send(res, 401, { error: e.message });
              send(res, 200, { status: 'unknown' });
            });
        }
        if (!validateApiPath(url.pathname)) {
          return send(res, 403, { error: `Path not allowed: ${url.pathname}` });
        }
        const pairs = [...url.searchParams.entries()] as Array<[string, string]>;
        fetchAllPages(baseUrl, token, url.pathname, pairs)
          .then((body) => send(res, 200, body))
          .catch((e: unknown) => {
            const status = e instanceof CanvasHttpError ? e.status : 502;
            send(res, status, { error: e instanceof Error ? e.message : String(e) });
          });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), canvasDevProxy()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/.claude/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version) },
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Agent worktrees live under .claude/; their copies of the tests aren't ours.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
    css: false,
  },
});
