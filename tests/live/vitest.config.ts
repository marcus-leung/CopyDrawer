import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

if (!process.env.DRIVE_TOKEN) {
  console.error('Set DRIVE_TOKEN to an access token with the drive.appdata scope. See docs/07-store-listing.md.');
  process.exit(1);
}

export default defineConfig({
  plugins: [WxtVitest()],
  define: { __E2E__: 'false' },
  test: {
    include: ['tests/live/**/*.live.test.ts'],
    setupFiles: ['fake-indexeddb/auto'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
