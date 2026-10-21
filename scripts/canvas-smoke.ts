// Calls every client endpoint against the live account and prints counts and field coverage,
// so real-world differences from our schemas show up before they show up in the UI.
// Read-only: every call is a GET under /api/v1/.
import { addDays, formatISO, subDays } from 'date-fns';
import { CanvasClient } from '../src/canvas/client';
import * as R from '../src/canvas/resources';
import { currentTermCourses } from '../src/canvas/terms';
import { nodeTransportFromEnv } from './node-transport';

const { transport, baseUrl } = nodeTransportFromEnv();
const client = new CanvasClient(transport, baseUrl);
const day = (d: Date) => formatISO(d, { representation: 'date' });
const now = new Date();

/** For each field, how many records have a non-null value. */
function coverage(items: object[]): string {
  if (items.length === 0) return '  (no records)';
  const keys = Object.keys(items[0]);
  return keys
    .map((k) => {
      const set = items.filter((i) => {
        const v = (i as Record<string, unknown>)[k];
        return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
      }).length;
      return `  ${k.padEnd(18)} ${String(set).padStart(4)}/${items.length}`;
    })
    .join('\n');
}

let failures = 0;
async function check<T extends object>(label: string, run: () => Promise<T[] | T>) {
  const started = Date.now();
  try {
    const result = await run();
    const list = Array.isArray(result) ? result : [result];
    console.log(`\n✔ ${label}: ${list.length} record(s) in ${Date.now() - started}ms`);
    console.log(coverage(list));
    return list;
  } catch (e) {
    failures++;
    console.log(`\n✘ ${label}: ${e instanceof Error ? e.message : String(e)}`);
    return [] as T[];
  }
}

console.log(`Canvas smoke test against ${new URL(baseUrl).host}`);
await check('profile', () => client.fetch(R.Profile));
const courses = await check('courses', () => client.fetch(R.Courses));
const current = currentTermCourses(courses, now);
console.log(
  `  → ${current.length} of ${courses.length} courses are in the current term (${current[0]?.term?.name ?? 'n/a'})`,
);
await check('course colours', async () => {
  const colors = await client.fetch(R.CourseColors);
  return [
    {
      courses: Object.keys(colors).length,
      currentTermWithColour: current.filter((c) => colors[c.id]).length,
    },
  ];
});
const planner = await check('planner items (-7d..+30d)', () =>
  client.fetch(R.Planner(day(subDays(now, 7)), day(addDays(now, 30)))),
);
const byType: Record<string, number> = {};
for (const p of planner) byType[p.type] = (byType[p.type] ?? 0) + 1;
console.log(`  by type: ${JSON.stringify(byType)}`);
const ids = current.map((c) => c.id);
if (ids[0])
  await check(`assignments (first current course)`, () => client.fetch(R.Assignments(ids[0])));
await check('announcements (current term, 60d)', () =>
  client.fetch(R.Announcements(ids, day(subDays(now, 60)), day(addDays(now, 1)))),
);
await check('calendar events (current term, ±60d)', () =>
  client.fetch(
    R.CalendarEvents(
      ids.map((id) => `course_${id}`),
      day(subDays(now, 60)),
      day(addDays(now, 60)),
    ),
  ),
);
await check('enrollments', () => client.fetch(R.Enrollments));
await check('todo', () => client.fetch(R.Todo));
await check('missing submissions', () => client.fetch(R.MissingSubmissions));

console.log(failures ? `\n${failures} endpoint(s) failed.` : '\nAll endpoints OK.');
process.exit(failures ? 1 : 0);
