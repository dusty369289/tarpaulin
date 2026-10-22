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
import { Switch } from '../ui';
import { SettingsForm, type CourseOption } from '../widgets/settings/SettingsForm';
import type { Course } from '../canvas/models';
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
        <Switch
          label="Tilt"
          checked={values.tilt}
          onChange={(tilt) => onChange({ tilt })}
          className="flex justify-between"
        />
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
            applyWidgetStyle(null, effective);
            updateSettings({ widgetStyle: effective });
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

/** Picker rows for the course filter; courses sharing a name show their term or code. */
export function courseOptions(courses: Iterable<Course>): CourseOption[] {
  const list = [...courses];
  const count = new Map<string, number>();
  for (const c of list) count.set(c.name, (count.get(c.name) ?? 0) + 1);
  return list.map((c) => {
    const option: CourseOption = { id: c.id, name: c.name, color: c.color };
    if ((count.get(c.name) ?? 0) > 1) {
      const sameTerm = list.filter((o) => o.name === c.name && o.term?.name === c.term?.name);
      option.detail = (sameTerm.length > 1 ? c.code : c.term?.name) || c.code;
    }
    return option;
  });
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
  const courses = courseOptions(catalog.inScope.byName());
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
      {/* What the widget shows comes first; the style tiles are tall. */}
      <SettingsForm
        schema={fullSchema(def)}
        values={values}
        onChange={(v) => update(page.id, widgetId, v)}
        courses={courses}
        between={
          <WidgetStyleSection
            page={page}
            values={values as unknown as FrameSettings}
            onChange={(patch) => update(page.id, widgetId, { ...values, ...patch })}
          />
        }
      />
    </Drawer>
  );
}
