import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { exposeSettle } from './app/settle';
import { CanvasProvider } from './canvas/CanvasProvider';
import { CatalogProvider } from './canvas/hooks';
import { createDefaultTransport } from './canvas/transport';
import { ReaderProvider } from './reader/ReaderProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true, gcTime: 24 * 60 * 60_000 },
  },
});

// The Canvas cache is persisted so the app opens instantly with the last data, then refreshes.
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'tarpaulin.cache',
});

exposeSettle(queryClient);

async function pickTransport() {
  // Dev-only demo mode for recording the product video (see src/dev/demoTransport.ts).
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
    const { DemoTransport } = await import('./dev/demoTransport');
    return new DemoTransport();
  }
  return createDefaultTransport();
}

pickTransport().then((transport) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 24 * 60 * 60_000,
          // Bumped when cached data changes shape (v2: item bodies kept for the reader).
          buster: `v2-${transport.kind}`,
          dehydrateOptions: {
            shouldDehydrateQuery: (q) => q.queryKey[0] === 'canvas' && q.state.status === 'success',
          },
        }}
      >
        <ThemeProvider>
          <CanvasProvider transport={transport}>
            <CatalogProvider>
              <ReaderProvider>
                <App />
              </ReaderProvider>
            </CatalogProvider>
          </CanvasProvider>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </StrictMode>,
  );
});
