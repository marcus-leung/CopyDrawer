import { beforeEach, describe, expect, it } from 'vitest';
import { stubImageDecoding } from './imageStubs';
import { backupDue } from '@/lib/backup';

beforeEach(stubImageDecoding);

const DAY = 86_400_000;
const now = 100 * DAY;
const due = { backupReminder: true, backupRemindAfter: now - DAY };

describe('backupDue: when the home screen reminds you to export', () => {
  it('reminds once it is time and there are 50 or more clips', () => {
    expect(backupDue(due, 50, now)).toBe(true);
    expect(backupDue({ ...due, backupRemindAfter: now }, 500, now)).toBe(true);
  });

  it('stays quiet otherwise', () => {
    expect(backupDue(due, 49, now)).toBe(false);
    expect(backupDue({ ...due, backupReminder: false }, 500, now)).toBe(false);
    expect(backupDue({ ...due, backupRemindAfter: now + DAY }, 500, now)).toBe(false);
    expect(backupDue({ ...due, backupRemindAfter: 0 }, 500, now)).toBe(false);
  });
});

describe('export file', () => {
  const ADD = { lastUsedAt: 1, useCount: 0 };

  async function sampleDb() {
    const { ClipDatabase } = await import('@/lib/db');
    const db = new ClipDatabase(`test-${crypto.randomUUID()}`);
    await db.open();
    await db.collections.add({
      id: 'col',
      key: 'manual:col',
      name: 'Recipes',
      color: 'green',
      kind: 'manual',
      createdAt: 1,
      order: 0,
    });
    await db.clips.add({
      ...ADD,
      id: 'pin',
      createdAt: 3,
      kind: 'text',
      text: 'Lemon pasta\nwith garlic',
      title: 'Lemon pasta',
      pinned: 1,
      hash: 'h1',
      collectionId: 'col',
    });
    await db.clips.add({
      ...ADD,
      id: 'evil',
      createdAt: 2,
      kind: 'text',
      text: '<script>alert(1)</script>',
      title: '<b>bold</b>',
      pinned: 0,
      hash: 'h2',
      source: { url: 'javascript:alert(1)', title: 'x' },
    });
    await db.images.put({ id: 'img1', blob: new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: 'image/png' }) });
    await db.clips.add({
      ...ADD,
      id: 'pic',
      createdAt: 1,
      kind: 'image',
      text: 'dog.png',
      title: 'dog.png',
      pinned: 0,
      hash: 'img:1',
      note: 'Our dog',
      image: {
        imageId: 'img1',
        mime: 'image/png',
        width: 1,
        height: 1,
        bytes: 7,
        thumb: new Blob(['t'], { type: 'image/webp' }),
      },
    });
    return db;
  }

  it('is a zip with a readable page, tidy JSON and real image files', async () => {
    const { unzipSync, strFromU8 } = await import('fflate');
    const { exportZip } = await import('@/lib/backup');
    const zip = await exportZip(await sampleDb());
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(['clips.html', 'clips.json', 'images/1.png']);

    const json = strFromU8(files['clips.json']!);
    expect(json).toContain('\n  "clips": [');
    expect(JSON.parse(json).version).toBe(2);
    expect([...files['images/1.png']!]).toEqual([137, 80, 78, 71, 1, 2, 3]);

    const html = strFromU8(files['clips.html']!);
    expect(html).toContain('Recipes');
    expect(html).toContain('Lemon pasta\nwith garlic');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(html).not.toMatch(/<script|javascript:/i);
    expect(html).toContain('src="images/1.png"');
    expect(html).toContain('Our dog');
  });

  it('imports the zip back, and still imports old .json exports', async () => {
    const { exportZip, importFile } = await import('@/lib/backup');
    const { ClipDatabase } = await import('@/lib/db');
    const zip = await exportZip(await sampleDb());
    const other = new ClipDatabase(`test-${crypto.randomUUID()}`);
    await other.open();
    expect(await importFile(zip, other)).toEqual({ added: 3, skipped: 0 });
    const clips = await other.clips.toArray();
    const pinned = clips.find((c) => c.text.startsWith('Lemon'))!;
    expect(pinned.pinned).toBe(1);
    expect((await other.collections.get(pinned.collectionId!))?.name).toBe('Recipes');
    const pic = clips.find((c) => c.kind === 'image')!;
    expect(pic.note).toBe('Our dog');
    expect([...new Uint8Array(await (await other.images.get(pic.image!.imageId))!.blob.arrayBuffer())]).toEqual([
      137, 80, 78, 71, 1, 2, 3,
    ]);

    const v1 = {
      app: 'clipboard-extension',
      version: 1,
      collections: [],
      clips: [{ id: 'old', kind: 'text', text: 'From an old export', title: 'old', hash: 'x', createdAt: 1, pinned: 0 }],
    };
    expect(await importFile(new Blob([JSON.stringify(v1)], { type: 'application/json' }), other)).toEqual({
      added: 1,
      skipped: 0,
    });
  });

  it('says so when a file is not an export', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const { importFile } = await import('@/lib/backup');
    const { ClipDatabase } = await import('@/lib/db');
    const db = new ClipDatabase(`test-${crypto.randomUUID()}`);
    await db.open();
    await expect(importFile(new Blob([zipSync({ 'notes.txt': strToU8('hi') }).slice()]), db)).rejects.toThrow(
      "isn't a Clipboard export",
    );
    await expect(importFile(new Blob(['{"a":1}']), db)).rejects.toThrow("isn't a Clipboard export");
    await expect(importFile(new Blob(['not json']), db)).rejects.toThrow("isn't a Clipboard export");
  });
});

