import { RotateCcw } from 'lucide-react';
import { Drawer } from '../app/Modal';
import { useCatalog } from '../canvas/hooks';
import { fullSchema, getWidget, normalizeSettings } from '../widgets/registry';
import { SettingsForm } from '../widgets/settings/SettingsForm';
import { useDashboard } from './store';
import type { Page } from './types';

export function WidgetSettingsPanel({
  page,
  widgetId,
  onClose,
}: {
  page: Page;
  widgetId: string;
  onClose: () => void;
}) {
  const update = useDashboard((s) => s.updateWidgetSettings);
  const reset = useDashboard((s) => s.resetWidgetSettings);
  const catalog = useCatalog();
  const instance = page.widgets[widgetId];
  const def = instance && getWidget(instance.type);
  if (!instance || !def) return null;
  const values = normalizeSettings(instance.type, instance.settings);
  const courses = catalog.inScope.byName().map((c) => ({ id: c.id, name: c.name, color: c.color }));
  return (
    <Drawer
      title={`${(values.title as string) || def.name} settings`}
      onClose={onClose}
      footer={
        <button type="button" className="btn" onClick={() => reset(page.id, widgetId)}>
          <RotateCcw className="h-4 w-4" /> Reset to defaults
        </button>
      }
    >
      <SettingsForm
        schema={fullSchema(def)}
        values={values}
        onChange={(v) => update(page.id, widgetId, v)}
        courses={courses}
      />
    </Drawer>
  );
}
