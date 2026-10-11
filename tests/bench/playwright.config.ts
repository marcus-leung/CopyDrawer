import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.bench.ts',
  outputDir: '../../test-results/bench',
  timeout: 15 * 60_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
});
