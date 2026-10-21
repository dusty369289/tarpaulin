import { ExternalLink, Info, ShieldCheck } from 'lucide-react';
import { Modal } from '../app/Modal';
import { useCanvas } from '../canvas/CanvasProvider';
import { canvasSettingsUrl } from '../canvas/token';

/**
 * How to make a Canvas access token, step by step. The one copy of these instructions: the
 * sign-in screen shows it inline, and the token banners and Settings open it in a dialog.
 * `address` is the Canvas address typed or connected, for a direct link to its settings page.
 */
export function TokenHelp({ address }: { address?: string | null }) {
  const { transport } = useCanvas();
  const settingsUrl = canvasSettingsUrl(address);
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="token-help">
      <ol className="ml-5 flex list-decimal flex-col gap-1.5 marker:text-muted">
        <li>
          Sign in to Canvas in your browser and open <b>Account → Settings</b>.
          {settingsUrl ? (
            <button
              type="button"
              className="btn mt-1.5 flex max-w-full py-1"
              // Our own link to the address the user typed; http(s) only, checked again in Rust.
              onClick={() => void transport.openWebLink(settingsUrl).catch(() => {})}
            >
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">Open {settingsUrl.replace(/^https?:\/\//, '')}</span>
            </button>
          ) : (
            <span className="block text-xs text-muted">
              Type your Canvas address above for a direct link.
            </span>
          )}
        </li>
        <li>
          Scroll to <b>Approved Integrations</b> and click <b>+ New Access Token</b>.
        </li>
        <li>
          Give it a purpose, like <i>Tarpaulin</i>. That’s only a label for you.
        </li>
        <li>
          Optionally pick an expiry date. Without one, the token works until you delete it.
          Tarpaulin warns you before a dated token runs out.
        </li>
        <li>
          Click <b>Generate Token</b> and copy it straight away: Canvas shows it only once.
        </li>
        <li>
          Paste it into the <b>Access token</b> box here.
        </li>
      </ol>
      <p className="flex gap-2 rounded-md bg-surface-2 p-2.5 text-xs">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
        <span>
          Some universities turn access tokens off, or make every token expire after a set time. If
          there’s no <b>+ New Access Token</b> button, ask your university’s Canvas support whether
          they allow tokens or can set up sign-in (OAuth).
        </span>
      </p>
      <p className="flex gap-2 rounded-md bg-surface-2 p-2.5 text-xs">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
        <span>
          The token stays in your system keychain, and Tarpaulin only ever reads from Canvas: it
          never submits, edits or marks anything. Deleting the token in Canvas cuts Tarpaulin off at
          once.
        </span>
      </p>
    </div>
  );
}

export function TokenHelpDialog({
  address,
  onClose,
}: {
  address?: string | null;
  onClose: () => void;
}) {
  return (
    <Modal title="How to get an access token" onClose={onClose}>
      <TokenHelp address={address} />
    </Modal>
  );
}
