// Makes the Chrome Web Store art in assets/store: the promo tiles, and five screenshots of the real
// side panel (E2E build, filled by copying from sample pages) docked in a drawn browser window.
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
const INK = '#2A0E12';
/** The browser window's page area, and the docked panel's width. Captures are taken at these sizes, so nothing is scaled. */
const VIEW_H = 546;
const WIN_W = 1200;
const PANEL_W = 400;
const PAGE_W = WIN_W - PANEL_W;
/** Each of the two quick-paste frames' windows. */
const PASTE_W = 586;

// Flat illustrations for the sample pages: drawn, so no photos or real brands appear in the listing.
const ART = {
  kyoto: `<svg viewBox="0 0 720 230" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE3C8"/><stop offset="1" stop-color="#FFF6EC"/></linearGradient></defs>
    <rect width="720" height="230" fill="url(#sky)"/>
    <circle cx="560" cy="70" r="38" fill="#FF8A5B"/>
    <path d="M150 230 L330 70 L510 230 Z" fill="#8FA3BF"/><path d="M290 106 L330 70 L370 106 L352 100 L338 112 L322 100 L306 112 Z" fill="#fff"/>
    <path d="M0 200 Q120 170 240 196 T480 192 T720 186 V230 H0 Z" fill="#6E8C6A"/>
    <g fill="#B7322C"><rect x="96" y="96" width="8" height="120"/>
      <path d="M66 100 H134 L124 90 H76 Z"/><path d="M72 130 H128 L119 121 H81 Z"/><path d="M76 158 H124 L116 150 H84 Z"/><path d="M80 184 H120 L113 177 H87 Z"/>
      <rect x="84" y="208" width="32" height="10"/></g>
    <g fill="#E0523A"><circle cx="640" cy="180" r="9"/><circle cx="660" cy="196" r="7"/><circle cx="620" cy="200" r="6"/></g>
  </svg>`,
  ryokan: `<svg viewBox="0 0 720 230" xmlns="http://www.w3.org/2000/svg">
    <rect width="720" height="230" fill="#F4EBDD"/>
    <path d="M120 96 L360 40 L600 96 Z" fill="#4A3B35"/><rect x="150" y="96" width="420" height="120" fill="#C9A77C"/>
    <g fill="#8C6A4A"><rect x="150" y="96" width="420" height="10"/><rect x="230" y="106" width="6" height="110"/><rect x="484" y="106" width="6" height="110"/></g>
    <rect x="300" y="130" width="120" height="86" fill="#2F4858"/><g fill="#F4EBDD"><rect x="300" y="130" width="120" height="30"/></g>
    <g fill="#B7322C"><rect x="304" y="132" width="34" height="26" rx="2"/><rect x="343" y="132" width="34" height="26" rx="2"/><rect x="382" y="132" width="34" height="26" rx="2"/></g>
    <ellipse cx="196" cy="150" rx="18" ry="24" fill="#FF8A5B"/><rect x="190" y="122" width="12" height="6" fill="#4A3B35"/>
    <ellipse cx="524" cy="150" rx="18" ry="24" fill="#FF8A5B"/><rect x="518" y="122" width="12" height="6" fill="#4A3B35"/>
    <rect y="216" width="720" height="14" fill="#9C8B76"/>
  </svg>`,
  ramen: `<svg viewBox="0 0 720 230" xmlns="http://www.w3.org/2000/svg">
    <rect width="720" height="230" fill="#FDF1E3"/>
    <path d="M220 110 H500 Q500 200 360 206 Q220 200 220 110 Z" fill="#B7322C"/><ellipse cx="360" cy="110" rx="140" ry="22" fill="#F2C27B"/>
    <circle cx="320" cy="104" r="20" fill="#fff"/><circle cx="320" cy="104" r="10" fill="#F5A623"/>
    <rect x="372" y="94" width="50" height="18" rx="4" fill="#6E8C6A"/>
    <rect x="300" y="40" width="200" height="6" rx="3" fill="#8C6A4A" transform="rotate(18 400 43)"/><rect x="300" y="54" width="200" height="6" rx="3" fill="#8C6A4A" transform="rotate(14 400 57)"/>
  </svg>`,
  shoes: `<svg viewBox="0 0 720 230" xmlns="http://www.w3.org/2000/svg">
    <rect width="720" height="230" fill="#EAF2EE"/>
    <path d="M230 160 Q240 96 300 92 L360 120 Q420 124 470 140 Q500 150 500 172 H230 Z" fill="#2F6F5E"/>
    <path d="M226 172 H504 V184 Q504 192 494 192 H236 Q226 192 226 184 Z" fill="#fff"/>
    <path d="M300 96 L322 140 M318 104 L340 140 M336 112 L356 142" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
  </svg>`,
  lanterns: `<svg viewBox="0 0 720 230" xmlns="http://www.w3.org/2000/svg">
    <rect width="720" height="230" fill="#2F2A3A"/><path d="M0 40 Q360 90 720 40" stroke="#C9A77C" stroke-width="3" fill="none"/>
    <g fill="#FF6B45">${[80, 200, 320, 440, 560, 660].map((x, i) => `<ellipse cx="${x}" cy="${86 + (i % 2) * 8}" rx="26" ry="34"/>`).join('')}</g>
  </svg>`,
};

