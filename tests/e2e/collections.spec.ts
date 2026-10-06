import { test, expect } from './fixtures';

test('clips sort into smart collections and trips; moving a clip keeps it there', async ({ context, extensionId }) => {
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

  // Move the hotel into a new collection from its detail page.
  await inTrip.getByRole('button', { name: /Hotel in Chiado/ }).click();
  page.once('dialog', (d) => void d.accept('Places to stay'));
  await page.getByLabel('Collection').selectOption('__new__');
  await expect(page.getByLabel('Collection')).toHaveValue(/.+/);
  await expect(page.getByLabel('Collection').locator('option:checked')).toHaveText('Places to stay');

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
