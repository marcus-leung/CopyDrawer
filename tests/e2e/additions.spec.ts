/**
 * Clip editing, dragging clips onto collections, and "Open" on the in-page
 * "Saved" card, end to end in Chromium with the real extension.
 */
import { test, expect } from './fixtures';
import { pasteIntoPanel, readClips } from './helpers';

test('edit a clip: text, title, cancel, empty text refused', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await pasteIntoPanel(panel, 'Meet at the cafe on Friday');
  const list = panel.getByRole('list', { name: 'Clips' });
  await list.getByRole('button', { name: /Meet at the cafe/ }).click();

  // Cancel leaves it unchanged (button and Esc).
  await panel.getByRole('button', { name: 'Edit' }).click();
  await panel.getByLabel('Text').fill('changed my mind');
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Meet at the cafe on Friday' })).toBeVisible();
  await panel.getByRole('button', { name: 'Edit' }).click();
  await panel.getByLabel('Text').fill('changed my mind');
  await panel.keyboard.press('Escape');
  await expect(panel.getByRole('heading', { name: 'Meet at the cafe on Friday' })).toBeVisible();

  // Empty text is refused with a message.
  await panel.getByRole('button', { name: 'Edit' }).click();
  await expect(panel.getByText('Edits only change this saved copy, not the page it came from.')).toBeVisible();
  await panel.getByLabel('Text').fill('   ');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByRole('alert')).toContainText("The clip can't be empty");

  // New text: the title follows it, and the rules sort it again (an address now).
  await panel.getByLabel('Text').fill('Meet at 221B Baker Street, London NW1 6XE');
  await panel.keyboard.press('Control+Enter');
  await expect(panel.getByRole('status')).toContainText('Saved your changes');
  await expect(panel.getByRole('heading', { name: 'Meet at 221B Baker Street, London NW1 6XE' })).toBeVisible();
  await expect(panel.getByLabel('Collection').locator('option:checked')).toHaveText('Personal');
  await expect(panel.getByRole('button', { name: 'Open address in Maps' })).toBeVisible();

  // A title of your own; copying gives the edited text.
  await panel.getByRole('button', { name: 'Edit' }).click();
  await panel.getByLabel('Title').fill('Holmes');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByRole('heading', { name: 'Holmes' })).toBeVisible();
  await panel.getByRole('button', { name: 'Copy', exact: true }).click();
  expect(await panel.evaluate(() => navigator.clipboard.readText())).toBe('Meet at 221B Baker Street, London NW1 6XE');
  await panel.getByRole('button', { name: 'Back' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Holmes');
  expect((await readClips(panel))[0]?.titleSource).toBe('user');
});

test('drag a clip onto a collection tile to move it', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await pasteIntoPanel(panel, '2 cups flour, 1 tbsp sugar. Preheat the oven to 200C.', 'alex.morgan@example.com', 'Plain note');
  const tiles = panel.getByRole('list', { name: 'Collections' });
  await expect(tiles.getByRole('button')).toHaveCount(2);
  const list = panel.getByRole('list', { name: 'Clips' });

  await list.getByRole('button', { name: /Plain note/ }).dragTo(tiles.getByRole('button', { name: /Recipes/ }));
  await expect(panel.getByRole('status')).toContainText('Moved to Recipes');
  await expect(list.getByRole('listitem').filter({ hasText: 'Plain note' })).toContainText('Recipes');
  await expect(tiles.getByRole('button', { name: /Recipes/ })).toContainText('2 clips');
  // Dragging a clip is not "drop to save": no new clip, no drop overlay left behind.
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(panel.getByText('Drop to save')).toHaveCount(0);

  // It stays where it was put.
  await pasteIntoPanel(panel, 'Plain note');
  await expect(list.getByRole('listitem').filter({ hasText: 'Plain note' })).toContainText('Recipes');
});

