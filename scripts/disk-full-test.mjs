// Runs CopyDrawer with its Chrome profile on a small RAM disk, fills the disk, and checks that no clips are lost.
// A: the space check refuses saves before the disk is full. B: with the check off, Chrome's own disk error
// happens: saving must stay paused until Chrome restarts, and the next start must move the clips to a fresh
// database (writes after that error make Chrome discard the whole database at a later start). macOS only. Run by hand after `E2E=1 pnpm exec wxt build`.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const extensionPath = path.resolve('.output-e2e/chrome-mv3');
const DISK_MB = 256;
const PAGE = `<!doctype html><title>Disk test</title><p id="t"></p><img id="i" src="https://disk.e2e.test/a.png">`;
const PNG = fs.readFileSync(path.resolve('public/icon/128.png'));
const results = [];
const check = (scenario, name, ok, detail = '') =>
  results.push({ scenario, check: name, result: ok ? 'pass' : 'FAIL', detail: String(detail).slice(0, 110) });

if (process.platform !== 'darwin') throw new Error('macOS only');
if (!fs.existsSync(extensionPath)) throw new Error('Build the E2E extension first: E2E=1 pnpm exec wxt build');

async function launch(profile) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  await context.route('https://disk.e2e.test/**', (r) =>
    r.request().url().endsWith('.png')
      ? r.fulfill({ contentType: 'image/png', body: PNG })
      : r.fulfill({ contentType: 'text/html', body: PAGE }),
  );
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);
  const page = await context.newPage();
  await page.goto('https://disk.e2e.test/');
  // Playwright loads the extension afresh at each launch, so Chrome fires onInstalled instead of onStartup.
  return { context, panel, page };
}

async function setUp(panel, minFreeBytes) {
  await panel.evaluate(async (min) => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings ?? {}), autoSave: true } });
    if (min != null) await chrome.storage.session.set({ e2eMinFreeBytes: min });
    await chrome.runtime.sendMessage({ type: 'autosave-sync' });
  }, minFreeBytes);
}

async function copyText(page, text) {
  await page.evaluate((t) => {
    document.getElementById('__clipboard_ext_toast__')?.remove();
    const p = document.getElementById('t');
    p.textContent = t;
    const range = document.createRange();
    range.selectNodeContents(p);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    document.execCommand('copy');
  }, text);
  await page.waitForTimeout(500);
}

async function copyImage(page) {
  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNode(document.getElementById('i'));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    document.execCommand('copy');
  });
  await page.waitForTimeout(800);
}

const cardText = (page) =>
  page.evaluate(
    () =>
      document
        .getElementById('__clipboard_ext_toast__')
        ?.shadowRoot?.querySelector('.card')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() ?? '',
  );

function readTexts(panel) {
  return panel
    .evaluate(
      () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open('clipboard');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const all = req.result.transaction('clips').objectStore('clips').getAll();
            all.onsuccess = () => {
              resolve(all.result.map((c) => c.text || '[image]'));
              req.result.close();
            };
            all.onerror = () => reject(all.error);
          };
        }),
    )
    .catch((e) => [`read failed: ${e.message}`]);
}

const countOld = (texts) => texts.filter((t) => t.startsWith('Old clip')).length;

function fillDisk(file) {
  const fd = fs.openSync(file, 'w');
  try {
    for (const size of [1 << 20, 4096]) {
      const chunk = Buffer.alloc(size);
      try {
        for (;;) fs.writeSync(fd, chunk);
      } catch {}
    }
  } finally {
    fs.closeSync(fd);
  }
}

