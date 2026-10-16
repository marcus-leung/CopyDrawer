import { readClips } from './helpers';
import { test, expect } from './fixtures';

test('paste into the panel, find it, copy it, delete and undo', async ({ context, extensionId }) => {
  const origin = `chrome-extension://${extensionId}`;
  const page = await context.newPage();
  await page.goto(`${origin}/sidepanel.html`);

  await expect(page.getByRole('heading', { name: 'Save something to start' })).toBeVisible();

  const paste = async (text: string) =>
    page.evaluate((t) => {
      const data = new DataTransfer();
      data.setData('text/plain', t);
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    }, text);
  await paste('Lemon garlic pasta, ingredients');
  await paste('https://www.airbnb.com/rooms/48213377');

  const list = page.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list).toContainText('airbnb.com/rooms/48213377');

  await page.getByRole('searchbox', { name: 'Search your clips' }).fill('garlic');
  await expect(list.getByRole('listitem')).toHaveCount(1);

  await list.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByRole('status')).toContainText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Lemon garlic pasta, ingredients');

  await list.getByRole('button', { name: /Lemon garlic pasta/ }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('status')).toContainText('Clip deleted');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(1);
});

test('add a clip by hand: type or paste, save, cancel, empty refused', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const add = page.getByRole('button', { name: 'Add a clip' });
  const form = page.getByRole('form', { name: 'Add a clip' });
  const box = form.getByLabel('New clip');

  await add.click();
  await expect(box).toBeFocused();
  const search = page.getByRole('searchbox', { name: 'Search your clips' });
  expect((await form.boundingBox())!.y).toBeLessThan((await search.boundingBox())!.y);
  await box.fill('never mind');
  await box.press('Escape');
  await expect(form).toHaveCount(0);

  await add.click();
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByRole('alert')).toHaveText('Type or paste something to save.');

  // Pasting goes into the box (not saved straight away); Ctrl/Cmd+Enter saves; the rules sort it.
  const text = '2 cups flour, 1 tbsp sugar.\nPreheat the oven to 200C.';
  await box.focus();
  await page.evaluate((text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  }, text);
  await page.keyboard.insertText(text);
  await expect(page.getByRole('list', { name: 'Clips' })).toHaveCount(0);
  await box.press('ControlOrMeta+Enter');
  await expect(form).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('Saved');
  const list = page.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Recipes');
  expect((await readClips(page))[0]!.text).toBe('2 cups flour, 1 tbsp sugar.\nPreheat the oven to 200C.');

  // Pasting an image shows it in the box; it can be removed, and Save keeps it as an image clip.
  await add.click();
  const pasteImage = () =>
    page.evaluate(async () => {
      const canvas = new OffscreenCanvas(40, 30);
      canvas.getContext('2d')!.fillRect(0, 0, 40, 30);
      const data = new DataTransfer();
      data.items.add(new File([await canvas.convertToBlob({ type: 'image/png' })], 'pasted.png', { type: 'image/png' }));
      document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    });
  await pasteImage();
  await pasteImage();
  const previews = form.getByRole('list', { name: 'Images to save' }).getByRole('listitem');
  await expect(previews).toHaveCount(2);
  await form.getByRole('button', { name: 'Remove image 2' }).click();
  await expect(previews).toHaveCount(1);
  await expect(list.getByRole('listitem')).toHaveCount(1);
  // Text typed with an image is its note, not a clip of its own.
  await expect(box).toHaveAttribute('placeholder', 'Add a note (optional)');
  await box.fill('Logo for the bake sale');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toHaveCount(0);
  await expect(list.getByRole('listitem')).toHaveCount(2);
  const imageRow = list.getByRole('listitem').filter({ hasText: 'pasted.png' });
  await expect(imageRow).toContainText('Logo for the bake sale');
  await search.fill('bake sale');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('pasted.png');
});

test('the add box keeps text pasted with an image, and refuses files that are not images', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await page.getByRole('button', { name: 'Add a clip' }).click();
  const form = page.getByRole('form', { name: 'Add a clip' });
  const box = form.getByRole('textbox');
  const previews = form.getByRole('list', { name: 'Images to save' }).getByRole('listitem');

  // A real Ctrl+V of a picture copied together with its caption.
  await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(40, 30);
    canvas.getContext('2d')!.fillRect(0, 0, 40, 30);
    const png = await canvas.convertToBlob({ type: 'image/png' });
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': png, 'text/plain': new Blob(['Bake sale poster'], { type: 'text/plain' }) }),
    ]);
  });
  await box.click();
  await page.keyboard.press('ControlOrMeta+V');
  await expect(previews).toHaveCount(1);
  await expect(box).toHaveValue('Bake sale poster');

  // A PDF is not an image: no broken preview, and the box says why.
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(['%PDF-1.4'], 'menu.pdf', { type: 'application/pdf' }));
    document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  });
  await expect(form.getByRole('alert')).toHaveText('Only PNG, JPG, GIF and WebP images can be saved.');
  await expect(previews).toHaveCount(1);

  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toHaveCount(0);
  const clips = await readClips(page);
  expect(clips).toHaveLength(1);
  expect(clips[0]).toMatchObject({ kind: 'image', note: 'Bake sale poster' });
});
