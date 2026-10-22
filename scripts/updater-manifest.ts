// Writes the updater's latest.json for a draft release from the files already on it, once every
// platform has built. Each build used to add its own platform to latest.json by downloading it
// and uploading it again, and builds that finished together raced: one dropped another's entry,
// or failed replacing an asset another had just replaced. Built once here, it can't race.
//
//   GH_TOKEN=… node scripts/updater-manifest.ts <owner/repo> <release id> <tag> > latest.json
//
// Keys and defaults match tauri-action's, so installed apps read it the same way: each bundle
// has its own key (windows-x86_64-msi, linux-aarch64-deb, …), and the plain <os>-<arch> key is
// the bundle an install updates from (the MSI over NSIS on Windows x64, the AppImage on Linux).

export interface Asset {
  name: string;
  /** The contents of the asset's .sig file. */
  signature: string;
}

export interface Manifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
}

// [file pattern, its own key, whether it is the platform's default]. Earlier defaults win.
const BUNDLES: [RegExp, string, boolean][] = [
  [/_aarch64\.app\.tar\.gz$/, 'darwin-aarch64-app', true],
  [/_x64\.app\.tar\.gz$/, 'darwin-x86_64-app', true],
  [/_x64_[a-z]{2}-[A-Z]{2}\.msi$/, 'windows-x86_64-msi', true],
  [/_x64-setup\.exe$/, 'windows-x86_64-nsis', true],
  [/_arm64-setup\.exe$/, 'windows-aarch64-nsis', true],
  [/_amd64\.AppImage$/, 'linux-x86_64-appimage', true],
  [/_aarch64\.AppImage$/, 'linux-aarch64-appimage', true],
  [/_amd64\.deb$/, 'linux-x86_64-deb', false],
  [/_arm64\.deb$/, 'linux-aarch64-deb', false],
  [/\.x86_64\.rpm$/, 'linux-x86_64-rpm', false],
  [/\.aarch64\.rpm$/, 'linux-aarch64-rpm', false],
];

export const PLATFORMS = [
  'darwin-aarch64',
  'darwin-x86_64',
  'windows-x86_64',
  'windows-aarch64',
  'linux-x86_64',
  'linux-aarch64',
];

export function buildManifest(opts: {
  repo: string;
  tag: string;
  notes: string;
  pubDate: string;
  assets: Asset[];
}): Manifest {
  const platforms: Manifest['platforms'] = {};
  for (const [pattern, key, isDefault] of BUNDLES) {
    const asset = opts.assets.find((a) => pattern.test(a.name));
    if (!asset) continue;
    const entry = {
      signature: asset.signature,
      url: `https://github.com/${opts.repo}/releases/download/${opts.tag}/${encodeURIComponent(asset.name)}`,
    };
    platforms[key] = entry;
    const plain = key.replace(/-[a-z]+$/, '');
    if (isDefault && !platforms[plain]) platforms[plain] = entry;
  }
  const missing = PLATFORMS.filter((p) => !platforms[p]);
  if (missing.length) throw new Error(`no updater bundle for ${missing.join(', ')}`);
  return {
    version: opts.tag.replace(/^v/, ''),
    notes: opts.notes,
    pub_date: opts.pubDate,
    platforms,
  };
}

async function main() {
  const [repo, releaseId, tag] = process.argv.slice(2);
  if (!repo || !releaseId || !tag)
    throw new Error('usage: updater-manifest.ts <owner/repo> <release id> <tag>');
  const headers = {
    Authorization: `Bearer ${process.env.GH_TOKEN ?? ''}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const api = async (path: string, accept = 'application/vnd.github+json') => {
    const res = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      headers: { ...headers, Accept: accept },
    });
    if (!res.ok) throw new Error(`GET ${path}: HTTP ${res.status}`);
    return res;
  };
  const release = (await (await api(`releases/${releaseId}`)).json()) as {
    body: string | null;
    assets: { id: number; name: string }[];
  };
  const byName = new Map(release.assets.map((a) => [a.name, a.id]));
  const assets: Asset[] = [];
  for (const a of release.assets) {
    const sig = byName.get(`${a.name}.sig`);
    if (!sig) continue;
    const signature = await (
      await api(`releases/assets/${sig}`, 'application/octet-stream')
    ).text();
    assets.push({ name: a.name, signature: signature.trim() });
  }
  const manifest = buildManifest({
    repo,
    tag,
    notes: release.body ?? '',
    pubDate: new Date().toISOString(),
    assets,
  });
  console.log(JSON.stringify(manifest, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e: unknown) => {
    console.error(`::error::${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
