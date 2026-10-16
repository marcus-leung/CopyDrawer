import { pasteIntoPanel, readClips } from './helpers';
import { test, expect } from './fixtures';

test('smart actions, images and colors strip, toolbar popup expands to the panel', async ({ context, extensionId }) => {
  const origin = `chrome-extension://${extensionId}`;
  // Stub the carrier page: if the real one fails to load, the tab shows an error page whose URL is hidden.
  await context.route('https://www.ups.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>UPS</p>' }));
  const panel = await context.newPage();
  await panel.goto(`${origin}/sidepanel.html`);
  await expect(panel.getByText("Collections appear as you save. You don't need to make any.")).toBeVisible();
  await panel.evaluate(() => {
    for (const t of ['#2457C5', '1Z 999 AA1 01 2345 6784', 'https://shop.test/lamp?utm_source=news&color=warm']) {
      const data = new DataTransfer();
      data.setData('text/plain', t);
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    }
  });
  const list = panel.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  // The link is kept as copied; the clip offers a copy without the tracking parameters.
  await expect(list).toContainText('shop.test/lamp');
  await expect
    .poll(async () => (await readClips(panel)).map((c) => c.text))
    .toContain('https://shop.test/lamp?utm_source=news&color=warm');
  await list.getByRole('button', { name: /shop\.test\/lamp/ }).click();
  await panel.getByRole('button', { name: 'Copy without tracking' }).click();
  await expect.poll(() => panel.evaluate(() => navigator.clipboard.readText())).toBe('https://shop.test/lamp?color=warm');
  await panel.getByRole('button', { name: 'Back' }).click();
  await expect(panel.getByRole('list', { name: 'Images and colors' }).getByRole('button')).toHaveCount(1);
  await expect(panel.getByText('Try pasting it back')).toBeVisible();
  await panel.getByRole('button', { name: 'Got it' }).click();
  await expect(panel.getByText('Try pasting it back')).toHaveCount(0);

  await list.getByRole('button', { name: /1Z 999/ }).click();
  await expect(panel.getByText('Looks like a UPS tracking number')).toBeVisible();
  await expect(panel.getByLabel('Collection').locator('option:checked')).toHaveText('Shopping');
  await panel.getByRole('button', { name: 'Copy without spaces' }).click();
  expect(await panel.evaluate(() => navigator.clipboard.readText())).toBe('1Z999AA10123456784');
  await panel.getByRole('button', { name: 'Track package' }).click();
  await expect
    .poll(() => panel.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.pendingUrl || t.url || '').join(' ')))
    .toContain('ups.com/track?tracknum=1Z999AA10123456784');
  await panel.getByRole('button', { name: 'Back' }).click();

  await panel.getByRole('list', { name: 'Images and colors' }).getByRole('button').click();
  await expect(panel.getByText('Looks like a color')).toBeVisible();
  await panel.getByRole('button', { name: 'Copy RGB' }).click();
  expect(await panel.evaluate(() => navigator.clipboard.readText())).toBe('rgb(36, 87, 197)');

  // Toolbar popup: the full app. Expanding hands the current screen and search to the side panel.
  await panel.getByRole('button', { name: 'Back' }).click();
  const popup = await context.newPage();
  await popup.goto(`${origin}/popup.html`);
  await expect(popup.getByRole('heading', { name: 'Your clips' })).toBeVisible();
  await expect(popup.getByRole('list', { name: 'Clips' }).getByRole('listitem')).toHaveCount(3);
  await popup.getByLabel('Search your clips').fill('lamp');
  await popup.getByRole('button', { name: 'Open in side panel' }).click();
  await panel.bringToFront();
  await expect(panel.getByLabel('Search your clips')).toHaveValue('lamp');
  await expect(list.getByRole('listitem')).toHaveCount(1);

  const popup2 = await context.newPage();
  await popup2.goto(`${origin}/popup.html`);
  await popup2
    .getByRole('list', { name: 'Clips' })
    .getByRole('button', { name: /^1Z 999/ })
    .click();
  await expect(popup2.getByRole('heading', { name: '1Z 999 AA1 01 2345 6784' })).toBeVisible();
  await popup2.getByRole('button', { name: 'Open in side panel' }).click();
  await panel.bringToFront();
  await expect(panel.getByRole('heading', { name: '1Z 999 AA1 01 2345 6784' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Open in side panel' })).toHaveCount(0);
});

test('a request to open a clip keeps the search, and only its own window takes it', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await pasteIntoPanel(panel, 'Lemon garlic pasta', 'Trail running shoes');
  const list = panel.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  const search = panel.getByLabel('Search your clips');
  await search.fill('garlic');
  const shoes = (await readClips(panel)).find((c) => c.text === 'Trail running shoes')!;
  const request = (req: object) =>
    panel.evaluate((req) => chrome.storage.session.set({ openView: { ...req, at: Date.now() } }), req);

  // For another window: left for that window's panel.
  await request({ view: { name: 'detail', id: shoes.id }, windowId: -42 });
  await panel.waitForTimeout(300);
  await expect(search).toHaveValue('garlic');
  expect(await panel.evaluate(async () => (await chrome.storage.session.get('openView')).openView)).toBeTruthy();

  // "Open" from the page's Saved card names only the clip: the search stays.
  await request({ view: { name: 'detail', id: shoes.id } });
  await expect(panel.getByRole('heading', { name: 'Trail running shoes' })).toBeVisible();
  await panel.getByRole('button', { name: 'Back' }).click();
  await expect(search).toHaveValue('garlic');
});

test('Import from the popup opens Settings in the side panel, where the file picker works', async ({ context, extensionId }) => {
  const origin = `chrome-extension://${extensionId}`;
  const panel = await context.newPage();
  await panel.goto(`${origin}/sidepanel.html`);
  const popup = await context.newPage();
  await popup.goto(`${origin}/popup.html`);
  await popup.getByRole('button', { name: 'Settings' }).click();
  // A file dialog takes focus, and Chrome closes a popup that loses it.
  await expect(popup.locator('input[type=file]')).toHaveCount(0);
  await popup.getByRole('button', { name: 'Import' }).click();
  await panel.bringToFront();
  await expect(panel.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(panel.locator('input[type=file]')).toHaveCount(1);
});
