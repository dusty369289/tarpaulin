import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { z } from 'zod';
import type { FrameSettings } from './shared/frame';

export interface WidgetSize {
  /** Grid columns (of 12). */
  w: number;
  /** Grid rows. */
  h: number;
}

export interface WidgetProps<S> {
  id: string;
  settings: S & FrameSettings;
  size: WidgetSize;
  editMode: boolean;
  /** Widget-owned local state (notes text, checklist). Stored locally, never sent to Canvas. */
  data: unknown;
  setData: (data: unknown) => void;
}

export interface WidgetDefinition<S extends z.AnyZodObject = z.AnyZodObject> {
  type: string;
  name: string;
  description: string;
  icon: LucideIcon;
  defaultSize: WidgetSize;
  minSize: WidgetSize;
  /** Widget-specific settings; every field needs a default. Frame settings are merged in. */
  settingsSchema: S;
  Component: ComponentType<WidgetProps<z.infer<S>>>;
}

export function defineWidget<S extends z.AnyZodObject>(
  def: WidgetDefinition<S>,
): WidgetDefinition<S> {
  return def;
}
