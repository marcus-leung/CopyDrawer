import { test, expect } from './fixtures';

test('smart actions, images and colors strip, toolbar popup', async ({ context, extensionId }) => {
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
  // Tracking parameters are gone from the saved link.
  await expect(list).toContainText('shop.test/lamp');
  await expect(list).not.toContainText('utm_source');
  await expect(panel.getByRole('list', { name: 'Images and colors' }).getByRole('button')).toHaveCount(1);
  await expect(panel.getByText('Try pasting it back')).toBeVisible();
  await panel.getByRole('button', { name: 'Got it' }).click();
  await expect(panel.getByText('Try pasting it back')).toHaveCount(0);

  // Tracking number: note + actions. It also lands in Shopping.
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

  // Color: swatch and formats.
  await panel.getByRole('list', { name: 'Images and colors' }).getByRole('button').click();
  await expect(panel.getByText('Looks like a color')).toBeVisible();
  await panel.getByRole('button', { name: 'Copy RGB' }).click();
  expect(await panel.evaluate(() => navigator.clipboard.readText())).toBe('rgb(36, 87, 197)');

  // Toolbar popup: recent clips, click to copy.
  const popup = await context.newPage();
  await popup.goto(`${origin}/popup.html`);
  const recent = popup.getByRole('list', { name: 'Recent clips' });
  await expect(recent.getByRole('button')).toHaveCount(3);
  await recent.getByRole('button', { name: /1Z 999/ }).click();
  await expect(popup.getByRole('status')).toHaveText('Copied. Paste it anywhere.');
});
