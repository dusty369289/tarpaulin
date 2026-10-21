// Sets the app version everywhere it lives, so the release tag, bundles and updater agree.
//   pnpm release:version 0.2.0
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error('Usage: pnpm release:version <major.minor.patch>');
  process.exit(2);
}
const edit = (file: string, fn: (s: string) => string) =>
  writeFileSync(file, fn(readFileSync(file, 'utf8')));
edit('package.json', (s) => s.replace(/"version": "[^"]+"/, `"version": "${version}"`));
edit('src-tauri/tauri.conf.json', (s) =>
  s.replace(/"version": "[^"]+"/, `"version": "${version}"`),
);
edit('src-tauri/Cargo.toml', (s) => s.replace(/^version = "[^"]+"/m, `version = "${version}"`));
execFileSync('cargo', ['update', '-p', 'tarpaulin', '--offline'], {
  cwd: 'src-tauri',
  stdio: 'inherit',
});
console.log(
  `Version set to ${version}. Commit, then: git tag v${version} && git push origin v${version}`,
);
