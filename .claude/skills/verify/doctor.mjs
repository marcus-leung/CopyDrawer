#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const manifestPath = path.join(root, '.output-e2e/chrome-mv3/manifest.json');
const problems = [];

if (!fs.existsSync(manifestPath)) {
  problems.push('no E2E build at .output-e2e/chrome-mv3. Run: E2E=1 pnpm exec wxt build');
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.host_permissions?.includes('<all_urls>')) {
    problems.push('.output-e2e is not an E2E build (no pre-granted <all_urls>). Rebuild with E2E=1.');
  }
  const built = fs.statSync(manifestPath).mtimeMs;
  const newest = (dir) =>
    fs
      .readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((e) => e.isFile())
      .reduce((max, e) => Math.max(max, fs.statSync(path.join(e.parentPath, e.name)).mtimeMs), 0);
  const changed = Math.max(newest(path.join(root, 'src')), fs.statSync(path.join(root, 'wxt.config.ts')).mtimeMs);
  if (changed > built) problems.push('src/ changed after the E2E build. Rebuild: E2E=1 pnpm exec wxt build');
  else console.log(`ok: E2E build ${manifest.name} ${manifest.version}, built ${new Date(built).toISOString()}`);
}

if (problems.length) {
  for (const p of problems) console.error(`not ok: ${p}`);
  process.exit(1);
}
