import type { Locator, Page } from '@playwright/test';

/** Pastes text into the side panel, as if the user pressed Ctrl+V on it. */
export async function pasteIntoPanel(page: Page, ...texts: string[]) {
  for (const t of texts) {
    await page.evaluate((text) => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    }, t);
  }
}

/** Reads clips straight from the extension's IndexedDB. */
export function readClips(page: Page) {
  return page.evaluate(
    () =>
      new Promise<
        {
          id: string;
          text: string;
          title: string;
          titleSource?: string;
          collectionId?: string;
          useCount: number;
        }[]
      >((resolve, reject) => {
        const req = indexedDB.open('clipboard');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const all = req.result.transaction('clips').objectStore('clips').getAll();
          all.onsuccess = () => resolve(all.result);
        };
      }),
  );
}

/**
 * Drags one element onto another with real drag events sharing one DataTransfer.
 * Playwright's mouse-driven dragTo sometimes misses HTML drag-and-drop when the machine is busy.
 */
export async function dragAndDrop(page: Page, source: Locator, target: Locator) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent('dragstart', { dataTransfer });
  for (const type of ['dragenter', 'dragover', 'drop']) await target.dispatchEvent(type, { dataTransfer });
  await source.dispatchEvent('dragend', { dataTransfer });
}
