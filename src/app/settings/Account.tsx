import { useQueryClient } from '@tanstack/react-query';
import { HelpCircle, KeyRound, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useCanvas } from '../../canvas/CanvasProvider';
import { TokenHelpDialog } from '../../onboarding/TokenHelp';
import { Row, Section } from '../../ui';
import { ReplaceToken } from '../ReplaceToken';
import { useFormatExpiry } from '../TokenBanner';
import { useAuthFailure, useTokenExpiry } from '../tokenHealth';

/** The access token's health, its expiry date, and the help and replace-in-place controls. */
function TokenRow() {
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
    <Row
      label="Access token"
      help={status}
      helpTone={rejected ? 'danger' : undefined}
      keywords="replace expiry expires how to get a token"
      testId="token-status"
      below={
        <>
          {open === 'replace' && (
            <div className="rounded-md border border-border bg-surface-2/40 p-3 animate-fade-in">
              <ReplaceToken onDone={() => setOpen(null)} />
            </div>
          )}
          {open === 'help' && (
            <TokenHelpDialog address={connection?.baseUrl} onClose={() => setOpen(null)} />
          )}
        </>
      }
    >
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
    </Row>
  );
}

export function AccountSettings() {
  const { connection, transport, refreshConnection } = useCanvas();
  const queryClient = useQueryClient();
  return (
    <>
      <Section>
        <Row label="Canvas" help={connection?.baseUrl ?? 'Not connected'} keywords="connection">
          <span className="chip bg-surface-2 text-muted">
            {connection?.method === 'oauth'
              ? 'OAuth'
              : connection?.method === 'token'
                ? 'Access token'
                : connection?.method}
          </span>
        </Row>
        {(connection?.method === 'token' || connection?.method === 'dev-proxy') && <TokenRow />}
      </Section>
      {transport.canManageCredentials && (
        <Section tone="danger">
          <Row
            label="Disconnect"
            help="Removes the credentials from your keychain. Your pages and settings stay on this device."
            keywords="sign out log out"
          >
            <button
              type="button"
              className="btn border-danger/50 text-danger hover:bg-danger/10"
              onClick={async () => {
                await transport.disconnect();
                queryClient.removeQueries({ queryKey: ['canvas'] });
                await refreshConnection();
              }}
            >
              <LogOut className="h-4 w-4" /> Disconnect
            </button>
          </Row>
        </Section>
      )}
    </>
  );
}
