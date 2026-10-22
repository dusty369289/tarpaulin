import { ListTodo, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { fromTodo } from '../reader/items';
import { useOpenItem } from '../reader/ReaderProvider';
import { useCourseIds, useNow, useTodos } from '../canvas/hooks';
import { newId } from '../lib/id';
import { formatDue, useTimeFormat } from '../lib/dates';
import { courseFilter, field } from './settings/fields';
import { CourseDot, EmptyState, LinkButton, QueryGate } from './shared/ui';
import { defineWidget } from './types';

const schema = z.object({
  source: field(z.enum(['both', 'canvas', 'local']).default('both'), {
    label: 'Show',
    options: {
      both: 'Canvas to-dos and my checklist',
      canvas: 'Canvas to-dos only',
      local: 'My checklist only',
    },
  }),
  courseIds: courseFilter(),
  showCompleted: field(z.boolean().default(true), { label: 'Keep ticked checklist items visible' }),
});

export const ChecklistData = z.object({
  items: z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean() })).default([]),
});
export type ChecklistData = z.infer<typeof ChecklistData>;

export const Todo = defineWidget({
  type: 'todo',
  name: 'To-do',
  description: 'Canvas’s to-do list plus a personal checklist that stays on this device.',
  icon: ListTodo,
  defaultSize: { w: 4, h: 7 },
  minSize: { w: 2, h: 3 },
  settingsSchema: schema,
  Component: function TodoWidget({ settings, data, setData }) {
    const todos = useTodos();
    const ids = useCourseIds(settings.courseIds);
    const now = useNow(60_000);
    const timeFmt = useTimeFormat();
    const openItem = useOpenItem();
    const [draft, setDraft] = useState('');
    const local = ChecklistData.safeParse(data ?? {}).data ?? { items: [] };
    const save = (items: ChecklistData['items']) => setData({ items });

    const showCanvas = settings.source !== 'local';
    const showLocal = settings.source !== 'canvas';
    const canvasItems = todos.data.inCourses(ids);
    const localItems = local.items.filter((i) => settings.showCompleted || !i.done);

    const add = () => {
      const text = draft.trim();
      if (!text) return;
      save([...local.items, { id: newId('t'), text, done: false }]);
      setDraft('');
    };

    // With both lists and room for them, Canvas's to-dos and the checklist sit side by side
    // (`.todo-both` in index.css).
    const both = showCanvas && showLocal && !canvasItems.isEmpty;
    const nothing =
      localItems.length === 0 &&
      (!showCanvas || (canvasItems.isEmpty && !todos.query.isLoading && !todos.query.isError));
    return (
      <div className="todo h-full">
        <div className={`flex h-full flex-col w-gap ${both ? 'todo-both' : ''}`}>
          {showCanvas && (
            <div className="todo-canvas min-w-0">
              <QueryGate queries={[todos.query]}>
                {() =>
                  canvasItems.isEmpty ? (
                    // With the checklist showing, its own hint covers an empty Canvas list.
                    !showLocal && <EmptyState>Nothing on your Canvas to-do list.</EmptyState>
                  ) : (
                    <ul className="wide-grid" aria-label="Canvas to-do">
                      {canvasItems.map((t) => (
                        <li key={t.key} className="flex items-start gap-2">
                          <CourseDot color={t.color} className="mt-1.5" />
                          <div className="min-w-0 flex-1">
                            <LinkButton
                              onClick={() => openItem(fromTodo(t), t.url)}
                              className="block truncate font-medium"
                            >
                              {t.title}
                            </LinkButton>
                            <div className="truncate text-xs text-muted">
                              {t.courseName}
                              {t.dueAt && ` · ${formatDue(t.dueAt, now, timeFmt)}`}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )
                }
              </QueryGate>
            </div>
          )}
          {both && localItems.length > 0 && <hr className="border-border" />}
          {showLocal && (
            <div className="todo-local flex min-w-0 flex-1 flex-col w-gap">
              {nothing && (
                <p className="py-2 text-center text-sm text-muted">
                  Nothing to do. Add your own below.
                </p>
              )}
              <ul className="wide-grid gap-y-0.5" aria-label="My checklist">
                {localItems.map((item) => (
                  <li key={item.id} className="group flex items-start gap-2 animate-in">
                    <input
                      type="checkbox"
                      checked={item.done}
                      aria-label={item.text}
                      onChange={() =>
                        save(
                          local.items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)),
                        )
                      }
                      className="mt-[calc((1lh_-_1rem)/2)] h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
                    />
                    <span
                      className={`min-w-0 flex-1 break-words transition-colors ${item.done ? 'text-muted line-through' : ''}`}
                    >
                      {item.text}
                    </span>
                    <button
                      type="button"
                      aria-label={`Delete ${item.text}`}
                      onClick={() => save(local.items.filter((i) => i.id !== item.id))}
                      className="btn-icon h-6 w-6 opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className="mt-auto flex gap-1 pt-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  add();
                }}
              >
                <input
                  className="input min-w-0 py-1"
                  placeholder="Add a task…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label="New task"
                />
                <button
                  type="submit"
                  className="btn-icon shrink-0"
                  aria-label="Add task"
                  disabled={!draft.trim()}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  },
});
