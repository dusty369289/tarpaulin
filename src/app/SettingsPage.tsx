import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Download,
  HelpCircle,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCanvas } from '../canvas/CanvasProvider';
import { useCatalog, useProfile } from '../canvas/hooks';
import {
  exportDashboard,
  importDashboard,
  ImportError,
  type ImportResult,
} from '../dashboard/exportImport';
import { buildPage, PRESETS, presetById } from '../dashboard/presets';
import { useDashboard } from '../dashboard/store';
import { BackgroundPicker, LookPicker, SkinPicker } from '../theme/pickers';
import { pickSettings, useSettings, type Settings } from './settingsStore';
import { NotificationsSection, StartupSection } from './DesktopSettings';
import { nativeSaveSupported, saveExport } from './desktop';
import { FoldedList, Row, Section, Switch, useConfirm } from '../ui';
import { TokenHelpDialog } from '../onboarding/TokenHelp';
import { ReplaceToken } from './ReplaceToken';
import { useFormatExpiry } from './TokenBanner';
import { useAuthFailure, useTokenExpiry } from './tokenHealth';
import { ReleaseNotes } from './UpdateBanner';
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
            help={state.status === 'error' ? state.message : undefined}
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
          {'update' in state && state.update.notes && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">What’s new</summary>
              <ReleaseNotes
                notes={state.update.notes}
                className="mt-2 rounded-md border border-border bg-surface-2 px-3 py-2"
              />
            </details>
          )}
        </>
      )}
    </Section>
  );
}

