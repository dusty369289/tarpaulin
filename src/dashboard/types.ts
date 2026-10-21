export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetInstance {
  type: string;
  settings: Record<string, unknown>;
  /** Widget-owned local data (notes, checklist). Never sent to Canvas. */
  data?: unknown;
}

export interface Page {
  id: string;
  name: string;
  icon: string;
  /** Overrides the app's default background / widget style for this page; empty inherits. */
  background?: string;
  widgetStyle?: string;
  layout: LayoutItem[];
  widgets: Record<string, WidgetInstance>;
}

export const GRID_COLS = 12;
