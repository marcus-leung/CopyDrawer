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
