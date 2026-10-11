import { defineConfig } from '@playwright/test';

/**
 * Specs that read the system clipboard are named *.clipboard.spec.ts. Chrome writes to the real
 * clipboard, so they run one at a time, after the rest. `pnpm test:e2e` also runs them when the rest fail.
 */
const READS_CLIPBOARD = /\.clipboard\.spec\.ts$/;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  projects: [
    { name: 'parallel', testIgnore: READS_CLIPBOARD },
    { name: 'clipboard', testMatch: READS_CLIPBOARD, workers: 1, dependencies: ['parallel'] },
  ],
});
