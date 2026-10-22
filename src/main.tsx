import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient, type Query } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { exposeSettle } from './app/settle';
import { resumeAfterUpdate } from './app/updater';
import { CanvasProvider } from './canvas/CanvasProvider';
import { CatalogProvider } from './canvas/hooks';
import { isAuthError } from './canvas/token';
import { createDefaultTransport } from './canvas/transport';
import { ReaderProvider } from './reader/ReaderProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import './index.css';

/** How long the saved Canvas data is kept: two weeks covers a holiday or a long weekend offline. */
const CACHE_MAX_AGE = 14 * 24 * 60 * 60_000;

/** Item bodies opened in the reader are kept for this many items (the most recently loaded). */
const KEEP_DETAILS = 30;
const DETAIL_KINDS = new Set(['assignment', 'quiz', 'discussion']);
const isDetail = (q: Query) => DETAIL_KINDS.has(q.queryKey[2] as string);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A rejected token won't work a second later; retrying only delays the banner.
      retry: (failures, error) => failures < 1 && !isAuthError(error),
      refetchOnWindowFocus: true,
      // As long as the persisted copy, so a cold start offline still has something to show.
      gcTime: CACHE_MAX_AGE,
    },
  },
});

// The Canvas cache is persisted so the app opens instantly with the last data, then refreshes.
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'tarpaulin.cache',
});

/** The reader bodies worth keeping, worked out once per save rather than once per query. */
let keptDetails: Set<Query> | null = null;
function keptDetail(q: Query): boolean {
  if (!keptDetails) {
    const details = queryClient
      .getQueryCache()
      .findAll({ queryKey: ['canvas'], predicate: isDetail })
      .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
    keptDetails = new Set(details.slice(0, KEEP_DETAILS));
    queueMicrotask(() => (keptDetails = null));
  }
  return keptDetails.has(q);
}

/** What goes into the saved cache: Canvas data that loaded, minus signed file links (they carry
 *  a verifier token and expire anyway) and all but the latest reader bodies. */
function shouldPersist(q: Query): boolean {
  if (q.queryKey[0] !== 'canvas' || q.state.status !== 'success') return false;
  if (q.queryKey[2] === 'file-url') return false;
  return !isDetail(q) || keptDetail(q);
}

// The settle signal for the UI scripts (scripts/browser.ts), which run against the dev server.
if (import.meta.env.DEV) exposeSettle(queryClient);
// After an update the new version reopens the page that was showing (see app/updater.ts).
resumeAfterUpdate();

async function pickTransport() {
  // Dev-only demo mode for recording the product video (see src/dev/demoTransport.ts).
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
    const [{ DemoTransport }, { exposeDemoHooks }] = await Promise.all([
      import('./dev/demoTransport'),
      import('./dev/demoHooks'),
    ]);
    exposeDemoHooks();
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
          maxAge: CACHE_MAX_AGE,
          // Bumped when cached data changes shape (v2: item bodies kept for the reader).
          buster: `v2-${transport.kind}`,
          dehydrateOptions: {
            shouldDehydrateQuery: shouldPersist,
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
