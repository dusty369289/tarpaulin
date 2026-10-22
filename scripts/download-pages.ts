// Builds the Tarpaulin website (GitHub Pages) from the latest release's files:
//   - the landing page (site/index.html, filled in with the version, sizes and download links,
//     and the README's pictures, which pnpm readme:assets renders);
//   - one page per installer at download/<slug>/ that sends the browser straight to that file
//     (whose name carries the version, so it changes every release), which the README links to;
//   - a plain list of every download at download/.
//
//   GH_TOKEN=… node scripts/download-pages.ts [out dir] [pictures dir]
//                                    # defaults: .cache/pages and .cache/readme
//   RELEASE_JSON=release.json node scripts/download-pages.ts   # from a saved API response
//
// .github/workflows/readme-assets.yml publishes the result to GitHub Pages after every release.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { RELEASE_FILES, findAsset } from './release-files.ts';

const REPO = process.env.GITHUB_REPOSITORY ?? 'dusty369289/tarpaulin';
const OUT = process.argv[2] ?? '.cache/pages';
const PICTURES = process.argv[3] ?? '.cache/readme';
const RELEASES = `https://github.com/${REPO}/releases`;

interface Release {
  tag_name: string;
  html_url: string;
  assets: { name: string; size: number; browser_download_url: string }[];
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function page(title: string, body: string, redirect?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${redirect ? `<meta http-equiv="refresh" content="0; url=${esc(redirect)}">\n<script>location.replace(${JSON.stringify(redirect)})</script>` : ''}
<style>
  :root { color-scheme: light dark; --bg: #f4f5f7; --fg: #1b1f2a; --muted: #5b6275; --accent: #6366f1; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0f1117; --fg: #e6e8ee; --muted: #9aa1b2; --accent: #8b8ff5; } }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 34rem; margin: 0 auto; padding: 3rem 1rem; }
  h1 { font-size: 1.5rem; margin: 0 0 .5rem; }
  p, li { color: var(--muted); }
  a { color: var(--accent); }
  ul { padding-left: 1.2rem; }
</style>
</head>
<body><main>${body}</main></body>
</html>
`;
}

async function latestRelease(): Promise<Release> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`latest release: HTTP ${res.status}`);
  return (await res.json()) as Release;
}

async function main() {
  const release = process.env.RELEASE_JSON
    ? (JSON.parse(readFileSync(process.env.RELEASE_JSON, 'utf8')) as Release)
    : await latestRelease();
  const version = release.tag_name.replace(/^v/, '');

  rmSync(OUT, { recursive: true, force: true });
  const rows: string[] = [];
  const files: Record<string, { url: string; size: number; name: string }> = {};
  for (const file of RELEASE_FILES) {
    if (!file.slug) continue;
    const asset = findAsset(release.assets, file.suffix);
    const dir = join(OUT, 'download', file.slug);
    mkdirSync(dir, { recursive: true });
    if (!asset) {
      // Not in this release: send people to the release instead of a dead link.
      writeFileSync(
        join(dir, 'index.html'),
        page(
          `Tarpaulin ${version}`,
          `<h1>Not in this release</h1><p>Tarpaulin ${esc(version)} has no ${esc(file.label)} build. <a href="${esc(release.html_url)}">See every download for ${esc(version)}</a>.</p>`,
          release.html_url,
        ),
      );
      continue;
    }
    const mb = (asset.size / 1024 / 1024).toFixed(1);
    writeFileSync(
      join(dir, 'index.html'),
      page(
        `Downloading Tarpaulin ${version}`,
        `<h1>Downloading Tarpaulin ${esc(version)}</h1><p>${esc(file.label)}, ${mb} MB. If it doesn’t start, <a href="${esc(asset.browser_download_url)}">download ${esc(asset.name)}</a>.</p><p><a href="${RELEASES}">Every version</a></p>`,
        asset.browser_download_url,
      ),
    );
    rows.push(`<li><a href="${file.slug}/">${esc(file.label)}</a> · ${mb} MB</li>`);
    files[file.slug] = { url: asset.browser_download_url, size: asset.size, name: asset.name };
  }
  const list = page(
    `Download Tarpaulin ${version}`,
    `<h1>Download Tarpaulin ${esc(version)}</h1><ul>${rows.join('')}</ul><p><a href="${esc(release.html_url)}">Release notes</a> · <a href="${RELEASES}">every version</a> · <a href="https://github.com/${REPO}">source code</a></p>`,
  );
  writeFileSync(join(OUT, 'download', 'index.html'), list);
  writeLanding(version, files);
  // Pages serves this site as is (no Jekyll).
  writeFileSync(join(OUT, '.nojekyll'), '');
  console.log(`Download pages for ${version} in ${OUT}: ${rows.length} files`);
}

/** The landing page, with the release's details and the README's pictures. */
function writeLanding(version: string, files: Record<string, unknown>) {
  const img = join(OUT, 'img');
  mkdirSync(img, { recursive: true });
  copyFileSync('public/icon.png', join(img, 'icon.png'));
  if (!existsSync(PICTURES))
    throw new Error(`no pictures in ${PICTURES}: run pnpm readme:assets first`);
  for (const f of readdirSync(PICTURES))
    if (f.endsWith('.webp')) copyFileSync(join(PICTURES, f), join(img, f));
  // </ can't appear inside the JSON script block, so a file name can't close it.
  const data = JSON.stringify({ version, files }).replaceAll('</', '<\\/');
  const html = readFileSync('site/index.html', 'utf8')
    .replaceAll('{{VERSION}}', esc(version))
    .replace('{{RELEASE}}', data);
  writeFileSync(join(OUT, 'index.html'), html);
}

main().catch((e: unknown) => {
  console.error(`::error::${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
