import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Drawer } from '../app/Modal';
import { useSettings } from '../app/settingsStore';
import { useCatalog } from '../canvas/hooks';
import { usePageLook } from '../theme/look';
import { PaperPicker, SkinPicker } from '../theme/pickers';
import { getSkin } from '../theme/skins';
import { fullSchema, getWidget, normalizeSettings } from '../widgets/registry';
import type { FrameSettings } from '../widgets/shared/frame';
import { SettingsForm } from '../widgets/settings/SettingsForm';
import { useDashboard } from './store';
import type { Page } from './types';

/** Style, paper and tilt for one widget, with shortcuts to use the style everywhere. */
function WidgetStyleSection({
  page,
  values,
  onChange,
}: {
  page: Page;
  values: FrameSettings;
  onChange: (patch: Partial<FrameSettings>) => void;
}) {
  const pageStyle = usePageLook(page).widgetStyle;
  const applyWidgetStyle = useDashboard((s) => s.applyWidgetStyle);
  const updateSettings = useSettings((s) => s.update);
  const [applied, setApplied] = useState<string | null>(null);
  const effective = values.style || pageStyle;
  const skin = getSkin(effective);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="widget-style-heading">
      <h3
        id="widget-style-heading"
        className="text-xs font-semibold uppercase tracking-wide text-muted"
      >
        Style
      </h3>
      <SkinPicker
        value={values.style}
        onChange={(style) => onChange({ style, paper: 'auto' })}
        inherit={{ label: 'Page default', id: pageStyle }}
      />
      {skin.papers && (
        <div className="flex flex-col gap-1">
          <span className="label mb-0">Paper</span>
          <PaperPicker
            skinId={effective}
            value={values.paper}
            onChange={(paper) => onChange({ paper })}
          />
        </div>
      )}
      {skin.tilt ? (
        <label className="flex items-center justify-between gap-2 text-sm">
          Tilt
          <input
            type="checkbox"
            role="switch"
            checked={values.tilt}
            onChange={(e) => onChange({ tilt: e.target.checked })}
          />
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn"
          onClick={() => {
            applyWidgetStyle(page.id, effective);
            setApplied(`Every widget on “${page.name}” is now ${skin.name}.`);
          }}
        >
          Apply to all on this page
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            updateSettings({ widgetStyle: effective });
            applyWidgetStyle(null, effective);
            setApplied(`Every widget on every page is now ${skin.name}.`);
          }}
        >
          All pages
        </button>
      </div>
      {applied && (
        <p role="status" className="text-xs text-success">
          {applied}
        </p>
      )}
    </section>
  );
}

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
      <div className="flex flex-col gap-6">
        <WidgetStyleSection
          page={page}
          values={values as unknown as FrameSettings}
          onChange={(patch) => update(page.id, widgetId, { ...values, ...patch })}
        />
        <SettingsForm
          schema={fullSchema(def)}
          values={values}
          onChange={(v) => update(page.id, widgetId, v)}
          courses={courses}
        />
      </div>
    </Drawer>
  );
}
