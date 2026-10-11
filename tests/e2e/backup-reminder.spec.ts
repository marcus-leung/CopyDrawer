import { test, expect } from './fixtures';
import { seedClips } from './helpers';

const DAY = 86_400_000;

test('the home screen reminds you to export, and Export now, Not now and the setting all work', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(page.getByRole('heading', { name: 'Save something to start' })).toBeVisible();
  const settings = (patch: object) =>
    page.evaluate(async (patch) => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings ?? {}), ...patch } });
    }, patch);
  const stored = () =>
    page.evaluate(
      async () => (await chrome.storage.local.get('settings')).settings as { backupRemindAfter: number; lastExportAt: number },
    );
  const reminder = page.getByText('Back up your clips');

  // Fewer than 50 clips: nothing to lose yet.
  await seedClips(
    page,
    Array.from({ length: 40 }, (_, i) => `Note ${i}`),
  );
  await settings({ backupRemindAfter: Date.now() - DAY });
  await page.reload();
  await expect(page.getByRole('list', { name: 'Clips' }).getByRole('listitem')).toHaveCount(40);
  await expect(reminder).toHaveCount(0);

  // 60 clips and due: the reminder shows; Export now downloads and puts it off a month.
  await seedClips(
    page,
    Array.from({ length: 20 }, (_, i) => `More ${i}`),
    { id: 'more', name: 'More' },
  );
  await page.reload();
  await expect(reminder).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export now' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^clipboard-export-\d{4}-\d{2}-\d{2}\.zip$/);
  await expect(page.getByRole('status')).toContainText('Exported 60 clips');
  await expect(reminder).toHaveCount(0);
  const afterExport = await stored();
  expect(afterExport.backupRemindAfter - Date.now()).toBeGreaterThan(29 * DAY);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText(`Last exported: ${new Date(afterExport.lastExportAt).toLocaleDateString()}`)).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();

  // Due again: Not now puts it off a week.
  await settings({ backupRemindAfter: Date.now() - DAY });
  await page.reload();
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(reminder).toHaveCount(0);
  const snoozed = (await stored()).backupRemindAfter - Date.now();
  expect(snoozed).toBeGreaterThan(6 * DAY);
  expect(snoozed).toBeLessThan(8 * DAY);

  // Turned off in Settings: no reminder even when due.
  await page.getByRole('button', { name: 'Settings' }).click();
  const toggle = page.getByLabel('Remind me to export every month');
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await settings({ backupRemindAfter: Date.now() - DAY });
  await page.reload();
  await expect(page.getByRole('list', { name: 'Clips' }).getByRole('listitem').first()).toBeVisible();
  await expect(reminder).toHaveCount(0);
});
