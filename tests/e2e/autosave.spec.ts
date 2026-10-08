import { test, expect } from './fixtures';

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Lisbon guide</title></head><body>
<p id="tip">Belém Tower opens at 10:00.</p>
<input id="pw" type="password" value="hunter2-secret">
<iframe id="editor" srcdoc="<p id='draft'>Draft typed in an editor frame</p>"></iframe>
</body></html>`;

test('auto-save keeps what you copy, skips passwords, pauses and blocks', async ({ context, extensionId }) => {
  await context.route('https://guide.e2e.test/**', (route) => route.fulfill({ contentType: 'text/html', body: PAGE }));
  await context.route('https://blocked.e2e.test/**', (route) => route.fulfill({ contentType: 'text/html', body: PAGE }));

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  // Turn auto-save on (the E2E build already has all-sites access).
  await panel.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings ?? {}), autoSave: true, blockedSites: ['blocked.e2e.test'] } });
    await chrome.runtime.sendMessage({ type: 'autosave-sync' });
  });

  const copyOn = async (url: string, selector: string) => {
    const page = await context.newPage();
    await page.goto(url);
    await page.evaluate((sel) => {
      const el = document.querySelector(sel)!;
      if (el instanceof HTMLInputElement) {
        el.focus();
        el.select();
      } else {
        const range = document.createRange();
        range.selectNodeContents(el);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(range);
      }
      document.execCommand('copy');
    }, selector);
    // Give the copy message time to reach the background before closing the tab.
    await page.waitForTimeout(300);
    await page.close();
  };

  // Rich-text editors often live in blank or srcdoc frames; those belong to the page around them.
  const copyInFrame = async (url: string) => {
    const page = await context.newPage();
    await page.goto(url);
    await page
      .frameLocator('#editor')
      .locator('#draft')
      .evaluate((el) => {
        const doc = el.ownerDocument;
        const range = doc.createRange();
        range.selectNodeContents(el);
        doc.getSelection()!.removeAllRanges();
        doc.getSelection()!.addRange(range);
        doc.execCommand('copy');
      });
    await page.waitForTimeout(300);
    await page.close();
  };

  await copyOn('https://guide.e2e.test/', '#tip');
  await copyOn('https://guide.e2e.test/', '#pw');
  await copyOn('https://blocked.e2e.test/', '#tip');
  await copyInFrame('https://blocked.e2e.test/');
  await copyInFrame('https://guide.e2e.test/');

  const list = panel.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByRole('listitem').filter({ hasText: 'Draft typed in an editor frame' })).toContainText(
    /from guide\.e2e\.test/i,
  );
  await expect(list).toContainText('Belém Tower opens at 10:00.');
  await expect(list).toContainText(/from guide\.e2e\.test/i);
  await expect(panel.getByText('hunter2-secret')).toHaveCount(0);

  // Pause stops saving.
  await panel.getByRole('button', { name: 'Pause' }).click();
  await expect(panel.getByText('Auto-save is paused')).toBeVisible();
  const page = await context.newPage();
  await page.goto('https://guide.e2e.test/');
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<p id="x">Copied while paused</p>');
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('x')!);
    getSelection()!.addRange(range);
    document.execCommand('copy');
  });
  await page.waitForTimeout(500);
  await expect(list.getByRole('listitem')).toHaveCount(2);
});

test('granting site access turns auto-save on, and tabs already open save without a reload', async ({ context, extensionId }) => {
  await context.route('https://open.e2e.test/**', (route) => route.fulfill({ contentType: 'text/html', body: PAGE }));
  // A page opened while auto-save is off.
  const page = await context.newPage();
  await page.goto('https://open.e2e.test/');

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const settings = () =>
    panel.evaluate(async () => (await chrome.storage.local.get('settings')).settings as { autoSave?: boolean } | undefined);
  expect((await settings())?.autoSave ?? false).toBe(false);

  // Chrome grants the access (the prompt that closes the toolbar popup): the background turns auto-save on.
  await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'e2e-permissions-added' }));
  expect((await settings())?.autoSave).toBe(true);

  // The tab that was already open saves what you copy, no reload.
  await page.bringToFront();
  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('tip')!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    document.execCommand('copy');
  });
  await panel.bringToFront();
  const list = panel.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Belém Tower opens at 10:00.');
});
