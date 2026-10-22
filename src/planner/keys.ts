import { WORK_KINDS, type ItemRef, type WorkKind } from '../canvas/kinds';

// Plans are kept per Canvas account and, within one, per Canvas item. The account scope is the
// same `<baseUrl>|<userId>` that notifications use (src/canvas/account.ts), so a plan made under
// one account never shows under another. The item key names the kind, course and id, because
// Canvas ids are only unique per kind ("assignment 12" and "quiz 12" differ). Every key is built
// from an item's `ref` (Deadline, TodoItem, ReaderItem), so wherever the work is opened from it
// finds the same plan.

/** The kinds of Canvas work you can plan. */
export type PlanItemType = WorkKind;

/** `assignment:<courseId>:<id>`. */
export const planItemKey = (type: PlanItemType, courseId: string, id: string) =>
  `${type}:${courseId}:${id}`;

const KEY = new RegExp(`^(${WORK_KINDS.join('|')}):([^:]+):([^:]+)$`);

export function parsePlanItemKey(key: string): ItemRef | null {
  const m = KEY.exec(key);
  return m ? { kind: m[1] as WorkKind, courseId: m[2], id: m[3] } : null;
}

/** The plan key of a piece of work, or null when it isn't work you plan. */
export const planKeyOf = (ref: ItemRef | null | undefined): string | null =>
  ref ? planItemKey(ref.kind, ref.courseId, ref.id) : null;

/** The plan key of a planner item (a `Deadline`), or null for things you don't plan (events,
 *  pages, announcements, notes, items outside a course). */
export const planKeyForPlannerItem = (d: { ref: ItemRef | null }) => planKeyOf(d.ref);

/** The plan key of an item open in the reader, or null when it isn't work you plan. */
export const planKeyForReaderItem = (item: { ref?: ItemRef }) => planKeyOf(item.ref);
