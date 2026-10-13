import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  define: { __E2E__: 'false' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['fake-indexeddb/auto'],
  },
});