describe('clips.html', () => {
  it('links web links only, and does not repeat a title that is the whole clip', async () => {
    const { renderBackupPage } = await import('@/lib/backupPage');
    const base = { id: 'x', createdAt: 1, lastUsedAt: 1, useCount: 0, pinned: 0 as const, hash: 'h' };
    const html = renderBackupPage({
      app: 'clipboard-extension',
      version: 2,
      exportedAt: new Date(0).toISOString(),
      collections: [],
      clips: [
        { ...base, kind: 'link', text: 'https://example.com/a?b=1&c=2', title: 'example.com/a' },
        { ...base, kind: 'link', text: 'javascript:alert(1)', title: 'bad' },
        { ...base, kind: 'text', text: 'Short note', title: 'Short note' },
      ],
    });
    expect(html).toContain('<a href="https://example.com/a?b=1&amp;c=2">');
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html.match(/Short note/g)).toHaveLength(1);
  });
});

describe('import tells you what it could not take', () => {
  const newDb = async () => {
    const { ClipDatabase } = await import('@/lib/db');
    const db = new ClipDatabase(`test-${crypto.randomUUID()}`);
    await db.open();
    return db;
  };
  const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
  const imageClip = (id: string, data: string, thumb = data) => ({
    id,
    kind: 'image',
    text: '',
    title: id,
    hash: `img:${id}`,
    createdAt: 1,
    pinned: 0,
    image: { imageId: id, mime: 'image/png', width: 1, height: 1, bytes: 10, thumb, data },
  });
  const v2 = (clips: object[]) => ({
    app: 'clipboard-extension',
    version: 2,
    exportedAt: new Date(0).toISOString(),
    collections: [],
    clips,
  });

  it('finds clips.json in a re-zipped folder', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const { importFile } = await import('@/lib/backup');
    const zip = zipSync({
      'clipboard-export-2026-10-11/clips.json': strToU8(
        JSON.stringify(v2([imageClip('a', 'images/1.png', '.thumbnails/1.png')])),
      ),
      'clipboard-export-2026-10-11/images/1.png': PNG,
      'clipboard-export-2026-10-11/.thumbnails/1.png': PNG,
    });
    expect(await importFile(new Blob([zip.slice()]), await newDb())).toEqual({ added: 1, skipped: 0 });
  });

  it('asks for the whole .zip when given its clips.json alone', async () => {
    const { importFile } = await import('@/lib/backup');
    await expect(importFile(new Blob([JSON.stringify(v2([]))]), await newDb())).rejects.toThrow('Import the whole .zip instead');
  });

  it('counts images it had to skip: missing, not an image, or too big', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const { importFile } = await import('@/lib/backup');
    const big = new Uint8Array(21 * 1024 * 1024);
    big.set(PNG);
    const zip = zipSync({
      'clips.json': strToU8(
        JSON.stringify(
          v2([
            imageClip('ok', 'images/1.png', '.thumbnails/1.png'),
            imageClip('gone', 'images/2.png', '.thumbnails/2.png'),
            {
              ...imageClip('svg', 'data:image/svg+xml,%3Csvg%2F%3E'),
              image: {
                ...imageClip('svg', '').image,
                data: 'data:image/svg+xml,%3Csvg%2F%3E',
                thumb: 'data:image/svg+xml,%3Csvg%2F%3E',
              },
            },
            imageClip('huge', 'images/3.png', '.thumbnails/1.png'),
          ]),
        ),
      ),
      'images/1.png': PNG,
      '.thumbnails/1.png': PNG,
      'images/3.png': big,
    });
    const db = await newDb();
    expect(await importFile(new Blob([zip.slice()]), db)).toEqual({ added: 1, skipped: 3 });
    const [kept] = await db.clips.toArray();
    // The hash comes from the bytes, not from the file.
    expect(kept!.hash).not.toBe('img:ok');
  });

  it('never puts clip ids into zip paths, and replaces odd ids on import', async () => {
    const { unzipSync } = await import('fflate');
    const { exportZip, importFile } = await import('@/lib/backup');
    const db = await newDb();
    await importFile(
      new Blob([
        JSON.stringify({
          app: 'clipboard-extension',
          version: 1,
          collections: [],
          clips: [{ id: '../../x', kind: 'text', text: 'hi', title: 'hi', hash: 'h', createdAt: 1, pinned: 0 }],
        }),
      ]),
      db,
    );
    const [clip] = await db.clips.toArray();
    expect(clip!.id).not.toContain('/');
    await db.images.put({ id: 'img', blob: new Blob([PNG], { type: 'image/png' }) });
    await db.clips.add({
      id: '../../y',
      createdAt: 2,
      lastUsedAt: 2,
      useCount: 0,
      kind: 'image',
      text: '',
      title: 'y',
      pinned: 0,
      hash: 'img:y',
      image: {
        imageId: 'img',
        mime: 'image/png',
        width: 1,
        height: 1,
        bytes: 10,
        thumb: new Blob(['t'], { type: 'image/webp' }),
      },
    });
    const names = Object.keys(unzipSync(new Uint8Array(await (await exportZip(db)).arrayBuffer())));
    expect(names.filter((n) => n.includes('..'))).toEqual([]);
  });
});

