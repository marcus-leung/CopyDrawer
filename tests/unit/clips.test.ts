import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { ClipDatabase } from '@/lib/db';
import {
  deleteClip,
  deleteOlderThan,
  detectKind,
  enforceLimit,
  hashText,
  listClips,
  makeTitle,
  markUsed,
  matchesQuery,
  restoreClip,
  saveClip,
  togglePin,
} from '@/lib/clips';

let db: ClipDatabase;

beforeEach(async () => {
  db = new ClipDatabase(`test-${crypto.randomUUID()}`);
  await db.open();
});

describe('detectKind and makeTitle', () => {
  it('recognises links and titles them by host and path', () => {
    expect(detectKind('https://www.airbnb.com/rooms/48213377')).toBe('link');
    expect(makeTitle('https://www.airbnb.com/rooms/48213377', 'link')).toBe('airbnb.com/rooms/48213377');
  });

  it('recognises multi-line code', () => {
    expect(detectKind('SELECT *\nFROM orders o;')).toBe('code');
    expect(detectKind('just a sentence')).toBe('text');
  });

  it('uses the first non-empty line, truncated', () => {
    const long = `\n\n${'a'.repeat(120)}\nsecond`;
    const title = makeTitle(long, 'text');
    expect(title.length).toBe(80);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('saveClip', () => {
  it('ignores empty text', async () => {
    expect(await saveClip({ text: '   ' }, db)).toBeNull();
    expect(await db.clips.count()).toBe(0);
  });

  it('stores text with its source', async () => {
    const clip = await saveClip({ text: 'Hello world', source: { url: 'https://example.com', title: 'Example' } }, db);
    expect(clip?.title).toBe('Hello world');
    expect((await db.clips.get(clip!.id))?.source?.url).toBe('https://example.com');
  });

  it('merges exact duplicates (ignoring whitespace) and moves them to the top', async () => {
    const a = await saveClip({ text: 'Same  text' }, db);
    await saveClip({ text: 'Other' }, db);
    const again = await saveClip({ text: 'Same text\n' }, db);
    expect(again?.id).toBe(a?.id);
    expect(await db.clips.count()).toBe(2);
    expect((await listClips(db))[0]?.id).toBe(a?.id);
    expect(hashText('Same  text')).toBe(hashText('Same text'));
  });
});

describe('limits and retention', () => {
  it('drops the oldest unpinned clips first and keeps pins', async () => {
    const first = await saveClip({ text: 'first' }, db);
    await togglePin(first!.id, db);
    await saveClip({ text: 'second' }, db);
    await saveClip({ text: 'third' }, db);
    const removed = await enforceLimit(db, 2);
    expect(removed).toBe(1);
    const texts = (await listClips(db)).map((c) => c.text);
    expect(texts).toEqual(['first', 'third']);
  });

  it('deletes unpinned clips older than the retention window', async () => {
    const old = await saveClip({ text: 'old' }, db);
    const keep = await saveClip({ text: 'old but pinned' }, db);
    await db.clips.update(old!.id, { createdAt: Date.now() - 40 * 86_400_000 });
    await db.clips.update(keep!.id, { createdAt: Date.now() - 40 * 86_400_000, pinned: 1 });
    await saveClip({ text: 'new' }, db);
    expect(await deleteOlderThan(30, db)).toBe(1);
    expect(await deleteOlderThan(0, db)).toBe(0);
    expect(await db.clips.count()).toBe(2);
  });
});

describe('list, search, pin, use, delete', () => {
  it('lists pinned clips first, then newest first', async () => {
    const a = await saveClip({ text: 'a' }, db);
    await saveClip({ text: 'b' }, db);
    await togglePin(a!.id, db);
    expect((await listClips(db)).map((c) => c.text)).toEqual(['a', 'b']);
  });

  it('matches every word against text, title and source', async () => {
    const clip = (await saveClip({ text: 'Lemon garlic pasta', source: { title: 'NYT Cooking' } }, db))!;
    expect(matchesQuery(clip, 'garlic lemon')).toBe(true);
    expect(matchesQuery(clip, 'cooking')).toBe(true);
    expect(matchesQuery(clip, 'pizza')).toBe(false);
    expect(matchesQuery(clip, '  ')).toBe(true);
  });

  it('counts uses', async () => {
    const clip = (await saveClip({ text: 'x' }, db))!;
    await markUsed(clip.id, db);
    await markUsed(clip.id, db);
    expect((await db.clips.get(clip.id))?.useCount).toBe(2);
  });

  it('deletes and restores a clip', async () => {
    const clip = (await saveClip({ text: 'undo me' }, db))!;
    const removed = await deleteClip(clip.id, db);
    expect(await db.clips.count()).toBe(0);
    await restoreClip(removed!, db);
    expect((await db.clips.get(clip.id))?.text).toBe('undo me');
  });
});

describe('backup', () => {
  it('exports and imports clips, images and collections without duplicates', async () => {
    const { exportBackup, importBackup } = await import('@/lib/backup');
    const { saveClip: save } = await import('@/lib/clips');
    await save({ text: 'Photosynthesis', source: { url: 'https://en.wikipedia.org/wiki/P' } }, db);
    await save({ text: 'just a note' }, db);
    await db.images.put({ id: 'img1', blob: new Blob(['png-bytes'], { type: 'image/png' }) });
    await db.clips.add({
      id: 'c-img',
      createdAt: 1,
      lastUsedAt: 1,
      useCount: 0,
      kind: 'image',
      text: '',
      title: 'pic.png',
      pinned: 0,
      hash: 'img:1',
      image: {
        imageId: 'img1',
        mime: 'image/png',
        width: 1,
        height: 1,
        bytes: 9,
        thumb: new Blob(['t'], { type: 'image/webp' }),
      },
    });
    const file = JSON.parse(JSON.stringify(await exportBackup(db)));
    expect(file.clips).toHaveLength(3);

    const other = new ClipDatabase(`test-${crypto.randomUUID()}`);
    await other.open();
    expect(await importBackup(file, other)).toBe(3);
    expect(await importBackup(file, other)).toBe(0);
    const research = (await other.clips.toArray()).find((c) => c.text === 'Photosynthesis')!;
    expect((await other.collections.get(research.collectionId!))?.name).toBe('Research');
    const img = (await other.clips.toArray()).find((c) => c.kind === 'image')!;
    expect(await (await other.images.get(img.image!.imageId))!.blob.text()).toBe('png-bytes');
    await expect(importBackup({ nope: 1 }, other)).rejects.toThrow("isn't a Clipboard export");
  });

  it('skips broken clips one by one and repairs missing or odd fields', async () => {
    const { importBackup } = await import('@/lib/backup');
    const now = Date.now();
    const file = {
      app: 'clipboard-extension',
      version: 1,
      clips: [
        null,
        { id: 'ghost', kind: 'image', text: '', hash: 'img:ghost', title: 'no file' },
        {
          id: 'bad-img',
          kind: 'image',
          text: '',
          hash: 'img:bad',
          title: 'bad data',
          image: { imageId: 'x', mime: 'image/png', width: 1, height: 1, bytes: 1, thumb: 'data:,@@@', data: 'data:,@@@' },
        },
        { id: 'weird-kind', kind: 'video', text: 'a video?', hash: 'h1' },
        { kind: 'text', text: 'no id, no dates', hash: 'wrong' },
        { id: 'future', kind: 'text', text: 'from the future', hash: 'h2', title: 'future', createdAt: now + 1e12 },
      ],
    };
    expect(await importBackup(file, db)).toBe(2);
    const clips = await db.clips.toArray();
    expect(clips.map((c) => c.text).sort()).toEqual(['from the future', 'no id, no dates']);
    const plain = clips.find((c) => c.text === 'no id, no dates')!;
    expect(plain.id).toBeTruthy();
    expect(plain.title).toBe('no id, no dates');
    expect(plain.hash).toBe(hashText('no id, no dates'));
    expect(plain.useCount).toBe(0);
    expect(plain.createdAt).toBeGreaterThanOrEqual(now);
    expect(clips.find((c) => c.text === 'from the future')!.createdAt).toBeLessThanOrEqual(Date.now());
    expect(await listClips(db)).toHaveLength(2);
  });
});

describe('editClip', () => {
  it('edits text and title, re-sorts, and keeps user choices', async () => {
    const { editClip } = await import('@/lib/clips');
    const c = (await saveClip({ text: 'just a note', html: '<b>just</b> a note' }, db))!;

    // New text: new title, type, hash; formatting dropped; sorted by the rules.
    expect(await editClip(c.id, { text: 'SELECT id FROM orders WHERE total > 10' }, db)).toBe(true);
    let e = (await db.clips.get(c.id))!;
    expect(e).toMatchObject({
      kind: 'code',
      title: 'SELECT id FROM orders WHERE total > 10',
      html: undefined,
    });
    expect(e.hash).toBe(hashText('SELECT id FROM orders WHERE total > 10'));
    expect((await db.collections.get(e.collectionId!))?.name).toBe('Code');

    // A user title sticks when the text changes again.
    await editClip(c.id, { title: 'Big orders query' }, db);
    await editClip(c.id, { text: 'SELECT id FROM orders WHERE total > 100' }, db);
    e = (await db.clips.get(c.id))!;
    expect(e).toMatchObject({ title: 'Big orders query', titleSource: 'user' });

    // Clearing the title makes one from the text again; empty text is refused.
    await editClip(c.id, { title: '  ' }, db);
    expect((await db.clips.get(c.id))!.title).toBe('SELECT id FROM orders WHERE total > 100');
    expect(await editClip(c.id, { text: '   ' }, db)).toBe(false);
  });

  it('keeps a clip the user placed in its collection', async () => {
    const { editClip } = await import('@/lib/clips');
    const { createCollection, moveClip } = await import('@/lib/collections');
    const c = (await saveClip({ text: 'note' }, db))!;
    const mine = await createCollection('Mine', undefined, db);
    await moveClip(c.id, mine.id, db);
    await editClip(c.id, { text: 'SELECT id FROM orders WHERE total > 10' }, db);
    expect((await db.clips.get(c.id))!.collectionId).toBe(mine.id);
  });
});

describe('settings sync', () => {
  it('only accepts well-formed values from other computers', async () => {
    const { validSynced } = await import('@/lib/settings');
    expect(
      validSynced({
        theme: 'dark',
        font: 'mono',
        textSize: 115,
        popupSize: 'large',
        retentionDays: 30,
        blockedSites: ['a.com', 5],
        smartModel: false,
        saveInIncognito: 'yes',
        autoSave: true,
      }),
    ).toEqual({
      theme: 'dark',
      font: 'mono',
      textSize: 115,
      popupSize: 'large',
      retentionDays: 30,
      blockedSites: ['a.com'],
    });
    expect(validSynced({ font: 'comic', textSize: 200, popupSize: 'huge' })).toEqual({});
    expect(validSynced({ theme: 'neon', retentionDays: 7 })).toEqual({});
    expect(validSynced(null)).toEqual({});
  });
});

describe('database upgrade', () => {
  it('drops search vectors and AI titles saved by earlier versions', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(3).stores({
      clips: 'id, createdAt, lastUsedAt, pinned, kind, hash, collectionId, embeddingModel',
      images: 'id',
      collections: 'id, &key, order',
    });
    await old
      .table('clips')
      .add({ id: 'a', createdAt: 1, text: 'hi', titleSource: 'ai', embedding: new Float32Array(3), embeddingModel: 'm' });
    old.close();

    const upgraded = new ClipDatabase(name);
    const clip = (await upgraded.clips.get('a')) as unknown as Record<string, unknown>;
    expect(clip.text).toBe('hi');
    expect(clip.titleSource).toBe('heuristic');
    expect('embedding' in clip || 'embeddingModel' in clip).toBe(false);
  });
});

describe('images and colors strip order', () => {
  it('moves a clip before another and keeps new clips first', async () => {
    const { moveInStrip, stripRank } = await import('@/lib/clips');
    for (const t of ['#111111', '#222222', '#333333']) await saveClip({ text: t }, db);
    const order = async () => (await db.clips.toArray()).sort((a, b) => stripRank(b) - stripRank(a)).map((c) => c.text);
    expect(await order()).toEqual(['#333333', '#222222', '#111111']);

    const strip = (await db.clips.toArray()).sort((a, b) => stripRank(b) - stripRank(a));
    const oldest = strip.find((c) => c.text === '#111111')!;
    await moveInStrip(oldest.id, strip[0]!.id, strip, db);
    expect(await order()).toEqual(['#111111', '#333333', '#222222']);

    await saveClip({ text: '#444444' }, db);
    expect((await order())[0]).toBe('#444444');
  });
});

describe('image notes', () => {
  const image = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    createdAt: Date.now(),
    lastUsedAt: 0,
    useCount: 0,
    kind: 'image' as const,
    text: '',
    title: `${id}.png`,
    pinned: 0 as const,
    hash: `img:${id}`,
    ...extra,
  });

  it('sets, searches and clears a note on an image only', async () => {
    const { editClip } = await import('@/lib/clips');
    const { searchClips } = await import('@/lib/search');
    await db.clips.add(image('chart'));
    expect(await editClip('chart', { note: '  Q3 revenue slide for Monday  ' }, db)).toBe(true);
    const clip = (await db.clips.get('chart'))!;
    expect(clip.note).toBe('Q3 revenue slide for Monday');
    expect(matchesQuery(clip, 'revenue monday')).toBe(true);
    expect(searchClips('revenu', [clip], { kind: 'any', site: 'any', date: 'any', sort: 'newest' })).toHaveLength(1);

    await editClip('chart', { note: '   ' }, db);
    expect((await db.clips.get('chart'))!.note).toBeUndefined();

    const text = (await saveClip({ text: 'plain text' }, db))!;
    await editClip(text.id, { note: 'ignored' }, db);
    expect((await db.clips.get(text.id))!.note).toBeUndefined();
  });

  it('imports a note only when it is text on an image', async () => {
    const { importBackup } = await import('@/lib/backup');
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const img = { mime: 'image/png', width: 1, height: 1, bytes: 8, thumb: png, data: png };
    await importBackup(
      {
        app: 'clipboard-extension',
        version: 1,
        clips: [
          image('kept', { note: 'Logo idea', image: img }),
          image('odd', { note: 42, image: img, hash: 'img:odd' }),
          { kind: 'text', text: 'a text clip', hash: 'x', note: 'not for text' },
        ],
      },
      db,
    );
    const byId = async (id: string) => (await db.clips.get(id))?.note;
    expect(await byId('kept')).toBe('Logo idea');
    expect(await byId('odd')).toBeUndefined();
    expect((await db.clips.toArray()).find((c) => c.kind === 'text')!.note).toBeUndefined();
  });
});
