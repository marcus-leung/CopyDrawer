import fs from 'node:fs';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { test, expect } from '../../../../tests/e2e/fixtures';
import { pasteIntoPanel } from '../../../../tests/e2e/helpers';
import { capture, EVIDENCE_ROOT } from './evidence';

const FEATURE = 'export';

test('the exported clips.html reads well in a browser', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await pasteIntoPanel(
    panel,
    '2 cups flour, 1 tbsp sugar. Preheat the oven to 200C.',
    'https://www.airbnb.com/rooms/48213377',
    'Meeting notes:\n- ship the export zip\n- <b>tags</b> stay as text',
  );
  await panel.evaluate(async () => {
    const canvas = new OffscreenCanvas(160, 100);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#2457C5';
    ctx.fillRect(0, 0, 160, 100);
    const data = new DataTransfer();
    data.items.add(new File([await canvas.convertToBlob({ type: 'image/png' })], 'blue.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  });
  await expect(panel.getByRole('list', { name: 'Clips' }).getByRole('listitem')).toHaveCount(4);

  await panel.getByRole('button', { name: 'Settings' }).click();
  const [download] = await Promise.all([panel.waitForEvent('download'), panel.getByRole('button', { name: 'Export' }).click()]);
  const dir = path.join(EVIDENCE_ROOT, FEATURE, 'unzipped');
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [name, bytes] of Object.entries(unzipSync(new Uint8Array(fs.readFileSync(await download.path()))))) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), bytes);
  }
  expect(strFromU8(fs.readFileSync(path.join(dir, 'clips.html')))).toContain('&lt;b&gt;tags&lt;/b&gt;');

  const page = await context.newPage();
  await page.goto(`file://${path.join(dir, 'clips.html')}`);
  await expect(page.getByRole('heading', { name: 'Your clips' })).toBeVisible();
  await expect(page.locator('img')).toHaveCount(1);
  await capture(page, FEATURE, '1-clips-html');
});
