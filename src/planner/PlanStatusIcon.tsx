import { Circle, CircleCheck, CircleDot } from 'lucide-react';
import type { PlanStatus } from './store';

const ICONS = {
  todo: { Icon: Circle, tone: 'text-muted' },
  doing: { Icon: CircleDot, tone: 'text-accent' },
  done: { Icon: CircleCheck, tone: 'text-success' },
} as const;

/** The small mark for a plan's status: an empty ring, a dot, a tick. Decorative; say the status
 *  in words next to it or in the control's name. */
export function PlanStatusIcon({
  status,
  className = 'h-4 w-4',
}: {
  status: PlanStatus;
  className?: string;
}) {
  const { Icon, tone } = ICONS[status];
  return <Icon className={`shrink-0 ${tone} ${className}`} aria-hidden data-status={status} />;
}
