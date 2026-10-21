import { format } from 'date-fns';
import { Clock, KeyRound, LogIn } from 'lucide-react';
import { useState } from 'react';
import { useCanvas } from '../canvas/CanvasProvider';
import { useTimeFormat } from '../lib/dates';
import { TokenHelpDialog } from '../onboarding/TokenHelp';
import { Banner } from '../ui';
import { Modal } from './Modal';
import { ReplaceToken } from './ReplaceToken';
import { useAuthFailure, useExpiryWarning } from './tokenHealth';

/** "Tue 3 Nov 2026, 14:00", in the user's 12/24-hour clock. */
export function useFormatExpiry() {
  const time = useTimeFormat();
  return (iso: string) => format(new Date(iso), `EEE d MMM yyyy, ${time}`);
}

/**
 * Token trouble, under the header. "Rejected" stays until a request with a working token
 * succeeds; "expiring soon" shows 14 and again 3 days ahead, each dismissible on its own.
 */
export function TokenBanner() {
  const { connection, transport, refreshConnection } = useCanvas();
  const rejected = useAuthFailure();
  const { warning, dismiss } = useExpiryWarning();
  const [open, setOpen] = useState<'help' | 'replace' | null>(null);
  const formatExpiry = useFormatExpiry();

  const dialogs = (
    <>
      {open === 'help' && (
        <TokenHelpDialog address={connection?.baseUrl} onClose={() => setOpen(null)} />
      )}
      {open === 'replace' && (
        <Modal title="Replace your access token" onClose={() => setOpen(null)}>
          <ReplaceToken onDone={() => setOpen(null)} />
        </Modal>
      )}
    </>
  );
  const fixButtons = (
    <>
      <button type="button" className="btn py-1" onClick={() => setOpen('help')}>
        How to get a token
      </button>
      <button type="button" className="btn btn-primary py-1" onClick={() => setOpen('replace')}>
        <KeyRound className="h-4 w-4" aria-hidden /> Paste a new token
      </button>
    </>
  );

  if (rejected && connection?.method === 'oauth') {
    // OAuth refreshes itself; this means Canvas revoked the sign-in. Disconnecting keeps the
    // layout and settings, and the sign-in screen takes it from there.
    return (
      <Banner tone="danger" icon={LogIn} role="alert" testId="token-banner">
        Canvas signed Tarpaulin out. Sign in again to keep your dashboard up to date.
        <span className="ml-2">
          <button
            type="button"
            className="btn btn-primary py-1"
            onClick={async () => {
              await transport.disconnect();
              await refreshConnection();
            }}
          >
            Sign in again
          </button>
        </span>
      </Banner>
    );
  }
  if (rejected) {
    return (
      <>
        <Banner
          tone="danger"
          icon={KeyRound}
          role="alert"
          testId="token-banner"
          actions={fixButtons}
        >
          <b>Your Canvas access token has expired or been revoked.</b> Tarpaulin is showing the last
          data it loaded. Make a new token in Canvas and paste it here.
        </Banner>
        {dialogs}
      </>
    );
  }
  if (warning) {
    const when = formatExpiry(warning.expiresAt);
    return (
      <>
        <Banner
          tone="warning"
          icon={Clock}
          testId="token-expiry-banner"
          actions={fixButtons}
          onDismiss={dismiss}
          dismissLabel={warning.threshold > 3 ? 'Remind me 3 days before' : 'Dismiss'}
        >
          {warning.threshold === 0 ? (
            <>Your Canvas access token expired on {when}.</>
          ) : (
            <>
              Your Canvas access token expires in{' '}
              <b>{warning.daysLeft === 1 ? '1 day' : `${warning.daysLeft} days`}</b> ({when}). Make
              a new one before then so Tarpaulin keeps working.
            </>
          )}
        </Banner>
        {dialogs}
      </>
    );
  }
  return null;
}
