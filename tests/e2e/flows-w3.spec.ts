/**
 * Week 3 flows, end to end in Chromium with the real extension: search
 * (words, meaning, filters), the Alt+Shift+V quick-paste box on many kinds of
 * fields and edge cases, and Paste as (plain options and the AI preview).
 */
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { mockChromeAI, pasteIntoPanel, readClips, stubModel } from './helpers';

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

test('search: words, typos, meaning, filters, empty results', async ({ context, extensionId }) => {
  await stubModel(context);
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
  // Wait for the model so "meaning" uses it.
  await expect.poll(async () => (await readClips(panel)).every((c) => c.embeddingModel === 'minilm-l6-q8'), { timeout: 30_000 }).toBe(true);

  // Words: collections hide while searching; the count is announced.
  await search.fill('garlic');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(panel.getByText('1 clip matches')).toBeVisible();
  await expect(panel.getByRole('list', { name: 'Collections' })).toHaveCount(0);

  // Meaning: none of these words are in the clip.
  await search.fill('what should I cook');
  await expect(list.getByRole('listitem').first()).toContainText('Lemon garlic pasta');
  await expect(panel.getByText(/by meaning/)).toBeVisible();

  // Word matches come before meaning matches.
  await search.fill('sunlight energy');
  await expect(list.getByRole('listitem').first()).toContainText('Photosynthesis');

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

test('search without the AI model still forgives typos', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId, { smartModel: false });
  await pasteIntoPanel(panel, 'Photosynthesis is how plants turn sunlight into energy', 'Trail running shoes');
  await expect.poll(async () => (await readClips(panel)).every((c) => c.embeddingModel === 'hash-v1')).toBe(true);
  await panel.getByRole('searchbox', { name: 'Search your clips' }).fill('photosynthsis');
  const list = panel.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Photosynthesis');
  // Nothing at all matches.
  await panel.getByRole('searchbox', { name: 'Search your clips' }).fill('zzqx');
  await expect(panel.getByText('No clips match “zzqx”.')).toBeVisible();
});

test('search: site filter and "See all" images', async ({ context, extensionId }) => {
  await context.route('https://site-a.e2e.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<meta charset="utf-8"><p id="t">Notes from site A</p>' }));
  const panel = await openPanel(context, extensionId, { smartModel: false });
  await panel.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings as object), autoSave: true } });
    await chrome.runtime.sendMessage({ type: 'autosave-sync' });
  });
  const tab = await context.newPage();
  await tab.goto('https://site-a.e2e.test/');
  await tab.locator('#t').selectText();
  await tab.keyboard.press('Control+C');
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
  const panel = await openPanel(context, extensionId, { smartModel: false });
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

test('quick paste into text, email, textarea (replacing a selection), contenteditable and framework inputs', async ({ context, extensionId }) => {
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
  await page.keyboard.press('Control+Z');
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

test('quick paste: Esc, click outside, no matches, page shortcuts, opening twice, used count', async ({ context, extensionId }) => {
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
  await page.mouse.click(700, 500); // empty page area: nothing focused
  await open();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Copied. Click where you want it and press Ctrl+V.')).toBeVisible();
  // (Read it from the extension: a web page would need permission.)
  await panel.bringToFront();
  expect(await panel.evaluate(() => navigator.clipboard.readText())).toBe('Alex Morgan');
  await page.bringToFront();

  // Focus inside an iframe: the box can't reach it, so it copies.
  await page.frameLocator('#frame').locator('#inner').click();
  await open();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Copied. Click where you want it and press Ctrl+V.')).toBeVisible();
});

test('quick paste: Tab for Paste as, filter options, Esc back to clips; images are not listed', async ({ context, extensionId }) => {
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
  await expect(page.getByText('Paste as', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveAttribute('placeholder', 'Filter options');
  // No built-in AI in this browser: only the plain options.
  await expect(page.getByRole('option', { name: 'Summarize' })).toHaveCount(0);
  await page.keyboard.type('bul');
  await expect(page.getByRole('option')).toHaveCount(1);
  // Esc goes back to the clip list, not out.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox')).toHaveAttribute('placeholder', 'Filter clips');
  await page.keyboard.press('Tab');
  await page.keyboard.type('bul');
  await page.keyboard.press('Enter');
  await expect(page.locator('#notes')).toHaveValue('- eggs\n- milk\n- bread\n- butter');

  for (const [option, expected] of [
    ['UPPERCASE', 'EGGS, MILK, BREAD, BUTTER'],
    ['Checklist', '- [ ] eggs\n- [ ] milk\n- [ ] bread\n- [ ] butter'],
  ] as const) {
    await page.locator('#notes').fill('');
    await page.locator('#notes').click();
    await open();
    await page.keyboard.press('Tab');
    await page.getByRole('option', { name: option }).click();
    await expect(page.locator('#notes')).toHaveValue(expected);
  }
});

test('quick paste on a page that blocks extensions fails quietly', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  const page = await context.newPage();
  await page.goto('chrome://version');
  const badge = await panel.evaluate(async () => {
    // Chrome hides chrome:// addresses from extensions; it's the active tab.
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await chrome.runtime.sendMessage({ type: 'e2e-menu', action: 'quick-paste', tabId: tab!.id });
    return chrome.action.getBadgeText({});
  });
  expect(badge).toBe('×');
});

// ---------- Paste as (side panel) ----------

async function openDetail(panel: Page, name: RegExp) {
  await panel.getByRole('list', { name: 'Clips' }).getByRole('button', { name }).click();
}
const clipboardText = (panel: Page) => panel.evaluate(() => navigator.clipboard.readText());

test('Paste as in the panel: every plain option, Markdown only for formatted clips', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId, { smartModel: false });
  await pasteIntoPanel(panel, 'Book the hotel. Buy train tickets. Pack light.');
  // A formatted clip (copied from a page with HTML).
  await panel.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Lemon pasta. Use fresh lemons.');
    data.setData('text/html', '<h2>Lemon pasta</h2><p>Use <b>fresh</b> lemons.</p>');
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  });

  await openDetail(panel, /Book the hotel/);
  await expect(panel.getByRole('button', { name: 'Markdown' })).toHaveCount(0);
  const cases: [string, string][] = [
    ['Plain text', 'Book the hotel. Buy train tickets. Pack light.'],
    ['Bullet list', '- Book the hotel.\n- Buy train tickets.\n- Pack light.'],
    ['Checklist', '- [ ] Book the hotel.\n- [ ] Buy train tickets.\n- [ ] Pack light.'],
    ['One line', 'Book the hotel. Buy train tickets. Pack light.'],
    ['UPPERCASE', 'BOOK THE HOTEL. BUY TRAIN TICKETS. PACK LIGHT.'],
    ['lowercase', 'book the hotel. buy train tickets. pack light.'],
    ['Title Case', 'Book the Hotel. Buy Train Tickets. Pack Light.'],
  ];
  for (const [label, expected] of cases) {
    await panel.getByRole('button', { name: label, exact: true }).click();
    await expect.poll(() => clipboardText(panel)).toBe(expected);
  }
  await panel.getByRole('button', { name: 'Paste as is' }).click();
  await expect(panel.getByRole('status')).toContainText('Copied. Paste it anywhere.');
  await panel.getByRole('button', { name: 'Back' }).click();

  await openDetail(panel, /Lemon pasta/);
  await panel.getByRole('button', { name: 'Markdown' }).click();
  await expect.poll(() => clipboardText(panel)).toBe('## Lemon pasta\n\nUse **fresh** lemons.');
});

