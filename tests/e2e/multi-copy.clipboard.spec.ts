/**
 * Picking several clips: copy them together (joined, with formatting and images), move or delete them all,
 * and pick several in the quick-paste box with Tab.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { pasteIntoPanel, readClips, seedClips } from './helpers';

async function openPanel(context: BrowserContext, extensionId: string) {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  return panel;
}

const clips = (panel: Page) => panel.getByRole('list', { name: 'Clips' });
const pick = (panel: Page, title: string) => clips(panel).getByRole('checkbox', { name: `Pick ${title}`, exact: true });
const bar = (panel: Page) => panel.getByRole('region', { name: 'Picked clips' });
const clipboardText = (panel: Page) => panel.evaluate(() => navigator.clipboard.readText().catch(() => 'not focused yet'));
const clipboardHtml = (panel: Page) =>
  panel.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return item!.types.includes('text/html') ? await (await item!.getType('text/html')).text() : null;
  });

test('pick clips in order, copy them joined, change the separator, ranges, pick all, Esc', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  await pasteIntoPanel(panel, 'Alpha', 'Bravo', 'Charlie');
  await expect(clips(panel).getByRole('listitem')).toHaveCount(3);
  await expect(bar(panel)).toHaveCount(0);

  // ⌘/Ctrl-click picks; after that a plain click on a row picks too.
  await clips(panel)
    .getByRole('button', { name: /Charlie/ })
    .click({ modifiers: ['ControlOrMeta'] });
  await clips(panel).getByRole('button', { name: /Alpha/ }).click();
  await expect(pick(panel, 'Charlie')).toHaveAttribute('aria-checked', 'true');
  await expect(pick(panel, 'Charlie')).toHaveText('1');
  await expect(pick(panel, 'Alpha')).toHaveText('2');
  await expect(pick(panel, 'Bravo')).toHaveAttribute('aria-checked', 'false');
  await expect(bar(panel)).toContainText('2 picked');
  // Row Copy buttons give way to the bar.
  await expect(clips(panel).getByRole('button', { name: 'Copy' })).toHaveCount(0);

  await bar(panel).getByRole('button', { name: 'Copy all' }).click();
  await expect(panel.getByRole('status')).toContainText('Copied 2 clips. Paste anywhere.');
  await expect.poll(() => clipboardText(panel)).toBe('Charlie\nAlpha');
  await expect.poll(async () => (await readClips(panel)).filter((c) => c.useCount === 1).length).toBe(2);

  await bar(panel).getByRole('button', { name: 'More for picked clips' }).click();
  await bar(panel).getByLabel('Join with').selectOption('Blank line');
  await bar(panel).getByRole('button', { name: 'Copy all' }).click();
  await expect.poll(() => clipboardText(panel)).toBe('Charlie\n\nAlpha');
  await expect
    .poll(() =>
      panel.evaluate(
        async () => ((await chrome.storage.local.get('settings')).settings as { joinWith?: string } | undefined)?.joinWith,
      ),
    )
    .toBe('blank');

  await pick(panel, 'Charlie').click();
  await expect(pick(panel, 'Alpha')).toHaveText('1');
  await panel.keyboard.press('Escape');
  await expect(bar(panel)).toHaveCount(0);

  // Shift-click picks the range in list order.
  await pick(panel, 'Charlie').click({ force: true });
  await pick(panel, 'Alpha').click({ modifiers: ['Shift'] });
  await expect(bar(panel)).toContainText('3 picked');
  await expect(pick(panel, 'Bravo')).toHaveText('2');
  await panel.keyboard.press('Escape');

  // ⌘/Ctrl+A picks the whole list, but not while typing in search.
  await panel.locator('body').click({ position: { x: 5, y: 5 } });
  await panel.keyboard.press('ControlOrMeta+a');
  await expect(bar(panel)).toContainText('3 picked');
  await panel.keyboard.press('Escape');
  await panel.getByLabel('Search your clips').click();
  await panel.keyboard.press('ControlOrMeta+a');
  await expect(bar(panel)).toHaveCount(0);

  // Opening a clip still works once nothing is picked.
  await clips(panel).getByRole('button', { name: /Bravo/ }).click();
  await expect(panel.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
});

test('formatting and images: rich copy keeps both in order, plain text leaves images out', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  await panel.evaluate(async () => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Lemon pasta. Use fresh lemons.');
    data.setData('text/html', '<p>Use <b>fresh</b> lemons.</p>');
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  });
  await expect(clips(panel).getByRole('listitem')).toHaveCount(1);
  await panel.evaluate(async () => {
    const canvas = new OffscreenCanvas(10, 10);
    canvas.getContext('2d')!.fillRect(0, 0, 10, 10);
    const file = new File([await canvas.convertToBlob({ type: 'image/png' })], 'dot.png', { type: 'image/png' });
    const data = new DataTransfer();
    data.items.add(file);
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  });
  await expect(clips(panel).getByRole('listitem')).toHaveCount(2);

  // The image first, then the text.
  await clips(panel)
    .getByRole('checkbox', { name: /^Pick (?!Lemon)/ })
    .click({ force: true });
  await clips(panel)
    .getByRole('checkbox', { name: /Lemon pasta/ })
    .click();

  await bar(panel).getByRole('button', { name: 'Copy all' }).click();
  await expect(panel.getByRole('status')).toContainText('Copied 2 clips. Images paste where pictures are allowed.');
  await expect.poll(() => clipboardText(panel)).toBe('Lemon pasta. Use fresh lemons.');
  const html = (await clipboardHtml(panel))!;
  expect(html).toContain('<b>fresh</b>');
  expect(html).toContain('<img src="data:image/png;base64,');
  expect(html.indexOf('<img')).toBeLessThan(html.indexOf('<b>fresh</b>'));

  await bar(panel).getByRole('button', { name: 'More for picked clips' }).click();
  await bar(panel).getByRole('button', { name: 'Copy as plain text' }).click();
  await expect(panel.getByRole('status')).toContainText('Copied 2 clips as plain text. Images left out.');
  await expect.poll(() => clipboardHtml(panel)).toBeNull();
  await expect.poll(() => clipboardText(panel)).toBe('Lemon pasta. Use fresh lemons.');
});

test('move and delete picked clips, with undo', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  await expect(panel.getByRole('heading', { name: 'Your clips' })).toBeVisible();
  await seedClips(panel, ['Hotel Lisboa'], { id: 'trip', name: 'Lisbon trip' });
  await seedClips(panel, ['Flight TP 1351', 'Museum tickets', 'Pastel de nata']);
  await panel.reload();
  await expect(clips(panel).getByRole('listitem')).toHaveCount(4);

  await pick(panel, 'Flight TP 1351').click({ force: true });
  await pick(panel, 'Museum tickets').click();
  await bar(panel).getByRole('button', { name: 'More for picked clips' }).click();
  await bar(panel).getByLabel('Move to').selectOption('Lisbon trip');
  await expect(panel.getByRole('status')).toContainText('Moved 2 clips to Lisbon trip');
  await expect(bar(panel)).toHaveCount(0);
  await expect
    .poll(async () =>
      (await readClips(panel))
        .filter((c) => c.collectionId === 'trip')
        .map((c) => c.text)
        .sort(),
    )
    .toEqual(['Flight TP 1351', 'Hotel Lisboa', 'Museum tickets']);

  await pick(panel, 'Pastel de nata').click({ force: true });
  await pick(panel, 'Hotel Lisboa').click();
  await bar(panel).getByRole('button', { name: 'More for picked clips' }).click();
  await bar(panel).getByRole('button', { name: 'Delete 2' }).click();
  await expect(panel.getByRole('status')).toContainText('2 clips deleted');
  await expect(clips(panel).getByRole('listitem')).toHaveCount(2);
  await panel.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(clips(panel).getByRole('listitem')).toHaveCount(4);
});

const FORM = `<!doctype html><html><head><meta charset="utf-8"><title>Form</title></head><body>
<input id="name" type="text" value="">
<textarea id="notes"></textarea>
</body></html>`;

test('quick paste: Tab picks several, Enter pastes them joined (a space in one-line boxes)', async ({ context, extensionId }) => {
  await context.route('https://form.e2e.test/**', (route) => route.fulfill({ contentType: 'text/html', body: FORM }));
  const panel = await openPanel(context, extensionId);
  await pasteIntoPanel(panel, 'eggs', 'milk', 'bread');
  await expect(clips(panel).getByRole('listitem')).toHaveCount(3);
  const page = await context.newPage();
  await page.goto('https://form.e2e.test/');
  const tabId = await panel.evaluate(async () => (await chrome.tabs.query({ url: 'https://form.e2e.test/*' }))[0]!.id!);
  const open = async () => {
    await panel.evaluate((id) => chrome.runtime.sendMessage({ type: 'e2e-menu', action: 'quick-paste', tabId: id }), tabId);
    await expect(page.getByRole('combobox', { name: 'Filter clips' })).toBeFocused();
    await expect(page.getByRole('option')).toHaveCount(3);
  };
  await page.bringToFront();

  await page.locator('#notes').click();
  await open();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('option', { name: /bread/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('option', { name: /bread/ })).toContainText('1');
  await expect(page.getByRole('option', { name: /milk/ })).toContainText('2');
  await expect(page.getByRole('dialog', { name: 'Quick paste' })).toContainText('paste 2');
  // Picks stay while the filter changes.
  await page.keyboard.type('egg');
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('#notes')).toHaveValue('bread\nmilk');

  await page.locator('#name').click();
  await open();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('#name')).toHaveValue('bread milk eggs');

  await expect
    .poll(async () => Object.fromEntries((await readClips(panel)).map((c) => [c.text, c.useCount])))
    .toEqual({ bread: 2, milk: 2, eggs: 1 });
});

test('⌘/Ctrl+A picks only what is shown; picks hidden by a search are counted, and deleting them asks first', async ({
  context,
  extensionId,
}) => {
  const panel = await openPanel(context, extensionId);
  await expect(panel.getByRole('heading', { name: 'Your clips' })).toBeVisible();
  await seedClips(panel, ['Apples', 'Bananas', ...Array.from({ length: 118 }, (_, i) => `Note ${i}`)]);
  await panel.reload();
  await expect(clips(panel).getByRole('listitem')).toHaveCount(100);

  // Only the 100 rows on screen, not the 20 behind "Show more".
  await panel.locator('body').click({ position: { x: 5, y: 5 } });
  await panel.keyboard.press('ControlOrMeta+a');
  await expect(bar(panel)).toContainText('100 picked');
  await panel.keyboard.press('Escape');
  await expect(bar(panel)).toHaveCount(0);

  // Pick two, then search for one: the other is still picked but not shown, and the bar says so.
  await pick(panel, 'Apples').click({ force: true });
  await pick(panel, 'Bananas').click();
  const search = panel.getByLabel('Search your clips');
  await search.fill('Bananas');
  await expect(bar(panel)).toContainText('2 picked · 1 not shown');
  // Esc while typing in the search keeps the picks.
  await search.press('Escape');
  await expect(bar(panel)).toContainText('2 picked');
  await search.fill('Bananas');
  await expect(bar(panel)).toContainText('2 picked · 1 not shown');

  await bar(panel).getByRole('button', { name: 'More for picked clips' }).click();
  await bar(panel).getByRole('button', { name: 'Delete 2' }).click();
  const confirm = bar(panel).getByRole('alertdialog');
  await expect(confirm).toContainText('1 of these isn’t shown in the list. Delete all 2?');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect.poll(async () => (await readClips(panel)).length).toBe(120);
  await bar(panel).getByRole('button', { name: 'Delete 2' }).click();
  await bar(panel).getByRole('alertdialog').getByRole('button', { name: 'Delete 2' }).click();
  await expect(panel.getByRole('status')).toContainText('2 clips deleted');
  await expect.poll(async () => (await readClips(panel)).length).toBe(118);
});

test('in a collection, ⌘/Ctrl+A numbers clips in the order the screen shows them', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  await expect(panel.getByRole('heading', { name: 'Your clips' })).toBeVisible();
  await seedClips(panel, ['Newest', 'Middle', 'Oldest'], { id: 'shop', name: 'Shopping' });
  await panel.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open('clipboard');
        req.onsuccess = () => {
          const tx = req.result.transaction('clips', 'readwrite');
          const store = tx.objectStore('clips');
          const uses: Record<string, number> = { 'seed-shop-0': 0, 'seed-shop-1': 3, 'seed-shop-2': 5 };
          for (const [id, useCount] of Object.entries(uses)) {
            const get = store.get(id);
            get.onsuccess = () => store.put({ ...get.result, useCount });
          }
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
        };
      }),
  );
  await panel.reload();
  await panel
    .getByRole('list', { name: 'Collections' })
    .getByRole('button', { name: /Shopping/ })
    .click();
  await panel.getByLabel('Sort').selectOption('Most used');
  const list = panel.getByRole('list', { name: 'Clips in Shopping' });
  await expect(list.getByRole('listitem')).toHaveText([/Oldest/, /Middle/, /Newest/]);
  await panel.locator('body').click({ position: { x: 5, y: 5 } });
  await panel.keyboard.press('ControlOrMeta+a');
  await expect(list.getByRole('checkbox')).toHaveText(['1', '2', '3']);
  await bar(panel).getByRole('button', { name: 'Copy all' }).click();
  await expect.poll(() => clipboardText(panel)).toBe('Oldest\nMiddle\nNewest');
});
