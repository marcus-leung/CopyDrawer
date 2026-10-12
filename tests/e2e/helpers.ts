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
  for (const type of ['dragenter', 'dragover', 'drop']) await dragOver(target, dataTransfer, type);
  await source.dispatchEvent('dragend', { dataTransfer });
}

/** A drag event at the middle of `target`, with the pointer position a real drag has. */
export async function dragOver(target: Locator, dataTransfer: unknown, type = 'dragover') {
  const box = (await target.boundingBox())!;
  await target.dispatchEvent(type, { dataTransfer, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 });
}

/** Puts many clips straight into IndexedDB, faster than saving them one by one. Wait for the panel to load first so the database exists. */
export function seedClips(page: Page, texts: string[], collection?: { id: string; name: string }) {
  return page.evaluate(
    ({ texts, collection }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('clipboard');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          if (!req.result.objectStoreNames.contains('clips'))
            return reject(new Error('The panel has not created the database yet'));
          const tx = req.result.transaction(['clips', 'collections'], 'readwrite');
          if (collection) {
            tx.objectStore('collections').put({
              ...collection,
              key: `manual:${collection.id}`,
              color: 'blue',
              kind: 'manual',
              createdAt: 1,
              order: 0,
            });
          }
          const now = Date.now();
          texts.forEach((text, i) =>
            tx.objectStore('clips').put({
              id: `seed-${collection?.id ?? 'x'}-${i}`,
              createdAt: now - i * 1000,
              lastUsedAt: now - i * 1000,
              useCount: 0,
              kind: 'text',
              text,
              title: text,
              pinned: 0,
              hash: `seed-${collection?.id ?? 'x'}-${i}`,
              collectionId: collection?.id,
            }),
          );
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { texts, collection },
  );
}
