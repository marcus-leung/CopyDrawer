/**
 * Week 2 flows, end to end in Chromium with the real extension: smart
 * collections from real-looking pages, trips, the collection view, moving
 * clips (and similar clips following), the AI model (load, failure, retry,
 * off) and AI titles.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { mockChromeAI, pasteIntoPanel, readClips, stubModel } from './helpers';

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
    await chrome.storage.local.set({ settings: { ...(settings ?? {}), autoSave: true, smartModel: false } });
    await chrome.runtime.sendMessage({ type: 'autosave-sync' });
  });
}

/** Opens the page, selects the paragraph and presses Ctrl+C, like a person would. */
async function copyFrom(context: BrowserContext, url: string) {
  const tab = await context.newPage();
  await tab.goto(url);
  await tab.locator('#t').selectText();
  await tab.keyboard.press('Control+C');
  await tab.waitForTimeout(250);
  await tab.close();
}

test('copying on real sites fills smart collections and a named trip', async ({ context, extensionId }) => {
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

test('collection view: sort, rename, delete (cancel and confirm)', async ({ context, extensionId }) => {
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

  // Delete: cancel keeps it, confirm removes it but keeps the clips.
  panel.once('dialog', (d) => void d.dismiss());
  await panel.getByRole('button', { name: 'Delete collection' }).click();
  await expect(panel.getByRole('heading', { name: 'Lisbon, October' })).toBeVisible();
  panel.once('dialog', (d) => {
    expect(d.message()).toContain('Its clips stay in your history');
    void d.accept();
  });
  await panel.getByRole('button', { name: 'Delete collection' }).click();
  await expect(panel.getByRole('status')).toContainText('Collection deleted');
  await expect(panel.getByRole('list', { name: 'Collections' })).toHaveCount(0);
  await expect(panel.getByRole('list', { name: 'Clips' }).getByRole('listitem')).toHaveCount(3);
});

test('moving clips: new collection, none, stays put, similar clips follow', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.evaluate(async () => chrome.storage.local.set({ settings: { smartModel: false } }));
  await panel.reload();
  await pasteIntoPanel(panel, 'Quarterly budget review meeting notes for the finance team');
  const list = panel.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(panel.getByRole('list', { name: 'Collections' })).toHaveCount(0); // rules don't know this one

  await list.getByRole('button', { name: /Quarterly budget/ }).click();
  const select = panel.getByLabel('Collection');
  await expect(select.locator('option:checked')).toHaveText('None');
  // Cancelling the name prompt changes nothing.
  panel.once('dialog', (d) => void d.dismiss());
  await select.selectOption('__new__');
  await expect(select.locator('option:checked')).toHaveText('None');
  panel.once('dialog', (d) => void d.accept('Work'));
  await select.selectOption('__new__');
  await expect(select.locator('option:checked')).toHaveText('Work');
  await panel.getByRole('button', { name: 'Back' }).click();
  await expect(panel.getByRole('list', { name: 'Collections' })).toContainText('Work');

  // A similar clip saved later follows it there (offline matcher; no AI needed).
  await pasteIntoPanel(panel, 'Quarterly budget review meeting agenda for the finance team');
  await expect(list.getByRole('listitem').filter({ hasText: 'agenda' })).toContainText('Work', { timeout: 10_000 });
  await expect(panel.getByRole('list', { name: 'Collections' }).getByRole('button', { name: /Work/ })).toContainText('2 clips');

  // Saving the first one again doesn't move it back out.
  await pasteIntoPanel(panel, 'Quarterly budget review meeting notes for the finance team');
  await expect(list.getByRole('listitem').filter({ hasText: 'notes' })).toContainText('Work');

  // "None" takes it out of the collection.
  await list.getByRole('button', { name: /meeting notes/ }).click();
  await select.selectOption('');
  await panel.getByRole('button', { name: 'Back' }).click();
  await expect(list.getByRole('listitem').filter({ hasText: 'notes' })).not.toContainText('Work');
});

test('AI model: downloads once, indexes clips, sorts by meaning, searches by meaning', async ({ context, extensionId }) => {
  const requests = await stubModel(context);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  // No recipe words the rules know, so only the model can sort it.
  await pasteIntoPanel(panel, 'Something nice to cook for dinner on Sunday', 'Remember the Lisbon trip airport pickup');

  await panel.getByRole('button', { name: 'Settings' }).click();
  await expect(panel.getByText('Ready. Runs on this computer; your clips never leave it.')).toBeVisible({ timeout: 30_000 });
  expect(requests).toContain('onnx/model_quantized.onnx');
  await expect.poll(async () => (await readClips(panel)).map((c) => c.embeddingModel)).toEqual(['minilm-l6-q8', 'minilm-l6-q8']);

  await panel.getByRole('button', { name: 'Back to home' }).click();
  await expect(panel.getByRole('list', { name: 'Collections' })).toContainText('Recipes', { timeout: 10_000 });

  // Search by meaning: no clip contains the word "pasta".
  await panel.getByRole('searchbox', { name: 'Search your clips' }).fill('pasta recipe');
  await expect(panel.getByText('1 clip matches, 1 by meaning')).toBeVisible();
  await expect(panel.getByRole('list', { name: 'Clips' })).toContainText('Something nice to cook');
});

test('AI model: failure falls back to rules, Try again recovers, turning it off re-indexes offline', async ({
  context,
  extensionId,
}) => {
  await stubModel(context, { fail: true });
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await pasteIntoPanel(panel, 'Photosynthesis turns sunlight into energy');
  await panel.getByRole('button', { name: 'Settings' }).click();
  await expect(panel.getByText("Couldn't download the model. Using simple rules for now.")).toBeVisible({ timeout: 30_000 });
  await panel.getByText('Details').click();
  await expect(panel.getByTestId('model-error')).not.toBeEmpty();
  // Clips are still indexed with the offline matcher.
  await expect.poll(async () => (await readClips(panel))[0]?.embeddingModel).toBe('hash-v1');

  // The network comes back: Try again works.
  await context.unroute('https://huggingface.co/**');
  await stubModel(context);
  await panel.getByRole('button', { name: 'Try again' }).click();
  await expect(panel.getByText('Ready. Runs on this computer; your clips never leave it.')).toBeVisible({ timeout: 30_000 });

  // Turn it off: back to rules + offline matcher.
  await panel.getByRole('switch', { name: /Sort and search by meaning/ }).click();
  await expect(panel.getByText('Off. Clips are sorted by simple rules, and search matches words.')).toBeVisible();
  await panel.getByRole('button', { name: 'Back to home' }).click();
  await pasteIntoPanel(panel, 'Another note');
  await expect.poll(async () => (await readClips(panel)).map((c) => c.embeddingModel)).toEqual(['hash-v1', 'hash-v1']);
});

test("AI titles with Chrome's built-in AI: long clips only, never when it isn't available", async ({ context, extensionId }) => {
  await mockChromeAI(context);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const long =
    'Grandma always said the secret to her tomato sauce was patience, a pinch of sugar and simmering it slowly all afternoon.';
  await pasteIntoPanel(panel, long, 'Short note');
  const list = panel.getByRole('list', { name: 'Clips' });
  await expect(list).toContainText('AI title: Grandma always said');
  await expect(list).toContainText('Short note');
  const clips = await readClips(panel);
  expect(clips.find((c) => c.text === long)?.titleSource).toBe('ai');
  expect(clips.find((c) => c.text === 'Short note')?.titleSource).toBe('heuristic');
  // The detail page shows the AI title; the text itself is unchanged.
  await list.getByRole('button', { name: /AI title/ }).click();
  await expect(panel.getByRole('heading', { name: 'AI title: Grandma always said' })).toBeVisible();
  await expect(panel.getByText(long)).toBeVisible();
});

test('no AI titles when the built-in AI is missing', async ({ context, extensionId }) => {
  await mockChromeAI(context, 'unavailable');
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await pasteIntoPanel(
    panel,
    'Grandma always said the secret to her tomato sauce was patience, a pinch of sugar and simmering it slowly all afternoon.',
  );
  await panel.waitForTimeout(800);
  await expect(panel.getByRole('list', { name: 'Clips' })).toContainText('Grandma always said the secret');
  expect((await readClips(panel))[0]?.titleSource).toBe('heuristic');
});
