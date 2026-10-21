// Fails unless package.json, tauri.conf.json and Cargo.toml all carry the expected version
// (the release tag without its leading "v").
import { readFileSync } from 'node:fs';

const expected = (process.argv[2] ?? '').replace(/^v/, '');
const versions = {
  'package.json': JSON.parse(readFileSync('package.json', 'utf8')).version,
  'tauri.conf.json': JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version,
  'Cargo.toml': readFileSync('src-tauri/Cargo.toml', 'utf8').match(/^version = "([^"]+)"/m)?.[1],
};
const bad = Object.entries(versions).filter(([, v]) => v !== expected);
if (bad.length) {
  console.error(
    `Tag v${expected} doesn't match: ${bad.map(([f, v]) => `${f}=${v}`).join(', ')}. Run pnpm release:version ${expected}.`,
  );
  process.exit(1);
}
console.log(`All versions are ${expected}.`);
