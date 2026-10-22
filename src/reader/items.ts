import type { Announcement, CalendarEvent, Deadline, TodoItem } from '../canvas/models';
import type { ItemDetail } from '../canvas/types';

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
  /** Announcements open as discussions, but there's nothing to plan (see src/planner). */
  noPlan?: boolean;
}

const fetchable = (courseId: string | null): courseId is string => Boolean(courseId);

export function fromDeadline(d: Deadline): ReaderItem | null {
  const base = {
    courseId: d.courseId,
    title: d.title,
    courseName: d.courseName,
    color: d.color,
    url: d.url,
    inline: { dueAt: d.data.dueAt, pointsPossible: d.points },
  };
  if (!fetchable(d.courseId)) return null;
  switch (d.type) {
    case 'assignment':
      return { ...base, kind: 'assignment', id: d.data.id };
    case 'quiz':
      return { ...base, kind: 'quiz', id: d.data.id };
    case 'discussion_topic':
      return { ...base, kind: 'discussion', id: d.data.id };
    case 'announcement':
      return { ...base, kind: 'discussion', id: d.data.id, noPlan: true };
    default:
      // Pages, planner notes, peer reviews and events from the planner open in Canvas.
      return null;
  }
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
    courseName: e.course?.name ?? e.data.contextName,
    color: e.color,
    url: e.url,
    inline: { html: e.data.description ?? '' },
  };
}

export function fromTodo(t: TodoItem): ReaderItem | null {
  if (!t.courseId) return null;
  const base = {
    courseId: t.courseId,
    title: t.title,
    courseName: t.courseName,
    color: t.color,
    url: t.url,
    inline: { dueAt: t.data.dueAt, pointsPossible: t.data.pointsPossible },
  };
  if (t.data.assignmentId) return { ...base, kind: 'assignment', id: t.data.assignmentId };
  if (t.data.quizId) return { ...base, kind: 'quiz', id: t.data.quizId };
  return null;
}
