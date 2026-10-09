import { defineConfig } from '@playwright/test';

/**
 * Tests that read the system clipboard. Chrome writes to the real clipboard, so
 * these run one at a time, after the rest, so no other test copies over what they read.
 */
const READS_CLIPBOARD = /(actions-popup|additions|core-loop|find-and-paste|types)\.spec\.ts$/;

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