describe('import rebuilds images instead of trusting the file', () => {
  it('skips bytes that are not an image, and makes its own preview and size', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const { importFile } = await import('@/lib/backup');
    const { ClipDatabase } = await import('@/lib/db');
    const db = new ClipDatabase(`test-${crypto.randomUUID()}`);
    await db.open();
    const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    const clip = (id: string, data: string, thumb?: string) => ({
      id,
      kind: 'image',
      text: '',
      title: id,
      hash: 'x',
      createdAt: 1,
      pinned: 0,
      image: { imageId: id, mime: 'image/png', width: 9999, height: -5, bytes: 1, data, thumb },
    });
    const zip = zipSync({
      'clips.json': strToU8(
        JSON.stringify({
          app: 'clipboard-extension',
          version: 2,
          exportedAt: new Date(0).toISOString(),
          collections: [],
          clips: [clip('real', 'images/1.png', '.thumbnails/1.png'), clip('fake', 'images/2.png')],
        }),
      ),
      'images/1.png': PNG,
      '.thumbnails/1.png': strToU8('<script>alert(1)</script>'),
      'images/2.png': strToU8('<html>not a picture</html>'),
    });
    expect(await importFile(new Blob([zip.slice()]), db)).toEqual({ added: 1, skipped: 1 });
    const [kept] = await db.clips.toArray();
    expect(kept!.image).toMatchObject({ width: 2, height: 3, mime: 'image/png', bytes: PNG.length });
    expect(kept!.image!.thumb.type).toBe('image/webp');
    expect(await kept!.image!.thumb.text()).toBe('thumb');
  });
});
