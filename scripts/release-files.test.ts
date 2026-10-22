import { describe, expect, it } from 'vitest';
import { RELEASE_FILES, findAsset, releaseName } from './release-files';

// What tauri-action uploaded for v0.2.2.
const TAURI = [
  ['Tarpaulin_0.2.2_x64-setup.exe', 'Tarpaulin-0.2.2-windows-x64-setup.exe'],
  ['Tarpaulin_0.2.2_x64_en-US.msi', 'Tarpaulin-0.2.2-windows-x64.msi'],
  ['Tarpaulin_0.2.2_arm64-setup.exe', 'Tarpaulin-0.2.2-windows-arm64-setup.exe'],
  ['Tarpaulin_0.2.2_aarch64.dmg', 'Tarpaulin-0.2.2-macos-apple-silicon.dmg'],
  ['Tarpaulin_0.2.2_x64.dmg', 'Tarpaulin-0.2.2-macos-intel.dmg'],
  ['Tarpaulin_aarch64.app.tar.gz', 'Tarpaulin-0.2.2-macos-apple-silicon.app.tar.gz'],
  ['Tarpaulin_x64.app.tar.gz', 'Tarpaulin-0.2.2-macos-intel.app.tar.gz'],
  ['Tarpaulin_0.2.2_amd64.AppImage', 'Tarpaulin-0.2.2-linux-x64.AppImage'],
  ['Tarpaulin_0.2.2_amd64.deb', 'Tarpaulin-0.2.2-linux-x64.deb'],
  ['Tarpaulin-0.2.2-1.x86_64.rpm', 'Tarpaulin-0.2.2-linux-x64.rpm'],
  ['Tarpaulin_0.2.2_aarch64.AppImage', 'Tarpaulin-0.2.2-linux-arm64.AppImage'],
  ['Tarpaulin_0.2.2_arm64.deb', 'Tarpaulin-0.2.2-linux-arm64.deb'],
  ['Tarpaulin-0.2.2-1.aarch64.rpm', 'Tarpaulin-0.2.2-linux-arm64.rpm'],
] as const;

describe('release file names', () => {
  it('renames every tauri-action file, and its signature', () => {
    for (const [from, to] of TAURI) {
      expect(releaseName(from, '0.2.2')).toBe(to);
      expect(releaseName(`${from}.sig`, '0.2.2')).toBe(`${to}.sig`);
    }
    expect(new Set(TAURI.map(([, to]) => to)).size).toBe(RELEASE_FILES.length);
  });

  it('leaves renamed files and anything else alone', () => {
    expect(releaseName('Tarpaulin-0.2.2-windows-x64-setup.exe', '0.2.2')).toBeNull();
    expect(releaseName('Tarpaulin-0.2.2-macos-intel.app.tar.gz.sig', '0.2.2')).toBeNull();
    expect(releaseName('latest.json', '0.2.2')).toBeNull();
  });

  it('finds a download by its platform, whatever the version', () => {
    const assets = [
      { name: 'Tarpaulin-0.3.0-windows-x64-setup.exe' },
      { name: 'Tarpaulin-0.3.0-windows-arm64-setup.exe' },
    ];
    expect(findAsset(assets, 'windows-x64-setup.exe')?.name).toBe(
      'Tarpaulin-0.3.0-windows-x64-setup.exe',
    );
    expect(findAsset(assets, 'macos-intel.dmg')).toBeUndefined();
    // The version-less copies on releases up to 0.2.2 count too.
    expect(
      findAsset([{ name: 'Tarpaulin-windows-x64-setup.exe' }], 'windows-x64-setup.exe'),
    ).toBeTruthy();
  });
});
