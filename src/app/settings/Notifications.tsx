import { BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LEAD_OPTIONS, type NotificationPrefs } from '../../notifications/prefs';
import { Row, Section, SwitchRow } from '../../ui';
import {
  notificationPermission,
  requestNotificationPermission,
  showNotification,
  type NotificationPermission,
} from '../desktop';
import { useSettings } from '../settingsStore';

export function NotificationsSettings() {
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

  const leads = (
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
  );

  return (
    <>
      <Section>
        <SwitchRow
          label="Desktop notifications"
          help="Reminders and news from Canvas while Tarpaulin is open (it can stay minimised)."
          keywords="alerts"
          checked={prefs.enabled}
          onChange={(enabled) => set({ enabled })}
        />
        {permission !== 'granted' && permission !== 'unsupported' && prefs.enabled && (
          <Row
            label={permission === 'denied' ? 'Notifications are blocked' : 'Allow notifications'}
            help={
              permission === 'denied'
                ? 'Turn them on for Tarpaulin in your system’s notification settings.'
                : 'Your system asks once.'
            }
            keywords="permission"
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
        <Row label="Try it" keywords="test notification" help="Sends one notification now.">
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
      <Section title="What to tell you about">
        <SwitchRow
          label="Deadline reminders"
          help="For work you haven’t handed in yet."
          keywords="due remind before"
          below={leads}
          checked={prefs.deadlines}
          disabled={off}
          onChange={(deadlines) => set({ deadlines })}
        />
        <SwitchRow
          label="New announcements"
          keywords="news"
          checked={prefs.announcements}
          disabled={off}
          onChange={(announcements) => set({ announcements })}
        />
        <SwitchRow
          label="Grades"
          help="Newly graded work and changes to course grades."
          keywords="marks"
          checked={prefs.grades}
          disabled={off}
          onChange={(grades) => set({ grades })}
        />
        <SwitchRow
          label="Remind me on days I planned work"
          help="On the do-date in My plan, at 09:00 or the time you set."
          keywords="plan do date"
          checked={prefs.planned}
          disabled={off}
          onChange={(planned) => set({ planned })}
        />
        <SwitchRow
          label="Weekly preview"
          help="The evening before each week starts, a summary of what's due in it."
          keywords="week summary busy"
          checked={prefs.weekly}
          disabled={off}
          onChange={(weekly) => set({ weekly })}
        />
      </Section>
      <Section title="Quiet time">
        <SwitchRow
          label="Quiet hours"
          help="Held back until quiet hours end."
          keywords="do not disturb night time"
          checked={prefs.quietHours.enabled}
          disabled={off}
          onChange={(enabled) => set({ quietHours: { ...prefs.quietHours, enabled } })}
        >
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
                  e.target.value &&
                  set({ quietHours: { ...prefs.quietHours, end: e.target.value } })
                }
              />
            </>
          )}
        </SwitchRow>
      </Section>
    </>
  );
}
