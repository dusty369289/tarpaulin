import { z } from 'zod';
import { SettingsSchema, type Settings } from '../app/settingsStore';
import { newId } from '../lib/id';
import { parsePlans, usePlans, type PlansByAccount } from '../planner/store';
import { getWidget } from '../widgets/registry';
import { DASHBOARD_VERSION, migrateDashboard } from './store';
import type { Page } from './types';

export const EXPORT_FORMAT = 'tarpaulin-dashboard';

const LayoutItemSchema = z.object({
  i: z.string(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(100),
});

const PageSchema = z.object({
  id: z.string(),
  name: z.string().max(80),
  icon: z.string().default('layout-dashboard'),
  background: z.string().max(40).optional(),
  widgetStyle: z.string().max(40).optional(),
  layout: z.array(LayoutItemSchema),
  widgets: z.record(
    z.object({
      type: z.string(),
      settings: z.record(z.unknown()).default({}),
      data: z.unknown().optional(),
    }),
  ),
});

const ExportFileSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.number().int().min(1),
  exportedAt: z.string(),
  pages: z.array(z.unknown()).min(1),
  settings: z.record(z.unknown()).optional(),
  /** My plan, by account scope (`<baseUrl>|<userId>`) then item. Checked by parsePlans. */
  plans: z.unknown().optional(),
});

export interface ExportOptions {
  includeSettings?: boolean;
  /** Notes and checklist contents, and My plan. */
  includeLocalData?: boolean;
  /** The plans to include with local data; the saved ones when left out. */
  plans?: PlansByAccount;
}

export function exportDashboard(
  pages: Page[],
  settings: Settings | null,
  opts: ExportOptions = {},
): string {
  const out = {
    format: EXPORT_FORMAT,
    version: DASHBOARD_VERSION,
    exportedAt: new Date().toISOString(),
    pages: pages.map((p) => ({
      ...p,
      widgets: Object.fromEntries(
        Object.entries(p.widgets).map(([id, w]) => [
          id,
          opts.includeLocalData ? w : { type: w.type, settings: w.settings },
        ]),
      ),
    })),
    ...(opts.includeSettings && settings ? { settings: SettingsSchema.parse(settings) } : {}),
    // Every account's plans, each under its own scope, so importing never shows one account's
    // plans under another.
    ...(opts.includeLocalData
      ? { plans: parsePlans(opts.plans ?? usePlans.getState().plans) }
      : {}),
  };
  return JSON.stringify(out, null, 2);
}

export interface ImportResult {
  pages: Page[];
  settings: Partial<Settings> | null;
  /** My plan from the file (by account scope), or null when it has none. Apply with
   *  applyImportedPlans once the import is confirmed. */
  plans: PlansByAccount | null;
  warnings: string[];
}

/** Adds the file's plans to this device's: each stays under the account it was made in, and
 *  where both have a plan for one item the more recently changed is kept. */
export function applyImportedPlans(plans: PlansByAccount | null) {
  if (plans) usePlans.getState().importPlans(plans);
}

export class ImportError extends Error {}

/** Validates an exported file, migrates it to the current version and gives every page/widget fresh ids. */
export function importDashboard(json: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ImportError('That file isn’t valid JSON.');
  }
  const file = ExportFileSchema.safeParse(raw);
  if (!file.success) throw new ImportError('That doesn’t look like a Tarpaulin dashboard export.');
  if (file.data.version > DASHBOARD_VERSION) {
    throw new ImportError(
      'This export is from a newer version of Tarpaulin. Update the app and try again.',
    );
  }

  const warnings: string[] = [];
  const migrated = migrateDashboard({ pages: file.data.pages }, file.data.version).pages;
  const unknownTypes = new Set<string>();
  for (const p of file.data.pages as Array<{ widgets?: unknown }>) {
    const widgets = p?.widgets;
    const list = Array.isArray(widgets)
      ? widgets
      : Object.values((widgets as Record<string, { type?: string }>) ?? {});
    for (const w of list as Array<{ type?: string }>)
      if (w?.type && !getWidget(w.type)) unknownTypes.add(w.type);
  }
  if (unknownTypes.size)
    warnings.push(`Skipped unknown widget types: ${[...unknownTypes].join(', ')}.`);

  const pages = migrated.map((p) => {
    const parsed = PageSchema.safeParse(p);
    if (!parsed.success) throw new ImportError(`Page “${p.name}” is malformed.`);
    const idMap = new Map(Object.keys(parsed.data.widgets).map((id) => [id, newId()]));
    return {
      id: newId('p'),
      name: parsed.data.name,
      icon: parsed.data.icon,
      ...(parsed.data.background && { background: parsed.data.background }),
      ...(parsed.data.widgetStyle && { widgetStyle: parsed.data.widgetStyle }),
      layout: parsed.data.layout
        .filter((l) => idMap.has(l.i))
        .map((l) => ({ ...l, i: idMap.get(l.i)! })),
      widgets: Object.fromEntries(
        Object.entries(parsed.data.widgets).map(([id, w]) => [idMap.get(id)!, w]),
      ),
    } satisfies Page;
  });

  let settings: Partial<Settings> | null = null;
  if (file.data.settings) {
    const parsed = SettingsSchema.partial().safeParse(file.data.settings);
    if (parsed.success) settings = parsed.data;
    else warnings.push('Appearance settings in the file were invalid and were ignored.');
  }
  let plans: PlansByAccount | null = null;
  if (file.data.plans !== undefined) {
    plans = parsePlans(file.data.plans);
    if (!Object.keys(plans).length) plans = null;
  }
  return { pages, settings, plans, warnings };
}
