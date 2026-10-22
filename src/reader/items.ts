import { PLANNER_TYPES, type ItemRef } from '../canvas/kinds';
import type { Announcement, CalendarEvent, Catalog, Deadline, TodoItem } from '../canvas/models';
import type { AssignmentData, ItemDetail } from '../canvas/types';

/**
 * Something the reader can show. Assignments, quizzes and discussions are fetched by id when
 * opened; announcements and events carry their content already (it came with the list).
 */
export interface ReaderItem {
  kind: ItemDetail['kind'];
  /** For fetched kinds. */
  courseId: string | null;
  id: string;
  title: string;
  courseName: string;
  color: string;
  url: string | null;
  /** Known up front; the fetched detail (if any) is merged over it. */
  inline?: Partial<ItemDetail>;
  /** The work it is, when it's work you can plan (see src/planner). Announcements open as
   *  discussions but have none. */
  ref?: ItemRef;
}

export function fromDeadline(d: Deadline): ReaderItem | null {
  const kind = PLANNER_TYPES[d.type].readerKind;
  // Pages, planner notes, peer reviews and events from the planner open in Canvas.
  if (!kind || !d.courseId) return null;
  return {
    kind,
    courseId: d.courseId,
    id: d.data.id,
    title: d.title,
    courseName: d.courseName,
    color: d.color,
    url: d.url,
    inline: { dueAt: d.data.dueAt, pointsPossible: d.points },
    ref: d.ref ?? undefined,
  };
}

export function fromAnnouncement(a: Announcement): ReaderItem {
  return {
    kind: 'announcement',
    courseId: a.courseId,
    id: a.id,
    title: a.title,
    courseName: a.courseName,
    color: a.color,
    url: a.url,
    inline: {
      html: a.data.html ?? '',
      postedAt: a.data.postedAt,
      author: a.data.author || null,
    },
  };
}

export function fromEvent(e: CalendarEvent): ReaderItem {
  return {
    kind: 'event',
    courseId: e.courseId,
    id: e.id,
    title: e.title,
    courseName: e.courseName,
    color: e.color,
    url: e.url,
    inline: { html: e.data.description ?? '' },
  };
}

/** A to-do opens as the work it is: a quiz as the quiz, like the planner has it. */
export function fromTodo(t: TodoItem): ReaderItem | null {
  const ref = t.ref;
  if (!ref) return null;
  return {
    kind: ref.kind,
    courseId: ref.courseId,
    id: ref.id,
    title: t.title,
    courseName: t.courseName,
    color: t.color,
    url: t.url,
    inline: { dueAt: t.data.dueAt, pointsPossible: t.data.pointsPossible },
    ref,
  };
}

/** Missing work (from /missing_submissions) opens as its assignment. */
export function fromMissing(a: AssignmentData, catalog: Catalog): ReaderItem | null {
  if (!a.courseId) return null;
  return {
    kind: 'assignment',
    courseId: a.courseId,
    id: a.id,
    title: a.name,
    courseName: catalog.course(a.courseId)?.name ?? '',
    color: catalog.colorOf(a.courseId),
    url: a.htmlUrl,
    inline: { dueAt: a.dueAt, pointsPossible: a.pointsPossible },
    ref: { kind: 'assignment', courseId: a.courseId, id: a.id },
  };
}
