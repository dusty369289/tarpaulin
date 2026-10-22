import { Row, Section, Switch } from '../../ui';
import { useSettings, type Settings } from '../settingsStore';

export function ReadingSettings() {
  const openItemsIn = useSettings((s) => s.openItemsIn);
  const loadRemoteImages = useSettings((s) => s.loadRemoteImages);
  const update = useSettings((s) => s.update);
  return (
    <Section>
      <Row
        label="Clicking an assignment or announcement"
        help="Tarpaulin keeps a read-only copy; submitting and replying happen in Canvas."
        keywords="open reader browser"
      >
        <select
          className="input w-auto"
          aria-label="Clicking an assignment or announcement"
          value={openItemsIn}
          onChange={(e) => update({ openItemsIn: e.target.value as Settings['openItemsIn'] })}
        >
          <option value="app">Read it in Tarpaulin</option>
          <option value="canvas">Open it in Canvas</option>
        </select>
      </Row>
      <Row
        label="Load images from other sites"
        help="Images in Canvas content that are hosted elsewhere can tell that site you opened it. Off shows a placeholder to click instead."
        keywords="privacy remote pictures"
      >
        <Switch
          hideLabel
          label="Load images from other sites"
          checked={loadRemoteImages}
          onChange={(on) => update({ loadRemoteImages: on })}
        />
      </Row>
    </Section>
  );
}
