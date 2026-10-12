import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
// Either run may match nothing (a single spec is in one project), but both matching nothing is a mistake.
let ran = 0;
const run = (...flags) => {
  const report = path.join(os.tmpdir(), `clipboard-e2e-${process.pid}-${flags[0].slice(10)}.json`);
  const { status } = spawnSync(
    'playwright',
    ['test', ...flags, '--pass-with-no-tests', '--reporter=list,json', ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: report },
    },
  );
  try {
    const { stats } = JSON.parse(fs.readFileSync(report, 'utf8'));
    ran += stats.expected + stats.unexpected + stats.flaky + stats.skipped;
  } finally {
    fs.rmSync(report, { force: true });
  }
  return status;
};
const failed = [run('--project=parallel'), run('--project=clipboard', '--no-deps')].some((status) => status !== 0);
if (!ran) console.error('No tests ran. Check the spec path or filter.');
process.exit(failed || !ran ? 1 : 0);
