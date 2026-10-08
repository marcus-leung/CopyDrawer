import { readClips } from './helpers';
import { test, expect } from './fixtures';

test('paste into the panel, find it, copy it, delete and undo', async ({ context, extensionId }) => {
  const origin = `chrome-extension://${extensionId}`;
  const page = await context.newPage();
  await page.goto(`${origin}/sidepanel.html`);

  await expect(page.getByRole('heading', { name: 'Save something to start' })).toBeVisible();

  // Simulate pasting text into the panel.
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

  // Search filters the list.
  await page.getByRole('searchbox', { name: 'Search your clips' }).fill('garlic');
  await expect(list.getByRole('listitem')).toHaveCount(1);

  // Copy puts the text on the clipboard.
  await list.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByRole('status')).toContainText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Lemon garlic pasta, ingredients');

  // Open, delete, undo.
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
  const box = form.getByLabel('Clip');

  // Esc cancels without saving.
  await add.click();
  await expect(box).toBeFocused();
  await box.fill('never mind');
  await box.press('Escape');
  await expect(form).toHaveCount(0);

  // Empty text is refused.
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
});
