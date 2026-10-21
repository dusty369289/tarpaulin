import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Loader2, LogOut, RefreshCw, RotateCcw, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useCanvas } from '../canvas/CanvasProvider';
import { useCatalog } from '../canvas/hooks';
import { exportDashboard, importDashboard, ImportError } from '../dashboard/exportImport';
import { buildPage, PRESETS, presetById } from '../dashboard/presets';
import { useDashboard } from '../dashboard/store';
import { BackgroundPicker, LookPicker, SkinPicker } from '../theme/pickers';
import { pickSettings, useSettings } from './settingsStore';
import { NotificationsSection, StartupSection } from './DesktopSettings';
import { FoldedList, Row, Section, Switch } from '../ui';
import { appVersion, useUpdater } from './updater';

function UpdatesSection() {
  const { state, check, install } = useUpdater();
  const autoCheck = useSettings((s) => s.autoCheckUpdates);
  const update = useSettings((s) => s.update);
  const [version, setVersion] = useState<string>('');
  useEffect(() => {
    void appVersion().then(setVersion);
  }, []);
  const busy =
    state.status === 'checking' || state.status === 'downloading' || state.status === 'installing';
  return (
    <Section title="Updates">
      <Row
        label="Version"
        help={
          state.status === 'unsupported' ? 'Updates are installed by the desktop app.' : undefined
        }
      >
        <span className="chip bg-surface-2 text-muted">{version || '…'}</span>
      </Row>
      {state.status !== 'unsupported' && (
        <>
          <Row label="Check for updates automatically" help="Once a day, from GitHub Releases.">
            <Switch
              hideLabel
              label="Check for updates automatically"
              checked={autoCheck}
              onChange={(on) => update({ autoCheckUpdates: on })}
            />
          </Row>
          <Row
            label={
              state.status === 'available' ||
              state.status === 'downloading' ||
              state.status === 'installing'
                ? `Version ${state.update.version} is available`
                : state.status === 'current'
                  ? 'You’re up to date'
                  : state.status === 'error'
                    ? 'Couldn’t check for updates'
                    : 'Updates'
            }
            help={
              state.status === 'error'
                ? state.message
                : state.status === 'available' && state.update.notes
                  ? state.update.notes.slice(0, 200)
                  : undefined
            }
          >
            {state.status === 'available' ||
            state.status === 'downloading' ||
            state.status === 'installing' ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void install()}
                disabled={busy}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {state.status === 'downloading'
                  ? `Downloading${state.total ? ` ${Math.round((state.received / state.total) * 100)}%` : '…'}`
                  : state.status === 'installing'
                    ? 'Installing…'
                    : 'Update now'}
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => void check()} disabled={busy}>
                {state.status === 'checking' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Check for updates
              </button>
            )}
          </Row>
        </>
      )}
    </Section>
  );
}

function AppVersion() {
  const [version, setVersion] = useState('');
  useEffect(() => {
    void appVersion().then(setVersion);
  }, []);
  return <span data-testid="app-version">{version ? `v${version}` : ''}</span>;
}

