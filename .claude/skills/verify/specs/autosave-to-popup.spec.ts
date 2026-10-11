import { test, expect } from '../../../../tests/e2e/fixtures';
import { readClips } from '../../../../tests/e2e/helpers';
import { capture } from './evidence';

const FEATURE = 'autosave';
const TEXT = 'Verify run: Belém Tower opens at 10:00.';
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Verify page</title></head>
<body><p id="tip">${TEXT}</p></body></html>`;

test('copy on a web page lands in the popup', async ({ context, extensionId }) => {
  const origin = `chrome-extension://${extensionId}`;
  await context.route('https://verify.e2e.test/**', (route) => route.fulfill({ contentType: 'text/html', body: PAGE }));

  const panel = await context.newPage();
  await panel.goto(`${origin}/sidepanel.html`);
  await panel.getByRole('button', { name: 'Settings' }).click();
  const toggle = panel.getByLabel('Save what I copy automatically');
  // The switch flips only after the permission check and settings write finish, so check() would race.
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(panel.getByRole('status')).toContainText('Auto-save is on');
  await capture(panel, FEATURE, '1-settings-autosave-on');

  const site = await context.newPage();
  await site.goto('https://verify.e2e.test/');
  await site.locator('#tip').selectText();
  await site.keyboard.press('ControlOrMeta+C');
  await capture(site, FEATURE, '2-page-copied');
  await expect.poll(async () => (await readClips(panel)).map((c) => c.text)).toContain(TEXT);

  const popup = await context.newPage();
  await popup.goto(`${origin}/popup.html`);
  const list = popup.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem').filter({ hasText: TEXT })).toContainText(/from verify\.e2e\.test/i);
  await capture(popup, FEATURE, '3-popup-shows-clip');
});
