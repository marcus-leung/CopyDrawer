/**
 * Finding and pasting, end to end in Chromium with the real extension: search
 * (words, typos, filters), the Alt+Shift+V quick-paste box on many kinds of
 * fields and edge cases, and Paste as.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { pasteIntoPanel, readClips } from './helpers';

async function openPanel(context: BrowserContext, extensionId: string, settings: Record<string, unknown> = {}) {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  if (Object.keys(settings).length) {
    await panel.evaluate(async (s) => chrome.storage.local.set({ settings: s }), settings);
    await panel.reload();
  }
  return panel;
}

// ---------- Search ----------

test('search: words, typos, filters, empty results', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  await pasteIntoPanel(
    panel,
    'Photosynthesis is how plants turn sunlight into energy',
    'Lemon garlic pasta for dinner',
    'https://www.booking.com/hotel/pt/chiado.html',
    '#2457C5',
  );
  const list = panel.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(4);
  const search = panel.getByRole('searchbox', { name: 'Search your clips' });

  // Words: collections hide while searching; the count is announced.
  await search.fill('garlic');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(panel.getByText('1 clip matches')).toBeVisible();
  await expect(panel.getByRole('list', { name: 'Collections' })).toHaveCount(0);

  // Every word has to match, in any order.
  await search.fill('energy sunlight');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Photosynthesis');

  // Filters: type, site, date. The site list comes from your clips.
  await search.fill('');
  await expect(panel.getByRole('group', { name: 'Filters' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Filters' }).click();
  await expect(panel.getByRole('button', { name: 'Filters' })).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.getByRole('group', { name: 'Filters' })).toBeVisible();
  await panel.getByLabel('Type').selectOption('link');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(panel.getByText('No clips match')).toHaveCount(0);
  await panel.getByLabel('Type').selectOption('any');
  await panel.getByLabel('Date').selectOption('today');
  await expect(list.getByRole('listitem')).toHaveCount(4);
  await panel.getByLabel('Type').selectOption('image');
  await expect(panel.getByText('No clips match these filters.')).toBeVisible();
  await panel.getByLabel('Type').selectOption('any');
  await panel.getByLabel('Date').selectOption('any');

  // Closing the filters and clearing the search brings the home screen back.
  await search.fill('');
  await panel.getByRole('button', { name: 'Filters' }).click();
  await expect(panel.getByRole('group', { name: 'Filters' })).toHaveCount(0);
  await expect(panel.getByRole('list', { name: 'Collections' })).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveCount(4);
});

test('search forgives typos', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  await pasteIntoPanel(panel, 'Photosynthesis is how plants turn sunlight into energy', 'Trail running shoes');
  await expect(panel.getByRole('list', { name: 'Clips' }).getByRole('listitem')).toHaveCount(2);
  await panel.getByRole('searchbox', { name: 'Search your clips' }).fill('photosynthsis');
  const list = panel.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Photosynthesis');
  // Nothing at all matches.
  await panel.getByRole('searchbox', { name: 'Search your clips' }).fill('zzqx');
  await expect(panel.getByText('No clips match “zzqx”.')).toBeVisible();
});

test('search: site filter and "See all" images', async ({ context, extensionId }) => {
  await context.route('https://site-a.e2e.test/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<meta charset="utf-8"><p id="t">Notes from site A</p>' }),
  );
  const panel = await openPanel(context, extensionId);
  await panel.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings as object), autoSave: true } });
    await chrome.runtime.sendMessage({ type: 'autosave-sync' });
  });
  const tab = await context.newPage();
  await tab.goto('https://site-a.e2e.test/');
  await tab.locator('#t').selectText();
  await tab.keyboard.press('ControlOrMeta+C');
  await tab.waitForTimeout(250);
  await tab.close();
  await panel.bringToFront();
  await pasteIntoPanel(panel, 'Saved by hand');
  // A pasted image for "See all".
  await panel.evaluate(async () => {
    const canvas = new OffscreenCanvas(20, 20);
    canvas.getContext('2d')!.fillRect(0, 0, 20, 20);
    const file = new File([await canvas.convertToBlob({ type: 'image/png' })], 'square.png', { type: 'image/png' });
    const data = new DataTransfer();
    data.items.add(file);
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  });
  const list = panel.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(3);

  await panel.getByRole('button', { name: 'See all' }).click();
  await expect(panel.getByLabel('Type')).toHaveValue('image');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await panel.getByLabel('Type').selectOption('any');
  await panel.getByLabel('Site').selectOption('site-a.e2e.test');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Notes from site A');
});

// ---------- Quick paste ----------

const FORM = `<!doctype html><html><head><meta charset="utf-8"><title>Form</title></head><body>
<input id="name" type="text" value="">
<input id="email" type="email" value="">
<textarea id="notes">Dear team, PLACEHOLDER thanks.</textarea>
<div id="ce" contenteditable="true">Draft:&nbsp;</div>
<input id="react" type="text">
<input id="locked" type="text" readonly value="locked">
<p id="state"></p>
<p id="keys">0</p>
<iframe id="frame" srcdoc="<input id='inner'>"></iframe>
<script>
  // Like a framework: state only changes through input events.
  const r = document.getElementById('react');
  r.addEventListener('input', () => (document.getElementById('state').textContent = 'state=' + r.value));
  // The page's own shortcut handler must not see keys typed in the box.
  let keys = 0;
  document.addEventListener('keydown', () => (document.getElementById('keys').textContent = String(++keys)));
</script></body></html>`;

async function setupQuickPaste(context: BrowserContext, extensionId: string, clips: string[]) {
  await context.route('https://form.e2e.test/**', (route) => route.fulfill({ contentType: 'text/html', body: FORM }));
  const panel = await openPanel(context, extensionId);
  await pasteIntoPanel(panel, ...clips);
  await expect(panel.getByRole('list', { name: 'Clips' }).getByRole('listitem')).toHaveCount(clips.length);
  const page = await context.newPage();
  await page.goto('https://form.e2e.test/');
  const tabId = await panel.evaluate(async () => (await chrome.tabs.query({ url: 'https://form.e2e.test/*' }))[0]!.id!);
  const open = async () => {
    await panel.evaluate((id) => chrome.runtime.sendMessage({ type: 'e2e-menu', action: 'quick-paste', tabId: id }), tabId);
    await expect(page.getByRole('combobox', { name: 'Filter clips' })).toBeFocused();
  };
  await page.bringToFront();
  return { panel, page, open };
}

test('quick paste into text, email, textarea (replacing a selection), contenteditable and framework inputs', async ({
  context,
  extensionId,
}) => {
  const { page, open } = await setupQuickPaste(context, extensionId, ['Alex Morgan', 'alex.morgan@example.com', 'the Q3 report']);
  const box = page.getByRole('dialog', { name: 'Quick paste' });

  // Most recent first; Enter pastes the highlighted one.
  await page.locator('#name').click();
  await open();
  await expect(page.getByRole('option').first()).toContainText('the Q3 report');
  await page.keyboard.type('alex m');
  await expect(page.getByRole('option')).toHaveCount(2);
  await page.keyboard.press('ArrowDown'); // second match
  await page.keyboard.press('ArrowUp'); // back to the first
  await page.keyboard.press('Enter');
  // Both match "alex m"; the newer one (the email) is first.
  await expect(page.locator('#name')).toHaveValue('alex.morgan@example.com');
  await expect(box).toHaveCount(0);
  await expect(page.locator('#name')).toBeFocused();

  // Email field.
  await page.locator('#email').click();
  await open();
  await page.keyboard.type('example.com');
  await page.keyboard.press('Enter');
  await expect(page.locator('#email')).toHaveValue('alex.morgan@example.com');

  // Textarea: replaces the selected word.
  await page.locator('#notes').evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    const start = el.value.indexOf('PLACEHOLDER');
    el.setSelectionRange(start, start + 'PLACEHOLDER'.length);
  });
  await open();
  await page.keyboard.type('q3');
  await page.keyboard.press('Enter');
  await expect(page.locator('#notes')).toHaveValue('Dear team, the Q3 report thanks.');
  // Ctrl+Z undoes the paste (it went through the page's undo history).
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(page.locator('#notes')).toHaveValue('Dear team, PLACEHOLDER thanks.');

  // Contenteditable, by mouse.
  await page.locator('#ce').click();
  await page.keyboard.press('End');
  await open();
  await page.getByRole('option', { name: /Alex Morgan/ }).click();
  await expect(page.locator('#ce')).toHaveText('Draft:\u00a0Alex Morgan');

  // Framework-controlled input sees the change through input events.
  await page.locator('#react').click();
  await open();
  await page.keyboard.type('Alex Morgan');
  await page.keyboard.press('ArrowDown'); // the name, not the newer email
  await page.keyboard.press('Enter');
  await expect(page.locator('#state')).toHaveText('state=Alex Morgan');
});

test('quick paste: keys pressed right after opening count, even before the list shows', async ({ context, extensionId }) => {
  const { page, open } = await setupQuickPaste(context, extensionId, ['Alex Morgan', 'the Q3 report']);
  const run = async (keys: string[], expected: string) => {
    await page.locator('#name').fill('');
    await page.locator('#name').click();
    await open();
    for (const key of keys) await page.keyboard.press(key);
    await expect(page.locator('#name')).toHaveValue(expected);
    await expect(page.getByRole('dialog', { name: 'Quick paste' })).toHaveCount(0);
  };
  for (let i = 0; i < 3; i++) {
    await run(['Enter'], 'the Q3 report');
    await run(['a', 'l', 'e', 'x', 'Enter'], 'Alex Morgan');
  }
});

test('quick paste: Esc, click outside, no matches, page shortcuts, opening twice, used count', async ({
  context,
  extensionId,
}) => {
  const { panel, page, open } = await setupQuickPaste(context, extensionId, ['Alex Morgan', 'the Q3 report']);
  const box = page.getByRole('dialog', { name: 'Quick paste' });
  await page.locator('#name').click();
  const keysBefore = Number(await page.locator('#keys').textContent());

  await open();
  await page.keyboard.type('zzz');
  await expect(box).toContainText('No clips match');
  // Keys typed in the box don't reach the page's own handlers.
  expect(Number(await page.locator('#keys').textContent())).toBe(keysBefore);
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);
  await expect(page.locator('#name')).toHaveValue('');

  // Clicking outside the box closes it.
  await open();
  await page.mouse.click(5, 5);
  await expect(box).toHaveCount(0);

  // Opening twice doesn't stack two boxes.
  await page.locator('#name').click();
  await open();
  await panel.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://form.e2e.test/*' });
    await chrome.runtime.sendMessage({ type: 'e2e-menu', action: 'quick-paste', tabId: tab!.id });
  });
  await expect(page.locator('#clipboard-quick-paste')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('#name')).toHaveValue('the Q3 report');

  // Pasting counts as a use.
  await expect.poll(async () => (await readClips(panel)).find((c) => c.text === 'the Q3 report')?.useCount).toBe(1);
});

test('quick paste with no text field (or inside a frame) copies instead and says so', async ({ context, extensionId }) => {
  const { panel, page, open } = await setupQuickPaste(context, extensionId, ['Alex Morgan']);
  // Writing to the clipboard needs a focused page, as it is when a person presses the shortcut.
  const pageFocused = () => page.waitForFunction(() => document.hasFocus());
  await page.mouse.click(700, 500); // empty page area: nothing focused
  await pageFocused();
  await open();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/^Copied\. Click where you want it and press (Ctrl|Cmd)\+V\.$/)).toBeVisible();
  // (Read it from the extension: a web page would need permission. Retry until the panel has focus.)
  await panel.bringToFront();
  await expect
    .poll(() => panel.evaluate(() => navigator.clipboard.readText().catch(() => 'not focused yet')))
    .toBe('Alex Morgan');
  await page.bringToFront();

  // A read-only field isn't changed: it copies instead.
  await page.locator('#locked').focus();
  await open();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/^Copied\. Click where you want it and press (Ctrl|Cmd)\+V\.$/)).toBeVisible();
  await expect(page.locator('#locked')).toHaveValue('locked');

  // Focus inside an iframe: the box can't reach it, so it copies.
  await page.frameLocator('#frame').locator('#inner').click();
  await pageFocused();
  await open();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/^Copied\. Click where you want it and press (Ctrl|Cmd)\+V\.$/)).toBeVisible();
  // The new note replaced the first one instead of stacking on top of it.
  await expect(page.locator('#clipboard-quick-paste-toast')).toHaveCount(1);
});

test('quick paste: Tab stays in the box; images are not listed', async ({ context, extensionId }) => {
  const { panel, page, open } = await setupQuickPaste(context, extensionId, ['eggs, milk, bread, butter']);
  // An image clip: not pasteable as text, so not listed.
  await panel.evaluate(async () => {
    const canvas = new OffscreenCanvas(10, 10);
    canvas.getContext('2d')!.fillRect(0, 0, 10, 10);
    const file = new File([await canvas.convertToBlob({ type: 'image/png' })], 'dot.png', { type: 'image/png' });
    const data = new DataTransfer();
    data.items.add(file);
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  });
  await expect(panel.getByRole('list', { name: 'Clips' }).getByRole('listitem')).toHaveCount(2);
  await page.bringToFront();

  await page.locator('#notes').fill('');
  await page.locator('#notes').click();
  await open();
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('combobox', { name: 'Filter clips' })).toBeFocused();
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('#notes')).toHaveValue('eggs, milk, bread, butter');
});

// ---------- Paste as (side panel) ----------

async function openDetail(panel: Page, name: RegExp) {
  await panel.getByRole('list', { name: 'Clips' }).getByRole('button', { name }).click();
}
const clipboardText = (panel: Page) => panel.evaluate(() => navigator.clipboard.readText());

test('Paste as in the panel: as is keeps formatting, plain text drops it', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  await panel.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Lemon pasta. Use fresh lemons.');
    data.setData('text/html', '<h2>Lemon pasta</h2><p>Use <b>fresh</b> lemons.</p>');
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  });
  await openDetail(panel, /Lemon pasta/);
  const options = panel.getByRole('region', { name: 'Paste as' }).getByRole('button');
  await expect(options).toHaveText(['Paste as is', 'Plain text']);

  const clipboardHtml = () =>
    panel.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      return item!.types.includes('text/html') ? await (await item!.getType('text/html')).text() : null;
    });
  await panel.getByRole('button', { name: 'Paste as is' }).click();
  await expect(panel.getByRole('status')).toContainText('Copied. Paste it anywhere.');
  await expect.poll(clipboardHtml).toContain('<b>fresh</b>');
  await panel.getByRole('button', { name: 'Plain text', exact: true }).click();
  await expect.poll(() => clipboardText(panel)).toBe('Lemon pasta. Use fresh lemons.');
  await expect.poll(clipboardHtml).toBeNull();
});

test('quick paste follows the theme chosen in Settings, not only the system', async ({ context, extensionId }) => {
  const { panel, page, open } = await setupQuickPaste(context, extensionId, ['Alex Morgan']);
  const setTheme = (theme: string) =>
    panel.evaluate(async (theme) => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings ?? {}), theme } });
    }, theme);
  const boxBg = () =>
    expect.poll(() =>
      page.evaluate(() => {
        const box = document.getElementById('clipboard-quick-paste')?.shadowRoot?.querySelector('.box');
        return box ? getComputedStyle(box).backgroundColor : null;
      }),
    );

  // Light system, Dark chosen: the box is dark.
  await setTheme('dark');
  await page.locator('#name').click();
  await open();
  await boxBg().toBe('rgb(27, 29, 39)');
  await page.keyboard.press('Escape');

  // Dark system, Light chosen: the box is light.
  await page.emulateMedia({ colorScheme: 'dark' });
  await setTheme('light');
  await page.locator('#name').click();
  await open();
  await boxBg().toBe('rgb(255, 255, 255)');
  await page.keyboard.press('Escape');

  // "Match system" follows the system.
  await setTheme('system');
  await page.locator('#name').click();
  await open();
  await boxBg().toBe('rgb(27, 29, 39)');
  await page.keyboard.press('Escape');

  // Font and text size from Settings too.
  await panel.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings ?? {}), font: 'mono', textSize: 115 } });
  });
  await page.locator('#name').click();
  await open();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const box = document.getElementById('clipboard-quick-paste')!.shadowRoot!.querySelector('.box') as HTMLElement;
        return [getComputedStyle(box).fontFamily.includes('JetBrains Mono'), box.style.zoom];
      }),
    )
    .toEqual([true, '1.15']);
});
