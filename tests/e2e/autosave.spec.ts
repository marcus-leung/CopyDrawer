import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readClips } from './helpers';
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

  // Selecting an image and pressing Ctrl/Cmd+C saves the image.
  const imagePage = await context.newPage();
  await imagePage.goto('https://guide.e2e.test/');
  await imagePage.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 60;
    canvas.height = 40;
    canvas.getContext('2d')!.fillRect(0, 0, 60, 40);
    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/png');
    document.body.append(img);
    const range = document.createRange();
    range.selectNode(img);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    document.execCommand('copy');
  });
  await imagePage.waitForTimeout(300);
  await imagePage.close();
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(panel.getByRole('list', { name: 'Images and colors' }).getByRole('button')).toHaveCount(1);

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
  await expect(list.getByRole('listitem')).toHaveCount(3);
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

  // Taking the access away in Chrome turns auto-save off, so the panel stops claiming it saves.
  await expect(panel.getByRole('button', { name: 'Pause' })).toBeVisible();
  await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'e2e-permissions-removed' }));
  expect((await settings())?.autoSave).toBe(false);
  await expect(panel.getByRole('button', { name: 'Grab clipboard' })).toBeVisible();
});

test('auto-save ignores copy events the page fakes, and never fetches their images', async ({ context, extensionId }) => {
  const intranetHits: string[] = [];
  await context.route('https://intranet.e2e.test/**', (route) => {
    intranetHits.push(route.request().url());
    return route.fulfill({ status: 404 });
  });
  await context.route('https://guide.e2e.test/**', (route) => route.fulfill({ contentType: 'text/html', body: PAGE }));

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings ?? {}), autoSave: true } });
    await chrome.runtime.sendMessage({ type: 'autosave-sync' });
  });

  const page = await context.newPage();
  await page.goto('https://guide.e2e.test/');
  await page.evaluate(() => {
    // Lazy and hidden, so the page itself never loads it: any request comes from the extension.
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.style.display = 'none';
    img.src = 'https://intranet.e2e.test/admin.png';
    document.body.append(img);
    img.dispatchEvent(new ClipboardEvent('copy', { bubbles: true }));
    for (let i = 0; i < 5; i++) {
      const data = new DataTransfer();
      data.setData('text/plain', `Fake copy ${i}`);
      window.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data }));
    }
  });
  await page.waitForTimeout(500);
  await expect.poll(async () => (await readClips(panel)).length).toBe(0);

  // A real copy on the same page still saves.
  await page.locator('#tip').selectText();
  await page.keyboard.press('ControlOrMeta+C');
  await expect.poll(async () => (await readClips(panel)).map((c) => c.text)).toEqual(['Belém Tower opens at 10:00.']);
  expect(intranetHits).toEqual([]);
});

test('tabs already open keep auto-saving after the extension updates', async ({ context, extensionId }) => {
  await context.route('https://guide.e2e.test/**', (route) => route.fulfill({ contentType: 'text/html', body: PAGE }));
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings ?? {}), autoSave: true } });
    await chrome.runtime.sendMessage({ type: 'autosave-sync' });
  });

  // The state an update leaves behind (Playwright can't update an extension): the script is
  // still registered, but the open tab's copy is cut off. Here: a tab opened while unregistered.
  const [registered] = await panel.evaluate(() => chrome.scripting.getRegisteredContentScripts());
  await panel.evaluate(() => chrome.scripting.unregisterContentScripts());
  const page = await context.newPage();
  await page.goto('https://guide.e2e.test/');
  await panel.evaluate((script) => chrome.scripting.registerContentScripts([script]), registered!);

  await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'e2e-installed', reason: 'update' }));
  await page.bringToFront();
  await page.locator('#tip').selectText();
  await page.keyboard.press('ControlOrMeta+C');
  await expect.poll(async () => (await readClips(panel)).map((c) => c.text)).toEqual(['Belém Tower opens at 10:00.']);
});

// Real servers: Playwright's route() skips CORS, so it can't show what a CDN without CORS headers does.
function serve(handler: http.RequestListener): Promise<{ origin: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler).listen(0, '127.0.0.1', () => {
      resolve({ origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() });
    });
  });
}

test('copying an image hosted on another site, without CORS headers, saves it', async ({ context, extensionId }) => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  const cdn = await serve((_req, res) => res.writeHead(200, { 'content-type': 'image/png' }).end(PNG));
  const site = await serve((_req, res) =>
    res
      .writeHead(200, { 'content-type': 'text/html' })
      .end(`<p>Photo</p><img id="pic" src="${cdn.origin}/pic.png" width="40" height="40">`),
  );
  try {
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings ?? {}), autoSave: true } });
      await chrome.runtime.sendMessage({ type: 'autosave-sync' });
    });
    const page = await context.newPage();
    await page.goto(`${site.origin}/`);
    await page.locator('#pic').evaluate((img: HTMLImageElement) => img.decode());
    await page.evaluate(() => {
      const range = document.createRange();
      range.selectNode(document.getElementById('pic')!);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });
    await page.keyboard.press('ControlOrMeta+C');
    await expect
      .poll(async () => (await readClips(panel)).map((c) => c.title))
      .toEqual([expect.stringMatching(/^Image from 127\.0\.0\.1/)]);
  } finally {
    cdn.close();
    site.close();
  }
});

test('copies on an HTML page whose address ends in .pdf (a PDF viewer) are saved', async ({ context, extensionId }) => {
  await context.route('https://viewer.e2e.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p id="t">Quarterly results, page 2</p>' }),
  );
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings ?? {}), autoSave: true } });
    await chrome.runtime.sendMessage({ type: 'autosave-sync' });
  });
  const page = await context.newPage();
  await page.goto('https://viewer.e2e.test/web/viewer.html?file=report.pdf');
  await page.locator('#t').selectText();
  await page.keyboard.press('ControlOrMeta+C');
  await expect.poll(async () => (await readClips(panel)).map((c) => c.text)).toEqual(['Quarterly results, page 2']);
});

test('a huge copied image is cut off at 20 MB, downloaded once, and not saved', async ({ context, extensionId }) => {
  let requests = 0;
  let sent = 0;
  let closedEarly = false;
  const TOTAL = 30 * 1024 * 1024;
  const site = await serve((req, res) => {
    if (!req.url?.startsWith('/big.png')) {
      res
        .writeHead(200, { 'content-type': 'text/html' })
        .end('<p>Big</p><img id="pic" loading="lazy" style="display:none" src="/big.png">');
      return;
    }
    requests++;
    // Streamed, so there's no Content-Length to check up front.
    res.writeHead(200, { 'content-type': 'image/png' });
    res.on('close', () => (closedEarly = sent < TOTAL));
    const chunk = Buffer.alloc(256 * 1024, 7);
    const pump = () => {
      while (sent < TOTAL) {
        sent += chunk.length;
        if (!res.write(chunk)) return void res.once('drain', pump);
      }
      res.end();
    };
    pump();
  });
  try {
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings ?? {}), autoSave: true } });
      await chrome.runtime.sendMessage({ type: 'autosave-sync' });
    });
    const page = await context.newPage();
    await page.goto(`${site.origin}/`);
    await page.evaluate(() => {
      const range = document.createRange();
      range.selectNode(document.getElementById('pic')!);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });
    await page.keyboard.press('ControlOrMeta+C');
    await expect.poll(() => closedEarly, { timeout: 10_000 }).toBe(true);
    await page.waitForTimeout(1000);
    expect(requests).toBe(1);
    expect(await readClips(panel)).toEqual([]);
  } finally {
    site.close();
  }
});
