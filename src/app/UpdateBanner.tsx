import { CheckCircle2, Download, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Banner } from '../ui';
import { appVersion, updatedFrom, useAutoUpdateCheck, useUpdater } from './updater';

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

/** A slim bar under the header when a new version is available. */
export function UpdateBanner() {
  useAutoUpdateCheck();
  const { state, install } = useUpdater();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const update = 'update' in state ? state.update : null;
  if (!update || dismissed === update.version) return <UpdatedNote />;
  const busy = state.status === 'downloading' || state.status === 'installing';
  const pct =
    state.status === 'downloading' && state.total
      ? Math.round((state.received / state.total) * 100)
      : null;
  return (
    <Banner
      tone="accent"
      icon={Download}
      truncate
      actions={
        <button
          type="button"
          className="btn btn-primary py-1"
          onClick={() => void install()}
          disabled={busy}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Update now
        </button>
      }
      onDismiss={busy ? undefined : () => setDismissed(update.version)}
      dismissLabel="Remind me later"
    >
      Tarpaulin {update.version} is available
      {busy &&
        ` — ${state.status === 'installing' ? 'installing…' : pct !== null ? `downloading ${pct}%` : 'downloading…'}`}
    </Banner>
  );
}
