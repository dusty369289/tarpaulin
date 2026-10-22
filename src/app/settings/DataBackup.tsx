import { useQueryClient } from '@tanstack/react-query';
import { Download, RotateCcw, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  exportDashboard,
  importDashboard,
  ImportError,
  saveOrDownload,
  type ImportResult,
} from '../../dashboard/exportImport';
import { buildPage, PRESETS, presetById } from '../../dashboard/presets';
import { useDashboard } from '../../dashboard/store';
import { usePlans } from '../../planner/store';
import { Row, Section, Switch, useConfirm } from '../../ui';
import { pickSettings, useSettings } from '../settingsStore';

export function DataSettings() {
  const refreshMinutes = useSettings((s) => s.refreshMinutes);
  const update = useSettings((s) => s.update);
  const resetAppearance = useSettings((s) => s.resetAppearance);
  const replacePages = useDashboard((s) => s.replacePages);
  const appendPages = useDashboard((s) => s.appendPages);
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dialog, confirm] = useConfirm();
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [includeSettings, setIncludeSettings] = useState(true);
  const [includeData, setIncludeData] = useState(false);

  const doExport = async () => {
    const json = exportDashboard(
      useDashboard.getState().pages,
      pickSettings(useSettings.getState()),
      usePlans.getState().plans,
      { includeSettings, includeLocalData: includeData },
    );
    const name = `tarpaulin-dashboard-${new Date().toISOString().slice(0, 10)}.json`;
    setMessage(null);
    try {
      const saved = await saveOrDownload(name, json);
      if (saved)
        setMessage({
          tone: 'ok',
          text:
            'path' in saved
              ? `Exported to ${saved.path}.`
              : `Exported as ${name}, in your downloads.`,
        });
    } catch (e) {
      setMessage({ tone: 'error', text: `Export failed: ${String(e)}` });
    }
  };

  const doImport = async (file: File) => {
    setMessage(null);
    let result: ImportResult;
    try {
      result = importDashboard(await file.text());
    } catch (e) {
      setMessage({
        tone: 'error',
        text: e instanceof ImportError ? e.message : `Import failed: ${String(e)}`,
      });
      return;
    }
    const n = result.pages.length;
    const pages = n === 1 ? '1 page' : `${n} pages`;
    const them = n === 1 ? 'it' : 'them';
    const mode = await confirm({
      title: 'Import dashboard',
      message: (
        <>
          <p>
            “{file.name}” has {pages}. Replace your current pages with {them}, or add {them}{' '}
            alongside?
          </p>
          <p className="mt-2 text-muted">
            Replacing deletes your current pages, with their notes and checklists.
            {result.settings ? ' The file’s settings replace yours either way.' : ''}
          </p>
        </>
      ),
      actions: [
        { value: 'replace', label: 'Replace my pages', tone: 'danger' },
        { value: 'append', label: 'Add alongside', tone: 'primary' },
      ],
    });
    if (!mode) return;
    if (mode === 'replace') replacePages(result.pages);
    else appendPages(result.pages);
    if (result.settings) update(result.settings);
    if (result.plans) usePlans.getState().importPlans(result.plans);
    setMessage({ tone: 'ok', text: `Imported ${pages}. ${result.warnings.join(' ')}`.trim() });
  };

  const applyPreset = async (id: string) => {
    const preset = presetById(id);
    if (!preset) return;
    const answer = await confirm({
      title: 'Replace all pages?',
      message: (
        <p>
          Your pages and widgets are replaced with the “{preset.name}” layout, and the notes and
          checklists on them are deleted. Your settings stay as they are.
        </p>
      ),
      actions: [{ value: 'replace', label: 'Replace pages', tone: 'danger' }],
    });
    if (answer) replacePages([buildPage(preset)]);
  };

  const resetLookAndCourses = async () => {
    const answer = await confirm({
      title: 'Reset look and courses?',
      message: (
        <>
          <p>
            The look, mode, accent, font, text size, corners, top bar, clock, time zone and week
            start go back to their defaults, and so do course colours, nicknames and hidden courses.
          </p>
          <p className="mt-2 text-muted">
            Your pages and widgets, notifications, startup and tray settings and your Canvas
            connection stay as they are.
          </p>
        </>
      ),
      actions: [{ value: 'reset', label: 'Reset', tone: 'danger' }],
    });
    if (answer) resetAppearance();
  };

  return (
    <>
      <Section title="Canvas data">
        <Row
          label="Refresh from Canvas every"
          help="Data is cached locally so the app opens instantly."
          keywords="interval minutes sync"
        >
          <input
            type="number"
            aria-label="Refresh interval in minutes"
            min={1}
            max={120}
            className="input w-20"
            value={refreshMinutes}
            onChange={(e) =>
              update({ refreshMinutes: Math.min(120, Math.max(1, Number(e.target.value) || 10)) })
            }
          />
          <span className="text-sm text-muted">min</span>
        </Row>
        <Row
          label="Cached Canvas data"
          help="Throws away the saved copy and loads everything again."
          keywords="cache clear reload"
        >
          <button
            type="button"
            className="btn"
            onClick={() => {
              queryClient.removeQueries({ queryKey: ['canvas'] });
              void queryClient.refetchQueries();
            }}
          >
            Clear & reload
          </button>
        </Row>
      </Section>
      <Section title="Backup">
        <Row
          label="Export dashboard"
          help="Pages, widgets and their settings as a JSON file."
          keywords="backup save file"
          below={
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Switch
                label="Include settings"
                checked={includeSettings}
                onChange={setIncludeSettings}
              />
              <Switch
                label="Include notes, checklists and plans"
                checked={includeData}
                onChange={setIncludeData}
              />
            </div>
          }
        >
          <button type="button" className="btn" onClick={() => void doExport()}>
            <Download className="h-4 w-4" /> Export
          </button>
        </Row>
        <Row
          label="Import dashboard"
          help="Asks whether to replace your pages or add to them."
          keywords="restore backup file"
        >
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-testid="import-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
              e.target.value = '';
            }}
          />
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4" /> Import…
          </button>
        </Row>
        {message && (
          <div className="px-4 py-3">
            <p
              role="status"
              className={`rounded-md px-3 py-2 text-sm ${message.tone === 'ok' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}
            >
              {message.text}
            </p>
          </div>
        )}
      </Section>
      <div className="mt-2 border-t border-border pt-5">
        <Section
          title="Reset"
          tone="danger"
          caption="These replace or delete what you’ve set up, and can’t be undone. Each asks first."
        >
          <Row label="Reset layout to a preset" help="Replaces all pages." keywords="layout pages">
            <select
              className="input w-auto"
              aria-label="Reset layout to a preset"
              defaultValue=""
              onChange={(e) => {
                const id = e.target.value;
                e.target.value = '';
                void applyPreset(id);
              }}
            >
              <option value="" disabled>
                Choose…
              </option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Row>
          <Row
            label="Reset look and courses"
            help="Back to the default look, appearance and course colours. Pages, notifications and startup settings stay."
            keywords="defaults appearance"
          >
            <button
              type="button"
              className="btn border-danger/50 text-danger hover:bg-danger/10"
              onClick={() => void resetLookAndCourses()}
            >
              <RotateCcw className="h-4 w-4" /> Reset…
            </button>
          </Row>
        </Section>
      </div>
      {dialog}
    </>
  );
}
