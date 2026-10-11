/**
 * Every way of copying into Clipboard and pasting back out, with real keypresses where
 * Playwright allows them: copy and cut keys (auto-save), the Edit/right-click menu's copy
 * command, the extension's own shortcuts, and pasting back into the panel and the page.
 */
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { readClips } from './helpers';

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Keys page</title></head><body>
<p id="para">Paragraph copied with keys</p>
<input id="field" value="Field copied with keys">
<textarea id="area">Textarea copied with keys</textarea>
<div id="editor" contenteditable="true">Editor copied with keys</div>
<iframe id="same" srcdoc="<p id='inner'>Same-origin frame copied with keys</p>"></iframe>
<iframe id="cross" src="https://frame.e2e.test/"></iframe>
<textarea id="target"></textarea>
</body></html>`;
const FRAME = `<!doctype html><html><body><p id="outer">Cross-origin frame copied with keys</p></body></html>`;

async function setup(context: BrowserContext, extensionId: string, { autoSave }: { autoSave: boolean }) {
  await context.route('https://keys.e2e.test/**', (route) => route.fulfill({ contentType: 'text/html', body: PAGE }));
  await context.route('https://frame.e2e.test/**', (route) => route.fulfill({ contentType: 'text/html', body: FRAME }));
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  if (autoSave) {
    await panel.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings ?? {}), autoSave: true } });
      await chrome.runtime.sendMessage({ type: 'autosave-sync' });
    });
  }
  const page = await context.newPage();
  await page.goto('https://keys.e2e.test/');
  const tabId = await panel.evaluate(async () => (await chrome.tabs.query({ url: 'https://keys.e2e.test/*' }))[0]!.id!);
  const saved = (text: string) => expect.poll(async () => (await readClips(panel)).map((c) => c.text)).toContain(text);
  return { panel, page, tabId, saved };
}

/** A user clicks into a frame before selecting in it, which moves keyboard focus there. */
async function clickAndSelect(locator: Locator) {
  await locator.click();
  await locator.selectText();
}

/** Each place a user copies from, selected the way a user would. */
function targets(page: Page) {
  return [
    { name: 'paragraph', text: 'Paragraph copied with keys', select: () => page.locator('#para').selectText() },
    { name: 'text field', text: 'Field copied with keys', select: () => page.locator('#field').selectText() },
    { name: 'textarea', text: 'Textarea copied with keys', select: () => page.locator('#area').selectText() },
    { name: 'rich-text editor', text: 'Editor copied with keys', select: () => page.locator('#editor').selectText() },
    {
      name: 'same-origin frame',
      text: 'Same-origin frame copied with keys',
      select: () => clickAndSelect(page.frameLocator('#same').locator('#inner')),
    },
    {
      name: 'cross-origin frame',
      text: 'Cross-origin frame copied with keys',
      select: () => clickAndSelect(page.frameLocator('#cross').locator('#outer')),
    },
  ];
}

test('Ctrl/Cmd+C saves what you copy from text, fields, editors and frames', async ({ context, extensionId }) => {
  const { page, saved } = await setup(context, extensionId, { autoSave: true });
  await page.bringToFront();
  for (const t of targets(page)) {
    await t.select();
    await page.keyboard.press('ControlOrMeta+C');
    await saved(t.text);
  }
});

test('Ctrl/Cmd+X saves what you cut, and the text leaves the field', async ({ context, extensionId }) => {
  const { page, saved } = await setup(context, extensionId, { autoSave: true });
  await page.bringToFront();
  for (const [selector, text] of [
    ['#field', 'Field copied with keys'],
    ['#area', 'Textarea copied with keys'],
    ['#editor', 'Editor copied with keys'],
  ] as const) {
    const el = page.locator(selector);
    await el.selectText();
    await page.keyboard.press('ControlOrMeta+X');
    await saved(text);
    if (selector === '#editor') await expect(el).toHaveText('');
    else await expect(el).toHaveValue('');
  }
});

test('Ctrl+Insert copies and Shift+Delete cuts (Windows and Linux)', async ({ context, extensionId }) => {
  test.skip(process.platform === 'darwin', 'Chrome on macOS has no Ctrl+Insert or Shift+Delete clipboard keys');
  const { page, saved } = await setup(context, extensionId, { autoSave: true });
  await page.bringToFront();
  await page.locator('#para').selectText();
  await page.keyboard.press('Control+Insert');
  await saved('Paragraph copied with keys');
  await page.locator('#area').selectText();
  await page.keyboard.press('Shift+Delete');
  await saved('Textarea copied with keys');
  await expect(page.locator('#area')).toHaveValue('');
});

// Chrome's own menus can't be clicked from Playwright; both run the page's copy command, which this fires.
test('Copy from the right-click or Edit menu (the copy command) saves the same way', async ({ context, extensionId }) => {
  const { page, saved } = await setup(context, extensionId, { autoSave: true });
  await page.bringToFront();
  for (const t of targets(page)) {
    await t.select();
    const frame =
      t.name === 'same-origin frame'
        ? page.frame({ url: 'about:srcdoc' })!
        : t.name === 'cross-origin frame'
          ? page.frame({ url: /frame\.e2e\.test/ })!
          : page.mainFrame();
    await frame.evaluate(() => document.execCommand('copy'));
    await saved(t.text);
  }
});

test('the extension shortcuts are bound, and each one does its job', async ({ context, extensionId }) => {
  const { panel, page, tabId, saved } = await setup(context, extensionId, { autoSave: false });
  const commands = await panel.evaluate(() => chrome.commands.getAll());
  const key = (name: string) => commands.find((c) => c.name === name)?.shortcut;
  expect(key('save-selection')).toMatch(/^(Alt\+Shift\+|⌥⇧)S$/);
  expect(key('screenshot-area')).toMatch(/^(Alt\+Shift\+|⌥⇧)X$/);
  expect(key('quick-paste')).toMatch(/^(Alt\+Shift\+|⌥⇧)V$/);
  const press = (command: string) =>
    panel.evaluate((m) => chrome.runtime.sendMessage({ type: 'e2e-command', ...m }), { command, tabId });

  // Alt+Shift+S saves the selection, with auto-save off.
  await page.bringToFront();
  await page.locator('#para').selectText();
  await press('save-selection');
  await saved('Paragraph copied with keys');

  // Alt+Shift+V opens the quick-paste box over the focused field.
  await page.locator('#target').click();
  void press('quick-paste');
  await expect(page.getByRole('combobox', { name: 'Filter clips' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#target')).toHaveValue('Paragraph copied with keys');

  // Alt+Shift+X starts the screenshot tool; drag an area to save it.
  const shot = press('screenshot-area');
  await page.locator('#__clipboard_ext_shot__').waitFor({ state: 'attached' });
  await page.mouse.move(10, 10);
  await page.mouse.down();
  await page.mouse.move(110, 80, { steps: 5 });
  await page.mouse.up();
  await shot;
  await expect.poll(async () => (await readClips(panel)).map((c) => c.title)).toContain('Screenshot of Keys page');
});

test('Ctrl/Cmd+V into the panel saves, and a copied clip pastes into a page', async ({ context, extensionId }) => {
  const { panel, page, saved } = await setup(context, extensionId, { autoSave: false });
  await panel.bringToFront();
  await panel.evaluate(() => navigator.clipboard.writeText('Pasted into the panel with keys'));
  await panel.locator('body').click();
  await panel.keyboard.press('ControlOrMeta+V');
  await saved('Pasted into the panel with keys');

  const list = panel.getByRole('list', { name: 'Clips' });
  await list.getByRole('button', { name: 'Copy' }).first().click();
  await expect(panel.getByRole('status')).toContainText('Copied');
  await page.bringToFront();
  await page.locator('#target').click();
  await page.keyboard.press('ControlOrMeta+V');
  await expect(page.locator('#target')).toHaveValue('Pasted into the panel with keys');
});

test('shortcut labels show the keys Chrome actually bound, in the platform style', async ({ context, extensionId }) => {
  const { panel, page, tabId } = await setup(context, extensionId, { autoSave: false });
  const keys = Object.fromEntries((await panel.evaluate(() => chrome.commands.getAll())).map((c) => [c.name, c.shortcut]));
  if (process.platform === 'darwin') expect(keys['save-selection']).toBe('⌥⇧S');

  // Empty home: how to save and paste back.
  await expect(panel.getByText(keys['save-selection']!, { exact: true })).toBeVisible();
  await expect(panel.getByText(keys['quick-paste']!, { exact: true })).toBeVisible();

  await panel.getByRole('button', { name: 'Settings' }).click();
  const shortcuts = panel.getByRole('region', { name: 'Shortcuts' });
  for (const name of ['quick-paste', 'save-selection', 'screenshot-area']) {
    await expect(shortcuts.getByText(keys[name]!, { exact: true })).toBeVisible();
  }

  // The quick-paste box footer.
  await page.bringToFront();
  await page.locator('#target').click();
  void panel.evaluate((id) => chrome.runtime.sendMessage({ type: 'e2e-command', command: 'quick-paste', tabId: id }), tabId);
  await expect(page.getByRole('dialog', { name: 'Quick paste' })).toContainText(keys['quick-paste']!);
});

test('on a page Chrome blocks, a shortcut explains in the panel, or just shows × when that is off', async ({
  context,
  extensionId,
}) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const page = await context.newPage();
  await page.goto('chrome://version');
  // Chrome hides chrome:// addresses from extensions; it's the active tab.
  const tabId = await panel.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]!.id!);
  const press = (command: string) =>
    panel.evaluate((m) => chrome.runtime.sendMessage({ type: 'e2e-command', ...m }), { command, tabId });

  await press('save-selection');
  await panel.bringToFront();
  const notice = panel.getByText("Chrome doesn't let extensions read this page");
  await expect(notice).toBeVisible();
  // Copying there still works for Chrome itself: grab it from the panel.
  await panel.evaluate(() => navigator.clipboard.writeText('Copied on a chrome:// page'));
  await panel.getByRole('button', { name: 'Grab clipboard' }).first().click();
  await expect.poll(async () => (await readClips(panel)).map((c) => c.text)).toEqual(['Copied on a chrome:// page']);
  await expect(notice).toHaveCount(0);

  // Turned off: only the × badge.
  await panel.getByRole('button', { name: 'Settings' }).click();
  const toggle = panel.getByLabel('Explain blocked pages in the side panel');
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await panel.getByRole('button', { name: 'Back' }).click();
  await press('quick-paste');
  expect(await panel.evaluate(() => chrome.action.getBadgeText({}))).toBe('×');
  await expect(notice).toHaveCount(0);
});
