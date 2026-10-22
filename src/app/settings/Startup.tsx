import { useEffect, useState } from 'react';
import { Row, Section, Switch } from '../../ui';
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
      <Row
        label="Keep running in the tray when closed"
        keywords="system tray background close"
        help={
          supported
            ? 'Closing the window keeps reminders coming. Quit from the tray icon.'
            : 'Available in the desktop app.'
        }
      >
        <Switch
          hideLabel
          label="Keep running in the tray when closed"
          checked={closeToTray}
          disabled={!supported}
          onChange={(on) => update({ closeToTray: on })}
        />
      </Row>
      <Row
        label="Open Tarpaulin when I log in"
        keywords="autostart startup login"
        help={
          supported
            ? 'So reminders arrive without opening it yourself.'
            : 'Available in the desktop app.'
        }
      >
        <Switch
          hideLabel
          label="Open Tarpaulin when I log in"
          checked={enabled}
          disabled={!supported}
          onChange={(on) => {
            setError(null);
            void setAutostart(on).then(setEnabled, (e) => setError(String(e)));
          }}
        />
      </Row>
      <Row
        label="Start in the background"
        keywords="minimised minimized startup"
        help={
          closeToTray
            ? 'When opened at login: straight to the tray.'
            : 'When opened at login: minimised.'
        }
      >
        <Switch
          hideLabel
          label="Start in the background"
          checked={startMinimized}
          disabled={!supported || !enabled}
          onChange={(on) => update({ startMinimized: on })}
        />
      </Row>
      {error && (
        <p role="alert" className="px-4 py-3 text-xs text-danger">
          Couldn’t change this: {error}
        </p>
      )}
    </Section>
  );
}
