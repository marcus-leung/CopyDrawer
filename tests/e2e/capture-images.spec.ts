import { test, expect } from './fixtures';

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Photo page</title></head>
<body style="margin:0"><img id="pic" src="/pic.png" width="200" height="150"><div style="height:2000px"></div></body></html>`;

test('right-click "Save image" and "Screenshot an area" save images with a page toast', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  // Make a real 40x30 PNG in the browser to serve as the page's image.
  const PNG = Buffer.from(
    await panel.evaluate(async () => {
      const canvas = new OffscreenCanvas(40, 30);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#B35A00';
      ctx.fillRect(0, 0, 40, 30);
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
      return btoa(String.fromCharCode(...bytes));
    }),
    'base64',
  );
  await context.route('https://photos.e2e.test/**', (route) =>
    route.request().url().endsWith('/pic.png')
      ? route.fulfill({ contentType: 'image/png', body: PNG })
      : route.fulfill({ contentType: 'text/html', body: PAGE }),
  );
  const page = await context.newPage();
  await page.goto('https://photos.e2e.test/');
  const tabId = await panel.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'https://photos.e2e.test/*' });
    return tabs[0]!.id!;
  });

  // Save image (same code path as the context menu).
  await panel.evaluate(
    (id) =>
      chrome.runtime.sendMessage({
        type: 'e2e-menu',
        action: 'save-image',
        tabId: id,
        srcUrl: 'https://photos.e2e.test/pic.png',
      }),
    tabId,
  );
  const list = panel.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('pic.png');

  // Screenshot: start the tool, then drag on the page.
  await page.bringToFront();
  const done = panel.evaluate((id) => chrome.runtime.sendMessage({ type: 'e2e-menu', action: 'screenshot', tabId: id }), tabId);
  await page.waitForTimeout(300);
  await page.mouse.move(10, 10);
  await page.mouse.down();
  await page.mouse.move(110, 80, { steps: 5 });
  await page.mouse.up();
  await done;
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list).toContainText('Screenshot of Photo page');
});
