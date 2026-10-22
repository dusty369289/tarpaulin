import { Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCanvas } from '../../canvas/CanvasProvider';
import { Row, Section, SwitchRow, useSettingsFilter } from '../../ui';
import { useSettings } from '../settingsStore';
import { ReleaseNotes } from '../UpdateBanner';
import { appVersion, useUpdater } from '../updater';

/** The app's version ('' until it's known). */
function useAppVersion() {
  const [version, setVersion] = useState('');
  useEffect(() => {
    void appVersion().then(setVersion);
  }, []);
  return version;
}

function UpdatesSection() {
  const { state, check, install } = useUpdater();
  const autoCheck = useSettings((s) => s.autoCheckUpdates);
  const update = useSettings((s) => s.update);
  const version = useAppVersion();
  const busy =
    state.status === 'checking' || state.status === 'downloading' || state.status === 'installing';
  const offered =
    state.status === 'available' || state.status === 'downloading' || state.status === 'installing';
  return (
    <Section title="Updates">
      <Row
        label="Version"
        help={
          state.status === 'unsupported' ? 'Updates are installed by the desktop app.' : undefined
        }
        keywords="about updates"
      >
        <span className="chip bg-surface-2 text-muted">{version || '…'}</span>
      </Row>
      {state.status !== 'unsupported' && (
        <>
          <SwitchRow
            label="Check for updates automatically"
            help="Once a day, from GitHub Releases."
            keywords="auto update"
            checked={autoCheck}
            onChange={(on) => update({ autoCheckUpdates: on })}
          />
          <Row
            label={
              offered
                ? `Version ${state.update.version} is available`
                : state.status === 'current'
                  ? 'You’re up to date'
                  : state.status === 'error'
                    ? 'Couldn’t check for updates'
                    : 'Updates'
            }
            help={state.status === 'error' ? state.message : undefined}
            keywords="check for updates what’s new"
            below={
              'update' in state &&
              state.update.notes && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted">What’s new</summary>
                  <ReleaseNotes
                    notes={state.update.notes}
                    className="mt-2 rounded-md border border-border bg-surface-2 px-3 py-2"
                  />
                </details>
              )
            }
          >
            {offered ? (
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
  const version = useAppVersion();
  return <span data-testid="app-version">{version ? `v${version}` : ''}</span>;
}

const SOURCE_URL = 'https://github.com/dusty369289/tarpaulin';

/** The credit and source link that NOTICE.md asks every copy, and every modified version, to keep. */
function Credit() {
  const { transport } = useCanvas();
  return (
    <p className="px-1 py-2 text-center text-xs text-muted">
      Tarpaulin <AppVersion /> by Ethan Wright · reads Canvas only. Notes and checklists stay on
      this device.
      <br />
      Free software under the GNU GPL v3 ·{' '}
      <button
        type="button"
        className="underline underline-offset-2 hover:text-text"
        onClick={() => void transport.openWebLink(SOURCE_URL).catch(() => {})}
      >
        Source code and license
      </button>
    </p>
  );
}

export function AboutSettings() {
  // The credit stays out of search results: it isn't a setting, and every view of About has it.
  const query = useSettingsFilter();
  return (
    <>
      <UpdatesSection />
      {!query && <Credit />}
    </>
  );
}
