import type { ByMode, ThemeTokens } from '../themes';

/** One of a style's paper colours, in light and dark mode. */
export interface Paper {
  id: string;
  name: string;
  /** CSS colour for the picker dot. */
  swatch: ByMode<string>;
  tokens: ByMode<Partial<ThemeTokens>>;
}

/** How a widget looks: its colours, type, edges, decorations and iconography. */
export interface Skin {
  id: string;
  name: string;
  description: string;
  /**
   * Colours scoped to the widget, per mode. Omitted tokens inherit the app theme. High contrast
   * ignores them, so widgets keep the style's shape and type but use the high-contrast colours.
   */
  tokens?: ByMode<Partial<ThemeTokens>>;
  /** Paper colours the user can pick per widget; the first is the default. Each overrides tokens. */
  papers?: Paper[];
  /** When true, `auto` paper cycles through the papers so a board of widgets looks varied. */
  mixPapers?: boolean;
  /** Body text. */
  font?: string;
  /** Widget titles. */
  headingFont?: string;
  /** Big numbers (clock, countdown) and the average glyph width of that font, in em. */
  displayFont?: string;
  glyphWidth?: number;
  /** Multiplies the widget's text size, for fonts with small or large x-heights. */
  scale?: number;
  /** Corner radius when the widget's corners are left at "theme". Any border-radius value. */
  radius?: string;
  /** Maximum resting tilt, in degrees. Widgets straighten up in edit mode. */
  tilt?: number;
  /** Decorations drawn over the widget's top edge; one is picked per widget. */
  decor?: string[];
  /** Whether the header shows the widget's icon. */
  headerIcon: boolean;
  /** CSS background for the picker swatch, per mode. */
  swatch: ByMode<string>;
}
