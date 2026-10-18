import { test, expect } from './fixtures';
import { pasteIntoPanel } from './helpers';

/** Every clip type: what it's saved as, its filter, search word, actions, Paste as and quick paste. */
const TYPES = [
  { text: '#2457C5', label: 'Color', filter: 'Colors', word: 'colour', action: 'Copy RGB', copies: 'rgb(36, 87, 197)' },
  { text: 'jane@example.com', label: 'Email', filter: 'Emails', word: 'email', action: 'Write an email' },
  { text: '+1 (415) 555-0134', label: 'Phone number', filter: 'Phone numbers', word: 'phone', action: 'Call' },
  { text: '{"city":"Kyoto","days":4}', label: 'JSON', filter: 'JSON', word: 'json', action: 'Copy tidy' },
  {
    text: '1600 Amphitheatre Parkway, Mountain View, CA 94043',
    label: 'Address',
    filter: 'Addresses',
    word: 'address',
    action: 'Open address in Maps',
  },
  { text: 'March 14, 2027', label: 'Date', filter: 'Dates', word: 'date', action: 'Add March 14, 2027 to calendar' },
  { text: '$1,299.00', label: 'Number', filter: 'Numbers', word: 'amount', action: 'Copy number only', copies: '1299.00' },
] as const;

const FORM = '<!doctype html><title>Form</title><textarea id="notes" aria-label="Notes"></textarea>';

test('each clip type is recognized, filtered, searched, acted on and quick-pasted', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await pasteIntoPanel(panel, 'Pack light for the trip', 'https://example.com/guide', ...TYPES.map((t) => t.text));
  const list = panel.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(TYPES.length + 2);
  const search = panel.getByRole('searchbox', { name: 'Search your clips' });

  for (const t of TYPES) {
    const row = list.getByRole('listitem').filter({ hasText: t.text });
    await expect(row.locator('span.block').last()).toHaveText(new RegExp(`^${t.label}, `));

    await search.fill(t.word);
    await expect(list.getByRole('listitem').filter({ hasText: t.text })).toHaveCount(1);
    await search.fill('');

    await panel.getByRole('button', { name: 'Filters' }).click();
    await panel.getByLabel('Type').selectOption({ label: t.filter });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText(t.text);
    await panel.getByRole('button', { name: 'Filters' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(TYPES.length + 2);

    // Plain text has no formatting, so no Paste as.
    await list.getByRole('button', { name: new RegExp(t.text.replace(/[$()+{}[\]]/g, '\\$&').slice(0, 20)) }).click();
    const actions = panel.getByRole('region', { name: 'Smart actions' });
    await expect(actions.getByRole('button', { name: t.action, exact: true })).toBeVisible();
    await expect(panel.getByRole('region', { name: 'Paste as' })).toHaveCount(0);
    if ('copies' in t) {
      await actions.getByRole('button', { name: t.action, exact: true }).click();
      await expect.poll(() => panel.evaluate(() => navigator.clipboard.readText())).toBe(t.copies);
    }
    await panel.getByRole('button', { name: 'Back' }).click();
  }

  // Plain text and links keep their types; only non-text types are labeled.
  await expect(list.getByRole('listitem').filter({ hasText: 'Pack light' })).not.toContainText(/Text,/);
  await expect(list.getByRole('listitem').filter({ hasText: 'example.com/guide' })).not.toContainText('Link,');

  await context.route('https://form.e2e.test/**', (route) => route.fulfill({ contentType: 'text/html', body: FORM }));
  const page = await context.newPage();
  await page.goto('https://form.e2e.test/');
  const tabId = await panel.evaluate(async () => (await chrome.tabs.query({ url: 'https://form.e2e.test/*' }))[0]!.id!);
  for (const t of TYPES) {
    await page.locator('#notes').fill('');
    await page.locator('#notes').click();
    await panel.evaluate((id) => chrome.runtime.sendMessage({ type: 'e2e-menu', action: 'quick-paste', tabId: id }), tabId);
    await expect(page.getByRole('combobox', { name: 'Filter clips' })).toBeFocused();
    await page.keyboard.type(t.text.slice(0, 8));
    await page.keyboard.press('Enter');
    await expect(page.locator('#notes')).toHaveValue(t.text);
  }
});

test('auto-save gives copied text its type', async ({ context, extensionId }) => {
  await context.route('https://contact.e2e.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Contact</title><p id="mail">sales@example.com</p>' }),
  );
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings ?? {}), autoSave: true } });
    await chrome.runtime.sendMessage({ type: 'autosave-sync' });
  });
  const page = await context.newPage();
  await page.goto('https://contact.e2e.test/');
  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('mail')!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    document.execCommand('copy');
  });
  await page.waitForTimeout(300);
  await panel.bringToFront();
  const row = panel.getByRole('list', { name: 'Clips' }).getByRole('listitem');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('sales@example.com');
  await expect(row).toContainText(/Email, .*from contact\.e2e\.test/i);
});

test('sort: oldest, most used and A–Z, pinned first', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await pasteIntoPanel(panel, 'banana bread', 'apple pie', 'cherry tart');
  const list = panel.getByRole('list', { name: 'Clips' });
  const titles = () =>
    list.getByRole('listitem').evaluateAll((rows) => rows.map((r) => r.querySelector('span.flex span.truncate')?.textContent));
  await expect.poll(titles).toEqual(['cherry tart', 'apple pie', 'banana bread']);

  // Use apple pie twice and banana bread once (copy from the row).
  for (const name of ['apple pie', 'apple pie', 'banana bread']) {
    await list.getByRole('listitem').filter({ hasText: name }).getByRole('button', { name: 'Copy' }).click();
  }
  await panel.getByRole('button', { name: 'Filters' }).click();
  const sort = panel.getByLabel('Sort');
  await sort.selectOption({ label: 'Oldest first' });
  await expect.poll(titles).toEqual(['banana bread', 'apple pie', 'cherry tart']);
  await sort.selectOption({ label: 'Most used' });
  await expect.poll(titles).toEqual(['apple pie', 'banana bread', 'cherry tart']);
  await sort.selectOption({ label: 'A–Z' });
  await expect.poll(titles).toEqual(['apple pie', 'banana bread', 'cherry tart']);

  // A pinned clip stays on top in any order.
  await list.getByRole('button', { name: /cherry tart/ }).click();
  await panel.getByRole('button', { name: 'Pin' }).click();
  await panel.getByRole('button', { name: 'Back' }).click();
  await expect(panel.getByLabel('Sort')).toHaveValue('az');
  await expect.poll(titles).toEqual(['cherry tart', 'apple pie', 'banana bread']);
});
