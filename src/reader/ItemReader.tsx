import { format } from 'date-fns';
import {
  CalendarClock,
  Clock,
  ExternalLink,
  FileText,
  HelpCircle,
  Lock,
  Megaphone,
  MessagesSquare,
  Repeat,
  Upload,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Drawer } from '../app/Modal';
import { useCanvas } from '../canvas/CanvasProvider';
import { useResource } from '../canvas/hooks';
import * as R from '../canvas/resources';
import type { ItemDetail } from '../canvas/types';
import { useTimeFormat } from '../lib/dates';
import { Badge, CourseDot, ErrorState, LoadingState } from '../widgets/shared/ui';
import { CanvasContent } from './CanvasContent';
import type { ReaderItem } from './items';

const KIND: Record<ItemDetail['kind'], { label: string; icon: LucideIcon }> = {
  assignment: { label: 'Assignment', icon: FileText },
  quiz: { label: 'Quiz', icon: HelpCircle },
  discussion: { label: 'Discussion', icon: MessagesSquare },
  announcement: { label: 'Announcement', icon: Megaphone },
  event: { label: 'Event', icon: CalendarClock },
};

const SUBMISSION_TYPES: Record<string, string> = {
  online_upload: 'File upload',
  online_text_entry: 'Text entry',
  online_url: 'Website URL',
  media_recording: 'Media recording',
  online_quiz: 'Quiz',
  discussion_topic: 'Discussion post',
  on_paper: 'On paper',
  external_tool: 'External tool',
  none: 'Nothing to submit',
};

/** Fetches the full item when it's a kind that needs it; announcements and events don't. */
function useDetail(item: ReaderItem) {
  const courseId = item.courseId ?? '';
  const resource =
    item.kind === 'assignment'
      ? R.AssignmentDetail(courseId, item.id)
      : item.kind === 'quiz'
        ? R.QuizDetail(courseId, item.id)
        : item.kind === 'discussion'
          ? R.DiscussionDetail(courseId, item.id)
          : null;
  const query = useResource({
    ...(resource ?? R.AssignmentDetail('', '')),
    enabled: Boolean(resource && item.courseId),
  });
  const detail: Partial<ItemDetail> = { ...item.inline, ...(resource ? query.data : undefined) };
  return { detail, query: resource ? query : null };
}

function Fact({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <li className="flex min-w-0 items-start gap-2 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function Status({ detail }: { detail: Partial<ItemDetail> }) {
  const s = detail.submission;
  if (!s) return null;
  if (s.excused) return <Badge tone="muted">Excused</Badge>;
  if (s.state === 'graded' && (s.score !== null || s.grade))
    return (
      <Badge tone="success">
        Graded{' '}
        {s.score !== null
          ? `${s.score}${detail.pointsPossible ? ` / ${detail.pointsPossible}` : ''}`
          : s.grade}
      </Badge>
    );
  if (s.submittedAt)
    return (
      <Badge tone={s.late ? 'warning' : 'success'}>{s.late ? 'Submitted late' : 'Submitted'}</Badge>
    );
  if (s.missing) return <Badge tone="danger">Missing</Badge>;
  return <Badge tone="accent">Not submitted</Badge>;
}

export function ItemReader({ item, onClose }: { item: ReaderItem; onClose: () => void }) {
  const { openLink } = useCanvas();
  const timeFmt = useTimeFormat();
  const { detail, query } = useDetail(item);
  const kind = KIND[item.kind];
  const when = (iso: string | null | undefined) =>
    iso ? format(new Date(iso), `EEE d MMM yyyy, ${timeFmt}`) : null;
  const title = detail.title || item.title;
  const types = (detail.submissionTypes ?? []).map((t) => SUBMISSION_TYPES[t] ?? t);

  return (
    <Drawer
      wide
      title={kind.label}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-muted">
            Read-only copy. Submit and reply in Canvas.
          </span>
          {item.url && (
            <button type="button" className="btn shrink-0" onClick={() => openLink(item.url)}>
              <ExternalLink className="h-4 w-4" /> Open in Canvas
            </button>
          )}
        </div>
      }
    >
      <article className="flex flex-col gap-4" data-testid="item-reader" data-kind={item.kind}>
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <kind.icon className="h-3.5 w-3.5" aria-hidden />
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <CourseDot color={item.color} />
              <span className="truncate">{item.courseName}</span>
            </span>
            <Status detail={detail} />
          </div>
          <h3 className="text-xl font-semibold leading-snug [overflow-wrap:anywhere]">{title}</h3>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {detail.dueAt && <Fact icon={Clock}>Due {when(detail.dueAt)}</Fact>}
            {detail.pointsPossible != null && (
              <Fact icon={FileText}>{detail.pointsPossible} points</Fact>
            )}
            {detail.unlockAt && new Date(detail.unlockAt) > new Date() && (
              <Fact icon={Lock}>Opens {when(detail.unlockAt)}</Fact>
            )}
            {detail.lockAt && <Fact icon={Lock}>Closes {when(detail.lockAt)}</Fact>}
            {detail.timeLimitMinutes != null && (
              <Fact icon={Clock}>{detail.timeLimitMinutes} minute time limit</Fact>
            )}
            {detail.questionCount != null && (
              <Fact icon={HelpCircle}>{detail.questionCount} questions</Fact>
            )}
            {detail.allowedAttempts != null && (
              <Fact icon={Repeat}>
                {detail.allowedAttempts} attempt{detail.allowedAttempts === 1 ? '' : 's'}
              </Fact>
            )}
            {types.length > 0 && <Fact icon={Upload}>{types.join(', ')}</Fact>}
            {detail.postedAt && <Fact icon={CalendarClock}>Posted {when(detail.postedAt)}</Fact>}
            {detail.author && <Fact icon={User}>{detail.author}</Fact>}
          </ul>
        </header>
        <hr className="border-border" />
        {query?.isLoading ? (
          <LoadingState />
        ) : query?.isError && !query.data ? (
          <ErrorState error={query.error} />
        ) : detail.html?.trim() ? (
          <CanvasContent html={detail.html} />
        ) : (
          <p className="text-sm text-muted">No description in Canvas.</p>
        )}
      </article>
    </Drawer>
  );
}
