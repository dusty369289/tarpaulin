// Snapshots real Canvas responses into src/canvas/fixtures/canvas.json for the unit tests.
// Names, emails, IDs, course codes, free text and scores are replaced with placeholders by
// src/canvas/anonymize.ts. Read-only: every call is a GET under /api/v1/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, formatISO, subDays } from 'date-fns';
import { Anonymizer, PLACEHOLDER_ORIGIN } from '../src/canvas/anonymize';
import { CanvasClient } from '../src/canvas/client';
import * as R from '../src/canvas/resources';
import type { Query } from '../src/canvas/http';
import { currentTermCourses } from '../src/canvas/terms';
import type { Transport } from '../src/canvas/transport';
import { nodeTransportFromEnv } from './node-transport';

const MAX_COURSES = 6;
const MAX_PAST_COURSES = 3;
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src/canvas/fixtures/canvas.json');

const { transport, baseUrl } = nodeTransportFromEnv();
const anon = new Anonymizer(baseUrl);
const responses: Record<string, unknown[]> = {};
const now = new Date();
const day = (d: Date) => formatISO(d, { representation: 'date' });

// Records the raw response for each path the client asks for (queries are not part of the key).
const recording: Transport = {
  ...transport,
  async get(path: string, query?: Query) {
    const data = await transport.get(path, query);
    const key = anon.path(path);
    const value = anon.value(data);
    if (Array.isArray(value)) responses[key] = [...(responses[key] ?? []), ...value];
    else responses[key] = value as unknown[];
    return data;
  },
};
const client = new CanvasClient(recording, baseUrl);

await client.fetch(R.Profile);
await client.fetch(R.CourseColors);
const courses = await client.fetch(R.Courses);
const current = currentTermCourses(courses, now).slice(0, MAX_COURSES);
const keepIds = new Set(current.map((c) => String(anon.id(c.id))));
const past = courses.filter((c) => !current.includes(c)).slice(0, MAX_PAST_COURSES);
for (const c of past) keepIds.add(String(anon.id(c.id)));
responses['/api/v1/courses'] = (responses['/api/v1/courses'] as Array<{ id: number }>).filter((c) =>
  keepIds.has(String(c.id)),
);

const ids = current.map((c) => c.id);
await client.fetch(R.Planner(day(subDays(now, 14)), day(addDays(now, 45))));
for (const id of ids) await client.fetch(R.Assignments(id));
await client.fetch(R.Announcements(ids, day(subDays(now, 45)), day(addDays(now, 1))));
await client.fetch(
  R.CalendarEvents(
    ids.map((id) => `course_${id}`),
    day(subDays(now, 45)),
    day(addDays(now, 60)),
  ),
);
await client.fetch(R.Enrollments);
await client.fetch(R.Todo);
await client.fetch(R.MissingSubmissions);

// Only keep cross-references to the courses we kept.
const courseKeyed = [
  '/api/v1/planner/items',
  '/api/v1/users/self/enrollments',
  '/api/v1/users/self/todo',
  '/api/v1/users/self/missing_submissions',
];
for (const key of courseKeyed) {
  responses[key] = (responses[key] ?? []).filter((r) => {
    const cid = (r as { course_id?: number }).course_id;
    return cid === undefined || cid === null || keepIds.has(String(cid));
  });
}

const bundle = { meta: { recordedAt: now.toISOString(), baseUrl: PLACEHOLDER_ORIGIN }, responses };
const json = JSON.stringify(bundle, null, 2);
const host = new URL(baseUrl).host;
if (json.includes(host)) {
  const at = json.indexOf(host);
  throw new Error(
    `Anonymisation leaked the Canvas host near: ${json.slice(Math.max(0, at - 80), at).replace(/https?:\/\/\S*$/, '')}`,
  );
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${json}\n`);
console.log(`Wrote ${Object.keys(responses).length} endpoints to ${out}`);
for (const [k, v] of Object.entries(responses))
  console.log(`  ${k}: ${Array.isArray(v) ? v.length : 1}`);
