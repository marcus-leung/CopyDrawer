import { test, expect } from './fixtures';
import { pasteIntoPanel, seedClips } from './helpers';

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

test('a list that grows past 100 while open still loads more on scroll', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(page.getByRole('heading', { name: 'Save something to start' })).toBeVisible();
  await seedClips(
    page,
    Array.from({ length: 90 }, (_, i) => `Early note ${i}`),
  );
  await page.reload();
  const rows = page.getByRole('list', { name: 'Clips' }).getByRole('listitem');
  await expect(rows).toHaveCount(90);
  await expect(page.getByRole('button', { name: /^Show \d+ more$/ })).toHaveCount(0);

  // New clips arrive while the panel is open.
  await pasteIntoPanel(page, ...Array.from({ length: 20 }, (_, i) => `Later note ${i}`));
  await expect(page.getByRole('button', { name: 'Show 10 more' })).toBeVisible();
  await page.getByRole('button', { name: 'Show 10 more' }).scrollIntoViewIfNeeded();
  await expect(rows).toHaveCount(110);
});
