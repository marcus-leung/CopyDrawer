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
    // No real network for the AI model: tests stay fast and the same everywhere.
    // Tests that need the model serve the stand-in with stubModel(), which takes precedence.
    await context.route('https://huggingface.co/**', (route) => route.abort());
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    // First install opens the setup tab. Close it so it doesn't keep the
    // test's own tab in the background (Chrome throttles background tabs).
    const isSetup = (url: string) => url.includes('onboarding=1');
    const setup =
      context.pages().find((p) => isSetup(p.url())) ??
      (await context.waitForEvent('page', { predicate: (p) => isSetup(p.url()), timeout: 5000 }).catch(() => null));
    await setup?.close();
    await use(new URL(worker.url()).host);
  },
});

export const expect = test.expect;
