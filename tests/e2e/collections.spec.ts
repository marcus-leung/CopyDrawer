import type { Page } from '@playwright/test';
import { dragAndDrop, dragOver, pasteIntoPanel } from './helpers';
import { test, expect } from './fixtures';

test('clips sort into collections and trips; moving a clip keeps it there', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const paste = async (text: string) =>
    page.evaluate((t) => {
      const data = new DataTransfer();
      data.setData('text/plain', t);
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    }, text);

  await paste('Flight TP 1355 London to Lisbon, departure 07:40, check-in opens at 05:40');
  await paste('Hotel in Chiado, Lisbon: check-in 15:00, €84 a night');
  await paste('2 cups flour, 1 tbsp sugar. Preheat the oven to 200C.');
  await paste('Remember to call grandma on Sunday');

  const tiles = page.getByRole('list', { name: 'Collections' });
  await expect(tiles.getByRole('button')).toHaveCount(2);
  await expect(tiles.getByRole('button').first()).toContainText('Lisbon trip');
  await expect(tiles.getByRole('button').first()).toContainText('2 clips, 2 new');
  await expect(page.getByText('Sorted 3 new clips today')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Clips' })).toContainText('Recipes, saved by hand');

  // Open the trip.
  await tiles.getByRole('button', { name: /Lisbon trip/ }).click();
  await expect(page.getByRole('heading', { name: 'Lisbon trip' })).toBeVisible();
  const inTrip = page.getByRole('list', { name: 'Clips in Lisbon trip' });
  await expect(inTrip.getByRole('listitem')).toHaveCount(2);

  // Move the hotel into a new collection from its detail page, named right there.
  await inTrip.getByRole('button', { name: /Hotel in Chiado/ }).click();
  const select = page.getByRole('combobox', { name: /Collection/ });
  await select.selectOption('__new__');
  const form = page.getByRole('form', { name: 'New collection' });
  await expect(form.getByLabel('Collection name')).toBeFocused();
  await form.getByRole('button', { name: 'Create' }).click();
  await expect(form.getByRole('alert')).toHaveText('Give the collection a name.');
  await form.getByLabel('Collection name').fill('Places to stay');
  await form.getByRole('radio', { name: 'Green' }).click();
  await form.getByLabel('Collection name').press('Enter');
  await expect(form).toHaveCount(0);
  await expect(select.locator('option:checked')).toHaveText('Places to stay');

  // Back goes to the trip, which now has one clip.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(inTrip.getByRole('listitem')).toHaveCount(1);

  // Rename the trip.
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Collection name').fill('Lisbon in October');
  await page.getByLabel('Collection name').press('Enter');
  await expect(page.getByRole('heading', { name: 'Lisbon in October' })).toBeVisible();

  await page.getByRole('button', { name: 'Back to home' }).click();
  await expect(tiles).toContainText('Places to stay');
  await expect(tiles).toContainText('Lisbon in October');
});

/** Folder names in the order saved in IndexedDB; the screen shows a dropped order before it is saved. */
function savedFolderOrder(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const req = indexedDB.open('clipboard');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const all = req.result.transaction('collections').objectStore('collections').index('order').getAll();
          all.onsuccess = () => resolve((all.result as { name: string }[]).map((c) => c.name));
        };
      }),
  );
}

test('folders keep their place when clips are dropped in, and move where you put them', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await pasteIntoPanel(page, 'Remember to call grandma on Sunday', 'Buy stamps');
  for (const name of ['Alpha', 'Bravo', 'Charlie']) {
    await page.getByRole('button', { name: 'New collection' }).click();
    const form = page.getByRole('form', { name: 'New collection' });
    await form.getByLabel('Collection name').fill(name);
    await form.getByLabel('Collection name').press('Enter');
    await expect(form).toHaveCount(0);
  }
  const tiles = page.getByRole('list', { name: 'Collections' }).getByRole('button');
  await expect(tiles).toHaveText([/^Alpha/, /^Bravo/, /^Charlie/]);

  // Dropping clips into the last folder doesn't move it.
  const list = page.getByRole('list', { name: 'Clips' });
  for (const clip of [/grandma/, /stamps/]) {
    await dragAndDrop(page, list.getByRole('button', { name: clip }), tiles.filter({ hasText: 'Charlie' }));
    await expect(page.getByRole('status')).toContainText('Moved to Charlie');
  }
  await expect(tiles.filter({ hasText: 'Charlie' })).toContainText('2 clips');
  await expect(tiles).toHaveText([/^Alpha/, /^Bravo/, /^Charlie/]);

  // Dragging a folder over another makes room for it right away; dropping keeps that order.
  const drag = await page.evaluateHandle(() => new DataTransfer());
  await tiles.filter({ hasText: 'Alpha' }).dispatchEvent('dragstart', { dataTransfer: drag });
  await dragOver(tiles.filter({ hasText: 'Charlie' }), drag);
  await expect(tiles).toHaveText([/^Bravo/, /^Charlie/, /^Alpha/]);
  await dragOver(tiles.filter({ hasText: 'Alpha' }), drag, 'drop');
  await tiles.filter({ hasText: 'Alpha' }).dispatchEvent('dragend', { dataTransfer: drag });
  await expect(tiles).toHaveText([/^Bravo/, /^Charlie/, /^Alpha/]);
  await expect(page.getByText('Drop to save')).toHaveCount(0);
  await expect.poll(() => savedFolderOrder(page)).toEqual(['Bravo', 'Charlie', 'Alpha']);
  await page.reload();
  await expect(tiles).toHaveText([/^Bravo/, /^Charlie/, /^Alpha/]);

  // Letting go outside the folders (or pressing Esc) puts them back.
  const cancelled = await page.evaluateHandle(() => new DataTransfer());
  await tiles.filter({ hasText: 'Alpha' }).dispatchEvent('dragstart', { dataTransfer: cancelled });
  await dragOver(tiles.filter({ hasText: 'Bravo' }), cancelled);
  await expect(tiles).toHaveText([/^Alpha/, /^Bravo/, /^Charlie/]);
  await tiles.filter({ hasText: 'Alpha' }).dispatchEvent('dragend', { dataTransfer: cancelled });
  await expect(tiles).toHaveText([/^Bravo/, /^Charlie/, /^Alpha/]);

  // The same, with the helper's whole drag: Charlie dropped on Bravo takes its place.
  await dragAndDrop(page, tiles.filter({ hasText: 'Charlie' }), tiles.filter({ hasText: 'Bravo' }));
  await expect(tiles).toHaveText([/^Charlie/, /^Bravo/, /^Alpha/]);
  await expect.poll(() => savedFolderOrder(page)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  await page.reload();
  await expect(tiles).toHaveText([/^Charlie/, /^Bravo/, /^Alpha/]);

  // Reordering is by dragging only: the folder screen has no move buttons.
  await tiles.filter({ hasText: 'Bravo' }).click();
  await expect(page.getByRole('button', { name: 'Back to home' })).toBeVisible();
  await expect(page.getByText(/Folder \d of \d/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Move (earlier|later)/ })).toHaveCount(0);
});
