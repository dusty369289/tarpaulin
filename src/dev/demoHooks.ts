// Dev-only (`/?demo`): lets the demo recorder (scripts/demo/story.ts) change the colour mode and
// look the way Settings does, without showing the Settings page on screen, and lay out the
// dashboard pages it shows off.
import { useSettings } from '../app/settingsStore';
import { buildPage, type Preset } from '../dashboard/presets';
import { useDashboard } from '../dashboard/store';
import { LOOKS } from '../theme/looks';

export function exposeDemoHooks() {
  window.__tarpaulinDemo = {
    setMode: (theme) => useSettings.getState().update({ theme }),
    applyLook: (id) => {
      const look = LOOKS.find((l) => l.id === id);
      if (!look) throw new Error(`No look "${id}"`);
      useSettings.getState().update({ background: look.background, widgetStyle: look.widgetStyle });
      useDashboard.getState().applyWidgetStyle(null, look.widgetStyle);
      useDashboard.getState().clearPageBackgrounds();
    },
    setPages: (pages) =>
      useDashboard
        .getState()
        .replacePages(pages.map((p) => buildPage({ id: p.name, description: '', ...p }))),
  };
}

declare global {
  interface Window {
    __tarpaulinDemo?: {
      setMode: (theme: 'system' | 'light' | 'dark' | 'high-contrast') => void;
      applyLook: (id: string) => void;
      /** Replaces every page with these, built like presets; the first becomes active. */
      setPages: (pages: Array<Pick<Preset, 'name' | 'icon' | 'widgets'>>) => void;
    };
  }
}
