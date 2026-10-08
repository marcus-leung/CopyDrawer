import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

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

test('onboarding: three steps, then the panel', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html?onboarding=1`);
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Everything you copy, kept and sorted' })).toBeVisible();
  await axe(page, 'welcome');
  await page.getByRole('button', { name: 'Get started' }).click();
  // The e2e build already has all-sites access, so turning on auto-save goes straight through.
  await page.getByRole('button', { name: 'Turn on auto-save' }).click();
  await expect(page.getByText('Step 3 of 3')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Two shortcuts to know' })).toBeVisible();
  await axe(page, 'shortcuts step');
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('heading', { name: "You're all set" })).toBeVisible();
  await page.getByRole('button', { name: 'Open the side panel' }).click();
  await expect(page.getByRole('heading', { name: 'Your clips' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Copy anything to start' })).toBeVisible();
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

  // Settings: export, delete all, import brings everything back.
  await page.getByRole('button', { name: 'Settings' }).click();
  await axe(page, 'settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export' }).click()]);
  const file = await download.path();
  // Delete all asks in place: Esc cancels, then confirm.
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

  // Nothing about AI, Pro or features that aren't here yet.
  await expect(page.getByText(/\bAI\b|\bPro\b|waitlist|coming soon/i)).toHaveCount(0);

  // Pausing shows the paused notice; Resume clears it.
  await page.evaluate(async () => {
    const s = (await chrome.storage.local.get('settings')).settings ?? {};
    await chrome.storage.local.set({ settings: { ...s, autoSave: true, pausedUntil: Date.now() + 3_600_000 } });
  });
  await page.getByRole('button', { name: 'Back to home' }).click();
  await expect(page.getByText('Auto-save is paused')).toBeVisible();
  await expect(page.getByText(/Resumes in (59|60) minutes/)).toBeVisible();
  await page.getByRole('button', { name: 'Resume now' }).click();
  await expect(page.getByText('Auto-save is paused')).toHaveCount(0);

  // Dark theme passes too.
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await axe(page, 'home dark');
});
