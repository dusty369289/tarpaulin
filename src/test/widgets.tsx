import { FixtureTransport, type Transport } from '../canvas/transport';
import { WidgetHost } from '../dashboard/WidgetHost';
import { defaultSettings } from '../widgets/registry';
import { fixtureBundle, renderWithCanvas } from './render';

/** Renders one widget with its default settings plus `settings`; 12×12 unless `size` says. */
export function renderWidget(
  type: string,
  settings: Record<string, unknown> = {},
  {
    transport = new FixtureTransport(fixtureBundle),
    size = { w: 12, h: 12 },
  }: { transport?: Transport; size?: { w: number; h: number } } = {},
) {
  return renderWithCanvas(
    <WidgetHost
      id={type}
      instance={{ type, settings: { ...defaultSettings(type), ...settings } }}
      size={size}
      editMode={false}
      onData={() => {}}
    />,
    transport,
  );
}
