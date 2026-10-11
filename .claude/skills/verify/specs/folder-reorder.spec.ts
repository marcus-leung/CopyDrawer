import { test, expect } from '../../../../tests/e2e/fixtures';
import { dragAndDrop, pasteIntoPanel } from '../../../../tests/e2e/helpers';
import { capture } from './evidence';

const FEATURE = 'folders';

test('folders stay put when a clip is dropped in, and move when dragged', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await pasteIntoPanel(page, 'Remember to call grandma on Sunday');
  for (const name of ['Alpha', 'Bravo', 'Charlie']) {
    await page.getByRole('button', { name: 'New collection' }).click();
    await page.getByLabel('Collection name').fill(name);
    await page.getByLabel('Collection name').press('Enter');
  }
  const tiles = page.getByRole('list', { name: 'Collections' }).getByRole('button');
  await expect(tiles).toHaveText([/^Alpha/, /^Bravo/, /^Charlie/]);
  await capture(page, FEATURE, '1-start');

  await dragAndDrop(
    page,
    page.getByRole('list', { name: 'Clips' }).getByRole('button', { name: /grandma/ }),
    tiles.filter({ hasText: 'Charlie' }),
  );
  await expect(tiles.filter({ hasText: 'Charlie' })).toContainText('1 clip');
  await expect(tiles).toHaveText([/^Alpha/, /^Bravo/, /^Charlie/]);
  await capture(page, FEATURE, '2-clip-dropped-order-kept');

  await dragAndDrop(page, tiles.filter({ hasText: 'Alpha' }), tiles.filter({ hasText: 'Charlie' }));
  await expect(tiles).toHaveText([/^Bravo/, /^Charlie/, /^Alpha/]);
  await capture(page, FEATURE, '3-folder-dragged');
});
