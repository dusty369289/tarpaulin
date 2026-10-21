import type { LoadStatus } from '../../canvas/hooks';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

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

export function ErrorState({ error }: { error: unknown }) {
  return (
    <EmptyState icon={<AlertTriangle className="h-5 w-5 text-danger" aria-hidden />}>
      <span className="text-danger">Couldn’t load from Canvas.</span>
      <div className="mt-1 line-clamp-3 text-xs">
        {error instanceof Error ? error.message : String(error)}
      </div>
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
  if (failed) return <ErrorState error={failed.error} />;
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
