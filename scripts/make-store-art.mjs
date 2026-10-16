// Makes the Chrome Web Store art in assets/store: the promo tiles, and five screenshots of the real
// side panel (E2E build, filled by copying from sample pages) docked next to a page.
// Usage: E2E=1 pnpm exec wxt build && node scripts/make-store-art.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'assets/store';
const EXT = path.resolve('.output-e2e/chrome-mv3');
const local = '/opt/pw-browsers/chromium';
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const brand = (name) => fs.readFileSync(`assets/brand/${name}.svg`, 'utf8').replace(/<title>.*?<\/title>/, '');

const TOMATO = '#FF4A2B';
const CREAM = '#FFF8F0';

// Sample pages: copying from each one fills a collection, a trip and the site names.
const article = (title, site, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
body { margin: 0; font: 17px/1.6 Georgia, serif; color: #222; background: #fff; }
header { padding: 18px 48px; border-bottom: 1px solid #eee; font: 600 15px system-ui, sans-serif; color: #555; }
main { max-width: 640px; padding: 40px 48px; } h1 { font: 700 38px/1.15 Georgia, serif; margin: 0 0 18px; }
.lead { font-size: 20px; color: #444; } .ph { height: 220px; border-radius: 12px; background: linear-gradient(135deg, #f3d9c4, #e9b48f); margin: 24px 0; }
</style></head><body><header>${site}</header><main><h1>${title}</h1><p class="lead" id="t">${body}</p><div class="ph"></div>
<p>Plan ahead: the best places book out early in summer, and the trams fill up by mid-morning. Bring comfortable shoes for the hills.</p></main></body></html>`;

// Made-up sites, so no real company appears in the store listing.
const SITES = {
  'https://wiki.example.com/photosynthesis': [
    'Photosynthesis',
    'wiki.example.com',
    'Photosynthesis is the process by which green plants use sunlight to synthesize foods from carbon dioxide and water.',
  ],
  'https://stays.example.com/alfama-loft': [
    'Loft in Alfama',
    'stays.example.com',
    'Sunny loft in Alfama, Lisbon. €96 a night, sleeps 2.',
  ],
  'https://stays.example.com/chiado-studio': [
    'Chiado Studio',
    'stays.example.com',
    'Chiado studio in Lisbon, €84 per night, free cancellation.',
  ],
  'https://mail.example.com/inbox': [
    'Your flight',
    'mail.example.com',
    'Flight TP 1355, departure 07:40, check-in opens at 05:40.',
  ],
  'https://recipes.example.com/lemon-garlic-pasta': [
    'Lemon Garlic Pasta',
    'recipes.example.com',
    'Lemon garlic pasta: 200 g spaghetti, 2 tbsp olive oil, lemon zest, parmesan.',
  ],
  'https://shop.example.com/trail-runners': ['Trail runners', 'shop.example.com', 'Trail running shoes, size 10, in stock.'],
  'https://guide.example.com/lisbon/restaurants': [
    'The best restaurants in Lisbon',
    'guide.example.com',
    'Taberna da Rua das Flores, Lisbon: book a table for Friday 8 pm, about €35 each.',
  ],
};
const PASTED = ['1Z 999 AA1 01 2345 6784', '#FF4A2B', 'https://example.com/reports/q3?utm_source=newsletter&utm_medium=email'];

const FORM = `<!doctype html><html><head><meta charset="utf-8"><title>New message</title><style>
body { margin: 0; font: 15px/1.5 system-ui, sans-serif; color: #222; background: #f6f7f9; }
.win { margin: 48px auto; width: 720px; background: #fff; border-radius: 14px; box-shadow: 0 6px 30px rgba(0,0,0,.08); overflow: hidden; }
.top { padding: 14px 22px; background: #2b2f36; color: #fff; font-weight: 600; }
label { display: flex; gap: 12px; align-items: center; padding: 10px 22px; border-bottom: 1px solid #eee; color: #777; }
input { flex: 1; border: 0; font: inherit; color: #222; outline: 0; }
textarea { display: block; width: 100%; box-sizing: border-box; height: 380px; border: 0; padding: 18px 22px; font: inherit; resize: none; outline: 0; }
</style></head><body><div class="win"><div class="top">New message</div>
<label>To <input value="sam@example.com"></label><label>Subject <input value="Lisbon plans"></label>
<textarea id="body">Hi Sam,

Here's where we're staying:
</textarea></div></body></html>`;

fs.mkdirSync(OUT, { recursive: true });
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  executablePath: fs.existsSync(local) ? local : undefined,
  // Headless Chrome on macOS closes tabs the extension opens.
  headless: process.platform !== 'darwin',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const setup = await context
    .waitForEvent('page', { predicate: (p) => p.url().includes('onboarding=1'), timeout: 5000 })
    .catch(() => context.pages().find((p) => p.url().includes('onboarding=1')));
  await setup?.close();

  for (const [url, [title, site, text]] of Object.entries(SITES))
    await context.route(url, (r) => r.fulfill({ contentType: 'text/html', body: article(title, site, text) }));
  await context.route('https://mail.example.com/compose', (r) => r.fulfill({ contentType: 'text/html', body: FORM }));

  const panel = await context.newPage();
  await panel.setViewportSize({ width: 400, height: 800 });
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await panel.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings ?? {}), autoSave: true, theme: 'light' } });
    await chrome.runtime.sendMessage({ type: 'autosave-sync' });
  });
  for (const url of Object.keys(SITES)) {
    const tab = await context.newPage();
    await tab.goto(url);
    await tab.locator('#t').selectText();
    await tab.keyboard.press('ControlOrMeta+C');
    await tab.waitForTimeout(300);
    await tab.close();
  }
  for (const text of PASTED)
    await panel.evaluate((text) => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    }, text);

  await panel.bringToFront();
  const list = panel.getByRole('list', { name: 'Clips' });
  await list
    .getByRole('listitem')
    .nth(Object.keys(SITES).length + PASTED.length - 1)
    .waitFor();
  await panel.getByText('Saved', { exact: true }).waitFor({ state: 'hidden', timeout: 15000 });
  const shot = async () => (await panel.screenshot()).toString('base64');

  const shots = {};
  shots.home = await shot();
  await panel.getByRole('searchbox').fill('lisbon');
  await panel.waitForTimeout(400);
  shots.search = await shot();
  await panel.getByRole('searchbox').fill('');
  await list.getByRole('button', { name: /1Z 999/ }).click();
  await panel.getByRole('button', { name: 'Back' }).waitFor();
  await panel.waitForTimeout(300);
  shots.detail = await shot();
  await panel.getByRole('button', { name: 'Back' }).click();
  await panel
    .getByRole('list', { name: 'Collections' })
    .getByRole('button', { name: /Lisbon trip/ })
    .click();
  await panel.waitForTimeout(400);
  shots.trip = await shot();
  await panel.getByRole('button', { name: 'Back to home' }).click();

  const pageShot = async (url, after, width = 880) => {
    const tab = await context.newPage();
    await tab.setViewportSize({ width, height: 800 });
    await tab.goto(url);
    await after?.(tab);
    const png = (await tab.screenshot()).toString('base64');
    await tab.close();
    return png;
  };
  const pages = {
    home: await pageShot('https://guide.example.com/lisbon/restaurants'),
    search: await pageShot('https://stays.example.com/alfama-loft'),
    detail: await pageShot('https://shop.example.com/trail-runners'),
    trip: await pageShot('https://stays.example.com/chiado-studio'),
    paste: await pageShot(
      'https://mail.example.com/compose',
      async (tab) => {
        const tabId = await panel.evaluate(
          async () => (await chrome.tabs.query({ url: 'https://mail.example.com/compose' }))[0].id,
        );
        await tab.locator('#body').click();
        await tab.keyboard.press('End');
        await panel.evaluate((tabId) => chrome.runtime.sendMessage({ type: 'e2e-menu', action: 'quick-paste', tabId }), tabId);
        await tab.getByRole('combobox', { name: 'Filter clips' }).waitFor();
        await tab.keyboard.type('lisbon');
        await tab.waitForTimeout(400);
      },
      1280,
    ),
  };

  const art = await context.newPage();
  const render = async (file, width, height, body) => {
    await art.setViewportSize({ width, height });
    await art.setContent(`<!doctype html><html><head><style>
      * { box-sizing: border-box; } body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; font-family: ${SANS}; }
      h1, .word { font-family: ${SANS}; font-weight: 800; letter-spacing: -0.02em; margin: 0; }
      </style></head><body>${body}</body></html>`);
    await art.evaluate(() => document.fonts.ready);
    await art.screenshot({ path: path.join(OUT, file) });
  };
  const img = (b64) => `data:image/png;base64,${b64}`;
  const screen = (n, headline, sub, pageKey, panelKey) =>
    render(
      `screenshot-${n}.png`,
      1280,
      800,
      `<div style="position:relative;width:1280px;height:800px;background:${CREAM}">
        <img src="${img(pages[pageKey])}" style="position:absolute;left:0;top:0;height:800px">
        ${panelKey ? `<img src="${img(shots[panelKey])}" style="position:absolute;right:0;top:0;width:400px;height:800px;box-shadow:-1px 0 0 #E3CDB6,-12px 0 32px rgba(42,14,18,.10)">` : ''}
        <div style="position:absolute;left:32px;bottom:32px;width:${panelKey ? 560 : 640}px;padding:26px 30px;border-radius:22px;background:${TOMATO};color:${CREAM};box-shadow:0 18px 40px rgba(42,14,18,.25)">
          <h1 style="font-size:40px;line-height:1.05">${headline}</h1>
          <p style="margin:10px 0 0;font-size:18px;line-height:1.4;font-weight:600;opacity:.95">${sub}</p>
        </div>
      </div>`,
    );

  await screen(
    1,
    'Everything you copy, kept and sorted',
    'Text, links, images and colors are saved and filed into collections on their own.',
    'home',
    'home',
  );
  await screen(2, 'Find it in seconds', 'Search forgives typos. Filter by type, site or date.', 'search', 'search');
  await screen(3, 'Paste anywhere with Alt+Shift+V', 'Pick a clip without leaving the page. Tab picks several.', 'paste');
  await screen(
    4,
    'One click to the next step',
    'Tracking numbers, dates, addresses and flights get the right action.',
    'detail',
    'detail',
  );
  await screen(5, 'Plans sort themselves', 'Stays, flights and bookings for a city become a trip.', 'trip', 'trip');

  const icon = brand('icon');
  const markCream = brand('mark').replace(/fill="#FF4A2B"/, `fill="${CREAM}"`);
  await render(
    'promo-440x280.png',
    440,
    280,
    `<div style="width:440px;height:280px;background:${TOMATO};color:${CREAM};display:flex;flex-direction:column;justify-content:center;padding:0 36px">
      <div style="display:flex;align-items:center;gap:14px"><div style="width:72px;height:72px">${markCream}</div>
      <span class="word" style="font-size:40px">CopyDrawer</span></div>
      <p style="margin:18px 0 0;font-size:21px;line-height:1.3;font-weight:600">Everything you copy,<br>kept and sorted.</p>
    </div>`,
  );
  await render(
    'marquee-1400x560.png',
    1400,
    560,
    `<div style="position:relative;width:1400px;height:560px;background:${TOMATO};color:${CREAM};overflow:hidden">
      <div style="position:absolute;left:96px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;width:640px">
        <div style="display:flex;align-items:center;gap:20px"><div style="width:96px;height:96px;filter:drop-shadow(0 10px 24px rgba(42,14,18,.25))">${icon.replace(TOMATO, CREAM).replace(/fill="#FFF1DE"/, `fill="${TOMATO}"`)}</div>
        <span class="word" style="font-size:64px">CopyDrawer</span></div>
        <h1 style="margin-top:28px;font-size:48px;line-height:1.05">Everything you copy,<br>kept and sorted.</h1>
        <p style="margin:18px 0 0;font-size:21px;font-weight:600;opacity:.95">Clipboard history for Chrome. Private, no account.</p>
      </div>
      <img src="${img(shots.home)}" style="position:absolute;right:110px;top:56px;width:400px;border-radius:18px;box-shadow:0 30px 60px rgba(42,14,18,.35)">
    </div>`,
  );
  console.log('store art written to', OUT);
} finally {
  await context.close();
}
