// Runs the widget layout sweep (scripts/widget-lab.ts) once per widget style, skipping any style
// whose hash matches the last run that passed. A style's hash covers its own files
// (src/theme/skins/<id>.ts and .css) plus everything every style shares: widgets, frame, global
// CSS, fonts, the lab and the mock data. Change one style and only that style is re-swept;
// change a widget and every style is.
//
//   pnpm test:themes              # sweep changed styles, record passes in .cache/theme-sweep.json
//   pnpm test:themes --all        # ignore the cache
//   pnpm test:themes --dry-run    # just print what would run
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE = '.cache/theme-sweep.json';
// The plain card style is the default, swept on every scenario by `pnpm test:widgets` already.
const COVERED = new Set(['card']);
const SKIN_DIR = 'src/theme/skins';
// Scenarios each style is swept against: everyday data and the awkward stuff.
const SCENARIOS = process.env.THEME_SCENARIOS ?? 'realistic,edge';

const SHARED = [
  'src/widgets',
  'src/index.css',
  'src/theme/skins/shared.css',
  'src/theme/skins/types.ts',
  'src/theme/palette.ts',
  'src/theme/themes.ts',
  'src/dev',
  'src/app/settle.ts',
  'src/canvas',
  'src/dashboard/WidgetHost.tsx',
  'src/dashboard/Grid.tsx',
  'scripts/widget-lab.ts',
  'scripts/browser.ts',
  'mock-canvas',
  'tailwind.config.ts',
  'pnpm-lock.yaml',
];

function files(path: string): string[] {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .sort()
    .flatMap((f) => files(join(path, f)));
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

const shared = hashFiles(SHARED);
const hashes = Object.fromEntries(
  Object.entries(skinFiles())
    .filter(([id]) => !COVERED.has(id))
    .map(([id, f]) => {
      return [
        id,
        createHash('sha256')
          .update(shared)
          .update(hashFiles([join(SKIN_DIR, `${f}.ts`), join(SKIN_DIR, `${f}.css`)]))
          .update(SCENARIOS)
          .digest('hex')
          .slice(0, 16),
      ];
    }),
);

const passed: Record<string, string> = existsSync(CACHE)
  ? JSON.parse(readFileSync(CACHE, 'utf8'))
  : {};
const all = process.argv.includes('--all');
const todo = Object.keys(hashes).filter((id) => all || passed[id] !== hashes[id]);
for (const id of Object.keys(hashes))
  console.log(`${todo.includes(id) ? '→ sweep' : '✔ skip '} ${id.padEnd(12)} ${hashes[id]}`);

if (process.argv.includes('--dry-run') || todo.length === 0) {
  if (!todo.length) console.log('Every widget style passed at its current hash.');
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
      `--skins=${todo.join(',')}`,
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
