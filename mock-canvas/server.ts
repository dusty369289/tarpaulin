// A local Canvas impersonator. It serves the REST endpoints Tarpaulin reads, with Canvas's auth,
// pagination and filtering behaviour, from generated worlds (see world.ts). The bearer token picks
// the scenario: `mock-realistic`, `mock-dense`, `mock-edge`, `mock-empty`, `mock-flaky`.
//
// It also implements /login/oauth2/{auth,token} so the desktop OAuth flow can run end to end,
// and it records any non-GET request to /api/ so tests can prove the app never writes to Canvas.
//
//   pnpm canvas:mock                         # http://127.0.0.1:4810
//   CANVAS_BASE_URL=http://127.0.0.1:4810 CANVAS_TOKEN=mock-dense pnpm dev

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildWorld, SCENARIOS, type Json, type ScenarioName, type World } from './world';

const DAY = 86_400_000;

export interface MockCanvasOptions {
  port?: number;
  /** Freeze the clock (data is generated relative to it). */
  now?: Date;
  /** Artificial delay per request, for exercising loading states. */
  latencyMs?: number;
  /** Lifetime of OAuth access tokens. */
  oauthTokenTtlSec?: number;
}

export interface MockRequest {
  method: string;
  path: string;
  query: string;
  status: number;
  scenario: string | null;
}

export interface MockCanvas {
  url: string;
  port: number;
  requests: MockRequest[];
  /** Non-GET requests to /api/ — must always be empty. */
  writes: MockRequest[];
  world: (scenario: ScenarioName) => World;
  close: () => Promise<void>;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Json = { errors: [{ message }] },
  ) {
    super(message);
  }
}

