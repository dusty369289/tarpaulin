import { X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

// Literal class names, so Tailwind sees them. Tinted with the theme's own tokens, which the
// high-contrast theme sets too.
const TONES = {
  accent: { bar: 'bg-accent/10', icon: 'text-accent' },
  success: { bar: 'bg-success/10', icon: 'text-success' },
  warning: { bar: 'bg-warning/10', icon: 'text-warning' },
  danger: { bar: 'bg-danger/10', icon: 'text-danger' },
} as const;

/** A slim full-width bar under the header: an update, a token problem, a confirmation. */
export function Banner({
  tone,
  icon: Icon,
  children,
  actions,
  onDismiss,
  dismissLabel = 'Dismiss',
  role = 'status',
  truncate,
  testId,
}: {
  tone: keyof typeof TONES;
  icon: LucideIcon;
  children: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  /** 'alert' for problems that need the user; 'status' for news. */
  role?: 'status' | 'alert';
  /** Keep the message to one line (short messages that sit beside one button). */
  truncate?: boolean;
  testId?: string;
}) {
  const t = TONES[tone];
  return (
    <div
      role={role}
      data-testid={testId}
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2 text-sm animate-fade-in ${t.bar}`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${t.icon}`} aria-hidden />
      <span className={`min-w-0 flex-1 ${truncate ? 'truncate' : ''}`}>{children}</span>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      {onDismiss && (
        <button type="button" className="btn-icon" aria-label={dismissLabel} onClick={onDismiss}>
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
