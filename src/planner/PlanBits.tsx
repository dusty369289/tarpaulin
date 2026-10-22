import { ListChecks } from 'lucide-react';
import { PlanStatusIcon } from './PlanStatusIcon';
import { formatDoDate, nextStatus, STATUS_LABEL, type PlanSummary } from './selectors';
import type { PlanStatus } from './store';

// Small pieces of a plan shown beside Canvas work elsewhere (Due soon's rows, the reader's
// panel), so they read the same everywhere.

/** "2/4" with a checklist mark, read out as "2 of 4 steps done"; nothing without steps. */
export function StepProgress({
  done,
  total,
  className = '',
}: {
  done: number;
  total: number;
  className?: string;
}) {
  if (total === 0) return null;
  const label = `${done} of ${total} steps done`;
  return (
    <span
      className={`inline-flex items-center gap-0.5 whitespace-nowrap ${className}`}
      aria-label={label}
      title={label}
    >
      <ListChecks className="h-3 w-3" aria-hidden />
      {done}/{total}
    </span>
  );
}

/** The do-date and checklist progress, for a row's meta line. */
export function PlanChips({
  summary,
  now,
  timeFmt,
}: {
  summary: PlanSummary;
  now: Date;
  timeFmt: string;
}) {
  return (
    <>
      {summary.doDate && (
        <span className="chip chip-tone whitespace-nowrap [--tone:var(--accent)]">
          Plan: {formatDoDate(summary.doDate, now, timeFmt)}
        </span>
      )}
      <StepProgress done={summary.stepsDone} total={summary.stepsTotal} />
    </>
  );
}

/** The plan's status mark, and a click to move it on: Not started → In progress → Done. */
export function PlanStatusButton({
  title,
  status,
  onCycle,
}: {
  title: string;
  status: PlanStatus;
  onCycle: () => void;
}) {
  const next = STATUS_LABEL[nextStatus(status)];
  return (
    <button
      type="button"
      className="btn-icon -my-0.5 h-6 w-6 shrink-0"
      aria-label={`${title}: ${STATUS_LABEL[status]} in my plan. Mark ${next.toLowerCase()}`}
      title={`My plan: ${STATUS_LABEL[status]}. Click for ${next.toLowerCase()}.`}
      data-testid="plan-status"
      data-status={status}
      onClick={onCycle}
    >
      <PlanStatusIcon status={status} />
    </button>
  );
}