test("Paste as with Chrome's built-in AI: preview, try again, copy, save as clip, translate, failure", async ({ context, extensionId }) => {
  await mockChromeAI(context);
  const panel = await openPanel(context, extensionId, { smartModel: false });
  await pasteIntoPanel(panel, 'Need the report by Friday. Send the numbers ASAP.');
  await openDetail(panel, /Need the report/);
  await expect(panel.getByText('Blue options use AI on this device. Nothing is uploaded.')).toBeVisible();

  // Preview first; the clip itself is unchanged.
  await panel.getByRole('button', { name: 'Friendlier' }).click();
  await expect(panel.getByText('Writing on this device…')).toBeVisible();
  const preview = panel.getByText('Hi! Need the report by Friday. Send the numbers ASAP. Thanks so much!');
  await expect(preview).toBeVisible();
  await expect(panel.getByText('Your original clip is unchanged.')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Friendlier' })).toHaveAttribute('aria-pressed', 'true');

  await panel.getByRole('button', { name: 'Copy this version' }).click();
  await expect.poll(() => clipboardText(panel)).toBe('Hi! Need the report by Friday. Send the numbers ASAP. Thanks so much!');

  const calls = () => panel.evaluate(() => (window as unknown as { __aiCalls: unknown[] }).__aiCalls.length);
  const before = await calls();
  await panel.getByRole('button', { name: 'Try again' }).click();
  await expect(preview).toBeVisible();
  expect(await calls()).toBe(before + 1);

  // Summarize swaps the preview.
  await panel.getByRole('button', { name: 'Summarize' }).click();
  await expect(panel.getByText('Summary of Need the report')).toBeVisible();

  // Translate, then change language.
  await panel.getByRole('button', { name: 'Translate' }).click();
  await expect(panel.getByText(/^\[\w+\] Need the report/)).toBeVisible();
  await panel.getByLabel('Language').selectOption('fr');
  await expect(panel.getByText('[French] Need the report by Friday. Send the numbers ASAP.')).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Translate to French' })).toBeVisible();

  // Save as clip: a new clip appears; the original stays.
  await panel.getByRole('button', { name: 'Save as clip' }).click();
  await expect(panel.getByRole('status')).toContainText('Saved as a new clip');
  await panel.getByRole('button', { name: 'Back' }).click();
  const list = panel.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list).toContainText('[French] Need the report');

  // When the model errors, say so instead of showing nothing.
  await openDetail(panel, /^Need the report/);
  await panel.evaluate(() => ((window as unknown as { __ai: string }).__ai = 'fail'));
  await panel.getByRole('button', { name: 'Shorter' }).click();
  await expect(panel.getByText("Couldn't write that on this device. Try again in a moment.")).toBeVisible();
});

test('Paste as without built-in AI shows only plain options and how to get more', async ({ context, extensionId }) => {
  await mockChromeAI(context, 'unavailable');
  const panel = await openPanel(context, extensionId, { smartModel: false });
  await pasteIntoPanel(panel, 'Need the report by Friday.');
  await openDetail(panel, /Need the report/);
  await expect(panel.getByRole('button', { name: 'Bullet list' })).toBeVisible();
  for (const name of ['Summarize', 'Friendlier', 'Translate']) await expect(panel.getByRole('button', { name })).toHaveCount(0);
  await expect(panel.getByText("Summarize, rewrite and translate with Chrome's built-in AI: turn it on in Settings.")).toBeVisible();
});