test('"Open" on the in-page Saved card shows the clip in the panel', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const png = Buffer.from(
    await panel.evaluate(async () => {
      const canvas = new OffscreenCanvas(30, 20);
      canvas.getContext('2d')!.fillRect(0, 0, 30, 20);
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
      return btoa(String.fromCharCode(...bytes));
    }),
    'base64',
  );
  await context.route('https://pics.e2e.test/**', (route) =>
    route.request().url().endsWith('.png')
      ? route.fulfill({ contentType: 'image/png', body: png })
      : route.fulfill({ contentType: 'text/html', body: '<meta charset="utf-8"><img src="/sunset.png">' }),
  );
  const page = await context.newPage();
  await page.goto('https://pics.e2e.test/');
  const tabId = await panel.evaluate(async () => (await chrome.tabs.query({ url: 'https://pics.e2e.test/*' }))[0]!.id!);
  await panel.evaluate(
    (id) =>
      chrome.runtime.sendMessage({
        type: 'e2e-menu',
        action: 'save-image',
        tabId: id,
        srcUrl: 'https://pics.e2e.test/sunset.png',
      }),
    tabId,
  );
  const card = page.locator('#__clipboard_ext_toast__');
  await expect(card.getByText('Image saved')).toBeVisible();
  await card.getByRole('button', { name: 'Open' }).click();
  await expect(card).toHaveCount(0);

  // The panel (already open here) jumps to the clip.
  await expect(panel.getByRole('heading', { name: 'sunset.png' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Copy image' })).toBeVisible();
});

test('"Open" with no panel open falls back to a tab showing the clip', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await pasteIntoPanel(panel, 'Fallback clip');
  await expect(panel.getByRole('list', { name: 'Clips' }).getByRole('listitem')).toHaveCount(1);
  const id = (await readClips(panel))[0]!.id;
  await context.route('https://x.e2e.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>page</p>' }));
  const page = await context.newPage();
  await page.goto('https://x.e2e.test/');
  await panel.close();
  // Send what the card's Open button sends, from the page (no click, so Chrome won't open the side panel).
  const sw = context.serviceWorkers()[0]!;
  const opened = context.waitForEvent('page', { predicate: (p) => p.url().includes(`clip=${id}`) });
  await sw.evaluate(async (clipId) => {
    const [tab] = await chrome.tabs.query({ url: 'https://x.e2e.test/*' });
    await chrome.scripting.executeScript({
      target: { tabId: tab!.id! },
      func: (cid: string) =>
        void (globalThis as unknown as { chrome: typeof chrome }).chrome.runtime.sendMessage({ type: 'open-clip', clipId: cid }),
      args: [clipId],
    });
  }, id);
  const tab = await opened;
  await expect(tab.getByRole('heading', { name: 'Fallback clip' })).toBeVisible();
});

test('settings sync with other computers through chrome.storage.sync', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const synced = () =>
    panel.evaluate(async () => (await chrome.storage.sync.get('settings')).settings as Record<string, unknown> | undefined);
  // The first computer publishes its settings.
  await expect.poll(async () => (await synced())?.theme).toBe('system');

  // A change here goes to sync; per-computer settings don't.
  await panel.getByRole('button', { name: 'Settings' }).click();
  await panel.getByLabel('Theme').selectOption('dark');
  await expect.poll(async () => (await synced())?.theme).toBe('dark');
  expect(await synced()).not.toHaveProperty('autoSave');
  expect(await synced()).not.toHaveProperty('pausedUntil');
  await expect(panel.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Another computer changes settings: this one follows.
  await panel.evaluate(async () => {
    await chrome.storage.sync.set({
      settings: {
        theme: 'light',
        blockedSites: ['work.example.com'],
        retentionDays: 90,
        saveInIncognito: false,
        smartModel: false,
        updatedAt: Date.now() + 1000,
      },
    });
  });
  await expect(panel.getByLabel('Theme')).toHaveValue('light');
  await expect(panel.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(panel.getByLabel('Delete old clips')).toHaveValue('90');
  await expect(panel.getByText('work.example.com')).toBeVisible();
  await expect(panel.getByRole('switch', { name: /Sort and search by meaning/ })).not.toBeChecked();

  // Bad values from elsewhere are ignored; an older copy doesn't overwrite newer settings.
  await panel.evaluate(async () => {
    await chrome.storage.sync.set({
      settings: { theme: 'neon', retentionDays: 7, blockedSites: 'all', updatedAt: Date.now() + 5000 },
    });
  });
  await panel.waitForTimeout(400);
  await expect(panel.getByLabel('Theme')).toHaveValue('light');
  await expect(panel.getByLabel('Delete old clips')).toHaveValue('90');
  await panel.evaluate(async () => chrome.storage.sync.set({ settings: { theme: 'dark', updatedAt: 1 } }));
  await panel.waitForTimeout(400);
  await expect(panel.getByLabel('Theme')).toHaveValue('light');
});
