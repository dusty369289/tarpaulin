// Replaces personal data in recorded Canvas responses with stable placeholders so fixtures keep
// real shapes, dates and relationships without committing names, emails, IDs or grades.

export const PLACEHOLDER_ORIGIN = 'https://canvas.example.edu';

const PERSON_KEYS = new Set([
  'sortable_name',
  'short_name',
  'first_name',
  'last_name',
  'display_name',
  'user_name',
  'login_id',
  'primary_email',
  'email',
  'pronouns',
  'pronunciation',
  'author_name',
]);
const COURSE_NAME_KEYS = new Set(['context_name', 'original_name', 'friendly_name']);
const CODE_KEYS = new Set(['course_code', 'context_short_name', 'sis_course_id', 'sis_user_id']);
const TEXT_KEYS = new Set(['message', 'description', 'bio', 'body', 'syllabus_body', 'details']);
const DROP_KEYS = new Set([
  'uuid',
  'lti_context_id',
  'secure_params',
  'integration_id',
  'lti_user_id',
  'calendar',
  'avatar_url',
  'avatar_image_url',
  'image_download_url',
  'context_image',
  'lock_explanation',
  'lti_id',
  'original_quiz_id',
  'original_lti_resource_link_id',
  'permissions',
  'attachments',
  'rubric',
  'rubric_settings',
  'external_tool_tag_attributes',
  'all_dates',
  'overrides',
]);
const SCORE_KEYS = /(^|_)(score|current_points|final_points)$/;
const GRADE_KEYS = /(^|_)grade$/;
const LOCATION_KEYS = new Set(['location_name', 'location_address']);

export class Anonymizer {
  private ids = new Map<string, number>();
  private labels = new Map<string, Map<string, string>>();
  private nextId = 1001;

  constructor(private originalOrigin: string) {}

  id(original: string | number): number {
    const key = String(original);
    let mapped = this.ids.get(key);
    if (mapped === undefined) {
      mapped = this.nextId++;
      this.ids.set(key, mapped);
    }
    return mapped;
  }

  label(kind: string, original: string): string {
    let table = this.labels.get(kind);
    if (!table) this.labels.set(kind, (table = new Map()));
    let value = table.get(original);
    if (!value) {
      const n = table.size;
      value =
        kind === 'Course'
          ? `Course ${String.fromCharCode(65 + (n % 26))}${n >= 26 ? Math.floor(n / 26) : ''}`
          : `${kind} ${n + 1}`;
      table.set(original, value);
    }
    return value;
  }

  /** Swaps the host and every numeric path segment / context code id. */
  text(value: string): string {
    let out = value.split(this.originalOrigin).join(PLACEHOLDER_ORIGIN);
    out = out.replace(
      /\/(courses|users|assignments|discussion_topics|quizzes|grades|calendar_events|files|pages|groups|planner_notes|announcements|submissions)\/(\d+)/g,
      (_m, seg: string, n: string) => `/${seg}/${this.id(n)}`,
    );
    // Context codes and asset strings: course_123, discussion_topic_456, …
    out = out.replace(
      /\b([a-z]+(?:_[a-z]+)*)_(\d{3,})\b/g,
      (_m, kind: string, n: string) => `${kind}_${this.id(n)}`,
    );
    return out;
  }

  /** Numeric `path` ids (e.g. /api/v1/courses/123/assignments) are remapped too. */
  path(path: string): string {
    return path.replace(/\/(\d+)(?=\/|$)/g, (_m, n: string) => `/${this.id(n)}`);
  }

  private nameKind(obj: Record<string, unknown>): string {
    if ('course_code' in obj || 'enrollment_term_id' in obj) return 'Course';
    if ('due_at' in obj || 'submission_types' in obj || 'points_possible' in obj)
      return 'Assignment';
    if ('sortable_name' in obj || 'login_id' in obj) return 'Person';
    if ('start_at' in obj && 'end_at' in obj && !('due_at' in obj)) return 'Term';
    return 'Item';
  }

  value(value: unknown, key = '', parent: Record<string, unknown> = {}): unknown {
    if (Array.isArray(value)) return value.map((v) => this.value(v, key, parent));
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (DROP_KEYS.has(k)) continue;
        if (k === 'custom_colors' && v && typeof v === 'object') {
          out[k] = Object.fromEntries(
            Object.entries(v).map(([code, color]) => [this.text(code), color]),
          );
          continue;
        }
        out[k] = this.value(v, k, obj);
      }
      return out;
    }
    if (value === null || value === undefined) return value;

    const isId = key === 'id' || key.endsWith('_id');
    if (isId && (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))) {
      return this.id(value);
    }
    if (typeof value === 'number') {
      if (SCORE_KEYS.test(key)) return 50 + (this.id(`${key}:${value}`) % 46);
      return value;
    }
    if (typeof value !== 'string') return value;

    if (key === 'name') {
      const kind = this.nameKind(parent);
      return kind === 'Term' ? value : this.label(kind, value);
    }
    if (key === 'title') return this.label(parent.is_announcement ? 'Announcement' : 'Item', value);
    if (PERSON_KEYS.has(key)) return this.label('Person', value);
    if (COURSE_NAME_KEYS.has(key)) return this.label('Course', value);
    if (CODE_KEYS.has(key)) return this.label('CODE', value).replace(' ', '');
    if (TEXT_KEYS.has(key))
      return value ? '<p>Placeholder text recorded from a real response.</p>' : value;
    if (LOCATION_KEYS.has(key)) return value ? this.label('Room', value) : value;
    if (GRADE_KEYS.test(key)) return value ? 'B' : value;
    if (/_(name|title)$/.test(key)) return this.label('Item', value);
    // Any other string can still embed the host or ids (URLs under unexpected keys, context codes).
    return this.text(value);
  }
}
