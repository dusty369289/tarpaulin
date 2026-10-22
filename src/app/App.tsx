import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import { useCanvas } from '../canvas/CanvasProvider';
import { Dashboard } from '../dashboard/Dashboard';
import { UndoToast } from '../dashboard/UndoToast';
import { NotificationRunner } from '../notifications/useNotifications';
import { QuickFind } from '../search/QuickFind';
import { describeError } from '../widgets/shared/ui';
import { setCloseToTray, startDesktopShell } from './desktop';
import { isSettingsCategory, openSettings } from './settingsNav';
import { useSettings } from './settingsStore';

// Screens most launches never show load on demand: setup only runs once, Settings is a click away.
const Onboarding = lazy(() =>
  import('../onboarding/Onboarding').then((m) => ({ default: m.Onboarding })),
);
const Personalize = lazy(() =>
  import('../onboarding/Personalize').then((m) => ({ default: m.Personalize })),
);
const SettingsPage = lazy(() =>
  import('./SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

const WidgetLab = import.meta.env.DEV
  ? lazy(() => import('../dev/WidgetLab').then((m) => ({ default: m.WidgetLab })))
  : null;

type Route = 'dashboard' | 'settings' | 'lab';

function routeFromHash(): Route {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  if (h === 'settings') return 'settings';
  if (h === 'lab' && WidgetLab) return 'lab';
  return 'dashboard';
}

export function App() {
  const { connection, connectionLoading, connectionError, connectionFromCache } = useCanvas();
  const [route, setRoute] = useState<Route>(routeFromHash);
  const onboarded = useSettings((s) => s.onboarded);

  const closeToTray = useSettings((s) => s.closeToTray);
  useEffect(() => {
    // Order matters: the shell must know about the tray before deciding where to send the window.
    void setCloseToTray(closeToTray)
      .then(() => startDesktopShell(useSettings.getState().startMinimized))
      .catch(() => {});
    // Only the first run sends the window away; later runs just sync the setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void setCloseToTray(closeToTray).catch(() => {});
  }, [closeToTray]);
  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (r: Route) => {
    location.hash = r === 'dashboard' ? '' : `/${r}`;
    setRoute(r);
  };

  if (connectionLoading) return <Spinner />;
  // Offline, a 5xx or rate limited with a saved connection: carry on with the cached data.
  // A rejected token or a locked keychain still stops here.
  if (connectionError && !connectionFromCache) return <ConnectionError error={connectionError} />;
  if (!connection?.connected) return <Lazy screen={<Onboarding />} />;
  if (route === 'lab' && WidgetLab) {
    return (
      <Suspense fallback={null}>
        <WidgetLab />
      </Suspense>
    );
  }
  if (!onboarded) return <Lazy screen={<Personalize />} />;
  return (
    <>
      {/* Reminders run whichever page is showing. */}
      <NotificationRunner />
      {connectionFromCache && <SavedConnectionNote />}
      {/* Ctrl/⌘+K on either screen. Settings sections will deep-link here later (see
          src/search/settingsEntries.ts); for now every settings entry opens Settings. */}
      <QuickFind
        onOpenSettings={(section) =>
          isSettingsCategory(section) ? openSettings(section) : go('settings')
        }
        onShowDashboard={() => go('dashboard')}
      />
      {route === 'settings' ? (
        <>
          <Lazy screen={<SettingsPage onBack={() => go('dashboard')} />} />
          {/* The look picker here can be undone too. */}
          <UndoToast />
        </>
      ) : (
        <Dashboard onOpenSettings={() => go('settings')} />
      )}
    </>
  );
}

function Spinner() {
  return (
    <div className="flex h-full items-center justify-center text-muted">
      <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
    </div>
  );
}

const Lazy = ({ screen }: { screen: ReactNode }) => (
  <Suspense fallback={<Spinner />}>{screen}</Suspense>
);

/**
 * The connection check failed but the saved one is standing in. The bar's chip says whether the
 * data is behind; this offers the same Retry the full-screen card would.
 */
function SavedConnectionNote() {
  const { refreshConnection } = useCanvas();
  const [retrying, setRetrying] = useState(false);
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-40 flex max-w-[calc(100%-2rem)]">
      <div
        role="status"
        data-testid="saved-connection"
        className="card pointer-events-auto flex items-center gap-2 py-1.5 pl-3 pr-1.5 text-xs text-muted shadow-lg"
      >
        <span className="min-w-0">
          Couldn’t check the Canvas connection, so this is saved data.
        </span>
        <button
          type="button"
          className="btn shrink-0 py-1"
          disabled={retrying}
          onClick={() => {
            setRetrying(true);
            void refreshConnection().finally(() => setRetrying(false));
          }}
        >
          <RotateCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} aria-hidden />
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    </div>
  );
}

/** The connection check failed (offline, or in the desktop app a locked keychain). */
function ConnectionError({ error }: { error: Error }) {
  const { refreshConnection } = useCanvas();
  const [retrying, setRetrying] = useState(false);
  const { kind, details } = describeError(error);
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="card flex max-w-md flex-col items-center gap-3 p-6 text-center" role="alert">
        <AlertTriangle className="h-6 w-6 text-danger" aria-hidden />
        <h1 className="font-semibold">
          {kind === 'offline' ? 'You’re offline' : 'Couldn’t check the Canvas connection'}
        </h1>
        <p className="text-sm text-muted">
          {kind === 'offline'
            ? 'Tarpaulin couldn’t reach Canvas. Check your connection and try again.'
            : 'Tarpaulin couldn’t read your saved Canvas connection. If your computer asked to unlock its keychain, allow it, then try again.'}
        </p>
        <p className="break-words text-xs text-muted">{details}</p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={retrying}
          onClick={() => {
            setRetrying(true);
            void refreshConnection().finally(() => setRetrying(false));
          }}
        >
          <RotateCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} aria-hidden />
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    </div>
  );
}
