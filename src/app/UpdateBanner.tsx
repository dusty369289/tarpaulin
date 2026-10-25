import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, Loader2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Markdown } from '../lib/markdown';
import { Banner } from '../ui';
import { onTrayRefresh } from './desktop';
import {
  appVersion,
  skippedVersion,
  skipVersion,
  updatedFrom,
  useAutoUpdateCheck,
  useUpdater,
} from './updater';

/** After an update: a brief confirmation, so the restart doesn't feel like a crash. */
function UpdatedNote() {
  const [version, setVersion] = useState<string | null>(null);
  const [open, setOpen] = useState(() => updatedFrom() !== null);
  useEffect(() => {
    if (!open) return;
    void appVersion().then(setVersion);
    const t = setTimeout(() => setOpen(false), 8000);
    return () => clearTimeout(t);
  }, [open]);
  if (!open) return null;
  return (
    <Banner tone="success" icon={CheckCircle2} truncate onDismiss={() => setOpen(false)}>
      Updated to Tarpaulin {version ?? ''} (from {updatedFrom()}).
    </Banner>
  );
}

/** The tray's Refresh reloads Canvas data while the dashboard is showing. */
function useTrayRefresh() {
  const queryClient = useQueryClient();
  useEffect(
    () => onTrayRefresh(() => void queryClient.invalidateQueries({ queryKey: ['canvas'] })),
    [queryClient],
  );
}

/** A release's notes (Markdown from the GitHub release), folded under the banner. */
export function ReleaseNotes({
  id,
  notes,
  className = 'border-b border-border bg-surface px-4 py-3',
}: {
  id?: string;
  notes: string;
  /** Replaces the banner's own frame (its border, background and padding). */
  className?: string;
}) {
  return (
    <div
      id={id}
      className={`max-h-64 overflow-y-auto text-sm ${className}`}
      data-testid="release-notes"
    >
      <Markdown source={notes} />
    </div>
  );
}

/**
 * A slim bar under the header when a new version is available. Also the dashboard's hook into
 * the desktop shell: background update checks and the tray's Refresh.
 */
export function UpdateBanner() {
  useAutoUpdateCheck();
  useTrayRefresh();
  const { state, install } = useUpdater();
  // "Remind me later" hides this check's result; the next check (a new state) shows it again. A
  // skipped version stays hidden until the user checks by hand, which forgets the skip.
  const [dismissed, setDismissed] = useState<typeof state | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const notesId = useId();
  const update = 'update' in state ? state.update : null;
  // A background download for installing on quit stays out of the way until it's ready.
  const quiet = state.status === 'downloading' && state.background;
  if (!update || quiet || dismissed === state || skippedVersion() === update.version)
    return <UpdatedNote />;
  const ready = state.status === 'ready';
  const busy = state.status === 'downloading' || state.status === 'installing';
  const pct =
    state.status === 'downloading' && state.total
      ? Math.round((state.received / state.total) * 100)
      : null;
  const notes = update.notes?.trim();
  return (
    <>
      <Banner
        tone="accent"
        icon={Download}
        truncate
        testId="update-banner"
        actions={
          <>
            {notes && (
              <button
                type="button"
                className="btn btn-ghost py-1"
                aria-expanded={notesOpen}
                aria-controls={notesId}
                onClick={() => setNotesOpen(!notesOpen)}
              >
                What’s new
              </button>
            )}
            {!busy && (
              <button
                type="button"
                className="btn btn-ghost py-1"
                onClick={() => {
                  skipVersion(update.version);
                  setDismissed(state);
                }}
              >
                Skip this version
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary py-1"
              onClick={() => void install()}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {ready ? 'Restart now' : 'Update now'}
            </button>
          </>
        }
        onDismiss={busy ? undefined : () => setDismissed(state)}
        dismissLabel="Remind me later"
      >
        {ready
          ? `Tarpaulin ${update.version} is ready — it installs when you quit`
          : `Tarpaulin ${update.version} is available`}
        {busy &&
          ` — ${state.status === 'installing' ? 'installing…' : pct !== null ? `downloading ${pct}%` : 'downloading…'}`}
      </Banner>
      {notes && notesOpen && <ReleaseNotes id={notesId} notes={notes} />}
    </>
  );
}
