import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../app/settingsStore';
import { exportDashboard, importDashboard, ImportError } from './exportImport';
import { buildPage, PRESETS } from './presets';

describe('export / import', () => {
  const pages = PRESETS.map((p) => buildPage(p));
  pages[1].widgets[pages[1].layout[0].i].data = { text: 'secret note' };

  it('round-trips pages and settings, with fresh ids', () => {
    const json = exportDashboard(
      pages,
      { ...DEFAULT_SETTINGS, theme: 'dark', accent: '#ff0066' },
      { includeSettings: true },
    );
    const result = importDashboard(json);
    expect(result.warnings).toEqual([]);
    expect(result.settings).toMatchObject({ theme: 'dark', accent: '#ff0066' });
    expect(result.pages.map((p) => p.name)).toEqual(pages.map((p) => p.name));
    for (const [i, page] of result.pages.entries()) {
      const original = pages[i];
      expect(page.id).not.toBe(original.id);
      // Same widgets, settings and positions, just re-keyed.
      const byPos = (p: typeof page) =>
        p.layout.map((l) => ({
          ...l,
          i: undefined,
          w: p.widgets[l.i] && l.w,
          type: p.widgets[l.i].type,
          settings: p.widgets[l.i].settings,
        }));
      expect(byPos(page)).toEqual(byPos(original));
    }
  });

  it('leaves notes and checklists out unless asked', () => {
    const without = importDashboard(exportDashboard(pages, null));
    expect(JSON.stringify(without.pages)).not.toContain('secret note');
    const withData = importDashboard(exportDashboard(pages, null, { includeLocalData: true }));
    expect(JSON.stringify(withData.pages)).toContain('secret note');
    expect(without.settings).toBeNull();
  });

  it('migrates v1 exports and warns about unknown widgets', () => {
    const v1 = {
      format: 'tarpaulin-dashboard',
      version: 1,
      exportedAt: '2025-01-01T00:00:00Z',
      pages: [
        {
          id: 'a',
          name: 'Old',
          layout: [
            { i: 'x', x: 0, y: 0, w: 4, h: 4 },
            { i: 'y', x: 4, y: 0, w: 4, h: 4 },
          ],
          widgets: [
            { id: 'x', type: 'clock' },
            { id: 'y', type: 'weather' },
          ],
        },
      ],
    };
    const result = importDashboard(JSON.stringify(v1));
    expect(result.pages[0].layout).toHaveLength(1);
    expect(Object.values(result.pages[0].widgets)[0].type).toBe('clock');
    expect(result.warnings[0]).toContain('weather');
  });

  it.each([
    ['not json', 'isn’t valid JSON'],
    [JSON.stringify({ hello: 'world' }), 'doesn’t look like'],
    [
      JSON.stringify({ format: 'tarpaulin-dashboard', version: 99, exportedAt: '', pages: [{}] }),
      'newer version',
    ],
  ])('rejects %s', (json, message) => {
    expect(() => importDashboard(json)).toThrow(ImportError);
    expect(() => importDashboard(json)).toThrow(message);
  });
});
