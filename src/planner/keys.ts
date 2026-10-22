import type { PlannerItemType } from '../canvas/types';

// Plans are kept per Canvas account and, within one, per Canvas item. The account scope is the
// same `<baseUrl>|<userId>` that notifications use (src/canvas/account.ts), so a plan made under
// one account never shows under another. The item key names the kind, course
// and id, because Canvas ids are only unique per kind ("assignment 12" and "quiz 12" differ).

/** The kinds of Canvas work you can plan. */
export const PLAN_ITEM_TYPES = ['assignment', 'quiz', 'discussion'] as const;
export type PlanItemType = (typeof PLAN_ITEM_TYPES)[number];

/** `assignment:<courseId>:<id>`. */
export const planItemKey = (type: PlanItemType, courseId: string, id: string) =>
  `${type}:${courseId}:${id}`;

const KEY = /^(assignment|quiz|discussion):([^:]+):([^:]+)$/;

export function parsePlanItemKey(
  key: string,
): { type: PlanItemType; courseId: string; id: string } | null {
  const m = KEY.exec(key);
  return m ? { type: m[1] as PlanItemType, courseId: m[2], id: m[3] } : null;
}

const FROM_PLANNER: Partial<Record<PlannerItemType, PlanItemType>> = {
  assignment: 'assignment',
  quiz: 'quiz',
  discussion_topic: 'discussion',
};

/** The plan key of a planner item (a `Deadline`), or null for things you don't plan (events,
 *  pages, announcements, notes, items outside a course). */
export function planKeyForPlannerItem(d: {
  type: PlannerItemType;
  courseId: string | null;
  data: { id: string };
}): string | null {
  const type = FROM_PLANNER[d.type];
  return type && d.courseId ? planItemKey(type, d.courseId, d.data.id) : null;
}

/** The plan key of an item open in the reader, or null when it isn't work you plan. */
export function planKeyForReaderItem(item: {
  kind: string;
  courseId: string | null;
  id: string;
  noPlan?: boolean;
}): string | null {
  if (item.noPlan || !item.courseId) return null;
  return (PLAN_ITEM_TYPES as readonly string[]).includes(item.kind)
    ? planItemKey(item.kind as PlanItemType, item.courseId, item.id)
    : null;
}
