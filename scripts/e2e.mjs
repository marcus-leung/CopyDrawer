import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = 'tests/e2e';
const unnamed = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.spec.ts') && !f.endsWith('.clipboard.spec.ts'))
  .filter((f) => /navigator\.clipboard\.read/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
if (unnamed.length) {
  for (const f of unnamed) {
    console.error(`${dir}/${f} reads the clipboard: rename it to ${f.replace(/\.spec\.ts$/, '.clipboard.spec.ts')}`);
  }
  process.exit(1);
}

// Clipboard specs run after the rest, even when the rest fail, so one failure doesn't hide their results.
const run = (...flags) =>
  spawnSync('playwright', ['test', ...flags, '--pass-with-no-tests', ...process.argv.slice(2)], { stdio: 'inherit' }).status;
const failed = [run('--project=parallel'), run('--project=clipboard', '--no-deps')].some((status) => status !== 0);
process.exit(failed ? 1 : 0);
