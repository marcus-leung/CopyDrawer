/**
 * How the panel, search, quick paste and saving scale with the number of clips, in the real extension.
 * Run `pnpm bench` (builds the E2E copy first). About 5 minutes for all sizes.
 * SIZES=2000,5000 picks sizes; ORDER=desc runs them largest first; OUT=file.jsonl sets where results go
 * (default bench-results.jsonl, appended, one line per size). Quick paste and save are timed from the test
 * side, so they have Playwright's polling granularity; panel open and readAll are timed in the page.
 */
import fs from 'node:fs';
import { test, expect } from '../e2e/fixtures';
import { pasteIntoPanel } from '../e2e/helpers';

const ALL = (process.env.SIZES ?? '2000,5000,10000,20000').split(',').map(Number);
const SIZES = process.env.ORDER === 'desc' ? [...ALL].reverse() : ALL;
const RUNS = 5;
const GARLIC = 37;
const OUT = process.env.OUT ?? 'bench-results.jsonl';

const PAGE = `<!doctype html><html><body><input id="field"></body></html>`;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const summary = (xs: number[]) => ({
  median: Math.round(median(xs)),
  min: Math.round(Math.min(...xs)),
  max: Math.round(Math.max(...xs)),
});

for (const size of SIZES) {
  test(`${size} clips`, async ({ context, extensionId }) => {
    await context.route('https://bench.e2e.test/**', (r) => r.fulfill({ contentType: 'text/html', body: PAGE }));
    const panel = await context.newPage();
    const url = `chrome-extension://${extensionId}/sidepanel.html`;
    await panel.goto(url);
    await expect(panel.getByRole('heading', { name: 'Save something to start' })).toBeVisible();

    // Seed straight into IndexedDB: a realistic mix, deterministic.
    const seeded = await panel.evaluate(
      async ({ size, garlic }) => {
        let s = 42;
        const rand = () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
        const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
        const WORDS =
          'the a meeting notes lisbon trip budget report draft quarterly plan design review email address street avenue invoice order shipping tracking recipe flour sugar butter oven chicken pasta lemon apple banana train flight hotel booking checkin research paper study results method data chart table summary todo call friend family weekend market price discount coupon code function return const value array object string number error fix bug deploy server client'.split(
            ' ',
          );
        const sentence = (n: number) => Array.from({ length: n }, () => pick(WORDS)).join(' ');
        const canvas = new OffscreenCanvas(220, 220);
        const ctx = canvas.getContext('2d')!;
        for (let i = 0; i < 3000; i++) {
          ctx.fillStyle = `hsl(${Math.floor(rand() * 360)},70%,50%)`;
          ctx.fillRect(rand() * 220, rand() * 220, 6, 6);
        }
        const full = await canvas.convertToBlob({ type: 'image/png' });
        const thumb = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });

        const db: IDBDatabase = await new Promise((res, rej) => {
          const r = indexedDB.open('clipboard');
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        const now = Date.now();
        const collections = Array.from({ length: 8 }, (_, i) => ({
          id: `col-${i}`,
          key: `manual:col-${i}`,
          name: `Folder ${i + 1}`,
          color: ['blue', 'green', 'red', 'mustard', 'purple', 'teal', 'pink', 'grey'][i],
          kind: 'manual',
          createdAt: now - 1e9,
          order: i,
        }));
        const clips: object[] = [];
        const images: object[] = [];
        const garlicEvery = Math.floor(size / garlic);
        let nextGarlic = 0;
        let garlicLeft = garlic;
        for (let i = 0; i < size; i++) {
          const r = rand();
          let kind = 'text';
          let text: string;
          if (r < 0.6) text = sentence(5 + Math.floor(rand() * 45));
          else if (r < 0.75) {
            kind = 'link';
            text = `https://www.example${Math.floor(rand() * 500)}.com/${pick(WORDS)}/${i}`;
          } else if (r < 0.85) text = sentence(200 + Math.floor(rand() * 300));
          else if (r < 0.9) {
            kind = 'code';
            text = `function ${pick(WORDS)}${i}() {\n  const x = ${i};\n  return x + 1;\n}`;
          } else if (r < 0.95) {
            kind = pick(['email', 'phone', 'color']);
            text =
              kind === 'email'
                ? `person${i}@example.com`
                : kind === 'phone'
                  ? `+1 415 555 ${String(i % 10000).padStart(4, '0')}`
                  : `#${((i * 2654435761) % 0xffffff).toString(16).padStart(6, '0')}`;
          } else {
            kind = 'image';
            text = `photo-${i}.png`;
          }
          if (kind === 'text' && garlicLeft > 0 && i >= nextGarlic) {
            text = `${text} garlic`;
            garlicLeft--;
            nextGarlic += garlicEvery;
          }
          const createdAt = now - Math.floor(rand() * 90 * 86_400_000);
          const clip: Record<string, unknown> = {
            id: `clip-${i}`,
            createdAt,
            lastUsedAt: createdAt,
            useCount: 0,
            kind,
            text,
            title: text.slice(0, 60),
            source: { url: `https://site${Math.floor(rand() * 200)}.test/page`, title: `Page ${Math.floor(rand() * 200)}` },
            pinned: 0,
            hash: `h-${i}`,
            collectionId: rand() < 0.7 ? `col-${Math.floor(rand() * 8)}` : undefined,
          };
          if (kind === 'image') {
            clip.image = { imageId: `img-${i}`, mime: 'image/png', width: 220, height: 220, bytes: full.size, thumb };
            images.push({ id: `img-${i}`, blob: full });
          }
          clips.push(clip);
        }
        const tx = db.transaction(['clips', 'images', 'collections'], 'readwrite');
        for (const c of collections) tx.objectStore('collections').put(c);
        for (const c of clips) tx.objectStore('clips').put(c);
        for (const im of images) tx.objectStore('images').put(im);
        await new Promise((res, rej) => {
          tx.oncomplete = res;
          tx.onerror = () => rej(tx.error);
        });
        const count: number = await new Promise((res) => {
          const r = db.transaction('clips').objectStore('clips').count();
          r.onsuccess = () => res(r.result);
        });
        const withGarlic = clips.filter((c) => /\bgarlic\b/.test((c as { text: string }).text)).length;
        db.close();
        return { count, withGarlic, images: images.length, fullBytes: full.size, thumbBytes: thumb.size };
      },
      { size, garlic: GARLIC },
    );
    expect(seeded.count).toBe(size);
    expect(seeded.withGarlic).toBe(GARLIC);

    const list = panel.getByRole('list', { name: 'Clips' });
    const result: Record<string, unknown> = { size, seeded };
    const open: number[] = [];
    const rows: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      await panel.goto(url);
      await list.getByRole('listitem').first().waitFor();
      open.push(await panel.evaluate(() => performance.now()));
      rows.push(await list.getByRole('listitem').count());
    }
    result.panelOpenMs = summary(open);
    const reads: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      reads.push(
        await panel.evaluate(async () => {
          const t = performance.now();
          const db: IDBDatabase = await new Promise((res) => {
            const r = indexedDB.open('clipboard');
            r.onsuccess = () => res(r.result);
          });
          await new Promise((res) => {
            const r = db.transaction('clips').objectStore('clips').getAll();
            r.onsuccess = () => res(r.result.length);
          });
          db.close();
          return performance.now() - t;
        }),
      );
    }
    result.readAllMs = summary(reads);
    result.rowsRendered = rows[0];
    result.heapMB = Math.round(
      (await panel.evaluate(() => (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize)) /
        1e6,
    );

    const search = panel.getByRole('searchbox', { name: 'Search your clips' });
    const typed: number[] = [];
    const cleared: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      let t = Date.now();
      await search.fill('garlic');
      await expect(panel.getByText(`${GARLIC} clips match`)).toBeVisible({ timeout: 60_000 });
      typed.push(Date.now() - t);
      t = Date.now();
      await search.fill('');
      await expect(panel.getByText(`${GARLIC} clips match`)).toHaveCount(0, { timeout: 60_000 });
      await list
        .getByRole('listitem')
        .nth(Math.min(size, rows[0]!) - 1)
        .waitFor({ timeout: 60_000 });
      cleared.push(Date.now() - t);
    }
    result.searchMs = summary(typed);
    result.clearSearchMs = summary(cleared);

    const page = await context.newPage();
    await page.goto('https://bench.e2e.test/');
    const tabId = await panel.evaluate(async () => (await chrome.tabs.query({ url: 'https://bench.e2e.test/*' }))[0]!.id!);
    const qp: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      await page.bringToFront();
      await page.locator('#field').click();
      const t = Date.now();
      void panel.evaluate((id) => chrome.runtime.sendMessage({ type: 'e2e-command', command: 'quick-paste', tabId: id }), tabId);
      await page.getByRole('option').first().waitFor({ timeout: 60_000 });
      qp.push(Date.now() - t);
      expect(await page.getByRole('option').count()).toBeLessThanOrEqual(50);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Quick paste' })).toHaveCount(0);
    }
    result.quickPasteMs = summary(qp);

    await panel.bringToFront();
    const saves: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const text = `Bench save ${size} ${i}`;
      const t = Date.now();
      await pasteIntoPanel(panel, text);
      await list.getByRole('listitem').filter({ hasText: text }).first().waitFor({ timeout: 60_000 });
      saves.push(Date.now() - t);
    }
    result.saveMs = summary(saves);

    fs.appendFileSync(OUT, JSON.stringify(result) + '\n');
    console.log('RESULT', JSON.stringify(result));
  });
}
