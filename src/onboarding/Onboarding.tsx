import { KeyRound, Loader2, LogIn, PlugZap } from 'lucide-react';
import { useState } from 'react';
import { useCanvas } from '../canvas/CanvasProvider';

const REDIRECTS = [43821, 43822, 43823].map((p) => `http://127.0.0.1:${p}/oauth/callback`);

export function Onboarding() {
  const { transport, refreshConnection } = useCanvas();
  const [method, setMethod] = useState<'token' | 'oauth'>('token');
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!transport.canManageCredentials) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Not connected to Canvas</h1>
        <p className="text-sm text-muted">
          You’re running Tarpaulin in a browser, which reads Canvas through the development proxy.
          Set
          <code className="mx-1 rounded bg-surface-2 px-1">CANVAS_BASE_URL</code>and
          <code className="mx-1 rounded bg-surface-2 px-1">CANVAS_TOKEN</code>in the environment
          that runs
          <code className="mx-1 rounded bg-surface-2 px-1">pnpm dev</code>, then restart it. The
          token never reaches the browser.
        </p>
        <button type="button" className="btn self-start" onClick={() => refreshConnection()}>
          <PlugZap className="h-4 w-4" /> Check again
        </button>
      </Shell>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (method === 'token') await transport.connectWithToken(baseUrl, token);
      else await transport.connectWithOAuth(baseUrl, clientId, clientSecret);
      await refreshConnection();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const ready =
    baseUrl.trim() && (method === 'token' ? token.trim() : clientId.trim() && clientSecret.trim());
  return (
    <Shell>
      <div>
        <h1 className="text-xl font-semibold">Connect to Canvas</h1>
        <p className="text-sm text-muted">
          Tarpaulin only reads from Canvas. It never submits, edits or marks anything.
        </p>
      </div>
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-theme bg-surface-2 p-1 text-sm">
        {(['token', 'oauth'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={method === m}
            type="button"
            onClick={() => setMethod(m)}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 transition ${method === m ? 'bg-surface font-semibold shadow-sm' : 'text-muted'}`}
          >
            {m === 'token' ? <KeyRound className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            {m === 'token' ? 'Access token' : 'Sign in (OAuth)'}
          </button>
        ))}
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void submit();
        }}
      >
        <div>
          <label className="label" htmlFor="base-url">
            Canvas address
          </label>
          <input
            id="base-url"
            className="input"
            placeholder="canvas.youruni.edu"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            autoComplete="url"
          />
        </div>
        {method === 'token' ? (
          <div>
            <label className="label" htmlFor="token">
              Access token
            </label>
            <input
              id="token"
              type="password"
              className="input"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-muted">
              In Canvas: <b>Account → Settings → Approved Integrations → + New Access Token</b>.
              It’s stored in your system keychain.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="client-id">
                  Client ID
                </label>
                <input
                  id="client-id"
                  className="input"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="client-secret">
                  Client secret
                </label>
                <input
                  id="client-secret"
                  type="password"
                  className="input"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted">
              Your institution’s Canvas admin creates a developer key with these redirect URIs:
              {REDIRECTS.map((r) => (
                <code key={r} className="mt-0.5 block rounded bg-surface-2 px-1">
                  {r}
                </code>
              ))}
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary justify-center" disabled={!ready || busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {method === 'token'
            ? 'Test & connect'
            : busy
              ? 'Waiting for Canvas in your browser…'
              : 'Sign in with Canvas'}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="card flex w-full max-w-md flex-col gap-4 p-6 shadow-xl animate-pop-in">
        <img src="/icon.png" alt="Tarpaulin" className="h-10 w-10" />
        {children}
      </div>
    </div>
  );
}
