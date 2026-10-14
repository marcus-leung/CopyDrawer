import { readClips } from './helpers';
import { test, expect } from './fixtures';

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Booking</title></head><body>
<button id="ref" onclick="navigator.clipboard.writeText('Booking ref QX7-221')">Copy reference</button>
<button id="rich" onclick="navigator.clipboard.write([new ClipboardItem({
  'text/plain': new Blob(['Gate B12'], { type: 'text/plain' }),
  'text/html': new Blob(['<b>Gate B12</b>'], { type: 'text/html' }),
})])">Copy gate</button>
<button id="key" onclick="navigator.clipboard.writeText('ghp_1234567890abcdefghijklmnopqrstuvwxyzAB')">Copy token</button>
<button id="card" onclick="navigator.clipboard.writeText('4111 1111 1111 1111')">Copy card</button>
<p id="plain">Just some text</p>
</body></html>`;

const UNCLICKED = `<!doctype html><title>start</title><script>
setTimeout(async () => {
  await navigator.clipboard.writeText('Written without a click').catch(() => {});
  dispatchEvent(new CustomEvent('copydrawer:clipboard-write', { detail: JSON.stringify({ text: 'Faked by the page' }) }));
  setTimeout(() => (document.title = 'done'), 500);
}, 300);
</script>`;

test('copy buttons on a page are auto-saved, keys are not, and pages cannot add clips without a click', async ({
  context,
  extensionId,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  for (const host of ['book.e2e.test', 'blocked.e2e.test'])
    await context.route(`https://${host}/**`, (route) => route.fulfill({ contentType: 'text/html', body: PAGE }));
  await context.route('https://unclicked.e2e.test/**', (route) => route.fulfill({ contentType: 'text/html', body: UNCLICKED }));

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings ?? {}), autoSave: true, blockedSites: ['blocked.e2e.test'] } });
    await chrome.runtime.sendMessage({ type: 'autosave-sync' });
  });
  const texts = async () => (await readClips(panel)).map((c) => c.text).sort();

  const page = await context.newPage();
  await page.goto('https://book.e2e.test/');
  await page.locator('#ref').click();
  await expect.poll(texts).toEqual(['Booking ref QX7-221']);

  await page.locator('#rich').click();
  await expect.poll(texts).toEqual(['Booking ref QX7-221', 'Gate B12']);
  expect((await readClips(panel)).find((c) => c.text === 'Gate B12')).toMatchObject({ title: 'Gate B12' });

  // A token is never kept, and the page says why.
  await page.locator('#key').click();
  const card = page.locator('#__clipboard_ext_toast__');
  await expect(card).toContainText('Not saved: looks like a password or key');
  await page.locator('#card').click();
  await expect(card).toContainText('Not saved: looks like a card number');
  expect(await texts()).toEqual(['Booking ref QX7-221', 'Gate B12']);

  // After a click anywhere, a page that fakes reports gets at most one in.
  await page.locator('#plain').click();
  await page.evaluate(() => {
    for (const text of ['Forged 1', 'Forged 2', 'Forged 3'])
      dispatchEvent(new CustomEvent('copydrawer:clipboard-write', { detail: JSON.stringify({ text }) }));
  });
  await page.waitForTimeout(500);
  expect((await texts()).filter((t) => t.startsWith('Forged')).length).toBeLessThanOrEqual(1);
  const afterForging = (await texts()).length;

  // A page's own script, with no click: neither its clipboard writes nor reports it fakes add clips.
  // Only waits here: Playwright's evaluate (and waitForFunction) would count as a click.
  const unclicked = await context.newPage();
  await unclicked.goto('https://unclicked.e2e.test/');
  await unclicked.waitForTimeout(1500);
  await expect(unclicked).toHaveTitle('done');
  expect(await texts()).toHaveLength(afterForging);

  // Blocked sites stay blocked.
  const blocked = await context.newPage();
  await blocked.goto('https://blocked.e2e.test/');
  await blocked.locator('#ref').click();
  await blocked.waitForTimeout(500);
  expect(await readClips(panel)).toHaveLength(afterForging);
});
