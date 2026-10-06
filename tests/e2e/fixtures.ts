import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const extensionPath = path.resolve('.output-e2e/chrome-mv3');
const localChromium = '/opt/pw-browsers/chromium';

/** Launches Chromium with the E2E build loaded (`pnpm test:e2e` builds it first). */
export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      executablePath: fs.existsSync(localChromium) ? localChromium : undefined,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).host);
  },
});

export const expect = test.expect;
