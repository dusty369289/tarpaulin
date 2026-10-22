import { useEffect, useState } from 'react';
import { Section, SwitchRow } from '../../ui';
import { autostartEnabled, autostartSupported, setAutostart } from '../desktop';
import { useSettings } from '../settingsStore';

export function StartupSettings() {
  const startMinimized = useSettings((s) => s.startMinimized);
  const closeToTray = useSettings((s) => s.closeToTray);
  const update = useSettings((s) => s.update);
  const supported = autostartSupported();
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (supported) void autostartEnabled().then(setEnabled, (e) => setError(String(e)));
  }, [supported]);

  return (
    <Section>
      <SwitchRow
        label="Keep running in the tray when closed"
        keywords="system tray background close"
        help={
          supported
            ? 'Closing the window keeps reminders coming. Quit from the tray icon.'
            : 'Available in the desktop app.'
        }
        checked={closeToTray}
        disabled={!supported}
        onChange={(on) => update({ closeToTray: on })}
      />
      <SwitchRow
        label="Open Tarpaulin when I log in"
        keywords="autostart startup login"
        help={
          supported
            ? 'So reminders arrive without opening it yourself.'
            : 'Available in the desktop app.'
        }
        checked={enabled}
        disabled={!supported}
        onChange={(on) => {
          setError(null);
          void setAutostart(on).then(setEnabled, (e) => setError(String(e)));
        }}
      />
      <SwitchRow
        label="Start in the background"
        keywords="minimised minimized startup"
        help={
          closeToTray
            ? 'When opened at login: straight to the tray.'
            : 'When opened at login: minimised.'
        }
        checked={startMinimized}
        disabled={!supported || !enabled}
        onChange={(on) => update({ startMinimized: on })}
      />
      {error && (
        <p role="alert" className="px-4 py-3 text-xs text-danger">
          Couldn’t change this: {error}
        </p>
      )}
    </Section>
  );
}
