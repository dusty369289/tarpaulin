import { Download, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { useAutoUpdateCheck, useUpdater } from './updater';

/** A slim bar under the header when a new version is available. */
export function UpdateBanner() {
  useAutoUpdateCheck();
  const { state, install } = useUpdater();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const update = 'update' in state ? state.update : null;
  if (!update || dismissed === update.version) return null;
  const busy = state.status === 'downloading' || state.status === 'installing';
  const pct =
    state.status === 'downloading' && state.total
      ? Math.round((state.received / state.total) * 100)
      : null;
  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b border-border bg-accent/10 px-4 py-2 text-sm animate-fade-in"
    >
      <Download className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        Tarpaulin {update.version} is available
        {busy &&
          ` — ${state.status === 'installing' ? 'installing…' : pct !== null ? `downloading ${pct}%` : 'downloading…'}`}
      </span>
      <button
        type="button"
        className="btn btn-primary py-1"
        onClick={() => void install()}
        disabled={busy}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Install & restart
      </button>
      {!busy && (
        <button
          type="button"
          className="btn-icon"
          aria-label="Remind me later"
          onClick={() => setDismissed(update.version)}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
