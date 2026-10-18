import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { strFromU8, unzipSync } from 'fflate';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { pasteIntoPanel } from './helpers';
import { startFakeDrive, TOKEN } from './fakeDriveServer';

async function axe(page: Page, label: string) {
  // Check the settled UI, not a toast halfway through fading in.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(
    violations.map(
      (v) =>
        `${label}: ${v.id} ${v.help}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.failureSummary?.split('\n').pop()}`).join(' | ')}`,
    ),
  ).toEqual([]);
}

test('onboarding: five steps with a step bar, sync turned on, then the panel', async ({ context, extensionId }) => {
  const fake = await startFakeDrive();
  try {
    const [worker] = context.serviceWorkers();
    await worker!.evaluate(([base, token]) => chrome.storage.session.set({ e2eDriveBase: base, e2eDriveToken: token }), [
      fake.url,
      TOKEN,
    ] as const);
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html?onboarding=1`);
    const bar = page.getByRole('navigation', { name: 'Setup steps' });
    const current = bar.locator('[aria-current="step"]');
    await expect(bar.getByRole('listitem')).toHaveText(['Welcome', 'Auto-save', 'Shortcuts', 'Sync', 'How to use']);
    await expect(current).toHaveText('Welcome');
    await expect(page.getByRole('heading', { name: 'Everything you copy, kept and sorted' })).toBeVisible();
    await axe(page, 'welcome');
    await page.getByRole('button', { name: 'Get started' }).click();

    await expect(current).toHaveText('Auto-save');
    await axe(page, 'auto-save step');
    // The e2e build already has all-sites access, so turning on auto-save goes straight through.
    await page.getByRole('button', { name: 'Turn on auto-save' }).click();

    await expect(current).toHaveText('Shortcuts');
    await expect(page.getByRole('heading', { name: 'Two shortcuts to know' })).toBeVisible();
    await axe(page, 'shortcuts step');
    // A finished step can be revisited from the bar.
    await bar.getByRole('button', { name: 'Back to Welcome' }).click();
    await expect(current).toHaveText('Welcome');
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.getByRole('button', { name: /Not now/ }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(current).toHaveText('Sync');
    await axe(page, 'sync step');
    await page.getByRole('button', { name: 'Turn on sync' }).click();
    await expect(page.getByText('Sync is on')).toBeVisible();
    expect(fake.drive.byName('copy')).toBeTruthy();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(current).toHaveText('How to use');
    for (const name of ['Save', 'Find', 'Paste'])
      await expect(page.getByRole('listitem').filter({ hasText: name }).first()).toBeVisible();
    await axe(page, 'how-to step');
    await page.getByRole('button', { name: 'Finish' }).click();

    await expect(page.getByRole('heading', { name: "You're all set" })).toBeVisible();
    await expect(bar).toHaveCount(0);
    await page.getByRole('button', { name: 'Open the side panel' }).click();
    await expect(page.getByRole('heading', { name: 'Your clips' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Copy anything to start' })).toBeVisible();
  } finally {
    await fake.close();
  }
});

test('onboarding: a shortcut Chrome left unset shows its default keys, and the how-to never says "press Not set"', async ({
  context,
  extensionId,
}) => {
  await context.addInitScript(() => {
    const real = chrome.commands?.getAll?.bind(chrome.commands);
    if (real) chrome.commands.getAll = async () => (await real()).map((c) => ({ ...c, shortcut: '' }));
  });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html?onboarding=1`);
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: /Not now/ }).click();
  await expect(page.getByText(/Chrome didn't set (⌥⇧S|Alt\+Shift\+S)\. Another extension may already use it\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set it in Chrome' })).toHaveCount(2);
  await axe(page, 'shortcuts not set');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('heading', { name: 'How to use it' })).toBeVisible();
  await expect(page.getByText('right-click a selection or an image and choose Save')).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('Not set');
});

test('notices, export and import, inline confirms, accessibility', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await axe(page, 'empty home');
  await page.evaluate(() => {
    for (const t of ['Photosynthesis turns light into energy', '#B35A00', '1Z 999 AA1 01 2345 6784']) {
      const data = new DataTransfer();
      data.setData('text/plain', t);
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    }
  });
  const list = page.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await axe(page, 'home');

  await list.getByRole('button', { name: /1Z 999/ }).click();
  await axe(page, 'clip detail');
  await page.getByRole('button', { name: 'Back' }).click();

  await page.getByRole('button', { name: 'Settings' }).click();
  await axe(page, 'settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export' }).click()]);
  const file = await download.path();
  expect(download.suggestedFilename()).toMatch(/^copydrawer-export-\d{4}-\d{2}-\d{2}\.zip$/);
  const zip = unzipSync(new Uint8Array(fs.readFileSync(file)));
  expect(Object.keys(zip)).toEqual(expect.arrayContaining(['clips.html', 'clips.json']));
  expect(strFromU8(zip['clips.html']!)).toContain('1Z 999 AA1 01 2345 6784');
  expect(strFromU8(zip['clips.json']!)).toContain('\n  "clips": [');
  await page.getByRole('button', { name: 'Delete all' }).click();
  const confirmBox = page.getByRole('alertdialog', { name: /Delete all clips, including pinned ones/ });
  await expect(confirmBox).toBeVisible();
  await axe(page, 'delete all confirm');
  await page.keyboard.press('Escape');
  await expect(confirmBox).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete all' })).toBeFocused();
  await page.getByRole('button', { name: 'Delete all' }).click();
  await confirmBox.getByRole('button', { name: 'Delete all clips' }).click();
  await expect(page.getByRole('status')).toContainText('All clips deleted');
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByRole('status')).toContainText('Imported 3 clips');

  await expect(page.getByText(/\bAI\b|\bPro\b|waitlist|coming soon/i)).toHaveCount(0);

  await page.evaluate(async () => {
    const s = (await chrome.storage.local.get('settings')).settings ?? {};
    await chrome.storage.local.set({ settings: { ...s, autoSave: true, pausedUntil: Date.now() + 3_600_000 } });
  });
  await page.getByRole('button', { name: 'Back to home' }).click();
  await expect(page.getByText('Auto-save is paused')).toBeVisible();
  await expect(page.getByText(/Resumes in (59|60) minutes/)).toBeVisible();
  await page.getByRole('button', { name: 'Resume now' }).click();
  await expect(page.getByText('Auto-save is paused')).toHaveCount(0);

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await axe(page, 'home dark');
});

test('a fresh install is light, even when the computer is in dark mode', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const url of ['sidepanel.html?onboarding=1', 'sidepanel.html', 'popup.html']) {
    await page.goto(`chrome-extension://${extensionId}/${url}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  }
});

test('dark mode applies before the first paint (no white flash)', async ({ context, extensionId }) => {
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      (window as unknown as { themeAtLoad?: string }).themeAtLoad = document.documentElement.dataset.theme;
    });
  });
  for (const path of ['sidepanel.html', 'popup.html']) {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/${path}`);
    await page.evaluate(async () => chrome.storage.local.set({ settings: { theme: 'dark', onboarded: true } }));
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    expect(await page.evaluate(() => (window as unknown as { themeAtLoad?: string }).themeAtLoad), path).toBe('dark');
    await page.close();
  }
});

test('font and text size: Settings changes every page, and pages open with them', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const html = page.locator('html');
  const fontOf = (p: Page) => p.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(await fontOf(page)).toContain('system-ui');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Font').selectOption('mono');
  await page.getByLabel('Text size').selectOption('130');
  await expect(html).toHaveAttribute('data-font', 'mono');
  await expect.poll(() => html.evaluate((el) => el.style.zoom)).toBe('1.3');
  expect(await fontOf(page)).toContain('ui-monospace');
  await axe(page, 'settings, monospace, larger');

  // Opens with them already applied (no jump), here and in the popup.
  await page.reload();
  expect(await html.evaluate((el) => [el.dataset.font, el.style.zoom])).toEqual(['mono', '1.3']);
  await expect(page.getByRole('heading', { name: 'Your clips' })).toBeVisible();
  await axe(page, 'home, monospace, larger');
  // The panel still fits the window: only its list scrolls, never the whole page.
  expect(await page.evaluate(() => document.scrollingElement!.scrollHeight <= window.innerHeight)).toBe(true);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('html')).toHaveAttribute('data-font', 'mono');
  expect(await fontOf(popup)).toContain('ui-monospace');
  // Popup size presets; the height stays inside Chrome's popup limit at any text size.
  await popup.setViewportSize({ width: 800, height: 600 });
  const popupSize = async () => {
    const box = (await popup.locator('html').boundingBox())!;
    return [Math.round(box.width), Math.round(box.height)];
  };
  expect(await popupSize()).toEqual([520, 600]);
  await popup.getByRole('button', { name: 'Settings' }).click();
  await popup.getByLabel('Popup size').selectOption('small');
  await expect.poll(popupSize).toEqual([468, 480]);
  await popup.getByLabel('Popup size').selectOption('medium');
  await page.bringToFront();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Text size').selectOption('100');
  await expect.poll(() => html.evaluate((el) => el.style.zoom)).toBe('');
  await page.getByLabel('Font').selectOption('default');
  await expect(html).not.toHaveAttribute('data-font');
  expect(await fontOf(page)).toContain('system-ui');
});

test('hide previews blurs clips until you point at one, in the panel and quick paste', async ({ context, extensionId }) => {
  await context.route('https://form.e2e.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Form</title><input id="field">' }),
  );
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await pasteIntoPanel(page, 'Booking ref QX7-221', 'Gate B12');
  const list = page.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  const blur = (row: number) =>
    list
      .getByRole('listitem')
      .nth(row)
      .locator('[data-preview]')
      .first()
      .evaluate((el) => getComputedStyle(el).filter);
  expect(await blur(0)).toBe('none');

  const toggle = page.getByRole('button', { name: 'Hide previews' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(0, 0);
  await expect.poll(() => blur(0)).toContain('blur');
  await list.getByRole('listitem').nth(1).hover();
  await expect.poll(() => blur(1)).toBe('none');
  expect(await blur(0)).toContain('blur');
  await axe(page, 'hide previews');

  // Quick paste blurs every clip, the selected one too, until the pointer is on it.
  const form = await context.newPage();
  await form.goto('https://form.e2e.test/');
  await form.locator('#field').click();
  const tabId = await page.evaluate(async () => (await chrome.tabs.query({ url: 'https://form.e2e.test/*' }))[0]!.id!);
  await page.evaluate((id) => chrome.runtime.sendMessage({ type: 'e2e-command', command: 'quick-paste', tabId: id }), tabId);
  const options = form.getByRole('option');
  await expect(options).toHaveCount(2);
  await form.mouse.move(0, 0);
  const qpBlur = (n: number) =>
    options
      .nth(n)
      .locator('.txt')
      .evaluate((el) => getComputedStyle(el).filter);
  await expect.poll(() => qpBlur(0)).toContain('blur');
  await options.nth(1).hover();
  await expect.poll(() => qpBlur(1)).toBe('none');
  expect(await qpBlur(0)).toContain('blur');

  await page.bringToFront();
  await toggle.click();
  await expect.poll(() => blur(0)).toBe('none');
});