export function SettingsPage({ onBack }: { onBack: () => void }) {
  const settings = useSettings();
  const { connection, transport, refreshConnection } = useCanvas();
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const dashboard = useDashboard();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [includeSettings, setIncludeSettings] = useState(true);
  const [includeData, setIncludeData] = useState(false);
  const term = catalog.currentTerm;

  const doExport = () => {
    const json = exportDashboard(dashboard.pages, pickSettings(settings), {
      includeSettings,
      includeLocalData: includeData,
    });
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tarpaulin-dashboard-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async (file: File, mode: 'replace' | 'append') => {
    try {
      const result = importDashboard(await file.text());
      if (mode === 'replace') dashboard.replacePages(result.pages);
      else dashboard.appendPages(result.pages);
      if (result.settings) settings.update(result.settings);
      setMessage({
        tone: 'ok',
        text: `Imported ${result.pages.length} page(s). ${result.warnings.join(' ')}`,
      });
    } catch (e) {
      setMessage({
        tone: 'error',
        text: e instanceof ImportError ? e.message : `Import failed: ${String(e)}`,
      });
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </button>
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      <Section title="Account">
        <Row label="Canvas" help={connection?.baseUrl ?? 'Not connected'}>
          <span className="chip bg-surface-2 text-muted">
            {connection?.method === 'oauth'
              ? 'OAuth'
              : connection?.method === 'token'
                ? 'Access token'
                : connection?.method}
          </span>
        </Row>
        {transport.canManageCredentials && (
          <Row label="Disconnect" help="Removes the credentials from your keychain.">
            <button
              type="button"
              className="btn hover:text-danger"
              onClick={async () => {
                await transport.disconnect();
                queryClient.removeQueries({ queryKey: ['canvas'] });
                await refreshConnection();
              }}
            >
              <LogOut className="h-4 w-4" /> Disconnect
            </button>
          </Row>
        )}
      </Section>

      <Section title="Look">
        <p className="-mt-1 text-sm text-muted">
          A look sets the background and the widget style together, on every page. Each page can
          have its own (Edit › Style), and each widget too (its settings). Every look has a light
          and a dark version, picked by Mode under Appearance.
        </p>
        <LookPicker
          value={settings}
          onPick={(look) => {
            settings.update({ background: look.background, widgetStyle: look.widgetStyle });
            dashboard.applyWidgetStyle(null, look.widgetStyle);
            dashboard.clearPageBackgrounds();
          }}
        />
        <div className="flex flex-col gap-2">
          <div className="text-sm">Background</div>
          <BackgroundPicker
            value={settings.background}
            onChange={(background) => settings.update({ background })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-sm">Widget style</div>
          <SkinPicker
            value={settings.widgetStyle}
            onChange={(widgetStyle) => settings.update({ widgetStyle })}
          />
        </div>
      </Section>

      <Section title="Appearance">
        <Row
          label="Mode"
          help="Every look has a light and a dark version. High contrast swaps in maximum-contrast colours and keeps each style's shape and fonts."
        >
          <select
            className="input w-auto"
            value={settings.theme}
            onChange={(e) => settings.update({ theme: e.target.value as typeof settings.theme })}
          >
            <option value="system">Match system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="high-contrast">High contrast</option>
          </select>
        </Row>
        <Row
          label="Accent colour"
          help={
            settings.theme === 'high-contrast' ? 'High contrast keeps its own accent.' : undefined
          }
        >
          <input
            type="color"
            aria-label="Accent colour"
            value={settings.accent || '#4f46e5'}
            onChange={(e) => settings.update({ accent: e.target.value })}
            className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
          />
          {settings.accent && (
            <button
              type="button"
              className="btn btn-ghost text-xs"
              onClick={() => settings.update({ accent: '' })}
            >
              Reset
            </button>
          )}
        </Row>
        <Row label="Font">
          <select
            className="input w-auto"
            value={settings.font}
            onChange={(e) => settings.update({ font: e.target.value as typeof settings.font })}
          >
            <option value="system">System</option>
            <option value="rounded">Rounded</option>
            <option value="serif">Serif</option>
            <option value="mono">Monospace</option>
            <option value="readable">Extra readable</option>
          </select>
        </Row>
        <Row label="Text size">
          <input
            type="range"
            aria-label="Text size"
            min={0.85}
            max={1.3}
            step={0.05}
            value={settings.fontScale}
            onChange={(e) => settings.update({ fontScale: Number(e.target.value) })}
            className="accent-[rgb(var(--accent))]"
          />
          <span className="w-10 text-right text-xs tabular-nums">
            {Math.round(settings.fontScale * 100)}%
          </span>
        </Row>
        <Row label="Corner radius">
          <input
            type="range"
            aria-label="Corner radius"
            min={0}
            max={24}
            value={settings.radius}
            onChange={(e) => settings.update({ radius: Number(e.target.value) })}
            className="accent-[rgb(var(--accent))]"
          />
          <span className="w-10 text-right text-xs tabular-nums">{settings.radius}px</span>
        </Row>
        <Row label="Top bar" help="Frosted glass that the page shows through, or a plain strip.">
          <select
            className="input w-auto"
            aria-label="Top bar style"
            value={settings.barStyle}
            onChange={(e) =>
              settings.update({ barStyle: e.target.value as typeof settings.barStyle })
            }
          >
            <option value="frosted">Frosted</option>
            <option value="basic">Basic</option>
          </select>
        </Row>
        <Row
          label="Fold away the top bar"
          help="Gives the page the full window. Point at the top edge or press Tab to bring it back. Always shown on touch screens."
        >
          <Switch
            hideLabel
            label="Fold away the top bar"
            checked={settings.barFoldAway}
            onChange={(on) => settings.update({ barFoldAway: on })}
          />
        </Row>
        <Row label="Clock">
          <select
            className="input w-auto"
            value={settings.clock}
            onChange={(e) => settings.update({ clock: e.target.value as typeof settings.clock })}
          >
            <option value="auto">System default</option>
            <option value="12h">12-hour</option>
            <option value="24h">24-hour</option>
          </select>
        </Row>
        <Row
          label="Clicking an assignment or announcement"
          help="Tarpaulin keeps a read-only copy; submitting and replying happen in Canvas."
        >
          <select
            className="input w-auto"
            aria-label="Clicking an assignment or announcement"
            value={settings.openItemsIn}
            onChange={(e) =>
              settings.update({ openItemsIn: e.target.value as typeof settings.openItemsIn })
            }
          >
            <option value="app">Read it in Tarpaulin</option>
            <option value="canvas">Open it in Canvas</option>
          </select>
        </Row>
        <Row label="Week starts on">
          <select
            className="input w-auto"
            value={settings.weekStartsOn}
            onChange={(e) =>
              settings.update({ weekStartsOn: e.target.value as typeof settings.weekStartsOn })
            }
          >
            <option value="monday">Monday</option>
            <option value="sunday">Sunday</option>
          </select>
        </Row>
      </Section>

      <Section title="Courses">
        <Row
          label="Show courses from"
          help={
            term
              ? `Current term looks like ${term}. Hide single courses below.`
              : 'Hide single courses below.'
          }
        >
          <select
            className="input w-auto"
            value={settings.courseScope}
            onChange={(e) =>
              settings.update({ courseScope: e.target.value as typeof settings.courseScope })
            }
          >
            <option value="all">All courses</option>
            <option value="current">Current term only</option>
          </select>
        </Row>
        <FoldedList
          items={catalog.scoped.byName().toArray()}
          itemKey={(c) => c.id}
          noun="courses"
          searchText={(c) => `${c.canvasName} ${c.name} ${c.code ?? ''} ${c.term?.name ?? ''}`}
          renderItem={(c) => {
            const hidden = c.isHidden;
            return (
              <div
                className={`flex flex-wrap items-center gap-2 py-2 ${hidden ? 'opacity-50' : ''}`}
              >
                <input
                  type="color"
                  aria-label={`Colour for ${c.canvasName}`}
                  value={c.color}
                  onChange={(e) => settings.setCourseColor(c.id, e.target.value)}
                  className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent"
                />
                <div className="min-w-0 flex-1">
                  <input
                    aria-label={`Nickname for ${c.canvasName}`}
                    className="input py-1"
                    placeholder={c.canvasName}
                    defaultValue={settings.courseNicknames[c.id] ?? ''}
                    onBlur={(e) => settings.setCourseNickname(c.id, e.target.value)}
                  />
                  <div className="mt-0.5 truncate text-xs text-muted">
                    {c.canvasName} · {c.term?.name ?? 'No term'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn px-2 py-1 text-xs"
                  onClick={() => settings.toggleCourseHidden(c.id)}
                >
                  {hidden ? 'Show' : 'Hide'}
                </button>
              </div>
            );
          }}
        />
      </Section>

      <Section title="Data">
        <Row
          label="Refresh from Canvas every"
          help="Data is cached locally so the app opens instantly."
        >
          <input
            type="number"
            aria-label="Refresh interval in minutes"
            min={1}
            max={120}
            className="input w-20"
            value={settings.refreshMinutes}
            onChange={(e) =>
              settings.update({
                refreshMinutes: Math.min(120, Math.max(1, Number(e.target.value) || 10)),
              })
            }
          />
          <span className="text-sm text-muted">min</span>
        </Row>
        <Row label="Cached Canvas data">
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
        <Row label="Export dashboard" help="Pages, widgets and their settings as a JSON file.">
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={includeSettings}
              onChange={(e) => setIncludeSettings(e.target.checked)}
            />{' '}
            appearance
          </label>
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={includeData}
              onChange={(e) => setIncludeData(e.target.checked)}
            />{' '}
            notes & checklists
          </label>
          <button type="button" className="btn" onClick={doExport}>
            <Download className="h-4 w-4" /> Export
          </button>
        </Row>
        <Row label="Import dashboard">
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                void doImport(
                  f,
                  confirm('Replace your current pages? Cancel to add them alongside.')
                    ? 'replace'
                    : 'append',
                );
              e.target.value = '';
            }}
          />
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4" /> Import…
          </button>
        </Row>
        {message && (
          <p
            role="status"
            className={`rounded-md px-3 py-2 text-sm ${message.tone === 'ok' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}
          >
            {message.text}
          </p>
        )}
        <Row label="Reset layout to a preset" help="Replaces all pages.">
          <select
            className="input w-auto"
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value;
              e.target.value = '';
              const preset = presetById(id);
              if (preset && confirm('Replace all pages with this preset?'))
                dashboard.replacePages([buildPage(preset)]);
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
          <button
            type="button"
            className="btn"
            onClick={() => confirm('Reset all appearance and course settings?') && settings.reset()}
          >
            <RotateCcw className="h-4 w-4" /> Reset settings
          </button>
        </Row>
      </Section>
      <NotificationsSection />
      <StartupSection />
      <UpdatesSection />
      <p className="pb-6 text-center text-xs text-muted">
        Tarpaulin <AppVersion /> · reads Canvas only. Notes and checklists stay on this device.
      </p>
    </div>
  );
}
