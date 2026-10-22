import { canvasErrorKind, canvasErrorStatus, type CanvasErrorKind } from '../../canvas/errors';
import type { LoadStatus } from '../../canvas/hooks';
import { AlertTriangle, Inbox, Loader2, RotateCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export function EmptyState({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center gap-1 px-2 py-4 text-center text-sm text-muted [justify-content:safe_center]">
      {icon ?? <Inbox className="h-5 w-5 opacity-60" aria-hidden />}
      <div>{children}</div>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center text-muted" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span className="sr-only">Loading</span>
    </div>
  );
}

const HEADLINES: Record<CanvasErrorKind, string> = {
  offline: 'You’re offline.',
  server: 'Canvas is having trouble.',
  rate_limited: 'Canvas asked us to slow down.',
  auth: 'Canvas didn’t accept your login.',
  keychain: 'Tarpaulin couldn’t read your saved login.',
  forbidden: 'Canvas won’t show this to your account.',
  not_found: 'Canvas couldn’t find this.',
  other: 'Couldn’t load from Canvas.',
};
const HINTS: Partial<Record<CanvasErrorKind, string>> = {
  offline: 'Tarpaulin couldn’t reach Canvas. Check your connection.',
  server: 'Try again in a minute.',
  rate_limited: 'Wait a minute, then try again.',
  auth: 'Reconnect from Settings.',
  keychain: 'Unlock your system keychain, then try again.',
};

/** Canvas's own wording from a JSON error body: {"errors":[{"message":…}]} or {"message":…}. */
function canvasMessage(body: string): string | null {
  try {
    const json = JSON.parse(body) as { errors?: unknown; message?: unknown };
    const first = Array.isArray(json.errors)
      ? (json.errors[0] as { message?: unknown } | undefined)?.message
      : undefined;
    const msg = first ?? json.message;
    return typeof msg === 'string' ? msg : null;
  } catch {
    return null;
  }
}

export interface ErrorDescription {
  kind: CanvasErrorKind;
  headline: string;
  hint?: string;
  /** The HTTP status and what Canvas said, never a raw response body. */
  details: string;
}

/** An error in plain words: a headline for its kind, a hint, and details for the curious. */
export function describeError(error: unknown): ErrorDescription {
  const kind = canvasErrorKind(error);
  const status = canvasErrorStatus(error);
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const at = text.search(/[[{]/);
  const said = at >= 0 ? canvasMessage(text.slice(at)) : null;
  // Without a status the message is our own (the keychain, the network), so it's shown as is,
  // minus any markup or response body.
  const own = status === null ? (at >= 0 ? text.slice(0, at) : text) : '';
  const parts = [
    status !== null ? `HTTP ${status}` : '',
    said ?? '',
    own.replace(/<[^>]*>/g, ' ').replace(/[\s:]+$/, ''),
  ];
  const details = parts.filter(Boolean).join(' · ').trim().slice(0, 200) || 'No more detail.';
  return { kind, headline: HEADLINES[kind], hint: HINTS[kind], details };
}

export function ErrorState({
  error,
  onRetry,
  retrying = false,
}: {
  error: unknown;
  /** Shows a Retry button that fetches the failing data again. */
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { headline, hint, details } = describeError(error);
  // Rendered only when asked for, so the details never crowd a small widget.
  const [showDetails, setShowDetails] = useState(false);
  return (
    <EmptyState icon={<AlertTriangle className="h-5 w-5 text-danger" aria-hidden />}>
      <span className="text-danger">{headline}</span>
      {hint && <div className="mt-1 text-xs">{hint}</div>}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
        {onRetry && (
          <button
            type="button"
            className="btn px-2 py-1 text-xs"
            onClick={onRetry}
            disabled={retrying}
          >
            <RotateCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} aria-hidden />
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost px-2 py-1 text-xs"
          aria-expanded={showDetails}
          onClick={() => setShowDetails(!showDetails)}
        >
          Details
        </button>
      </div>
      {showDetails && <div className="mt-1 line-clamp-3 break-words text-xs">{details}</div>}
    </EmptyState>
  );
}

/** Shows loading/error states for the given queries, or the children once all have data. */
export function QueryGate({
  queries,
  children,
}: {
  queries: LoadStatus[];
  children: () => ReactNode;
}) {
  const failed = queries.find((q) => q.isError && !q.data);
  if (failed) {
    const again = queries.filter((q) => q.isError && q.refetch);
    return (
      <ErrorState
        error={failed.error}
        onRetry={again.length ? () => again.forEach((q) => void q.refetch!()) : undefined}
        retrying={again.some((q) => q.isFetching)}
      />
    );
  }
  if (queries.some((q) => q.isLoading)) return <LoadingState />;
  return <>{children()}</>;
}

export function CourseDot({ color, className = '' }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: color }}
    />
  );
}

const BADGE_TONES = {
  danger: 'bg-danger/15 text-danger',
  warning: 'bg-warning/15 text-warning',
  success: 'bg-success/15 text-success',
  accent: 'bg-accent/15 text-accent',
  muted: 'bg-surface-2 text-muted',
} as const;

export function Badge({ tone, children }: { tone: keyof typeof BADGE_TONES; children: ReactNode }) {
  return <span className={`chip ${BADGE_TONES[tone]}`}>{children}</span>;
}

export function LinkButton({
  onClick,
  children,
  className = '',
  title,
}: {
  onClick: () => void;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`max-w-full text-left hover:underline focus-visible:underline ${className}`}
    >
      {children}
    </button>
  );
}
