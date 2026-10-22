import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileText,
  HelpCircle,
  Megaphone,
  MessagesSquare,
  StickyNote,
  type LucideIcon,
} from 'lucide-react';
import type { ItemDetail, PlannerItemType } from './types';

// The kinds of thing Canvas lists, in one table: what each is called and drawn as, what the
// reader opens it as, and whether it's work. The reader, the planner, Quick find and the load
// all read it, so they can't disagree.

/** Canvas work you open by id and can plan: Canvas ids are only unique within one of these. */
export const WORK_KINDS = ['assignment', 'quiz', 'discussion'] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

/** One piece of work in one course. */
export interface ItemRef {
  kind: WorkKind;
  courseId: string;
  id: string;
}

/** Name and icon of what the reader shows. */
export const READER_KINDS: Record<ItemDetail['kind'], { label: string; icon: LucideIcon }> = {
  assignment: { label: 'Assignment', icon: FileText },
  quiz: { label: 'Quiz', icon: HelpCircle },
  discussion: { label: 'Discussion', icon: MessagesSquare },
  announcement: { label: 'Announcement', icon: Megaphone },
  event: { label: 'Event', icon: CalendarDays },
};

export interface PlannerKind {
  label: string;
  icon: LucideIcon;
  /** What the reader opens it as; null when it opens in Canvas instead. */
  readerKind: ItemDetail['kind'] | null;
  /** The kind of work it is, when it's work you can open by id and plan. */
  work: WorkKind | null;
  /** Work that's due even when Canvas sends no submission for it (counts toward the load). */
  dueWork: boolean;
}

const kind = (
  label: string,
  icon: LucideIcon,
  readerKind: PlannerKind['readerKind'] = null,
  work: WorkKind | null = null,
  dueWork = false,
): PlannerKind => ({ label, icon, readerKind, work, dueWork });

export const PLANNER_TYPES: Record<PlannerItemType, PlannerKind> = {
  assignment: kind('Assignment', FileText, 'assignment', 'assignment', true),
  quiz: kind('Quiz', HelpCircle, 'quiz', 'quiz', true),
  discussion_topic: kind('Discussion', MessagesSquare, 'discussion', 'discussion', true),
  // Announcements open as discussions, but there's nothing to plan.
  announcement: kind('Announcement', Megaphone, 'discussion'),
  // Pages, planner notes, peer reviews and events from the planner open in Canvas.
  wiki_page: kind('Page', BookOpen),
  planner_note: kind('Note', StickyNote),
  calendar_event: kind('Event', CalendarDays),
  assessment_request: kind('Peer review', ClipboardCheck, null, null, true),
  other: kind('Item', FileText),
};

/** The work a planner item is, or null for things that aren't (events, pages, announcements,
 *  notes) and for items outside a course. */
export function plannerItemRef(
  type: PlannerItemType,
  courseId: string | null,
  id: string,
): ItemRef | null {
  const work = PLANNER_TYPES[type].work;
  return work && courseId ? { kind: work, courseId, id } : null;
}
