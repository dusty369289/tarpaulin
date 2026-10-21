// Runs the widget layout sweep (scripts/widget-lab.ts) once per widget style and colour mode,
// skipping any style/mode whose hash matches the last run that passed. A style's hash covers its
// own files (src/theme/skins/<id>.ts and .css, which hold both its light and dark variants), the
// mode, plus everything every style shares: every file the lab page imports (widgets, frame,
// global CSS, stores, helpers), the lab driver, the mock data and the lockfile. Change one style
// and only that style is re-swept (in both modes); change a widget and every style is.
//
//   pnpm test:themes                 # sweep changed styles, record passes in .cache/theme-sweep.json
//   pnpm test:themes --all           # ignore the cache
//   pnpm test:themes --modes=dark    # only these modes (default: light,dark)
//   pnpm test:themes --styles=postit # only these styles (CI runs one style per job)
//   pnpm test:themes --dry-run       # just print what would run
//   pnpm test:themes --inputs        # list the shared files the hash covers
//   CHANGED_FILES='["src/lib/dates.ts"]' node scripts/theme-sweep.ts --affected
//                                    # print true if any of those files can change a sweep
//                                    # (CI uses it to decide whether the sweep jobs run)
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const CACHE = '.cache/theme-sweep.json';
// The plain card style in light mode is the default, swept on every scenario by
// `pnpm test:widgets` already.
const COVERED = new Set(['card:light']);
const MODES = (
  process.argv.find((a) => a.startsWith('--modes='))?.split('=')[1] ??
  process.env.THEME_MODES ??
  'light,dark'
).split(',');
const STYLES = process.argv
  .find((a) => a.startsWith('--styles='))
  ?.split('=')[1]
  ?.split(',');
const SKIN_DIR = 'src/theme/skins';
// Scenarios each style is swept against: everyday data and the awkward stuff.
const SCENARIOS = process.env.THEME_SCENARIOS ?? 'realistic,edge';

// Everything every style shares is found by following imports from what the lab renders: the
// lab itself and the providers main.tsx wraps it in. That way a widget's new import (a date
// helper, a shared control, the settings store) is hashed without anyone updating a list here.
const ROOTS = [
  'src/dev/WidgetLab.tsx',
  'src/main.tsx',
  'src/theme/ThemeProvider.tsx',
  'src/canvas/CanvasProvider.tsx',
  'src/canvas/hooks.ts',
  'src/canvas/transport.ts',
  'src/reader/ReaderProvider.tsx',
  'src/index.css',
];
// Not followed into: main.tsx also imports the whole app (App.tsx), which the lab never shows.
const LEAVES = new Set(['src/main.tsx']);
// Inputs that aren't imported by the page: the lab driver, the mock data, the CSS build and the
// installed packages.
const EXTRA = [
  'scripts/widget-lab.ts',
  'scripts/browser.ts',
  'mock-canvas',
  'tailwind.config.ts',
  'postcss.config.js',
  'index.html',
  'pnpm-lock.yaml',
];

function files(path: string): string[] {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .sort()
    .flatMap((f) => files(join(path, f)));
}

const IMPORT_JS =
  /(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const IMPORT_CSS = /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]|url\(\s*['"]?(\.[^'")]+)['"]?\s*\)/g;

