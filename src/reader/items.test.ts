import { describe, expect, it } from 'vitest';
import { CanvasClient } from '../canvas/client';
import { Catalog } from '../canvas/models';
import * as R from '../canvas/resources';
import { FixtureTransport } from '../canvas/transport';
import { planKeyForPlannerItem, planKeyForReaderItem } from '../planner/keys';
import { fixtureBundle } from '../test/render';
import { fromDeadline, fromTodo } from './items';

const catalog = new Catalog({
  courses: [],
  prefs: { courseScope: 'all', hiddenCourseIds: [], courseColors: {}, courseNicknames: {} },
});
const client = new CanvasClient(new FixtureTransport(fixtureBundle), fixtureBundle.meta.baseUrl);

describe('reader items and plans', () => {
  it('opens a quiz from the To-do list as the quiz the planner lists, with the same plan', async () => {
    // Recorded: the to-do names the quiz's assignment (1095), the planner the quiz (1094).
    const todo = catalog
      .todos(await client.fetch(R.Todo))
      .find((t) => t.data.assignmentId === '1095');
    const planned = catalog
      .deadlines(await client.fetch(R.Planner('2026-10-01', '2026-11-30')))
      .find((d) => d.type === 'quiz' && d.data.id === '1094');
    expect(todo && planned).toBeTruthy();
    const item = fromTodo(todo!)!;
    expect(item).toMatchObject({ kind: 'quiz', id: '1094' });
    expect(planKeyForReaderItem(item)).toBe('quiz:1028:1094');
    expect(planKeyForReaderItem(item)).toBe(planKeyForPlannerItem(planned!));
    expect(planKeyForReaderItem(fromDeadline(planned!)!)).toBe('quiz:1028:1094');
  });

  it('keys a graded discussion by its topic and plain work by its assignment', () => {
    const todo = (over: object) =>
      catalog.todos([
        {
          key: 'todo:1',
          kind: 'submitting',
          courseId: '10',
          contextName: '',
          title: 'Work',
          dueAt: null,
          pointsPossible: null,
          htmlUrl: null,
          assignmentId: '50',
          ...over,
        },
      ]).first!;
    expect(planKeyForReaderItem(fromTodo(todo({ discussionId: '7' }))!)).toBe('discussion:10:7');
    expect(planKeyForReaderItem(fromTodo(todo({}))!)).toBe('assignment:10:50');
    expect(fromTodo(todo({ courseId: null }))).toBeNull();
  });

  it('has nothing to plan for an announcement opened as a discussion', () => {
    const [a] = catalog.deadlines([
      {
        key: 'announcement:3',
        id: '3',
        type: 'announcement',
        title: 'News',
        courseId: '10',
        contextName: '',
        date: null,
        dueAt: null,
        pointsPossible: null,
        htmlUrl: null,
        gradeable: false,
        submitted: false,
        missing: false,
        late: false,
        graded: false,
        excused: false,
        markedComplete: false,
        newActivity: false,
      },
    ]);
    const item = fromDeadline(a)!;
    expect(item.kind).toBe('discussion');
    expect(planKeyForReaderItem(item)).toBeNull();
  });
});
