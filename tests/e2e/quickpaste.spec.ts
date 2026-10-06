import { test, expect } from './fixtures';

const FORM = `<!doctype html><html><head><meta charset="utf-8"><title>Form</title></head>
<body><label>Notes <textarea id="notes">Hi </textarea></label><div id="ce" contenteditable="true">Draft: </div></body></html>`;

test('quick-paste box pastes into the focused field, with Paste as', async ({ context, extensionId }) => {
  await context.route('https://form.e2e.test/**', (route) => route.fulfill({ contentType: 'text/html', body: FORM }));
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.evaluate(() => {
    for (const t of ['12 oz spaghetti, 1 lemon, parmesan', 'alex.morgan@example.com']) {
      const data = new DataTransfer();
      data.setData('text/plain', t);
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    }
  });
  await expect(panel.getByRole('list', { name: 'Clips' }).getByRole('listitem')).toHaveCount(2);

  const page = await context.newPage();
  await page.goto('https://form.e2e.test/');
  const tabId = await panel.evaluate(async () => (await chrome.tabs.query({ url: 'https://form.e2e.test/*' }))[0]!.id!);
  const open = () => panel.evaluate((id) => chrome.runtime.sendMessage({ type: 'e2e-menu', action: 'quick-paste', tabId: id }), tabId);

  // Type-to-filter, Enter pastes at the cursor.
  await page.bringToFront();
  await page.locator('#notes').click();
  await page.keyboard.press('End');
  await open();
  const filter = page.getByRole('combobox', { name: 'Filter clips' });
  await expect(filter).toBeFocused();
  await expect(page.getByRole('option')).toHaveCount(2);
  await page.keyboard.type('alex');
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('#notes')).toHaveValue('Hi alex.morgan@example.com');
  await expect(page.getByRole('dialog', { name: 'Quick paste' })).toHaveCount(0);

  // Tab opens Paste as; Checklist reshapes the clip.
  await page.locator('#ce').click();
  await page.keyboard.press('End');
  await open();
  await page.keyboard.type('spaghetti');
  await page.keyboard.press('Tab');
  await page.keyboard.type('check');
  await page.keyboard.press('Enter');
  await expect(page.locator('#ce')).toContainText('- [ ] 12 oz spaghetti');
  await expect(page.locator('#ce')).toContainText('- [ ] parmesan');

  // Esc closes without pasting.
  await open();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Quick paste' })).toHaveCount(0);

  // Using a clip counts as a use.
  await panel.bringToFront();
  await panel.getByRole('list', { name: 'Clips' }).getByRole('button', { name: /alex\.morgan/ }).click();
  await expect(panel.getByText('Used 1 time.')).toBeVisible();
});

test('search filters and Paste as in the panel', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.evaluate(() => {
    for (const t of ['Book the hotel. Buy train tickets. Pack light.', 'https://example.com/guide', 'Lemon tart']) {
      const data = new DataTransfer();
      data.setData('text/plain', t);
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    }
  });
  const list = panel.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(3);

  await panel.getByRole('searchbox', { name: 'Search your clips' }).fill('e');
  await panel.getByLabel('Type').selectOption('link');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(panel.getByText('1 clip matches')).toBeVisible();
  await panel.getByLabel('Type').selectOption('any');
  await panel.getByRole('searchbox', { name: 'Search your clips' }).fill('');

  await list.getByRole('button', { name: /Book the hotel/ }).click();
  await panel.getByRole('button', { name: 'Bullet list' }).click();
  await expect(panel.getByRole('status')).toContainText('Copied as bullet list');
  expect(await panel.evaluate(() => navigator.clipboard.readText())).toBe('- Book the hotel.\n- Buy train tickets.\n- Pack light.');
  // AI options are hidden when Chrome's built-in AI isn't on this device.
  await expect(panel.getByRole('button', { name: 'Summarize' })).toHaveCount(0);
  await expect(panel.getByText("with Chrome's built-in AI: turn it on in Settings")).toBeVisible();
});