/** Resolves a relative import the way Vite does for this project (no path aliases). */
function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null; // a package: covered by pnpm-lock.yaml
  const base = join(dirname(from), spec.replace(/[?#].*$/, ''));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  if (base.endsWith('.js'))
    candidates.push(base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'));
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

/** Every local file reachable from the roots, in a stable order. */
function importGraph(roots: string[], leaves: Set<string>): string[] {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    if (leaves.has(file) || !/\.(tsx?|css)$/.test(file)) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(file.endsWith('.css') ? IMPORT_CSS : IMPORT_JS)) {
      const spec = m[1] ?? m[2] ?? m[3];
      const target = spec && resolveImport(file, spec);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return [...seen].sort();
}

function hashFiles(paths: string[]): string {
  const h = createHash('sha256');
  for (const p of paths.flatMap(files)) {
    h.update(p);
    h.update(readFileSync(p));
  }
  return h.digest('hex').slice(0, 16);
}

/** Style id → its file name (without extension) in src/theme/skins. */
function skinFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of readdirSync(SKIN_DIR)) {
    if (!f.endsWith('.ts') || f === 'index.ts' || f === 'types.ts') continue;
    const id = readFileSync(join(SKIN_DIR, f), 'utf8').match(/\bid: '([^']+)'/)?.[1];
    if (id) out[id] = f.replace(/\.ts$/, '');
  }
  return out;
}

const known = skinFiles();
const unknown = (STYLES ?? []).filter((id) => !known[id]);
if (unknown.length) {
  console.error(
    `Unknown widget style(s): ${unknown.join(', ')}. Known: ${Object.keys(known).join(', ')}`,
  );
  process.exit(2);
}
// Each style's own files are hashed per style below, so they're left out of the shared part
// (the skin index imports every one of them).
const ownFiles = new Set(
  Object.values(known).flatMap((f) => [join(SKIN_DIR, `${f}.ts`), join(SKIN_DIR, `${f}.css`)]),
);
const sharedInputs = [
  ...importGraph(ROOTS, LEAVES).filter((f) => !ownFiles.has(f)),
  ...EXTRA.flatMap(files),
];
if (process.argv.includes('--inputs')) {
  console.log(sharedInputs.join('\n'));
  process.exit(0);
}
if (process.argv.includes('--affected')) {
  // Besides the hashed files: every style's own files, and what runs the sweeps.
  const inputs = new Set([
    ...sharedInputs,
    ...files(SKIN_DIR),
    'scripts/theme-sweep.ts',
    'package.json',
  ]);
  const changed: string[] = JSON.parse(process.env.CHANGED_FILES ?? '[]');
  const hits = changed.filter(
    (f) => inputs.has(f) || f.startsWith('.github/actions/') || f === '.github/workflows/ci.yml',
  );
  for (const f of hits) console.error(`affects the sweeps: ${f}`);
  console.log(hits.length ? 'true' : 'false');
  process.exit(0);
}
const shared = hashFiles(sharedInputs);
// Keyed "<style>:<mode>", e.g. "postit:dark".
const hashes = Object.fromEntries(
  Object.entries(known)
    .filter(([id]) => !STYLES || STYLES.includes(id))
    .flatMap(([id, f]) => {
      const own = hashFiles([join(SKIN_DIR, `${f}.ts`), join(SKIN_DIR, `${f}.css`)]);
      return MODES.map((mode) => [
        `${id}:${mode}`,
        createHash('sha256')
          .update(shared)
          .update(own)
          .update(mode)
          .update(SCENARIOS)
          .digest('hex')
          .slice(0, 16),
      ]).filter(([key]) => !COVERED.has(key));
    }),
);

const passed: Record<string, string> = existsSync(CACHE)
  ? JSON.parse(readFileSync(CACHE, 'utf8'))
  : {};
const all = process.argv.includes('--all');
const todo = Object.keys(hashes).filter((id) => all || passed[id] !== hashes[id]);
for (const id of Object.keys(hashes))
  console.log(`${todo.includes(id) ? '→ sweep' : '✔ skip '} ${id.padEnd(18)} ${hashes[id]}`);

if (process.argv.includes('--dry-run') || todo.length === 0) {
  if (!todo.length) console.log('Every widget style passed in every mode at its current hash.');
  process.exit(0);
}

mkdirSync('.cache', { recursive: true });
const report = '.cache/theme-sweep-report.json';
let status = 0;
try {
  execFileSync(
    'npx',
    [
      'tsx',
      'scripts/widget-lab.ts',
      `--scenario=${SCENARIOS}`,
      `--pairs=${todo.join(',')}`,
      `--report=${report}`,
    ],
    { stdio: 'inherit' },
  );
} catch {
  status = 1;
}
// Record each style that came through clean, even if another one failed.
const failures: Record<string, number> = existsSync(report)
  ? JSON.parse(readFileSync(report, 'utf8'))
  : {};
const anyStyleFailed = todo.some((id) => failures[id] !== 0);
// A non-zero exit with every style clean means something global broke (a page error, a write
// to Canvas): record nothing.
if (status === 0 || anyStyleFailed)
  for (const id of todo) if (failures[id] === 0) passed[id] = hashes[id];
writeFileSync(CACHE, JSON.stringify(passed, null, 2));
const bad = todo.filter((id) => failures[id] !== 0);
if (status && !bad.length) console.log('✘ sweep failed outside any one style; nothing recorded');
console.log(bad.length ? `✘ failing styles: ${bad.join(', ')}` : `✔ swept ${todo.join(', ')}`);
process.exit(status || bad.length ? 1 : 0);
