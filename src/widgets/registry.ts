import type { z } from 'zod';
import { Announcements } from './Announcements';
import { Calendar } from './Calendar';
import { Clock } from './Clock';
import { Countdown } from './Countdown';
import { CourseList } from './CourseList';
import { DueSoon } from './DueSoon';
import { Grades } from './Grades';
import { Notes } from './Notes';
import { Search } from './Search';
import { parseWithDefaults } from './settings/fields';
import { frameSchema } from './shared/frame';
import { Todo } from './Todo';
import type { WidgetDefinition } from './types';

// Adding a widget = one file plus one entry here.
const definitions = [
  DueSoon,
  Calendar,
  Grades,
  Announcements,
  CourseList,
  Todo,
  Countdown,
  Notes,
  Clock,
  Search,
] as const;

export type AnyWidgetDefinition = WidgetDefinition<z.AnyZodObject>;

export const widgetRegistry: Record<string, AnyWidgetDefinition> = Object.fromEntries(
  definitions.map((d) => [d.type, d as unknown as AnyWidgetDefinition]),
);

export const widgetTypes = definitions.map((d) => d.type);

export function getWidget(type: string): AnyWidgetDefinition | undefined {
  return widgetRegistry[type];
}

const fullSchemas = new Map<string, z.AnyZodObject>();
/** The widget's own schema with the shared frame (appearance) fields merged in. */
export function fullSchema(def: AnyWidgetDefinition): z.AnyZodObject {
  let schema = fullSchemas.get(def.type);
  if (!schema) {
    schema = frameSchema.merge(def.settingsSchema);
    fullSchemas.set(def.type, schema);
  }
  return schema;
}

export function defaultSettings(type: string): Record<string, unknown> {
  const def = getWidget(type);
  return def ? fullSchema(def).parse({}) : {};
}

export function normalizeSettings(type: string, raw: unknown): Record<string, unknown> {
  const def = getWidget(type);
  return def ? parseWithDefaults(fullSchema(def), raw) : {};
}
