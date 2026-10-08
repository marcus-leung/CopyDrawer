/**
 * Organizing, end to end in Chromium with the real extension: collections
 * sorted by rules from real-looking pages, trips, the collection view (sort,
 * rename, color, delete) and moving clips.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { pasteIntoPanel } from './helpers';

const page = (title: string, text: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p id="t">${text}</p></body></html>`;

const SITES: Record<string, { title: string; text: string }> = {
  'https://en.wikipedia.org/wiki/Photosynthesis': {
    title: 'Photosynthesis - Wikipedia',
    text: 'Photosynthesis is the process by which green plants use sunlight to synthesize foods from carbon dioxide and water.',
  },
  'https://www.airbnb.com/rooms/48213377': {
    title: 'Loft in Alfama',
    text: 'Sunny loft in Alfama, Lisbon. €96 a night, sleeps 2.',
  },
  'https://www.booking.com/hotel/pt/chiado.html': {
    title: 'Chiado Studio',
    text: 'Chiado studio in Lisbon, €84 per night, free cancellation.',
  },
  'https://mail.example.com/inbox': { title: 'Inbox', text: 'Flight TP 1355, departure 07:40, check-in opens at 05:40.' },
  'https://cooking.nytimes.com/recipes/1': {
    title: 'Lemon Garlic Pasta',
    text: 'Lemon garlic pasta: spaghetti, lemon zest, parmesan.',
  },
  'https://github.com/acme/shop/blob/main/orders.sql': {
    title: 'orders.sql',
    text: 'Orders joined with users, grouped by month.',
  },
  'https://www.rei.com/product/123': { title: 'Trail runners', text: 'Trail running shoes, size 10, in stock.' },
};

async function routeSites(context: BrowserContext) {
  for (const [url, { title, text }] of Object.entries(SITES)) {
    await context.route(url, (route) => route.fulfill({ contentType: 'text/html', body: page(title, text) }));
  }
}

async function enableAutosave(panel: Page) {
  await panel.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings ?? {}), autoSave: true } });
    await chrome.runtime.sendMessage({ type: 'autosave-sync' });
  });
}

/** Opens the page, selects the paragraph and presses Ctrl+C, like a person would. */
async function copyFrom(context: BrowserContext, url: string) {
  const tab = await context.newPage();
  await tab.goto(url);
  await tab.locator('#t').selectText();
  await tab.keyboard.press('ControlOrMeta+C');
  await tab.waitForTimeout(250);
  await tab.close();
}

test('copying on real sites fills collections and a named trip', async ({ context, extensionId }) => {
  await routeSites(context);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await enableAutosave(panel);
  for (const url of Object.keys(SITES)) await copyFrom(context, url);

  await panel.bringToFront();
  const tiles = panel.getByRole('list', { name: 'Collections' });
  await expect(tiles.getByRole('button')).toHaveCount(5);
  // Largest first: the trip has the two stays and the city-less flight.
  await expect(tiles.getByRole('button').first()).toHaveText(/Lisbon trip\s*3 clips, 3 new/);
  for (const name of ['Research', 'Recipes', 'Code', 'Shopping']) await expect(tiles).toContainText(name);
  await expect(panel.getByText('Sorted 7 new clips today')).toBeVisible();

  // Recent rows show the collection and the site.
  const list = panel.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem').filter({ hasText: 'Photosynthesis is the process' })).toContainText(
    'Research, from en.wikipedia.org',
  );
  await expect(list.getByRole('listitem').filter({ hasText: 'Flight TP 1355' })).toContainText(
    'Lisbon trip, from mail.example.com',
  );
});

