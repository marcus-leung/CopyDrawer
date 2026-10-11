import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'specs',
  outputDir: '../../../test-results/verify',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
});
