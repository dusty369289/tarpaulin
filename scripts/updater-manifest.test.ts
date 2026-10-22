import { describe, expect, it } from 'vitest';
import { buildManifest, PLATFORMS } from './updater-manifest';

// The files a full v0.1.1 release carried, under their release names, each with a .sig beside it.
const NAMES = [
  'Tarpaulin-0.1.1-linux-arm64.rpm',
  'Tarpaulin-0.1.1-linux-x64.rpm',
  'Tarpaulin-0.1.1-linux-arm64.AppImage',
  'Tarpaulin-0.1.1-linux-x64.AppImage',
  'Tarpaulin-0.1.1-linux-x64.deb',
  'Tarpaulin-0.1.1-windows-arm64-setup.exe',
  'Tarpaulin-0.1.1-linux-arm64.deb',
  'Tarpaulin-0.1.1-windows-x64-setup.exe',
  'Tarpaulin-0.1.1-windows-x64.msi',
  'Tarpaulin-0.1.1-macos-apple-silicon.app.tar.gz',
  'Tarpaulin-0.1.1-macos-intel.app.tar.gz',
];
const assets = NAMES.map((name) => ({ name, signature: `sig of ${name}` }));
const build = (list = assets) =>
  buildManifest({ repo: 'o/r', tag: 'v0.1.1', notes: 'n', pubDate: 'd', assets: list });

describe('updater manifest', () => {
  it('has every platform, each bundle under its own key too', () => {
    const m = build();
    expect(m.version).toBe('0.1.1');
    expect(Object.keys(m.platforms).sort()).toEqual(
      [
        ...PLATFORMS,
        'darwin-aarch64-app',
        'darwin-x86_64-app',
        'linux-aarch64-appimage',
        'linux-aarch64-deb',
        'linux-aarch64-rpm',
        'linux-x86_64-appimage',
        'linux-x86_64-deb',
        'linux-x86_64-rpm',
        'windows-aarch64-nsis',
        'windows-x86_64-msi',
        'windows-x86_64-nsis',
      ].sort(),
    );
  });

  it('defaults to what tauri-action picks: the MSI on Windows x64, the AppImage on Linux', () => {
    const m = build();
    expect(m.platforms['windows-x86_64'].url).toBe(
      'https://github.com/o/r/releases/download/v0.1.1/Tarpaulin-0.1.1-windows-x64.msi',
    );
    expect(m.platforms['linux-aarch64'].signature).toBe(
      'sig of Tarpaulin-0.1.1-linux-arm64.AppImage',
    );
    expect(m.platforms['darwin-x86_64'].url).toMatch(
      /\/Tarpaulin-0\.1\.1-macos-intel\.app\.tar\.gz$/,
    );
  });

  it('names a platform whose bundle is missing', () => {
    expect(() => build(assets.filter((a) => !a.name.endsWith('windows-arm64-setup.exe')))).toThrow(
      'no updater bundle for windows-aarch64',
    );
  });
});
