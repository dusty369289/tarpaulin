import { createContext, useContext } from 'react';
import { useSettings } from '../app/settingsStore';
import type { Page } from '../dashboard/types';
import { DEFAULT_BACKGROUND } from './backgrounds';
import { DEFAULT_SKIN } from './skins';

// Where a widget's style and the page background come from, most specific first:
// widget setting → page default → app default (Settings › Appearance).

/** The widget style widgets inherit when their own style is left empty. */
export const PageSkinContext = createContext<string>(DEFAULT_SKIN);
export const usePageSkin = () => useContext(PageSkinContext);

export function usePageLook(page: Pick<Page, 'background' | 'widgetStyle'> | undefined) {
  const background = useSettings((s) => s.background);
  const widgetStyle = useSettings((s) => s.widgetStyle);
  return {
    background: page?.background || background || DEFAULT_BACKGROUND,
    widgetStyle: page?.widgetStyle || widgetStyle || DEFAULT_SKIN,
  };
}