async function scenario(label, minFreeBytes, expectCard) {
  const device = execFileSync('hdiutil', ['attach', '-nomount', `ram://${DISK_MB * 2048}`])
    .toString()
    .trim();
  if (!/^\/dev\/disk\d+$/.test(device)) throw new Error(`Unexpected hdiutil output: ${device}`);
  const name = `cdfull${process.pid}${label}`;
  const volume = `/Volumes/${name}`;
  const filler = path.join(volume, 'filler');
  const profile = path.join(volume, 'profile');
  try {
    execFileSync('diskutil', ['erasevolume', 'APFS', name, device], { stdio: 'ignore' });
    fs.mkdirSync(profile);

    let s = await launch(profile);
    await setUp(s.panel, minFreeBytes);
    for (let i = 1; i <= 20; i++) await copyText(s.page, `Old clip number ${i}`);
    check(label, '20 clips saved', countOld(await readTexts(s.panel)) === 20);

    fillDisk(filler);
    for (let i = 1; i <= 3; i++) await copyText(s.page, `Copied while full ${i} ${'x'.repeat(4000)}`);
    const card = await cardText(s.page);
    await copyImage(s.page);
    const full = await readTexts(s.panel);
    check(label, 'nothing saved while full', !full.some((t) => t.startsWith('Copied while full')));
    check(label, 'old clips readable while full', countOld(full) === 20, `${full.length} clips`);
    check(label, 'card says why', card.includes(expectCard), card || 'no card');
    const notice = await s.panel
      .getByText(/almost out of space|paused to protect/)
      .first()
      .textContent({ timeout: 3000 })
      .catch(() => '');
    check(label, 'panel notice', !!notice, notice || 'no notice');

    fs.rmSync(filler);
    await copyText(s.page, 'Copied after freeing space');
    const freed = await readTexts(s.panel);
    if (label === 'A') check(label, 'saving resumes once space is free', freed.includes('Copied after freeing space'));
    else {
      check(label, 'still paused until restart', !freed.includes('Copied after freeing space'), await cardText(s.page));
      // An extension update clears session storage, but isn't a Chrome restart. (Chrome won't reload an
      // extension loaded from the command line, so this clears session storage the way an update does.)
      await s.panel.evaluate(() => chrome.storage.session.clear());
      await s.panel.reload();
      await copyText(s.page, 'Copied after an update');
      check(label, 'still paused after an extension update', !(await readTexts(s.panel)).includes('Copied after an update'));
      const mark = await s.panel.evaluate(async () => (await chrome.storage.local.get('dbRebuild')).dbRebuild);
      check(label, 'clips not moved before Chrome restarts', mark === 'needed', `mark: ${mark}`);
    }

    await s.context.close();
    s = await launch(profile);
    const relaunched = await readTexts(s.panel);
    check(label, 'all clips intact after restart', countOld(relaunched) === 20, `${relaunched.length} clips`);
    if (label === 'B') {
      const mark = await s.panel.evaluate(async () => {
        await chrome.runtime.sendMessage({ type: 'e2e-browser-start' });
        return (await chrome.storage.local.get('dbRebuild')).dbRebuild;
      });
      check(label, 'clips moved to fresh storage at the restart', mark === undefined, `mark: ${mark}`);
      const moved = await readTexts(s.panel);
      check(label, 'all clips intact after the move', countOld(moved) === 20, `${moved.length} clips`);
    }
    await setUp(s.panel, minFreeBytes);
    await copyText(s.page, 'Copied after restart');
    // Many larger saves: after a disk error this used to make Chrome discard the whole database at the next start.
    for (let i = 1; i <= 40; i++) await copyText(s.page, `Bulk ${i} ${'y'.repeat(20000)}`);
    const sameSession = await readTexts(s.panel);
    check(
      label,
      'saving works after restart',
      sameSession.includes('Copied after restart'),
      (await cardText(s.page)) || `${sameSession.length} clips`,
    );
    await s.context.close();
    s = await launch(profile);
    const last = await readTexts(s.panel);
    check(
      label,
      'and lasts after another restart',
      last.includes('Copied after restart') && countOld(last) === 20 && last.filter((t) => t.startsWith('Bulk')).length === 40,
      `${last.length} clips`,
    );
    await s.context.close();
  } finally {
    try {
      execFileSync('hdiutil', ['detach', device, '-force'], { stdio: 'ignore' });
    } catch {}
  }
}

try {
  await scenario('A', null, 'almost out of space');
  await scenario('B', 0, 'paused to protect');
} finally {
  console.table(results);
  if (results.some((r) => r.result === 'FAIL')) process.exitCode = 1;
}
