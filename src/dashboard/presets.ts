import { newId } from '../lib/id';
import { getWidget, normalizeSettings } from '../widgets/registry';
import type { LayoutItem, Page, WidgetInstance } from './types';

interface PresetWidget {
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  settings?: Record<string, unknown>;
}

export interface Preset {
  id: string;
  name: string;
  icon: string;
  description: string;
  widgets: PresetWidget[];
}

export const PRESETS: Preset[] = [
  {
    id: 'deadline-focus',
    name: 'Deadline Focus',
    icon: 'target',
    description: 'What’s due, what’s overdue and how long you’ve got.',
    widgets: [
      { type: 'countdown', x: 0, y: 0, w: 4, h: 4 },
      {
        type: 'due-soon',
        x: 4,
        y: 0,
        w: 5,
        h: 12,
        settings: { daysAhead: 21, groupBy: 'day', showPoints: true },
      },
      { type: 'todo', x: 9, y: 0, w: 3, h: 7 },
      { type: 'calendar', x: 0, y: 4, w: 4, h: 8, settings: { view: 'agenda', agendaDays: 7 } },
      {
        type: 'announcements',
        x: 9,
        y: 7,
        w: 3,
        h: 5,
        settings: { unreadOnly: true, showPreview: false },
      },
    ],
  },
  {
    id: 'weekly-planner',
    name: 'Weekly Planner',
    icon: 'calendar',
    description: 'Your week at a glance with a checklist and notes beside it.',
    widgets: [
      { type: 'clock', x: 0, y: 0, w: 4, h: 3 },
      { type: 'calendar', x: 4, y: 0, w: 8, h: 11, settings: { view: 'week' } },
      { type: 'todo', x: 0, y: 3, w: 4, h: 8, settings: { source: 'both' } },
      { type: 'due-soon', x: 0, y: 11, w: 6, h: 7, settings: { daysAhead: 7, groupBy: 'course' } },
      { type: 'notes', x: 6, y: 11, w: 6, h: 7, settings: { title: 'This week' } },
    ],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    icon: 'sparkles',
    description: 'Just the essentials, quietly.',
    widgets: [
      {
        type: 'clock',
        x: 0,
        y: 0,
        w: 12,
        h: 3,
        settings: { align: 'center', background: 'transparent', showHeader: false },
      },
      {
        type: 'due-soon',
        x: 2,
        y: 3,
        w: 5,
        h: 9,
        settings: { daysAhead: 7, groupBy: 'none', density: 'spacious' },
      },
      { type: 'grades', x: 7, y: 3, w: 3, h: 9, settings: { showBars: false } },
    ],
  },
];

export function buildPage(preset: Preset, name = preset.name): Page {
  const layout: LayoutItem[] = [];
  const widgets: Record<string, WidgetInstance> = {};
  for (const w of preset.widgets) {
    if (!getWidget(w.type)) continue;
    const id = newId();
    layout.push({ i: id, x: w.x, y: w.y, w: w.w, h: w.h });
    widgets[id] = { type: w.type, settings: normalizeSettings(w.type, w.settings ?? {}) };
  }
  return { id: newId('p'), name, icon: preset.icon, layout, widgets };
}

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