/** The access token's health, its expiry date, and the help and replace-in-place controls. */
function TokenRows() {
  const { connection } = useCanvas();
  const expiry = useTokenExpiry();
  const rejected = useAuthFailure();
  const formatExpiry = useFormatExpiry();
  const [open, setOpen] = useState<'help' | 'replace' | null>(null);
  const e = expiry.data;
  const status = rejected
    ? 'Canvas rejected it: it has expired or been revoked.'
    : expiry.isLoading
      ? 'Checking when it expires…'
      : e?.status === 'expires'
        ? `Expires ${formatExpiry(e.expiresAt)}.`
        : e?.status === 'never'
          ? 'No expiry date: it works until you delete it in Canvas.'
          : 'Canvas didn’t say when it expires.';
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2" data-testid="token-status">
        <div>
          <div className="text-sm">Access token</div>
          <div className={`text-xs ${rejected ? 'text-danger' : 'text-muted'}`}>{status}</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn" onClick={() => setOpen('help')}>
            <HelpCircle className="h-4 w-4" /> How to get a token
          </button>
          <button
            type="button"
            className={`btn ${rejected ? 'btn-primary' : ''}`}
            aria-expanded={open === 'replace'}
            onClick={() => setOpen(open === 'replace' ? null : 'replace')}
          >
            <KeyRound className="h-4 w-4" /> Replace token
          </button>
        </div>
      </div>
      {open === 'replace' && (
        <div className="rounded-md border border-border p-3 animate-fade-in">
          <ReplaceToken onDone={() => setOpen(null)} />
        </div>
      )}
      {open === 'help' && (
        <TokenHelpDialog address={connection?.baseUrl} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

function AppVersion() {
  const [version, setVersion] = useState('');
  useEffect(() => {
    void appVersion().then(setVersion);
  }, []);
  return <span data-testid="app-version">{version ? `v${version}` : ''}</span>;
}

function AccountSection() {
  const { connection, transport, refreshConnection } = useCanvas();
  const queryClient = useQueryClient();
  return (
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
      {(connection?.method === 'token' || connection?.method === 'dev-proxy') && <TokenRows />}
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
  );
}

function LookSection() {
  const look = useSettings(
    useShallow((s) => ({ background: s.background, widgetStyle: s.widgetStyle })),
  );
  const update = useSettings((s) => s.update);
  const applyWidgetStyle = useDashboard((s) => s.applyWidgetStyle);
  const clearPageBackgrounds = useDashboard((s) => s.clearPageBackgrounds);
  return (
    <Section title="Look">
      <p className="-mt-1 text-sm text-muted">
        A look sets the background and the widget style together, on every page. Each page can have
        its own (Edit › Style), and each widget too (its settings). Every look has a light and a
        dark version, picked by Mode under Appearance.
      </p>
      <LookPicker
        value={look}
        onPick={(l) => {
          update({ background: l.background, widgetStyle: l.widgetStyle });
          applyWidgetStyle(null, l.widgetStyle);
          clearPageBackgrounds();
        }}
      />
      <div className="flex flex-col gap-2">
        <div className="text-sm">Background</div>
        <BackgroundPicker
          value={look.background}
          onChange={(background) => update({ background })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-sm">Widget style</div>
        <SkinPicker value={look.widgetStyle} onChange={(widgetStyle) => update({ widgetStyle })} />
      </div>
    </Section>
  );
}

const readableZone = (zone: string) => zone.replace(/_/g, ' ');

function AppearanceSection() {
  const s = useSettings(
    useShallow((s) => ({
      theme: s.theme,
      accent: s.accent,
      font: s.font,
      fontScale: s.fontScale,
      radius: s.radius,
      barStyle: s.barStyle,
      barFoldAway: s.barFoldAway,
      clock: s.clock,
      timesIn: s.timesIn,
      openItemsIn: s.openItemsIn,
      loadRemoteImages: s.loadRemoteImages,
      weekStartsOn: s.weekStartsOn,
    })),
  );
  const update = useSettings((s) => s.update);
  const canvasZone = useProfile().data?.timeZone ?? null;
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Section title="Appearance">
      <Row
        label="Mode"
        help="Every look has a light and a dark version. High contrast swaps in maximum-contrast colours and keeps each style's shape and fonts."
      >
        <select
          className="input w-auto"
          value={s.theme}
          onChange={(e) => update({ theme: e.target.value as Settings['theme'] })}
        >
          <option value="system">Match system</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="high-contrast">High contrast</option>
        </select>
      </Row>
      <Row
        label="Accent colour"
        help={s.theme === 'high-contrast' ? 'High contrast keeps its own accent.' : undefined}
      >
        <input
          type="color"
          aria-label="Accent colour"
          value={s.accent || '#4f46e5'}
          onChange={(e) => update({ accent: e.target.value })}
          className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
        />
        {s.accent && (
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={() => update({ accent: '' })}
          >
            Reset
          </button>
        )}
      </Row>
      <Row label="Font">
        <select
          className="input w-auto"
          value={s.font}
          onChange={(e) => update({ font: e.target.value as Settings['font'] })}
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
          value={s.fontScale}
          onChange={(e) => update({ fontScale: Number(e.target.value) })}
          className="accent-[rgb(var(--accent))]"
        />
        <span className="w-10 text-right text-xs tabular-nums">
          {Math.round(s.fontScale * 100)}%
        </span>
      </Row>
      <Row label="Corner radius">
        <input
          type="range"
          aria-label="Corner radius"
          min={0}
          max={24}
          value={s.radius}
          onChange={(e) => update({ radius: Number(e.target.value) })}
          className="accent-[rgb(var(--accent))]"
        />
        <span className="w-10 text-right text-xs tabular-nums">{s.radius}px</span>
      </Row>
      <Row label="Top bar" help="Frosted glass that the page shows through, or a plain strip.">
        <select
          className="input w-auto"
          aria-label="Top bar style"
          value={s.barStyle}
          onChange={(e) => update({ barStyle: e.target.value as Settings['barStyle'] })}
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
          checked={s.barFoldAway}
          onChange={(on) => update({ barFoldAway: on })}
        />
      </Row>
      <Row label="Clock">
        <select
          className="input w-auto"
          value={s.clock}
          onChange={(e) => update({ clock: e.target.value as Settings['clock'] })}
        >
          <option value="auto">System default</option>
          <option value="12h">12-hour</option>
          <option value="24h">24-hour</option>
        </select>
      </Row>
      <Row
        label="Show times in"
        help={
          canvasZone
            ? `This computer uses ${readableZone(deviceZone)}; your Canvas account uses ${readableZone(canvasZone)}. Due times, Today and Tomorrow, the clock and quiet hours follow the one chosen here.`
            : 'Your Canvas account doesn’t say which time zone it uses, so times follow this computer.'
        }
      >
        <select
          className="input w-auto"
          aria-label="Show times in"
          value={canvasZone ? s.timesIn : 'device'}
          disabled={!canvasZone}
          onChange={(e) => update({ timesIn: e.target.value as Settings['timesIn'] })}
        >
          <option value="device">This computer’s time zone</option>
          <option value="canvas">Canvas’s time zone</option>
        </select>
      </Row>
      <Row
        label="Clicking an assignment or announcement"
        help="Tarpaulin keeps a read-only copy; submitting and replying happen in Canvas."
      >
        <select
          className="input w-auto"
          aria-label="Clicking an assignment or announcement"
          value={s.openItemsIn}
          onChange={(e) => update({ openItemsIn: e.target.value as Settings['openItemsIn'] })}
        >
          <option value="app">Read it in Tarpaulin</option>
          <option value="canvas">Open it in Canvas</option>
        </select>
      </Row>
      <Row
        label="Load images from other sites"
        help="Images in Canvas content that are hosted elsewhere can tell that site you opened it. Off shows a placeholder to click instead."
      >
        <Switch
          hideLabel
          label="Load images from other sites"
          checked={s.loadRemoteImages}
          onChange={(on) => update({ loadRemoteImages: on })}
        />
      </Row>
      <Row label="Week starts on">
        <select
          className="input w-auto"
          value={s.weekStartsOn}
          onChange={(e) => update({ weekStartsOn: e.target.value as Settings['weekStartsOn'] })}
        >
          <option value="monday">Monday</option>
          <option value="sunday">Sunday</option>
        </select>
      </Row>
    </Section>
  );
}

function CoursesSection() {
  const catalog = useCatalog();
  const courseScope = useSettings((s) => s.courseScope);
  const nicknames = useSettings((s) => s.courseNicknames);
  const update = useSettings((s) => s.update);
  const setCourseColor = useSettings((s) => s.setCourseColor);
  const setCourseNickname = useSettings((s) => s.setCourseNickname);
  const toggleCourseHidden = useSettings((s) => s.toggleCourseHidden);
  const term = catalog.currentTerm;
  return (
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
          value={courseScope}
          onChange={(e) => update({ courseScope: e.target.value as Settings['courseScope'] })}
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
          const nickname = nicknames[c.id] ?? '';
          return (
            <div className={`flex flex-wrap items-center gap-2 py-2 ${hidden ? 'opacity-50' : ''}`}>
              <input
                type="color"
                aria-label={`Colour for ${c.canvasName}`}
                value={c.color}
                onChange={(e) => setCourseColor(c.id, e.target.value)}
                className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent"
              />
              <div className="min-w-0 flex-1">
                <input
                  // Remounts when the saved nickname changes underneath (a reset or an import).
                  key={nickname}
                  aria-label={`Nickname for ${c.canvasName}`}
                  className="input py-1"
                  placeholder={c.canvasName}
                  defaultValue={nickname}
                  onBlur={(e) => setCourseNickname(c.id, e.target.value)}
                />
                <div className="mt-0.5 truncate text-xs text-muted">
                  {c.canvasName} · {c.term?.name ?? 'No term'}
                </div>
              </div>
              <button
                type="button"
                className="btn px-2 py-1 text-xs"
                onClick={() => toggleCourseHidden(c.id)}
              >
                {hidden ? 'Show' : 'Hide'}
              </button>
            </div>
          );
        }}
      />
    </Section>
  );
}

function DataSection() {
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
      { includeSettings, includeLocalData: includeData },
    );
    const name = `tarpaulin-dashboard-${new Date().toISOString().slice(0, 10)}.json`;
    // Desktop: the native save dialog (webviews there don't all handle downloads).
    if (nativeSaveSupported()) {
      setMessage(null);
      try {
        const path = await saveExport(name, json);
        if (path) setMessage({ tone: 'ok', text: `Exported to ${path}.` });
      } catch (e) {
        setMessage({ tone: 'error', text: `Export failed: ${String(e)}` });
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    // Attached, and revoked later: WebKit drops a download whose URL is revoked straight away.
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setMessage({ tone: 'ok', text: `Exported as ${name}, in your downloads.` });
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
          value={refreshMinutes}
          onChange={(e) =>
            update({ refreshMinutes: Math.min(120, Math.max(1, Number(e.target.value) || 10)) })
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
      <div className="flex flex-col gap-2">
        <Row label="Export dashboard" help="Pages, widgets and their settings as a JSON file.">
          <button type="button" className="btn" onClick={() => void doExport()}>
            <Download className="h-4 w-4" /> Export
          </button>
        </Row>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Switch
            label="Include settings"
            checked={includeSettings}
            onChange={setIncludeSettings}
          />
          <Switch
            label="Include notes and checklists"
            checked={includeData}
            onChange={setIncludeData}
          />
        </div>
      </div>
      <Row label="Import dashboard" help="Asks whether to replace your pages or add to them.">
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
      >
        <button type="button" className="btn" onClick={() => void resetLookAndCourses()}>
          <RotateCcw className="h-4 w-4" /> Reset…
        </button>
      </Row>
      {dialog}
    </Section>
  );
}

export function SettingsPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </button>
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>
      <AccountSection />
      <LookSection />
      <AppearanceSection />
      <CoursesSection />
      <DataSection />
      <NotificationsSection />
      <StartupSection />
      <UpdatesSection />
      <p className="pb-6 text-center text-xs text-muted">
        Tarpaulin <AppVersion /> · reads Canvas only. Notes and checklists stay on this device.
      </p>
    </div>
  );
}
