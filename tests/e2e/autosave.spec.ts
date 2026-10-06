import { test, expect } from './fixtures';

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Lisbon guide</title></head><body>
<p id="tip">Belém Tower opens at 10:00.</p>
<input id="pw" type="password" value="hunter2-secret">
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

  await copyOn('https://guide.e2e.test/', '#tip');
  await copyOn('https://guide.e2e.test/', '#pw');
  await copyOn('https://blocked.e2e.test/', '#tip');

  const list = panel.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Belém Tower opens at 10:00.');
  await expect(list).toContainText('From guide.e2e.test');
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
  await expect(list.getByRole('listitem')).toHaveCount(1);
});
