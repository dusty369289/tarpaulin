import { Section, SelectRow, SwitchRow } from '../../ui';
import { useSettings } from '../settingsStore';

export function ReadingSettings() {
  const openItemsIn = useSettings((s) => s.openItemsIn);
  const loadRemoteImages = useSettings((s) => s.loadRemoteImages);
  const update = useSettings((s) => s.update);
  return (
    <Section>
      <SelectRow
        label="Clicking an assignment or announcement"
        help="Tarpaulin keeps a read-only copy; submitting and replying happen in Canvas."
        keywords="open reader browser"
        value={openItemsIn}
        options={[
          ['app', 'Read it in Tarpaulin'],
          ['canvas', 'Open it in Canvas'],
        ]}
        onChange={(openItemsIn) => update({ openItemsIn })}
      />
      <SwitchRow
        label="Load images from other sites"
        help="Images in Canvas content that are hosted elsewhere can tell that site you opened it. Off shows a placeholder to click instead."
        keywords="privacy remote pictures"
        checked={loadRemoteImages}
        onChange={(on) => update({ loadRemoteImages: on })}
      />
    </Section>
  );
}