const parseDate = (v: string | null): number | null => {
  if (!v) return null;
  const t = Date.parse(v.length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isNaN(t) ? null : t;
};
const strip = (o: Json) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));
/** A Canvas File object whose `url` (normally a short-lived signed download link) is an SVG. */
function mockFile(id: string): Json {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240" viewBox="0 0 480 240"><rect width="480" height="240" fill="#e8eefc"/><g fill="#3b82f6">${[
    60, 120, 90, 170, 140,
  ]
    .map((h, i) => `<rect x="${40 + i * 84}" y="${220 - h}" width="56" height="${h}" rx="6"/>`)
    .join(
      '',
    )}</g><text x="20" y="34" font-family="sans-serif" font-size="20" fill="#1e293b">Figure ${id}</text></svg>`;
  return {
    id,
    display_name: `figure-${id}.svg`,
    filename: `figure-${id}.svg`,
    'content-type': 'image/svg+xml',
    url: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    size: svg.length,
  };
}

const rel = (url: unknown) =>
  typeof url === 'string' ? url.replace(/^https?:\/\/[^/]+/, '') : url;

export async function startMockCanvas(opts: MockCanvasOptions = {}): Promise<MockCanvas> {
  const worlds = new Map<ScenarioName, World>();
  const world = (s: ScenarioName) => {
    let w = worlds.get(s);
    if (!w) worlds.set(s, (w = buildWorld(s, opts.now ?? new Date())));
    return w;
  };
  const requests: MockRequest[] = [];
  const writes: MockRequest[] = [];
  const hits = new Map<string, number>();
  const oauthCodes = new Map<string, { clientId: string; redirectUri: string }>();
  const oauthTokens = new Map<string, { expires: number; scenario: ScenarioName }>();
  const refreshTokens = new Map<string, ScenarioName>();
  let tokenCounter = 0;

  const scenarioFor = (req: IncomingMessage): ScenarioName => {
    const auth = req.headers.authorization ?? '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m)
      throw new HttpError(401, 'user authorization required', {
        status: 'unauthenticated',
        errors: [{ message: 'user authorization required' }],
      });
    const token = m[1].trim();
    if (token === 'mock') return 'realistic';
    const direct = token.match(/^mock-(\w+)$/);
    if (direct && SCENARIOS.includes(direct[1] as ScenarioName)) return direct[1] as ScenarioName;
    const oauth = oauthTokens.get(token);
    if (oauth) {
      if (Date.now() > oauth.expires)
        throw new HttpError(401, 'Invalid access token.', {
          errors: [{ message: 'Invalid access token.' }],
        });
      return oauth.scenario;
    }
    throw new HttpError(401, 'Invalid access token.', {
      errors: [{ message: 'Invalid access token.' }],
    });
  };

  /** Canvas-style pagination: default 10 per page, max 100, full Link header. */
  const paginate = (req: IncomingMessage, url: URL, items: unknown[], res: ServerResponse) => {
    const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get('per_page')) || 10));
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const last = Math.max(1, Math.ceil(items.length / perPage));
    const link = (p: number) => {
      const u = new URL(url.toString());
      u.searchParams.set('page', String(p));
      u.searchParams.set('per_page', String(perPage));
      return `<http://${req.headers.host}${u.pathname}${u.search}>`;
    };
    const rels = [`${link(page)}; rel="current"`];
    if (page < last) rels.push(`${link(page + 1)}; rel="next"`);
    if (page > 1) rels.push(`${link(page - 1)}; rel="prev"`);
    rels.push(`${link(1)}; rel="first"`, `${link(last)}; rel="last"`);
    res.setHeader('Link', rels.join(','));
    return items.slice((page - 1) * perPage, page * perPage);
  };

  const courseById = (w: World, id: string) => w.courses.find((c) => String(c.id) === id);

  function plannerItems(w: World): Json[] {
    const items: Json[] = [];
    for (const course of w.courses) {
      for (const a of w.assignments.get(String(course.id)) ?? []) {
        if (!a.due_at) continue;
        const sub = a.submission as Json;
        const type = a._plannerType as string;
        items.push({
          context_type: 'Course',
          course_id: course.id,
          plannable_id: type === 'quiz' ? a.quiz_id : a.id,
          planner_override: a._markedComplete
            ? {
                id: 1,
                plannable_type: type,
                plannable_id: a.id,
                user_id: w.user.id,
                workflow_state: 'active',
                marked_complete: true,
                dismissed: false,
              }
            : null,
          plannable_type: type,
          new_activity: false,
          submissions: {
            submitted: Boolean(sub.submitted_at),
            excused: sub.excused === true,
            graded: sub.workflow_state === 'graded',
            posted_at: sub.posted_at,
            late: Boolean(sub.late),
            missing: Boolean(sub.missing),
            needs_grading: sub.workflow_state === 'submitted',
            has_feedback: false,
            redo_request: false,
          },
          plannable_date: a.due_at,
          plannable: {
            id: type === 'quiz' ? a.quiz_id : a.id,
            title: a.name,
            created_at: a.created_at,
            updated_at: a.updated_at,
            assignment_id: type === 'quiz' ? a.id : undefined,
            points_possible: a.points_possible,
            due_at: a.due_at,
            lock_at: a.lock_at,
          },
          html_url: rel(a.html_url),
          context_name: course.name,
          context_image: null,
        });
      }
    }
    for (const ann of w.announcements) {
      const cid = String(ann.context_code).replace('course_', '');
      const course = courseById(w, cid);
      items.push({
        context_type: 'Course',
        course_id: course?.id ?? null,
        plannable_id: ann.id,
        planner_override: null,
        plannable_type: 'announcement',
        new_activity: ann.read_state === 'unread',
        submissions: false,
        plannable_date: ann.posted_at,
        plannable: {
          id: ann.id,
          title: ann.title,
          unread_count: 0,
          read_state: ann.read_state,
          created_at: ann.created_at,
          updated_at: ann.created_at,
        },
        html_url: rel(ann.html_url),
        context_name: course?.name ?? null,
        context_image: null,
      });
    }
    for (const ev of w.calendarEvents) {
      const cid = String(ev.context_code).startsWith('course_')
        ? String(ev.context_code).slice(7)
        : null;
      items.push({
        context_type: cid ? 'Course' : 'User',
        course_id: cid ? (courseById(w, cid)?.id ?? null) : null,
        plannable_id: ev.id,
        planner_override: null,
        plannable_type: 'calendar_event',
        new_activity: false,
        submissions: false,
        plannable_date: ev.start_at,
        plannable: {
          id: ev.id,
          title: ev.title,
          location_name: ev.location_name,
          all_day: ev.all_day,
          start_at: ev.start_at,
          end_at: ev.end_at,
          created_at: ev.created_at,
          updated_at: ev.updated_at,
        },
        html_url: rel(ev.html_url),
        context_name: ev.context_name,
        context_image: null,
      });
    }
    items.push(...w.extraPlanner);
    return items.sort((a, b) =>
      String(a.plannable_date ?? '').localeCompare(String(b.plannable_date ?? '')),
    );
  }

  function route(req: IncomingMessage, url: URL, res: ServerResponse): unknown {
    const path = url.pathname;
    const q = url.searchParams;
    const list = (name: string) => [...q.getAll(`${name}[]`), ...q.getAll(name)];

    // --- OAuth2 (Canvas's /login/oauth2/*) ---------------------------------------------------
    if (path === '/login/oauth2/auth' && req.method === 'GET') {
      const clientId = q.get('client_id') ?? '';
      const redirect = q.get('redirect_uri') ?? '';
      if (clientId !== 'mock-client') throw new HttpError(400, 'unknown client');
      if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(redirect))
        throw new HttpError(400, 'redirect_uri does not match');
      const code = `code-${++tokenCounter}`;
      oauthCodes.set(code, { clientId, redirectUri: redirect });
      const target = new URL(redirect);
      target.searchParams.set('code', code);
      if (q.get('state')) target.searchParams.set('state', q.get('state')!);
      res.statusCode = 302;
      res.setHeader('Location', target.toString());
      return undefined;
    }
    if (!path.startsWith('/api/v1/'))
      throw new HttpError(404, 'The specified resource does not exist.');
    if (req.method !== 'GET') throw new HttpError(405, 'Tarpaulin mock Canvas is read-only.');

    const scenario = scenarioFor(req);
    const w = world(scenario);
    const key = `${scenario}:${path}`;
    const n = (hits.get(key) ?? 0) + 1;
    hits.set(key, n);
    for (const f of w.failures) {
      if (!f.match.test(path)) continue;
      const status = typeof f.status === 'function' ? f.status(n) : f.status;
      if (status) throw new HttpError(status, f.message);
    }
    const now = w.now.getTime();
    const user = w.user;

    if (path === '/api/v1/users/self') {
      return {
        id: user.id,
        name: user.name,
        created_at: '2023-08-01T10:00:00Z',
        sortable_name: user.sortable_name,
        short_name: user.short_name,
        avatar_url: null,
        last_name: user.last_name,
        first_name: user.first_name,
        locale: null,
        effective_locale: 'en-GB',
        permissions: {
          can_update_name: false,
          can_update_avatar: true,
          limit_parent_app_web_access: false,
        },
      };
    }
    if (path === '/api/v1/users/self/profile') {
      return {
        id: user.id,
        name: user.name,
        short_name: user.short_name,
        sortable_name: user.sortable_name,
        avatar_url: null,
        title: null,
        bio: null,
        pronunciation: null,
        primary_email: user.primary_email,
        login_id: user.login_id,
        integration_id: null,
        time_zone: user.time_zone,
        locale: null,
        effective_locale: 'en-GB',
        calendar: { ics: 'https://canvas.mock/feeds/calendars/user.ics' },
        lti_user_id: 'mock',
        k5_user: false,
        use_classic_font_in_k5: false,
      };
    }
    if (path === '/api/v1/users/self/colors') return { custom_colors: w.colors };

    if (path === '/api/v1/courses') {
      const includes = list('include');
      const state = q.get('enrollment_state');
      const courses = w.courses
        .filter((c) => !state || state !== 'active' || c.workflow_state !== 'deleted')
        .map((c) => {
          const out: Json = { ...c };
          if (!includes.includes('term')) delete out.term;
          if (!includes.includes('total_scores')) {
            out.enrollments = (c.enrollments as Json[]).map(
              ({
                computed_current_score: _a,
                computed_current_grade: _b,
                computed_final_score: _c,
                computed_final_grade: _d,
                computed_current_letter_grade: _e,
                ...rest
              }) => rest,
            );
          }
          if (!includes.includes('course_image')) delete out.image_download_url;
          return out;
        });
      return paginate(req, url, courses, res);
    }

    const assignmentsMatch = path.match(/^\/api\/v1\/courses\/([^/]+)\/assignments$/);
    if (assignmentsMatch) {
      const course = courseById(w, assignmentsMatch[1]);
      if (!course) throw new HttpError(404, 'The specified resource does not exist.');
      const withSubmission = list('include').includes('submission');
      const items = (w.assignments.get(String(course.id)) ?? []).map((a) => {
        const out = strip(a);
        if (!withSubmission) delete out.submission;
        return out;
      });
      if (q.get('order_by') === 'due_at')
        items.sort((a, b) => String(a.due_at ?? '￿').localeCompare(String(b.due_at ?? '￿')));
      return paginate(req, url, items, res);
    }

    // Single items, as the reader fetches them.
    const one = path.match(
      /^\/api\/v1\/courses\/([^/]+)\/(assignments|quizzes|discussion_topics|files)\/([^/]+)$/,
    );
    if (one) {
      const [, cid, kind, itemId] = one;
      const course = courseById(w, cid);
      if (!course) throw new HttpError(404, 'The specified resource does not exist.');
      const work = w.assignments.get(String(course.id)) ?? [];
      if (kind === 'assignments') {
        const a = work.find((x) => String(x.id) === itemId);
        if (!a) throw new HttpError(404, 'The specified resource does not exist.');
        const out = strip(a);
        if (!list('include').includes('submission')) delete out.submission;
        return out;
      }
      if (kind === 'quizzes') {
        const a = work.find((x) => String(x.quiz_id) === itemId);
        if (!a) throw new HttpError(404, 'The specified resource does not exist.');
        return {
          id: a.quiz_id,
          title: a.name,
          description: a.description,
          html_url: `https://canvas.mock/courses/${cid}/quizzes/${itemId}`,
          due_at: a.due_at,
          lock_at: a.lock_at,
          unlock_at: a.unlock_at,
          points_possible: a.points_possible,
          time_limit: 30,
          allowed_attempts: 1,
          question_count: 10,
          assignment_id: a.id,
          quiz_type: 'assignment',
        };
      }
      if (kind === 'discussion_topics') {
        const a = work.find(
          (x) => String(x.id) === itemId && x._plannerType === 'discussion_topic',
        );
        const ann = w.announcements.find((x) => String(x.id) === itemId);
        if (a)
          return {
            id: a.id,
            title: a.name,
            message: a.description,
            posted_at: a.created_at,
            html_url: `https://canvas.mock/courses/${cid}/discussion_topics/${itemId}`,
            user_name: 'Course team',
            assignment_id: a.id,
            assignment: strip({ ...a, submission: undefined }),
          };
        if (ann) return ann;
        throw new HttpError(404, 'The specified resource does not exist.');
      }
      return mockFile(itemId);
    }
    const file = path.match(/^\/api\/v1\/files\/([^/]+)$/);
    if (file) return mockFile(file[1]);

    if (path === '/api/v1/planner/items') {
      // Canvas defaults the window to "from today" when start_date is omitted.
      const start = parseDate(q.get('start_date')) ?? Math.floor(now / DAY) * DAY;
      const end = parseDate(q.get('end_date'));
      const items = plannerItems(w).filter((p) => {
        const t = parseDate(p.plannable_date as string | null);
        if (t === null) return p.plannable_date === null && start <= now; // malformed items still show up
        return t >= start && (end === null || t < end);
      });
      return paginate(req, url, items, res);
    }

    if (path === '/api/v1/announcements') {
      const codes = list('context_codes');
      if (codes.length === 0) throw new HttpError(400, 'context_codes is required');
      // Quirk: start defaults to 14 days ago and end to 28 days after start, so a 60-day lookback
      // without end_date silently drops the newest posts.
      const start = parseDate(q.get('start_date')) ?? now - 14 * DAY;
      const end = parseDate(q.get('end_date')) ?? start + 28 * DAY;
      const items = w.announcements
        .filter((a) => codes.includes(String(a.context_code)))
        .filter((a) => {
          const t = parseDate(a.posted_at as string)!;
          return t >= start && t <= end && t <= now;
        })
        .sort((a, b) => String(b.posted_at).localeCompare(String(a.posted_at)))
        .map((a) => ({ ...a, posted_at: a.posted_at }));
      return paginate(req, url, items, res);
    }

    if (path === '/api/v1/calendar_events') {
      const type = q.get('type') ?? 'event';
      // Quirk: only the first 10 context codes are honoured; the rest are silently ignored.
      const codes = (
        list('context_codes').length ? list('context_codes') : [`user_${user.id}`]
      ).slice(0, 10);
      const allEvents = q.get('all_events') === 'true';
      const start = parseDate(q.get('start_date')) ?? Math.floor(now / DAY) * DAY;
      const end = parseDate(q.get('end_date')) ?? start + DAY;
      if (type !== 'event') return paginate(req, url, [], res);
      const items = w.calendarEvents.filter((e) => {
        if (!codes.includes(String(e.context_code))) return false;
        if (allEvents) return true; // Quirk: all_events ignores the date range entirely.
        const t = parseDate(e.start_at as string)!;
        return t >= start && t < end;
      });
      return paginate(req, url, items, res);
    }

    if (path === '/api/v1/users/self/enrollments') {
      const types = list('type');
      const items = w.courses
        .map((c, i) => {
          const e = (c.enrollments as Json[])[0];
          return {
            id: 500000 + i,
            user_id: user.id,
            course_id: c.id,
            type: 'StudentEnrollment',
            created_at: c.created_at,
            updated_at: c.created_at,
            associated_user_id: null,
            start_at: null,
            end_at: null,
            course_section_id: 70000 + i,
            root_account_id: 1,
            limit_privileges_to_course_section: false,
            enrollment_state: 'active',
            role: 'StudentEnrollment',
            role_id: 116,
            last_activity_at: null,
            last_attended_at: null,
            total_activity_time: 0,
            grades: c.hide_final_grades
              ? null
              : {
                  html_url: `https://canvas.mock/courses/${c.id}/grades/${user.id}`,
                  current_grade: null,
                  current_score: e.computed_current_score,
                  final_grade: null,
                  final_score: e.computed_final_score,
                  unposted_current_score: e.computed_current_score,
                },
            html_url: `https://canvas.mock/courses/${c.id}/users/${user.id}`,
            user: {
              id: user.id,
              name: user.name,
              sortable_name: user.sortable_name,
              short_name: user.short_name,
            },
          };
        })
        .filter((e) => types.length === 0 || types.includes(e.type));
      return paginate(req, url, items, res);
    }

    if (path === '/api/v1/users/self/todo') {
      const items: Json[] = [];
      for (const course of w.courses) {
        for (const a of w.assignments.get(String(course.id)) ?? []) {
          const due = parseDate(a.due_at as string | null);
          const sub = a.submission as Json;
          if (due === null || due < now || due > now + 7 * DAY || sub.submitted_at || sub.excused)
            continue;
          items.push({
            type: 'submitting',
            assignment: strip({ ...a, submission: undefined }),
            ignore: `https://canvas.mock/api/v1/users/self/todo/assignment_${a.id}/submitting?permanent=0`,
            ignore_permanently: `https://canvas.mock/api/v1/users/self/todo/assignment_${a.id}/submitting?permanent=1`,
            html_url: `https://canvas.mock/courses/${course.id}/assignments/${a.id}#submit`,
            context_type: 'Course',
            course_id: course.id,
            context_name: course.name,
            context_short_name: course.course_code,
          });
        }
      }
      return paginate(req, url, items, res);
    }

    if (path === '/api/v1/users/self/missing_submissions') {
      const items: Json[] = [];
      for (const course of w.courses) {
        for (const a of w.assignments.get(String(course.id)) ?? []) {
          const sub = a.submission as Json;
          const due = parseDate(a.due_at as string | null);
          const submittable = !(a.submission_types as string[]).some(
            (t) => t === 'on_paper' || t === 'none',
          );
          if (
            due !== null &&
            due < now &&
            !sub.submitted_at &&
            !sub.excused &&
            (submittable || !list('filter').includes('submittable'))
          ) {
            items.push(strip({ ...a, submission: undefined }));
          }
        }
      }
      return paginate(req, url, items, res);
    }

    throw new HttpError(404, 'The specified resource does not exist.');
  }

  async function handleToken(req: IncomingMessage): Promise<Json> {
    const raw = await new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => resolve(data));
    });
    const form = new URLSearchParams(raw);
    if (form.get('client_id') !== 'mock-client' || form.get('client_secret') !== 'mock-secret') {
      throw new HttpError(401, 'invalid_client', {
        error: 'invalid_client',
        error_description: 'unknown client',
      });
    }
    const issue = (scenario: ScenarioName, withRefresh: boolean): Json => {
      const access = `mock-oauth-access-${++tokenCounter}`;
      const ttl = opts.oauthTokenTtlSec ?? 3600;
      oauthTokens.set(access, { expires: Date.now() + ttl * 1000, scenario });
      const out: Json = {
        access_token: access,
        token_type: 'Bearer',
        expires_in: ttl,
        user: { id: 336001, name: 'Sam Rivera' },
      };
      if (withRefresh) {
        const refresh = `mock-oauth-refresh-${tokenCounter}`;
        refreshTokens.set(refresh, scenario);
        out.refresh_token = refresh;
      }
      return out;
    };
    if (form.get('grant_type') === 'authorization_code') {
      const code = oauthCodes.get(form.get('code') ?? '');
      if (!code || code.redirectUri !== form.get('redirect_uri'))
        throw new HttpError(400, 'invalid_grant', { error: 'invalid_grant' });
      oauthCodes.delete(form.get('code')!);
      return issue('realistic', true);
    }
    if (form.get('grant_type') === 'refresh_token') {
      const scenario = refreshTokens.get(form.get('refresh_token') ?? '');
      if (!scenario) throw new HttpError(400, 'invalid_grant', { error: 'invalid_grant' });
      return issue(scenario, false); // Canvas doesn't rotate refresh tokens.
    }
    throw new HttpError(400, 'unsupported_grant_type', { error: 'unsupported_grant_type' });
  }

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    let status = 200;
    let scenario: string | null = null;
    try {
      if (opts.latencyMs) await new Promise((r) => setTimeout(r, opts.latencyMs));
      try {
        scenario = req.headers.authorization ? scenarioFor(req) : null;
      } catch {
        /* reported by route() */
      }
      let body: unknown;
      if (url.pathname === '/login/oauth2/token' && req.method === 'POST')
        body = await handleToken(req);
      else body = route(req, url, res);
      status = res.statusCode;
      if (body !== undefined) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(body));
      } else res.end();
    } catch (e) {
      const err = e instanceof HttpError ? e : new HttpError(500, String(e));
      status = err.status;
      res.statusCode = err.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(err.body));
    } finally {
      const entry = {
        method: req.method ?? 'GET',
        path: url.pathname,
        query: url.search,
        status,
        scenario,
      };
      requests.push(entry);
      if (entry.method !== 'GET' && url.pathname.startsWith('/api/')) writes.push(entry);
    }
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    requests,
    writes,
    world,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// `pnpm canvas:mock` runs it standalone.
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.MOCK_CANVAS_PORT ?? 4810);
  const latencyMs = Number(process.env.MOCK_CANVAS_LATENCY_MS ?? 0);
  const mock = await startMockCanvas({ port, latencyMs });
  console.log(
    `Mock Canvas on ${mock.url}  (tokens: ${SCENARIOS.map((s) => `mock-${s}`).join(', ')})`,
  );
  console.log(`OAuth client: mock-client / mock-secret`);
}
