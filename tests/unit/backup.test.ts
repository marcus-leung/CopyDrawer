import { describe, expect, it } from 'vitest';
import { backupDue } from '@/lib/backup';

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
    expect(Object.keys(files).sort()).toEqual(['.thumbnails/pic.webp', 'clips.html', 'clips.json', 'images/pic.png']);

    const json = strFromU8(files['clips.json']!);
    expect(json).toContain('\n  "clips": [');
    expect(JSON.parse(json).version).toBe(2);
    expect([...files['images/pic.png']!]).toEqual([137, 80, 78, 71, 1, 2, 3]);

    const html = strFromU8(files['clips.html']!);
    expect(html).toContain('Recipes');
    expect(html).toContain('Lemon pasta\nwith garlic');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(html).not.toMatch(/<script|javascript:/i);
    expect(html).toContain('src="images/pic.png"');
    expect(html).toContain('Our dog');
  });

  it('imports the zip back, and still imports old .json exports', async () => {
    const { exportZip, importFile } = await import('@/lib/backup');
    const { ClipDatabase } = await import('@/lib/db');
    const zip = await exportZip(await sampleDb());
    const other = new ClipDatabase(`test-${crypto.randomUUID()}`);
    await other.open();
    expect(await importFile(zip, other)).toBe(3);
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
    expect(await importFile(new Blob([JSON.stringify(v1)], { type: 'application/json' }), other)).toBe(1);
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
