import { test, expect } from './fixtures';
import { seedClips } from './helpers';

test('long lists show 100 clips at a time and load more as you scroll', async ({ context, extensionId }) => {
  const page = await context.newPage();
  const url = `chrome-extension://${extensionId}/sidepanel.html`;
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Save something to start' })).toBeVisible();
  await seedClips(
    page,
    Array.from({ length: 250 }, (_, i) => `Loose note ${i}${i % 2 ? ' tomato' : ''}`),
  );
  await seedClips(
    page,
    Array.from({ length: 150 }, (_, i) => `Filed note ${i}`),
    { id: 'big', name: 'Big folder' },
  );
  await page.reload();

  const rows = page.getByRole('list', { name: 'Clips' }).getByRole('listitem');
  const more = page.getByRole('button', { name: /^Show \d+ more$/ });
  await expect(rows).toHaveCount(100);
  await expect(more).toHaveText('Show 100 more');

  // Scrolling to the end loads the next page.
  await more.scrollIntoViewIfNeeded();
  await expect(rows).toHaveCount(200);
  await expect(more).toHaveText('Show 100 more');
  // The button works by itself (keyboard, screen readers): pressed without scrolling it into view.
  await more.evaluate((b: HTMLButtonElement) => b.click());
  await expect(rows).toHaveCount(300);
  await more.scrollIntoViewIfNeeded();
  await expect(rows).toHaveCount(400);
  await expect(more).toHaveCount(0);

  // A search starts again from one page; the count is the full one.
  await page.getByRole('searchbox', { name: 'Search your clips' }).fill('tomato');
  await expect(page.getByText('125 clips match')).toBeVisible();
  await expect(rows).toHaveCount(100);
  await expect(more).toHaveText('Show 25 more');

  // A collection pages the same way.
  await page.getByRole('searchbox', { name: 'Search your clips' }).fill('');
  await page
    .getByRole('list', { name: 'Collections' })
    .getByRole('button', { name: /Big folder/ })
    .click();
  const inFolder = page.getByRole('list', { name: 'Clips in Big folder' }).getByRole('listitem');
  await expect(inFolder).toHaveCount(100);
  await expect(more).toHaveText('Show 50 more');
});
