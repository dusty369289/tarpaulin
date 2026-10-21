import { useSettings } from '../app/settingsStore';
import { Drawer } from '../app/Modal';
import { getBackground } from '../theme/backgrounds';
import { BackgroundPicker, SkinPicker } from '../theme/pickers';
import { getSkin } from '../theme/skins';
import { getWidget } from '../widgets/registry';
import { useDashboard } from './store';
import type { Page } from './types';

/** Look of one page: its background and default widget style, and widgets that differ. */
export function PageStylePanel({ page, onClose }: { page: Page; onClose: () => void }) {
  const settings = useSettings();
  const setPageLook = useDashboard((s) => s.setPageLook);
  const applyWidgetStyle = useDashboard((s) => s.applyWidgetStyle);
  const clearPageBackgrounds = useDashboard((s) => s.clearPageBackgrounds);
  const updateWidget = useDashboard((s) => s.updateWidgetSettings);
  const pageStyle = page.widgetStyle || settings.widgetStyle;
  const background = page.background || settings.background;
  const overrides = page.layout
    .map((l) => ({ id: l.i, w: page.widgets[l.i] }))
    .filter(({ w }) => w && typeof w.settings.style === 'string' && w.settings.style);

  const heading = 'text-xs font-semibold uppercase tracking-wide text-muted';
  return (
    <Drawer title={`Style “${page.name}”`} onClose={onClose}>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3" aria-labelledby="page-bg-heading">
          <h3 id="page-bg-heading" className={heading}>
            Background
          </h3>
          <BackgroundPicker
            value={page.background ?? ''}
            onChange={(id) => setPageLook(page.id, { background: id })}
            inherit={{ label: 'App default', id: settings.background }}
          />
          <button
            type="button"
            className="btn self-start"
            onClick={() => {
              settings.update({ background });
              clearPageBackgrounds();
            }}
          >
            Use {getBackground(background).name} on all pages
          </button>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="page-skin-heading">
          <h3 id="page-skin-heading" className={heading}>
            Widget style — default for this page
          </h3>
          <SkinPicker
            value={page.widgetStyle ?? ''}
            onChange={(id) => setPageLook(page.id, { widgetStyle: id })}
            inherit={{ label: 'App default', id: settings.widgetStyle }}
          />
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="page-overrides-heading">
          <h3 id="page-overrides-heading" className={heading}>
            Widgets with their own style
          </h3>
          {overrides.length === 0 ? (
            <p className="text-sm text-muted">
              None — every widget uses the page default. Pick a style for one widget in its
              settings.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {overrides.map(({ id, w }) => (
                <li key={id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {(w.settings.title as string) || getWidget(w.type)?.name} ·{' '}
                    {getSkin(w.settings.style as string).name}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost shrink-0 text-xs text-accent"
                    onClick={() =>
                      updateWidget(page.id, id, { ...w.settings, style: '', paper: 'auto' })
                    }
                  >
                    Use page default
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary flex-1"
              onClick={() => applyWidgetStyle(page.id, pageStyle)}
            >
              Apply {getSkin(pageStyle).name} to every widget
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                settings.update({ widgetStyle: pageStyle });
                applyWidgetStyle(null, pageStyle);
              }}
            >
              All pages
            </button>
          </div>
        </section>
      </div>
    </Drawer>
  );
}