test('collection view: sort, rename, color, delete (cancel and confirm)', async ({ context, extensionId }) => {
  await routeSites(context);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await enableAutosave(panel);
  for (const url of [
    'https://www.airbnb.com/rooms/48213377',
    'https://www.booking.com/hotel/pt/chiado.html',
    'https://mail.example.com/inbox',
  ]) {
    await copyFrom(context, url);
  }
  await panel.bringToFront();
  await panel
    .getByRole('list', { name: 'Collections' })
    .getByRole('button', { name: /Lisbon trip/ })
    .click();
  const inTrip = panel.getByRole('list', { name: 'Clips in Lisbon trip' });
  await expect(inTrip.getByRole('listitem')).toHaveCount(3);
  await expect(panel.getByText('Sorted here automatically.')).toBeVisible();

  // Newest first by default; "Most used" puts the copied one on top.
  await expect(inTrip.getByRole('listitem').first()).toContainText('Flight TP 1355');
  await inTrip.getByRole('listitem').filter({ hasText: 'Sunny loft' }).getByRole('button', { name: 'Copy' }).click();
  await expect(panel.getByRole('status')).toContainText('Copied');
  await panel.getByLabel('Sort').selectOption('used');
  await expect(inTrip.getByRole('listitem').first()).toContainText('Sunny loft');
  // "Source" groups by site.
  await panel.getByLabel('Sort').selectOption('source');
  await expect(inTrip.getByRole('listitem').first()).toContainText('Sunny loft'); // airbnb.com sorts first

  // Rename by typing and clicking away (blur saves).
  await panel.getByRole('button', { name: 'Rename' }).click();
  await panel.getByLabel('Collection name').fill('Lisbon, October');
  await panel.getByText('Sorted here automatically.').click();
  await expect(panel.getByRole('heading', { name: 'Lisbon, October' })).toBeVisible();
  // An empty name is ignored.
  await panel.getByRole('button', { name: 'Rename' }).click();
  await panel.getByLabel('Collection name').fill('   ');
  await panel.getByLabel('Collection name').press('Enter');
  await expect(panel.getByRole('heading', { name: 'Lisbon, October' })).toBeVisible();

  // Color: a preset, then any hue from the rainbow bar. It shows on the home tile too.
  const tint = () =>
    panel
      .locator('[style*="--c-tint"]')
      .first()
      .evaluate((el) => el.style.getPropertyValue('--c-tint'));
  await panel.getByRole('button', { name: 'Color' }).click();
  await panel.getByRole('radio', { name: 'Violet' }).click();
  await expect(panel.getByRole('radio', { name: 'Violet' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(tint).toBe('#EEE8FB');
  await panel.getByLabel('Custom color').fill('150');
  await expect(panel.getByRole('radio', { name: 'Violet' })).toHaveAttribute('aria-checked', 'false');
  const custom = await tint();
  expect(custom).toMatch(/^#[0-9a-f]{6}$/);

  // Delete asks in place: cancel keeps it, confirm removes it but keeps the clips.
  const ask = panel.getByRole('alertdialog');
  await panel.getByRole('button', { name: 'Delete collection' }).click();
  await expect(ask).toContainText('Its clips stay in your history');
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toHaveCount(0);
  await expect(panel.getByRole('heading', { name: 'Lisbon, October' })).toBeVisible();
  await panel.getByRole('button', { name: 'Back to home' }).click();
  await expect(panel.locator('[aria-label="Collections"] [style*="--c-tint"]').first()).toHaveAttribute(
    'style',
    new RegExp(`--c-tint: ${custom}`),
  );
  await panel
    .getByRole('list', { name: 'Collections' })
    .getByRole('button', { name: /Lisbon, October/ })
    .click();
  await panel.getByRole('button', { name: 'Delete collection' }).click();
  await ask.getByRole('button', { name: 'Delete collection' }).click();
  await expect(panel.getByRole('status')).toContainText('Collection deleted');
  await expect(panel.getByRole('list', { name: 'Collections' }).getByRole('listitem')).toHaveCount(0);
  await expect(panel.getByRole('list', { name: 'Clips' }).getByRole('listitem')).toHaveCount(3);
});

test('moving clips: new collection, none, stays put', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await pasteIntoPanel(panel, 'Quarterly budget review meeting notes for the finance team');
  const list = panel.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  const tiles = panel.getByRole('list', { name: 'Collections' });
  await expect(tiles.getByRole('listitem')).toHaveCount(0); // rules don't know this one

  await list.getByRole('button', { name: /Quarterly budget/ }).click();
  const select = panel.getByRole('combobox', { name: /Collection/ });
  await expect(select.locator('option:checked')).toHaveText('None');
  // Esc in the name form changes nothing.
  await select.selectOption('__new__');
  await panel.getByLabel('Collection name').press('Escape');
  await expect(panel.getByRole('form', { name: 'New collection' })).toHaveCount(0);
  await expect(select.locator('option:checked')).toHaveText('None');
  await select.selectOption('__new__');
  await panel.getByLabel('Collection name').fill('Work');
  await panel.getByLabel('Collection name').press('Enter');
  await expect(select.locator('option:checked')).toHaveText('Work');
  await panel.getByRole('button', { name: 'Back' }).click();
  await expect(tiles).toContainText('Work');

  // A collection can also be made from home.
  await panel.getByRole('button', { name: 'New collection' }).click();
  await panel.getByLabel('Collection name').fill('Reading list');
  await panel.getByLabel('Custom color').fill('20');
  await panel.getByRole('button', { name: 'Create' }).click();
  await expect(tiles).toContainText('Reading list');

  // Saving the first one again doesn't move it back out.
  await pasteIntoPanel(panel, 'Quarterly budget review meeting notes for the finance team');
  await expect(list.getByRole('listitem').filter({ hasText: 'notes' })).toContainText('Work');

  // "None" takes it out of the collection.
  await list.getByRole('button', { name: /meeting notes/ }).click();
  await select.selectOption('');
  await panel.getByRole('button', { name: 'Back' }).click();
  await expect(list.getByRole('listitem').filter({ hasText: 'notes' })).not.toContainText('Work');
});
