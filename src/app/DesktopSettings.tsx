import { BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LEAD_OPTIONS, type NotificationPrefs } from '../notifications/prefs';
import {
  autostartEnabled,
  autostartSupported,
  notificationPermission,
  requestNotificationPermission,
  setAutostart,
  showNotification,
  type NotificationPermission,
} from './desktop';
import { useSettings } from './settingsStore';
import { Row, Section, Switch } from '../ui';

export function NotificationsSection() {
  const prefs = useSettings((s) => s.notifications);
  const update = useSettings((s) => s.update);
  const [permission, setPermission] = useState<NotificationPermission>('prompt');
  const [tested, setTested] = useState(false);
  useEffect(() => {
    void notificationPermission()
      .then(setPermission)
      .catch(() => setPermission('unsupported'));
  }, []);
  const set = (patch: Partial<NotificationPrefs>) =>
    update({ notifications: { ...prefs, ...patch } });
  const off = !prefs.enabled;

  return (
    <Section title="Notifications">
      <Row
        label="Desktop notifications"
        help="Reminders and news from Canvas while Tarpaulin is open (it can stay minimised)."
      >
        <Switch
          hideLabel
          label="Desktop notifications"
          checked={prefs.enabled}
          onChange={(enabled) => set({ enabled })}
        />
      </Row>
      {permission !== 'granted' && permission !== 'unsupported' && prefs.enabled && (
        <Row
          label={permission === 'denied' ? 'Notifications are blocked' : 'Allow notifications'}
          help={
            permission === 'denied'
              ? 'Turn them on for Tarpaulin in your system’s notification settings.'
              : 'Your system asks once.'
          }
        >
          {permission === 'prompt' && (
            <button
              type="button"
              className="btn"
              onClick={() => void requestNotificationPermission().then(setPermission)}
            >
              Allow
            </button>
          )}
        </Row>
      )}
      <Row label="Deadline reminders" help="For work you haven’t handed in yet.">
        <Switch
          hideLabel
          label="Deadline reminders"
          checked={prefs.deadlines}
          disabled={off}
          onChange={(deadlines) => set({ deadlines })}
        />
      </Row>
      <div
        role="group"
        aria-label="Remind me before a deadline"
        className={`flex flex-wrap items-center gap-1.5 ${off || !prefs.deadlines ? 'opacity-50' : ''}`}
      >
        <span className="mr-1 text-xs text-muted">Remind me</span>
        {LEAD_OPTIONS.map((o) => {
          const on = prefs.leads.includes(o.minutes);
          return (
            <button
              key={o.minutes}
              type="button"
              aria-pressed={on}
              disabled={off || !prefs.deadlines}
              onClick={() =>
                set({
                  leads: on
                    ? prefs.leads.filter((m) => m !== o.minutes)
                    : [...prefs.leads, o.minutes].sort((a, b) => b - a),
                })
              }
              className={`chip border transition ${on ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted hover:text-text'}`}
            >
              {o.label} before
            </button>
          );
        })}
      </div>
      <Row label="New announcements">
        <Switch
          hideLabel
          label="New announcements"
          checked={prefs.announcements}
          disabled={off}
          onChange={(announcements) => set({ announcements })}
        />
      </Row>
      <Row label="Grades" help="Newly graded work and changes to course grades.">
        <Switch
          hideLabel
          label="Grades"
          checked={prefs.grades}
          disabled={off}
          onChange={(grades) => set({ grades })}
        />
      </Row>
      <Row label="Quiet hours" help="Held back until quiet hours end.">
        {prefs.quietHours.enabled && (
          <>
            <input
              type="time"
              aria-label="Quiet hours start"
              className="input w-auto py-1"
              value={prefs.quietHours.start}
              disabled={off}
              onChange={(e) =>
                e.target.value &&
                set({ quietHours: { ...prefs.quietHours, start: e.target.value } })
              }
            />
            <span className="text-xs text-muted">to</span>
            <input
              type="time"
              aria-label="Quiet hours end"
              className="input w-auto py-1"
              value={prefs.quietHours.end}
              disabled={off}
              onChange={(e) =>
                e.target.value && set({ quietHours: { ...prefs.quietHours, end: e.target.value } })
              }
            />
          </>
        )}
        <Switch
          hideLabel
          label="Quiet hours"
          checked={prefs.quietHours.enabled}
          disabled={off}
          onChange={(enabled) => set({ quietHours: { ...prefs.quietHours, enabled } })}
        />
      </Row>
      <Row label="Try it">
        {tested && <span className="text-xs text-muted">Sent.</span>}
        <button
          type="button"
          className="btn"
          disabled={off || permission === 'denied' || permission === 'unsupported'}
          onClick={() =>
            void showNotification('Tarpaulin', 'Notifications are working.').then(() =>
              setTested(true),
            )
          }
        >
          <BellRing className="h-4 w-4" /> Send a test
        </button>
      </Row>
    </Section>
  );
}

export function StartupSection() {
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
    <Section title="Startup and tray">
      <Row
        label="Keep running in the tray when closed"
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
        <p role="alert" className="text-xs text-danger">
          Couldn’t change this: {error}
        </p>
      )}
    </Section>
  );
}
