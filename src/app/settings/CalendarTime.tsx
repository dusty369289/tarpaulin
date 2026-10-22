import { useShallow } from 'zustand/react/shallow';
import { useProfile } from '../../canvas/hooks';
import { Section, SelectRow } from '../../ui';
import { useSettings } from '../settingsStore';

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
      <SelectRow
        label="Week starts on"
        keywords="monday sunday calendar"
        value={s.weekStartsOn}
        options={[
          ['monday', 'Monday'],
          ['sunday', 'Sunday'],
        ]}
        onChange={(weekStartsOn) => update({ weekStartsOn })}
      />
      <SelectRow
        label="Clock"
        keywords="12-hour 24-hour time format"
        value={s.clock}
        options={[
          ['auto', 'System default'],
          ['12h', '12-hour'],
          ['24h', '24-hour'],
        ]}
        onChange={(clock) => update({ clock })}
      />
      <SelectRow
        label="Show times in"
        help={
          canvasZone
            ? `This computer uses ${readableZone(deviceZone)}; your Canvas account uses ${readableZone(canvasZone)}. Due times, Today and Tomorrow, the clock and quiet hours follow the one chosen here.`
            : 'Your Canvas account doesn’t say which time zone it uses, so times follow this computer.'
        }
        keywords="time zone timezone"
        value={canvasZone ? s.timesIn : 'device'}
        disabled={!canvasZone}
        options={[
          ['device', 'This computer’s time zone'],
          ['canvas', 'Canvas’s time zone'],
        ]}
        onChange={(timesIn) => update({ timesIn })}
      />
    </Section>
  );
}
