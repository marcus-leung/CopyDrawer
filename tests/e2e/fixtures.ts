import { test as base, chromium, expect as baseExpect, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const extensionPath = path.resolve('.output-e2e/chrome-mv3');
const localChromium = '/opt/pw-browsers/chromium';

/** Chromium with the E2E build loaded (`pnpm test:e2e` builds it first). Any browser dialog is recorded in `dialogs`. */
export async function launchExtension(): Promise<{ context: BrowserContext; dialogs: string[] }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    executablePath: fs.existsSync(localChromium) ? localChromium : undefined,
    // Headless Chrome on macOS closes tabs the extension opens.
    headless: process.platform !== 'darwin',
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  // The extension shows everything inside the panel: a browser dialog (alert, confirm, prompt) is a bug.
  const dialogs: string[] = [];
  const watch = (page: Page) => page.on('dialog', (d) => void (dialogs.push(`${d.type()}: ${d.message()}`), d.dismiss()));
  context.pages().forEach(watch);
  context.on('page', watch);
  return { context, dialogs };
}

/** The extension's id, once its worker runs. Closes the setup tab that the first install opens. */
export async function extensionIdOf(context: BrowserContext): Promise<string> {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  // It would keep the test's own tab in the background (Chrome throttles background tabs).
  const isSetup = (url: string) => url.includes('onboarding=1');
  const setup =
    context.pages().find((p) => isSetup(p.url())) ??
    (await context.waitForEvent('page', { predicate: (p) => isSetup(p.url()), timeout: 5000 }).catch(() => null));
  await setup?.close();
  return new URL(worker.url()).host;
}

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const { context, dialogs } = await launchExtension();
    await use(context);
    baseExpect(dialogs, 'browser dialogs shown').toEqual([]);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    await use(await extensionIdOf(context));
  },
});

export const expect = test.expect;
