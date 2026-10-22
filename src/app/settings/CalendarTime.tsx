import { useShallow } from 'zustand/react/shallow';
import { useProfile } from '../../canvas/hooks';
import { Row, Section } from '../../ui';
import { useSettings, type Settings } from '../settingsStore';

const readableZone = (zone: string) => zone.replace(/_/g, ' ');

export function CalendarSettings() {
  const s = useSettings(
    useShallow((s) => ({ clock: s.clock, timesIn: s.timesIn, weekStartsOn: s.weekStartsOn })),
  );
  const update = useSettings((s) => s.update);
  const canvasZone = useProfile().data?.timeZone ?? null;
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Section>
      <Row label="Week starts on" keywords="monday sunday calendar">
        <select
          className="input w-auto"
          aria-label="Week starts on"
          value={s.weekStartsOn}
          onChange={(e) => update({ weekStartsOn: e.target.value as Settings['weekStartsOn'] })}
        >
          <option value="monday">Monday</option>
          <option value="sunday">Sunday</option>
        </select>
      </Row>
      <Row label="Clock" keywords="12-hour 24-hour time format">
        <select
          className="input w-auto"
          aria-label="Clock"
          value={s.clock}
          onChange={(e) => update({ clock: e.target.value as Settings['clock'] })}
        >
          <option value="auto">System default</option>
          <option value="12h">12-hour</option>
          <option value="24h">24-hour</option>
        </select>
      </Row>
      <Row
        label="Show times in"
        help={
          canvasZone
            ? `This computer uses ${readableZone(deviceZone)}; your Canvas account uses ${readableZone(canvasZone)}. Due times, Today and Tomorrow, the clock and quiet hours follow the one chosen here.`
            : 'Your Canvas account doesn’t say which time zone it uses, so times follow this computer.'
        }
        keywords="time zone timezone"
      >
        <select
          className="input w-auto"
          aria-label="Show times in"
          value={canvasZone ? s.timesIn : 'device'}
          disabled={!canvasZone}
          onChange={(e) => update({ timesIn: e.target.value as Settings['timesIn'] })}
        >
          <option value="device">This computer’s time zone</option>
          <option value="canvas">Canvas’s time zone</option>
        </select>
      </Row>
    </Section>
  );
}
