// What every release ships, under one naming scheme: Tarpaulin-<version>-<platform>.<ext>, such
// as Tarpaulin-0.2.3-windows-x64-setup.exe. tauri-action uploads its own names
// (Tarpaulin_0.2.3_x64-setup.exe, Tarpaulin_aarch64.app.tar.gz, Tarpaulin-0.2.3-1.x86_64.rpm…),
// and release.yml renames them to these before latest.json is written. The updater checks a
// file's signature and the version signed into it, never its name, so renaming is safe.
//
//   gh api …/releases/<id>/assets | node scripts/release-files.ts renames 0.2.3
//     prints "<asset id> <new name>" for each asset that still has tauri-action's name
//
// The same table names the download pages (scripts/download-pages.ts) and feeds latest.json
// (scripts/updater-manifest.ts).

export interface ReleaseFile {
  /** Its download page, under …github.io/tarpaulin/download/<slug>/ (installers only). */
  slug: string | null;
  label: string;
  /** How tauri-action names it. */
  tauri: RegExp;
  /** The part after "Tarpaulin-<version>-". */
  suffix: string;
}

export const RELEASE_FILES: ReleaseFile[] = [
  {
    slug: 'windows-x64',
    label: 'Windows x64 installer',
    tauri: /_x64-setup\.exe$/,
    suffix: 'windows-x64-setup.exe',
  },
  {
    slug: 'windows-x64-msi',
    label: 'Windows x64 MSI',
    tauri: /_x64_[a-z]{2}-[A-Z]{2}\.msi$/,
    suffix: 'windows-x64.msi',
  },
  {
    slug: 'windows-arm64',
    label: 'Windows arm64 installer',
    tauri: /_arm64-setup\.exe$/,
    suffix: 'windows-arm64-setup.exe',
  },
  {
    slug: 'macos-apple-silicon',
    label: 'macOS, Apple silicon',
    tauri: /_aarch64\.dmg$/,
    suffix: 'macos-apple-silicon.dmg',
  },
  { slug: 'macos-intel', label: 'macOS, Intel', tauri: /_x64\.dmg$/, suffix: 'macos-intel.dmg' },
  {
    slug: null,
    label: 'macOS update, Apple silicon',
    tauri: /_aarch64\.app\.tar\.gz$/,
    suffix: 'macos-apple-silicon.app.tar.gz',
  },
  {
    slug: null,
    label: 'macOS update, Intel',
    tauri: /_x64\.app\.tar\.gz$/,
    suffix: 'macos-intel.app.tar.gz',
  },
  {
    slug: 'linux-x64-appimage',
    label: 'Linux x64 AppImage',
    tauri: /_amd64\.AppImage$/,
    suffix: 'linux-x64.AppImage',
  },
  {
    slug: 'linux-x64-deb',
    label: 'Linux x64 .deb',
    tauri: /_amd64\.deb$/,
    suffix: 'linux-x64.deb',
  },
  {
    slug: 'linux-x64-rpm',
    label: 'Linux x64 .rpm',
    tauri: /\.x86_64\.rpm$/,
    suffix: 'linux-x64.rpm',
  },
  {
    slug: 'linux-arm64-appimage',
    label: 'Linux arm64 AppImage',
    tauri: /_aarch64\.AppImage$/,
    suffix: 'linux-arm64.AppImage',
  },
  {
    slug: 'linux-arm64-deb',
    label: 'Linux arm64 .deb',
    tauri: /_arm64\.deb$/,
    suffix: 'linux-arm64.deb',
  },
  {
    slug: 'linux-arm64-rpm',
    label: 'Linux arm64 .rpm',
    tauri: /\.aarch64\.rpm$/,
    suffix: 'linux-arm64.rpm',
  },
];

/** The release name for a tauri-action file (or its .sig), or null to leave it as it is. */
export function releaseName(name: string, version: string): string | null {
  const sig = name.endsWith('.sig');
  const base = sig ? name.slice(0, -4) : name;
  // Already renamed. (tauri-action's rpm names start the same way, so match the whole name.)
  if (RELEASE_FILES.some((f) => base === `Tarpaulin-${version}-${f.suffix}`)) return null;
  const file = RELEASE_FILES.find((f) => f.tauri.test(base));
  return file ? `Tarpaulin-${version}-${file.suffix}${sig ? '.sig' : ''}` : null;
}

/** The release file with this table entry's suffix, whatever version it carries. */
export function findAsset<T extends { name: string }>(assets: T[], suffix: string): T | undefined {
  return assets.find((a) => a.name.startsWith('Tarpaulin-') && a.name.endsWith(`-${suffix}`));
}

async function main() {
  const [command, version] = process.argv.slice(2);
  if (command !== 'renames' || !version)
    throw new Error('usage: release-files.ts renames <version> < assets.json');
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const assets = JSON.parse(input) as { id: number; name: string }[];
  const names = new Set(assets.map((a) => a.name));
  for (const a of assets) {
    const to = releaseName(a.name, version);
    if (!to) continue;
    // Two files can't share a name; a re-run never meets this, since renamed files are skipped.
    if (names.has(to)) throw new Error(`${a.name} → ${to}: that name is taken`);
    console.log(`${a.id} ${to}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e: unknown) => {
    console.error(`::error::${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
