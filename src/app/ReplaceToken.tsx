import { HelpCircle, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useCanvas } from '../canvas/CanvasProvider';
import { isAuthError } from '../canvas/token';
import { TokenHelp } from '../onboarding/TokenHelp';
import { useAfterTokenChange } from './tokenHealth';

/** Shown when Canvas won't take the token, wherever a token is typed. */
export function tokenErrorMessage(e: unknown): string {
  return isAuthError(e)
    ? 'Canvas didn’t accept that token. Check you copied all of it, and that it hasn’t expired or been deleted.'
    : e instanceof Error
      ? e.message
      : String(e);
}

/**
 * Swaps the access token for a new one on the same Canvas, in place: the dashboard, its layout
 * and every setting stay as they are, and everything reloads with the new token.
 */
export function ReplaceToken({ onDone }: { onDone?: () => void }) {
  const { transport, connection } = useCanvas();
  const afterChange = useAfterTokenChange();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  if (!transport.canManageCredentials) {
    // The browser build reads Canvas through the dev proxy, which holds the token itself.
    return (
      <div className="flex flex-col gap-3 text-sm" data-testid="replace-token">
        <p className="text-muted">
          In the browser the token comes from
          <code className="mx-1 rounded bg-surface-2 px-1">CANVAS_TOKEN</code>
          where <code className="mx-1 rounded bg-surface-2 px-1">pnpm dev</code> runs. Set the new
          one there and restart it, then check again.
        </p>
        <button
          type="button"
          className="btn self-start"
          onClick={() => void afterChange().then(() => onDone?.())}
        >
          <RefreshCw className="h-4 w-4" /> Check again
        </button>
      </div>
    );
  }

  const submit = async () => {
    if (!connection?.baseUrl) return;
    setBusy(true);
    setError(null);
    try {
      await transport.connectWithToken(connection.baseUrl, token);
      setToken('');
      await afterChange();
      onDone?.();
    } catch (e) {
      setError(tokenErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      data-testid="replace-token"
      onSubmit={(e) => {
        e.preventDefault();
        if (token.trim()) void submit();
      }}
    >
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <label className="label" htmlFor="replace-token">
            New access token for {connection?.baseUrl?.replace(/^https?:\/\//, '')}
          </label>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            aria-expanded={help}
            onClick={() => setHelp(!help)}
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden /> How to get a token
          </button>
        </div>
        <input
          id="replace-token"
          type="password"
          className="input"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
        />
      </div>
      {help && (
        <div className="rounded-md border border-border p-3 animate-fade-in">
          <TokenHelp address={connection?.baseUrl} />
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="btn btn-primary justify-center"
        disabled={!token.trim() || busy}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Test & save token
      </button>
      <p className="text-xs text-muted">Your dashboard, layout and settings stay as they are.</p>
    </form>
  );
}