/** A sample site: its own header and logo, an illustration, and only the text a person would copy. */
const site = ({
  name,
  color,
  nav,
  title,
  art,
  meta = '',
  text,
  after = '',
}) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
body { margin: 0; font: 16px/1.55 ${SANS}; color: #23201E; background: #fff; }
header { display: flex; align-items: center; gap: 10px; padding: 14px 40px; border-bottom: 1px solid #EEE7DF; }
.logo { width: 26px; height: 26px; border-radius: 7px; background: ${color}; color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 14px; }
.name { font-weight: 800; font-size: 17px; letter-spacing: -0.01em; } nav { margin-left: auto; display: flex; gap: 22px; color: #6B625B; font-size: 14px; }
main { padding: 26px 40px; } h1 { font-size: 30px; line-height: 1.15; margin: 0 0 4px; letter-spacing: -0.02em; } .meta { color: #6B625B; font-size: 14px; margin: 0 0 16px; }
.art svg { display: block; width: 100%; height: auto; border-radius: 14px; } #t { font-size: 18px; margin: 18px 0 0; }
</style></head><body><header><div class="logo">${name[0]}</div><div class="name">${name}</div><nav>${nav.map((n) => `<span>${n}</span>`).join('')}</nav></header>
<main><h1>${title}</h1><p class="meta">${meta}</p><div class="art">${ART[art]}</div><p id="t">${text}</p>${after}</main></body></html>`;

const mail = ({ title, body }) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
body { margin: 0; font: 15px/1.55 ${SANS}; color: #23201E; background: #F6F3EF; display: flex; height: 100vh; }
aside { width: 190px; padding: 18px 16px; color: #6B625B; font-size: 14px; } aside b { display: block; color: #23201E; font-size: 18px; margin-bottom: 18px; }
aside div { padding: 7px 10px; border-radius: 8px; } aside .on { background: #FFE4DA; color: #B7322C; font-weight: 600; }
.card { flex: 1; margin: 14px 14px 0 0; background: #fff; border-radius: 14px 14px 0 0; padding: 22px 28px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
h2 { margin: 0 0 6px; font-size: 21px; } .from { color: #6B625B; font-size: 14px; margin-bottom: 18px; }
label { display: flex; gap: 12px; padding: 9px 0; border-bottom: 1px solid #EEE7DF; color: #6B625B; } input { flex: 1; border: 0; font: inherit; color: #23201E; outline: 0; }
textarea { display: block; width: 100%; box-sizing: border-box; height: 300px; border: 0; padding: 14px 0; font: inherit; resize: none; outline: 0; }
.pass { display: flex; gap: 26px; margin: 16px 0; padding: 16px 20px; border-radius: 12px; background: #FFF4EC; border: 1px solid #F6D8C6; }
.pass div { font-size: 13px; color: #6B625B; } .pass b { display: block; font-size: 20px; color: #23201E; }
</style></head><body><aside><b>Mail</b><div class="on">Inbox</div><div>Sent</div><div>Drafts</div><div>Travel</div></aside><div class="card">${body}</div></body></html>`;

// Made-up sites on the reserved .example domain, so no real company appears in the listing.
// Copied in this order: the Kyoto clips come first, so the flight (which names no city) joins the Kyoto trip.
const PAGES = {
  'https://kyoto-guide.example/three-days': site({
    name: 'Kyoto Guide',
    color: '#B7322C',
    nav: ['Plan', 'Stay', 'Eat', 'Maps'],
    title: 'Kyoto in three days',
    meta: 'Updated November · 8 min read',
    art: 'kyoto',
    text: 'Day 1 itinerary, Kyoto: Fushimi Inari before 8 am, then lunch in Gion.',
  }),
  'https://eats.example/nishiki-market': site({
    name: 'Eats',
    color: '#7A4FB5',
    nav: ['Guides', 'Cities', 'Lists'],
    title: 'Nishiki Market, Kyoto',
    meta: 'Market · Open 9:00 to 18:00',
    art: 'lanterns',
    text: 'Nishiki Market, Kyoto: tamagoyaki ¥300, matcha soft serve ¥450.',
  }),
  'https://mail.example/flight': mail({
    title: 'Your flight is confirmed',
    body: `<h2>Your flight is confirmed</h2><div class="from">Sky Air &lt;bookings@skyair.example&gt;</div>
      <div class="pass"><div>Flight<b>JL 6</b></div><div>Departs<b>Sat 14 Nov, 11:45</b></div><div>Gate<b>54</b></div><div>Seat<b>32A</b></div></div>
      <p id="t">Flight JL 6 departs Sat 14 Nov 11:45 from gate 54, boarding 11:05.</p>`,
  }),
  'https://recipes.example/miso-ramen': site({
    name: 'Recipes',
    color: '#E0803A',
    nav: ['Dinner', 'Quick', 'Saved'],
    title: 'Weeknight miso ramen',
    meta: '25 minutes · Serves 2',
    art: 'ramen',
    text: 'Miso ramen: 2 portions noodles, 3 tbsp white miso, 1 L chicken stock, 2 soft-boiled eggs.',
  }),
  'https://shop.example/trail-runners': site({
    name: 'Shop',
    color: '#2F4858',
    nav: ['Men', 'Women', 'Sale'],
    title: 'Trail runners',
    meta: 'Free returns',
    art: 'shoes',
    text: 'Trail running shoes, size 10, in stock. $89.',
  }),
  'https://stays.example/gion-ryokan': site({
    name: 'Stays',
    color: '#2F6F5E',
    nav: ['Homes', 'Hotels', 'Saved'],
    title: 'Hanami Ryokan, Gion',
    meta: '★ 4.9 · 212 reviews · Kyoto, Japan',
    art: 'ryokan',
    text: 'Ryokan in Gion, Kyoto: ¥28,000 a night with breakfast, check-in 15:00.',
  }),
};
const PASTED = ['1Z 999 AA1 01 2345 6784', '#FF4A2B', 'https://example.com/reports/q3?utm_source=newsletter&utm_medium=email'];
const KYOTO = ['Day 1 itinerary', 'Ryokan in Gion', 'Nishiki Market', 'Flight JL 6'];

/** A notes page. The plans fill the top, where the quick-paste box opens, so the line being written stays in view below it. */
const NOTE = `<!doctype html><html><head><meta charset="utf-8"><title>Trip notes</title><style>
body { margin: 0; font: 17px/2 ${SANS}; color: #23201E; background: #fff; }
header { display: flex; align-items: center; gap: 10px; padding: 12px 28px; border-bottom: 1px solid #EEE7DF; font-weight: 800; font-size: 17px; line-height: 1.55; }
.logo { width: 26px; height: 26px; border-radius: 7px; background: #E0A32E; color: #fff; display: grid; place-items: center; font-size: 14px; }
textarea { display: block; width: 100%; box-sizing: border-box; height: 480px; border: 0; padding: 18px 28px; font: inherit; resize: none; outline: 0; }
textarea::selection { background: #FFD2C2; }
</style></head><body><header><div class="logo">N</div>Notes</header><textarea id="body" spellcheck="false">Kyoto trip notes

Day 1: Fushimi Inari early, lunch in Gion
Day 2: Arashiyama bamboo grove
Day 3: Nishiki Market
Pack: rain jacket, comfy shoes

Where we're staying: </textarea></body></html>`;

const ICONS = {
  back: '<path d="M15 6l-6 6 6 6"/>',
  fwd: '<path d="M9 6l6 6-6 6"/>',
  reload: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};
const icon = (name, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#5C534D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

/** A Chrome-like window: one tab, the address bar, CopyDrawer's toolbar icon lit while its panel is open. */
function browser({ url, title, favicon, letter = title[0], page, panel, width = WIN_W, label = '' }) {
  const host = url.replace(/^https:\/\//, '');
  return `<div style="width:${width}px;background:#fff;border-radius:14px 14px 0 0;overflow:hidden;box-shadow:0 24px 60px rgba(42,14,18,.35)">
    <div style="height:40px;background:#EDE5DC;display:flex;align-items:flex-end;padding:0 14px;gap:14px">
      <div style="display:flex;gap:7px;align-self:center">${['#FF5F57', '#FEBC2E', '#28C840'].map((c) => `<span style="width:12px;height:12px;border-radius:50%;background:${c}"></span>`).join('')}</div>
      <div style="display:flex;align-items:center;gap:8px;height:32px;padding:0 14px;min-width:220px;background:#fff;border-radius:10px 10px 0 0;font-size:13px;color:#23201E">
        <span style="width:16px;height:16px;border-radius:4px;background:${favicon};color:#fff;font:800 10px ${SANS};display:grid;place-items:center">${letter}</span>${title}</div>
      ${label ? `<div style="margin-left:auto;align-self:center;font:700 13px ${SANS};color:#6B625B">${label}</div>` : ''}
    </div>
    <div style="height:44px;display:flex;align-items:center;gap:14px;padding:0 14px;border-bottom:1px solid #E6DED5">
      ${icon('back')}${icon('fwd')}${icon('reload')}
      <div style="flex:1;height:30px;border-radius:15px;background:#F3EEE8;display:flex;align-items:center;gap:8px;padding:0 14px;font-size:14px;color:#23201E">${icon('lock', 14)}${host}</div>
      <div style="width:30px;height:30px;border-radius:50%;background:${panel ? '#FFE4DA' : 'transparent'};display:grid;place-items:center"><div style="width:18px;height:18px">${brand('icon')}</div></div>
    </div>
    <div style="display:flex;height:${VIEW_H}px">
      ${page ? `<img src="${img(page)}" style="display:block;height:${VIEW_H}px">` : ''}
      ${panel ? `<img src="${img(panel)}" style="display:block;width:${PANEL_W}px;height:${VIEW_H}px;border-left:1px solid #E3CDB6">` : ''}
    </div>
  </div>`;
}
const img = (b64) => `data:image/png;base64,${b64}`;

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

  for (const [url, body] of Object.entries(PAGES)) await context.route(url, (r) => r.fulfill({ contentType: 'text/html', body }));
  await context.route('https://notes.example/kyoto', (r) => r.fulfill({ contentType: 'text/html', body: NOTE }));

  const panel = await context.newPage();
  await panel.setViewportSize({ width: PANEL_W, height: VIEW_H });
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await panel.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings ?? {}), autoSave: true, theme: 'light' } });
    await chrome.runtime.sendMessage({ type: 'autosave-sync' });
  });
  for (const url of Object.keys(PAGES)) {
    const tab = await context.newPage();
    await tab.goto(url);
    await tab.locator('#t').selectText();
    await tab.keyboard.press('ControlOrMeta+C');
    await tab.waitForTimeout(400);
    await tab.close();
  }
  for (const text of PASTED)
    await panel.evaluate((text) => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    }, text);
  // The pagoda drawing, pasted as an image, fills the Images row.
  await panel.evaluate(
    async (svg) => {
      const pic = new Image();
      pic.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await pic.decode();
      const canvas = new OffscreenCanvas(720, 460);
      canvas.getContext('2d').drawImage(pic, 0, 0, 720, 460);
      const data = new DataTransfer();
      data.items.add(new File([await canvas.convertToBlob({ type: 'image/png' })], 'pagoda.png', { type: 'image/png' }));
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    },
    ART.kyoto.replace('<svg ', '<svg width="720" height="230" preserveAspectRatio="xMidYMid slice" '),
  );

  await panel.bringToFront();
  const toast = panel.getByText('Image saved');
  await toast.waitFor({ timeout: 15000 });
  await toast.waitFor({ state: 'hidden', timeout: 15000 });
  const list = panel.getByRole('list', { name: 'Clips' });
  await list
    .getByRole('listitem')
    .nth(Object.keys(PAGES).length + PASTED.length)
    .waitFor();
  await panel.getByText('Saved', { exact: true }).waitFor({ state: 'hidden', timeout: 15000 });

  const placed = await panel.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('clipboard');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction(['clips', 'collections']);
          const clips = tx.objectStore('clips').getAll();
          const cols = tx.objectStore('collections').getAll();
          tx.oncomplete = () => {
            const names = new Map(cols.result.map((c) => [c.id, c.name]));
            resolve(clips.result.map((c) => [c.text ?? '', names.get(c.collectionId) ?? '']));
          };
        };
      }),
  );
  const astray = KYOTO.filter((start) => placed.find(([text]) => text.startsWith(start))?.[1] !== 'Kyoto trip');
  if (astray.length) throw new Error(`Not in Kyoto trip: ${astray.join(', ')}\n${JSON.stringify(placed, null, 2)}`);

  const shot = async () => (await panel.screenshot()).toString('base64');
  const shots = {};
  shots.home = await shot();
  await panel.getByRole('searchbox').fill('kyotto');
  await panel.waitForTimeout(500);
  shots.search = await shot();
  await panel.getByRole('searchbox').fill('');
  await list.getByRole('button', { name: /Flight JL 6/ }).click();
  await panel.getByRole('button', { name: 'Back' }).waitFor();
  await panel.waitForTimeout(300);
  shots.detail = await shot();
  await panel.getByRole('button', { name: 'Back' }).click();

  // Staged for the art, not a test: the panel shows sync as it looks once on and caught up.
  // Turning it on starts a sync, which fails here with no Drive; the caught-up status goes in after that settles.
  await panel.evaluate(() => chrome.storage.local.set({ driveSync: { on: true, copyId: 'store-art', copyFileId: 'store-art' } }));
  await panel.waitForTimeout(2000);
  await panel.evaluate(() => chrome.storage.local.set({ driveSyncStatus: { state: 'idle', lastSyncAt: Date.now() } }));
  await panel.getByRole('button', { name: 'Settings' }).click();
  await panel.getByText(/^Last synced/).waitFor();
  await panel.evaluate(() => {
    document.getElementById('s-sync')?.scrollIntoView({ block: 'start' });
    document.scrollingElement?.scrollBy(0, -12);
    for (let el = document.getElementById('s-sync')?.parentElement; el; el = el.parentElement)
      if (el.scrollHeight > el.clientHeight) el.scrollTop -= 12;
  });
  await panel.waitForTimeout(300);
  shots.sync = await shot();

  const pageShot = async (url, after, width = PAGE_W) => {
    const tab = await context.newPage();
    await tab.setViewportSize({ width, height: VIEW_H });
    await tab.goto(url);
    await after?.(tab);
    const png = (await tab.screenshot()).toString('base64');
    await tab.close();
    return png;
  };
  const pages = {
    guide: await pageShot('https://kyoto-guide.example/three-days'),
    stay: await pageShot('https://stays.example/gion-ryokan'),
    flight: await pageShot('https://mail.example/flight'),
  };
  const paste = {};
  {
    const tab = await context.newPage();
    await tab.setViewportSize({ width: PASTE_W, height: VIEW_H });
    await tab.goto('https://notes.example/kyoto');
    const tabId = await panel.evaluate(async () => (await chrome.tabs.query({ url: 'https://notes.example/kyoto' }))[0].id);
    await tab.locator('#body').click();
    await tab.locator('#body').evaluate((el) => el.setSelectionRange(el.value.length, el.value.length));
    const before = await tab.locator('#body').inputValue();
    await panel.evaluate((tabId) => chrome.runtime.sendMessage({ type: 'e2e-menu', action: 'quick-paste', tabId }), tabId);
    await tab.getByRole('combobox', { name: 'Filter clips' }).waitFor();
    await tab.keyboard.type('gion');
    await tab.waitForTimeout(500);
    for (let i = 0; i < 4; i++) {
      const picked = await tab.getByRole('option', { selected: true }).textContent();
      if (picked?.startsWith('Ryokan')) break;
      await tab.keyboard.press('ArrowDown');
    }
    await tab.waitForTimeout(200);
    paste.open = (await tab.screenshot()).toString('base64');
    await tab.keyboard.press('Enter');
    await tab.getByRole('combobox', { name: 'Filter clips' }).waitFor({ state: 'detached' });
    const after = await tab.locator('#body').inputValue();
    if (!after.startsWith(before) || !after.slice(before.length).startsWith('Ryokan in Gion'))
      throw new Error(`Quick paste didn't type the ryokan into the note: ${JSON.stringify(after.slice(before.length))}`);
    // Selects what quick paste typed, so the second frame shows it highlighted.
    await tab.locator('#body').evaluate((el, from) => el.setSelectionRange(from, el.value.length), before.length);
    await tab.waitForTimeout(200);
    paste.done = (await tab.screenshot()).toString('base64');
    await tab.close();
  }

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
  const screen = (n, headline, sub, scene) =>
    render(
      `screenshot-${n}.png`,
      1280,
      800,
      `<div style="position:relative;width:1280px;height:800px;background:${TOMATO};color:${CREAM}">
        <div style="position:absolute;left:40px;top:36px;right:40px">
          <h1 style="font-size:46px;line-height:1.05">${headline}</h1>
          <p style="margin:10px 0 0;font-size:20px;line-height:1.35;font-weight:600;opacity:.95">${sub}</p>
        </div>
        <div style="position:absolute;left:40px;right:40px;top:170px;display:flex;justify-content:center;align-items:flex-start;gap:28px">${scene}</div>
      </div>`,
    );

  const key = (k) =>
    `<span style="display:inline-block;min-width:34px;padding:5px 9px;border-radius:8px;background:${CREAM};color:${INK};font:800 16px ${SANS};text-align:center;box-shadow:0 3px 0 #C7351C">${k}</span>`;
  const keys = (...ks) => `<span style="display:inline-flex;gap:5px;align-items:center">${ks.map(key).join('')}</span>`;
  const frame = (n, title, window) => `<div style="color:${CREAM}">
    <div style="display:flex;gap:12px;align-items:center;min-height:38px;margin-bottom:12px">
      <span style="flex:none;width:32px;height:32px;border-radius:50%;background:${CREAM};color:${TOMATO};font:800 17px ${SANS};display:grid;place-items:center">${n}</span>
      <span style="font:800 20px/1.25 ${SANS}">${title}</span></div>${window}</div>`;
  const noteWindow = (page) =>
    browser({ url: 'https://notes.example/kyoto', title: 'Trip notes', favicon: '#E0A32E', letter: 'N', page, width: PASTE_W });
  const tabOf = { guide: ['Kyoto in three days', '#B7322C'], stay: ['Hanami Ryokan', '#2F6F5E'], flight: ['Mail', '#B7322C'] };
  await screen(
    1,
    'Everything you copy, kept and sorted',
    'Text, links and images file themselves into collections, like a Kyoto trip.',
    browser({
      url: 'https://kyoto-guide.example/three-days',
      title: tabOf.guide[0],
      favicon: tabOf.guide[1],
      page: pages.guide,
      panel: shots.home,
    }),
  );
  await screen(
    2,
    'Paste from your history, right where you type',
    `Press ${keys('Alt', 'Shift', 'V')} on Windows or ${keys('⌥', '⇧', 'V')} on a Mac in any text box.`,
    `${frame(1, 'Quick paste opens. Type to find a clip.', noteWindow(paste.open))}${frame(2, 'Press Enter. It’s typed in for you.', noteWindow(paste.done))}`,
  );
  await screen(
    3,
    'Find it in seconds',
    'Search forgives typos. Filter by type, site or date.',
    browser({
      url: 'https://stays.example/gion-ryokan',
      title: tabOf.stay[0],
      favicon: tabOf.stay[1],
      page: pages.stay,
      panel: shots.search,
    }),
  );
  await screen(
    4,
    'One click to the next step',
    'Flights, dates, tracking numbers and addresses get the right button.',
    browser({
      url: 'https://mail.example/flight',
      title: 'Your flight is confirmed',
      favicon: '#B7322C',
      letter: 'M',
      page: pages.flight,
      panel: shots.detail,
    }),
  );

  const laptop = (label, panelShot) =>
    `<div><div style="font:700 15px ${SANS};color:${CREAM};margin:0 0 10px 4px;opacity:.95">${label}</div>
      <div style="width:${PANEL_W}px;border-radius:14px 14px 0 0;overflow:hidden;box-shadow:0 24px 60px rgba(42,14,18,.35)"><img src="${img(panelShot)}" style="display:block;width:${PANEL_W}px;height:${VIEW_H}px"></div></div>`;
  const cloud = `<div style="align-self:center;margin-top:120px;width:220px;text-align:center;color:${CREAM}">
      <svg width="120" height="84" viewBox="0 0 120 84"><path d="M34 74 H92 A22 22 0 0 0 92 30 A30 30 0 0 0 36 22 A26 26 0 0 0 34 74 Z" fill="${CREAM}"/>
      <path d="M48 52 L60 40 L72 52 M60 40 V64" stroke="${TOMATO}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div style="margin-top:10px;font:800 18px ${SANS}">Your Google Drive</div>
      <div style="margin-top:6px;font:600 14px/1.4 ${SANS};opacity:.9">A hidden app folder only CopyDrawer can see. Nothing goes to us.</div>
      <svg style="margin-top:18px" width="150" height="24" viewBox="0 0 150 24"><path d="M14 12 H136 M24 3 L12 12 L24 21 M126 3 L138 12 L126 21" stroke="${CREAM}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
  await screen(
    5,
    'On all your computers',
    'Turn on sync and your clips follow you, through your own Google Drive.',
    `${laptop('Work laptop', shots.home)}${cloud}${laptop('Home laptop', shots.sync)}`,
  );

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
        <div style="display:flex;align-items:center;gap:20px"><div style="width:96px;height:96px;filter:drop-shadow(0 10px 24px rgba(42,14,18,.25))">${brand(
          'icon',
        )
          .replace(TOMATO, CREAM)
          .replace(/fill="#FFF1DE"/, `fill="${TOMATO}"`)}</div>
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
