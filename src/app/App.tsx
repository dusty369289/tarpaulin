import { lazy, Suspense, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useCanvas } from '../canvas/CanvasProvider';
import { Dashboard } from '../dashboard/Dashboard';
import { Onboarding } from '../onboarding/Onboarding';
import { NotificationRunner } from '../notifications/useNotifications';
import { Personalize } from '../onboarding/Personalize';
import { backgroundIfLaunchedAtLogin, setCloseToTray } from './desktop';
import { useSettings } from './settingsStore';
import { SettingsPage } from './SettingsPage';

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
  const { connection, connectionLoading, connectionError } = useCanvas();
  const [route, setRoute] = useState<Route>(routeFromHash);
  const onboarded = useSettings((s) => s.onboarded);

  const closeToTray = useSettings((s) => s.closeToTray);
  useEffect(() => {
    // Order matters: the shell must know about the tray before deciding where to send the window.
    void setCloseToTray(closeToTray)
      .then(() => backgroundIfLaunchedAtLogin(useSettings.getState().startMinimized))
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

  if (connectionLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
      </div>
    );
  }
  if (connectionError) {
    return (
      <div className="p-6 text-danger">
        Couldn’t check the Canvas connection: {connectionError.message}
      </div>
    );
  }
  if (!connection?.connected) return <Onboarding />;
  if (route === 'lab' && WidgetLab) {
    return (
      <Suspense fallback={null}>
        <WidgetLab />
      </Suspense>
    );
  }
  if (!onboarded) return <Personalize />;
  return (
    <>
      {/* Reminders run whichever page is showing. */}
      <NotificationRunner />
      {route === 'settings' ? (
        <SettingsPage onBack={() => go('dashboard')} />
      ) : (
        <Dashboard onOpenSettings={() => go('settings')} />
      )}
    </>
  );
}
