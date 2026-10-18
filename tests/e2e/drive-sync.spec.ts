import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, extensionIdOf, launchExtension } from './fixtures';
import { startFakeDrive, TOKEN } from './fakeDriveServer';
import { readClips, seedClips } from './helpers';

/** Points this browser's extension at the fake Drive, signed in. */
async function useFakeDrive(context: BrowserContext, url: string) {
  const [worker] = context.serviceWorkers();
  await worker!.evaluate(([base, token]) => chrome.storage.session.set({ e2eDriveBase: base, e2eDriveToken: token }), [
    url,
    TOKEN,
  ] as const);
}

async function openPanel(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  return page;
}

async function axe(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
}

async function addClip(page: Page, text: string) {
  await page.getByRole('button', { name: 'Add a clip' }).click();
  const form = page.getByRole('form', { name: 'Add a clip' });
  await form.getByRole('textbox').fill(text);
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(text)).toBeVisible();
}

/** The sizes of the full images stored in this browser's database. */
const storedImageSizes = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number[]>((resolve, reject) => {
        const req = indexedDB.open('clipboard');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const all = req.result.transaction('images').objectStore('images').getAll();
          all.onsuccess = () => {
            req.result.close();
            resolve(all.result.map((i: { blob: Blob }) => i.blob.size));
          };
        };
      }),
  );

/** How many changes in this browser's database are still waiting to go up to Drive. */
const unsent = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('clipboard');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const count = req.result.transaction('syncMeta').objectStore('syncMeta').index('dirty').count(1);
          count.onsuccess = () => {
            req.result.close();
            resolve(count.result);
          };
        };
      }),
  );

const syncNow = (page: Page) => page.getByRole('button', { name: 'Sync now' }).click();
const synced = (page: Page) => expect(page.getByText(/^Last synced/)).toBeVisible();

test('two computers share their clips through a Drive copy', async ({ context, extensionId }) => {
  const fake = await startFakeDrive();
  const other = await launchExtension();
  try {
    // Computer A starts the Drive copy.
    await useFakeDrive(context, fake.url);
    const a = await openPanel(context, extensionId);
    await seedClips(a, ['note from a']);
    await a.getByRole('button', { name: 'Settings' }).click();
    await axe(a, 'sync off');
    await a.getByRole('switch', { name: /Sync with Google Drive/ }).click();
    await synced(a);
    await axe(a, 'sync on');
    expect(fake.drive.byName('copy')).toBeTruthy();

    // Computer B joins from a page that closes straight away, as the toolbar popup does when Chrome asks to
    // sign in: the background finishes, and B gets A's clip.
    const bId = await extensionIdOf(other.context);
    await useFakeDrive(other.context, fake.url);
    const closing = await openPanel(other.context, bId);
    await closing.getByRole('button', { name: 'Settings' }).click();
    await closing.getByRole('switch', { name: /Sync with Google Drive/ }).click();
    await closing.close();
    const b = await openPanel(other.context, bId);
    await b.getByRole('button', { name: 'Settings' }).click();
    await synced(b);
    await expect.poll(async () => (await readClips(b)).map((c) => c.text)).toEqual(['note from a']);

    // A clip added on B reaches A when A's panel opens.
    await b.getByRole('button', { name: 'Back to home' }).click();
    await addClip(b, 'note from b');
    await b.getByRole('button', { name: 'Settings' }).click();
    await syncNow(b);
    await synced(b);
    await expect.poll(() => fake.drive.files.size).toBeGreaterThan(2);
    await a.reload();
    await expect(a.getByText('note from b')).toBeVisible();

    // An image saved on A arrives on B whole.
    await a.getByRole('button', { name: 'Add a clip' }).click();
    const form = a.getByRole('form', { name: 'Add a clip' });
    await form.getByRole('textbox').focus();
    const sent = await a.evaluate(async () => {
      const canvas = new OffscreenCanvas(40, 30);
      canvas.getContext('2d')!.fillRect(0, 0, 40, 30);
      const png = await canvas.convertToBlob({ type: 'image/png' });
      const data = new DataTransfer();
      data.items.add(new File([png], 'square.png', { type: 'image/png' }));
      document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
      return png.size;
    });
    await expect(form.getByRole('list', { name: 'Images to save' }).getByRole('listitem')).toHaveCount(1);
    await form.getByRole('button', { name: 'Save' }).click();
    await a.getByRole('button', { name: 'Settings' }).click();
    await syncNow(a);
    // "Last synced" may still be on screen from before, so wait until A has nothing left to send.
    await expect.poll(() => unsent(a)).toBe(0);
    await syncNow(b);
    await expect.poll(() => storedImageSizes(b)).toEqual([sent]);

    // B turns sync off and deletes the Drive copy: A stops, keeps its clips, and Sync again starts a new copy.
    await b.getByRole('button', { name: 'Turn off' }).click();
    await b.getByLabel(/Also delete the copy in Google Drive/).check();
    await b.getByRole('button', { name: 'Turn off sync' }).click();
    await expect(b.getByText('Sync is off and the Drive copy is deleted')).toBeVisible();
    expect(fake.drive.files.size).toBe(0);

    await syncNow(a);
    await expect(a.getByText(/^Sync stopped/)).toBeVisible();
    await axe(a, 'sync stopped');
    await a.getByRole('button', { name: 'Back to home' }).click();
    await expect(a.getByText('Sync stopped', { exact: true })).toBeVisible();
    expect((await readClips(a)).map((c) => c.text).sort()).toEqual(['', 'note from a', 'note from b']);
    expect(fake.drive.files.size).toBe(0);

    await a.getByRole('button', { name: 'Open settings' }).click();
    await a.getByRole('button', { name: 'Sync again' }).click();
    await synced(a);
    await expect.poll(() => fake.drive.files.size).toBeGreaterThan(3);
    expect(other.dialogs).toEqual([]);
  } finally {
    await other.context.close();
    await fake.close();
  }
});
