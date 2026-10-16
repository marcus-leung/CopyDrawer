import { test, expect } from './fixtures';
import { dragAndDrop } from './helpers';

test('pasting an image saves it with a thumbnail and opens its detail', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(120, 80);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#2457C5';
    ctx.fillRect(0, 0, 120, 80);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const data = new DataTransfer();
    data.items.add(new File([blob], 'chart.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data }));
  });

  const list = page.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('chart.png');

  await list.getByRole('button', { name: /chart\.png/ }).click();
  await expect(page.getByRole('img', { name: 'chart.png' })).toBeVisible();
  await expect(page.getByText('PNG, 120 × 80')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download' })).toHaveAttribute('download', 'chart.png');

  await page.getByRole('button', { name: 'Add a note' }).click();
  const note = page.getByLabel('Note');
  await expect(note).toBeFocused();
  await note.fill('Q3 revenue, for the Monday deck');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('region', { name: 'Note' })).toHaveText('NoteQ3 revenue, for the Monday deck');
  await expect(page.getByRole('button', { name: 'Add a note' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByLabel('Note')).toHaveValue('Q3 revenue, for the Monday deck');
  await page.getByLabel('Note').fill('');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Add a note' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Note' })).toHaveCount(0);
});

test("pasting files that aren't supported images says so; good files in the same paste are still saved", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const paste = (withPng: boolean) =>
    page.evaluate(async (withPng) => {
      const data = new DataTransfer();
      if (withPng) {
        const canvas = new OffscreenCanvas(10, 10);
        canvas.getContext('2d')!.fillRect(0, 0, 10, 10);
        data.items.add(new File([await canvas.convertToBlob({ type: 'image/png' })], 'dot.png', { type: 'image/png' }));
      }
      data.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'logo.svg', { type: 'image/svg+xml' }));
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data }));
    }, withPng);

  await paste(false);
  await expect(page.getByRole('status')).toHaveText('Only PNG, JPG, GIF and WebP images can be saved.');
  await expect(page.getByRole('list', { name: 'Clips' })).toHaveCount(0);

  await paste(true);
  await expect(page.getByRole('list', { name: 'Clips' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('list', { name: 'Clips' })).toContainText('dot.png');
  await expect(page.getByRole('status')).toHaveText('Only PNG, JPG, GIF and WebP images can be saved.');
});

test('drag images in the panel: onto a collection, reorder the strip, and out to a page', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await page.evaluate(async () => {
    const data = new DataTransfer();
    for (const [name, color] of [
      ['red.png', '#B42318'],
      ['blue.png', '#2457C5'],
    ]) {
      const canvas = new OffscreenCanvas(20, 20);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = color!;
      ctx.fillRect(0, 0, 20, 20);
      data.items.add(new File([await canvas.convertToBlob({ type: 'image/png' })], name!, { type: 'image/png' }));
    }
    data.setData('text/plain', '');
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data }));
    const text = new DataTransfer();
    text.setData('text/plain', '2 cups flour, 1 tbsp sugar. Preheat the oven to 200C.');
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: text }));
  });
  const strip = page.getByRole('list', { name: 'Images and colors' });
  const names = () => strip.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  await expect.poll(names).toEqual(['blue.png', 'red.png']);

  // Reorder: drop red on blue puts red first, and the order stays after a reload.
  await dragAndDrop(page, strip.getByRole('button', { name: 'red.png' }), strip.getByRole('button', { name: 'blue.png' }));
  await expect.poll(names).toEqual(['red.png', 'blue.png']);
  // The list shows the change before it's saved; wait for the save before reloading.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const req = indexedDB.open('clipboard');
            req.onsuccess = () => {
              const all = req.result.transaction('clips').objectStore('clips').getAll();
              all.onsuccess = () =>
                resolve(
                  all.result.some((c: { title: string; stripRank?: number }) => c.title === 'red.png' && c.stripRank != null),
                );
            };
          }),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect.poll(names).toEqual(['red.png', 'blue.png']);

  const tiles = page.getByRole('list', { name: 'Collections' });
  await dragAndDrop(page, strip.getByRole('button', { name: 'blue.png' }), tiles.getByRole('button', { name: /Recipes/ }));
  await expect(page.getByRole('status')).toHaveText('Moved to Recipes');
  await expect(tiles.getByRole('button', { name: /Recipes/ })).toContainText('2 clips');
  // Internal drags never save a copy.
  await expect(page.getByRole('list', { name: 'Clips' }).getByRole('listitem')).toHaveCount(3);

  // Out to a page: the drag carries the full image as a file, a link and an <img>.
  const tile = strip.getByRole('button', { name: 'red.png' });
  await tile.hover();
  const out = await tile.evaluate(async (el) => {
    await new Promise((r) => setTimeout(r, 200));
    const data = new DataTransfer();
    el.dispatchEvent(new DragEvent('dragstart', { dataTransfer: data, bubbles: true }));
    return { uri: data.getData('text/uri-list'), html: data.getData('text/html'), file: data.getData('DownloadURL') };
  });
  expect(out.uri).toMatch(/^data:image\/png;base64,/);
  expect(out.html).toContain('<img src="data:image/png;base64,');
  expect(out.file).toMatch(/^image\/png:red\.png:data:image\/png;base64,/);
});
