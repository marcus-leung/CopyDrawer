import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { ClipDatabase } from '@/lib/db';
import { saveClip } from '@/lib/clips';
import { classifyByRules, detectDestination } from '@/lib/classify';
import {
  COLORS,
  PRESET_COLORS,
  colorOf,
  createCollection,
  deleteCollection,
  listCollections,
  moveClip,
  moveClips,
  setCollectionOrder,
  renameCollection,
} from '@/lib/collections';

let db: ClipDatabase;
beforeEach(async () => {
  db = new ClipDatabase(`test-${crypto.randomUUID()}`);
  await db.open();
});

const clip = (text: string, url?: string, kind: 'text' | 'link' | 'code' = 'text') => ({
  kind,
  text,
  title: text.slice(0, 40),
  source: url ? { url } : undefined,
});

describe('classifyByRules', () => {
  it('sorts by the site a clip came from', () => {
    expect(classifyByRules(clip('Photosynthesis is the process…', 'https://en.wikipedia.org/wiki/Photosynthesis'))).toBe(
      'research',
    );
    expect(classifyByRules(clip('Trail running shoes, size 10', 'https://www.rei.com/product/123'))).toBe('shopping');
    expect(classifyByRules(clip('Lemon garlic pasta', 'https://cooking.nytimes.com/recipes/1'))).toBe('recipes');
    expect(classifyByRules(clip('Gion studio, ¥12,000 a night', 'https://www.airbnb.com/rooms/1'))).toBe('travel');
    expect(classifyByRules(clip('git rebase -i HEAD~3', 'https://stackoverflow.com/q/1'))).toBe('code');
  });

  it('sorts by content when the site is unknown', () => {
    expect(classifyByRules(clip('2 cups flour, 1 tbsp sugar. Preheat the oven to 200C.'))).toBe('recipes');
    expect(classifyByRules(clip('Flight TP 1355 LHR to LIS, departure 07:40, check-in opens 2h before'))).toBe('travel');
    expect(classifyByRules(clip('alex.morgan@example.com'))).toBe('personal');
    expect(classifyByRules(clip('Nishiki Market food tour on Sat 18 Oct in Kyoto. Tickets ¥4,000 each.'))).toBe('travel');
    expect(classifyByRules(clip('221B Baker Street, London NW1 6XE'))).toBe('personal');
    expect(classifyByRules(clip('https://example.com/article', undefined, 'link'))).toBe('links');
    expect(classifyByRules(clip('const x = 1;\nexport default x;', undefined, 'code'))).toBe('code');
  });

  it('leaves ordinary text unsorted for the AI to handle', () => {
    expect(classifyByRules(clip('Remember to call grandma on Sunday'))).toBeUndefined();
  });
});

describe('detectDestination', () => {
  it('finds the most mentioned city and maps neighborhoods to it', () => {
    expect(detectDestination('Loft in Gion, Kyoto. Walk to Higashiyama.')).toBe('Kyoto');
    expect(detectDestination('Cheap flights to Tokyo and a day in Kyoto, Tokyo again')).toBe('Tokyo');
    expect(detectDestination('A nice sunny day')).toBeUndefined();
  });
});

describe('collections', () => {
  it('creates smart collections and named trips as clips are saved', async () => {
    await saveClip({ text: 'Photosynthesis definition', source: { url: 'https://en.wikipedia.org/wiki/P' } }, db);
    await saveClip({ text: 'Loft in Gion, Kyoto. ¥15,000 a night', source: { url: 'https://www.airbnb.com/rooms/9' } }, db);
    await saveClip({ text: 'Higashiyama studio in Kyoto', source: { url: 'https://www.booking.com/hotel/jp/x' } }, db);
    await saveClip({ text: 'just a note to self' }, db);

    const list = await listCollections(db);
    // In the order they appeared, not by size.
    expect(list.map((s) => [s.collection.name, s.count])).toEqual([
      ['Research', 1],
      ['Kyoto trip', 2],
    ]);
    expect(list[1]?.collection.color).toBe('mustard');
    expect(list[1]?.newCount).toBe(2);
  });

  it('puts travel clips without a city in the trip being planned', async () => {
    await saveClip({ text: 'Loft in Gion, Kyoto. ¥15,000 a night', source: { url: 'https://www.airbnb.com/rooms/9' } }, db);
    const c = (await saveClip({ text: 'Flight TP 1355, departure 07:40, check-in opens 05:40' }, db))!;
    const col = await db.collections.get((await db.clips.get(c.id))!.collectionId!);
    expect(col?.name).toBe('Kyoto trip');
    // With no trip in the last two weeks, it goes to Travel.
    const db2 = new ClipDatabase(`test-${crypto.randomUUID()}`);
    const c2 = (await saveClip({ text: 'Flight TP 1355, departure 07:40, check-in opens 05:40' }, db2))!;
    expect((await db2.collections.get((await db2.clips.get(c2.id))!.collectionId!))?.name).toBe('Travel');
  });

  it('keeps clips where the user moved them', async () => {
    const c = (await saveClip({ text: 'Photosynthesis', source: { url: 'https://en.wikipedia.org/wiki/P' } }, db))!;
    const mine = await createCollection('Biology essay', undefined, db);
    await moveClip(c.id, mine.id, db);
    // Saving the same text again must not move it back.
    await saveClip({ text: 'Photosynthesis', source: { url: 'https://en.wikipedia.org/wiki/P' } }, db);
    expect((await db.clips.get(c.id))?.collectionId).toBe(mine.id);
    await renameCollection(mine.id, 'Bio essay', db);
    expect((await db.collections.get(mine.id))?.name).toBe('Bio essay');
  });

  it('moves several clips at once and keeps them there', async () => {
    const mine = await createCollection('Trip', undefined, db);
    const a = (await saveClip({ text: 'Hotel Gion' }, db))!;
    const b = (await saveClip({ text: 'Flight TP 1351' }, db))!;
    await moveClips([a.id, b.id], mine.id, db);
    const moved = await db.clips.bulkGet([a.id, b.id]);
    expect(moved.map((c) => [c?.collectionId, c?.collectionLocked])).toEqual([
      [mine.id, 1],
      [mine.id, 1],
    ]);
    await moveClips([a.id], undefined, db);
    expect((await db.clips.get(a.id))?.collectionId).toBeUndefined();
  });

  it('deleting a collection keeps its clips', async () => {
    const c = (await saveClip({ text: 'Photosynthesis', source: { url: 'https://en.wikipedia.org/wiki/P' } }, db))!;
    const { collectionId } = (await db.clips.get(c.id))!;
    await deleteCollection(collectionId!, db);
    expect((await db.clips.get(c.id))?.collectionId).toBeUndefined();
    expect(await db.clips.count()).toBe(1);
  });
});

describe('collection colors', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  it('makes readable shades for every preset and any custom hue, in light and dark', () => {
    const colors = [...PRESET_COLORS, ...Array.from({ length: 360 }, (_, h) => `hue:${h}`)];
    for (const color of colors) {
      const c = colorOf({ color });
      expect(contrast(c.text, c.tint), `text on tint, ${color}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.accent, '#fff8f0'), `tab on the page, ${color}`).toBeGreaterThanOrEqual(3);
      expect(contrast('#fff1e6', c.tintDark), `dark text on dark tint, ${color}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.accentDark, '#1c1214'), `dark tab, ${color}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps preset colors and falls back to grey for anything unknown', () => {
    expect(colorOf({ color: 'blue' })).toBe(COLORS.blue);
    expect(colorOf({ color: 'hue:999' })).toBe(COLORS.grey);
    expect(colorOf({ color: 'nope' })).toBe(COLORS.grey);
    expect(colorOf({ color: 'hue:200' }).accent).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('collection names', () => {
  it('are capped at 100 characters when created, renamed or imported', async () => {
    const { importBackup } = await import('@/lib/backup');
    const long = 'x'.repeat(150);
    const c = await createCollection(`  ${long}  `, undefined, db);
    expect(c.name).toHaveLength(100);
    await renameCollection(c.id, `${'y'.repeat(150)}`, db);
    expect((await db.collections.get(c.id))!.name).toBe('y'.repeat(100));
    await importBackup(
      {
        app: 'clipboard-extension',
        version: 1,
        collections: [{ id: 'k', key: 'manual:k', name: long, color: 'blue', kind: 'manual', order: 0, createdAt: 1 }],
        clips: [],
      },
      db,
    );
    expect((await db.collections.where('key').equals('manual:k').first())!.name).toHaveLength(100);
  });
});

describe('collection order', () => {
  const names = async () => (await listCollections(db)).map((s) => s.collection.name);

  it('stays put when a later folder gets more clips', async () => {
    const a = await createCollection('A', undefined, db);
    const b = await createCollection('B', undefined, db);
    for (const t of ['one', 'two', 'three']) {
      const c = await saveClip({ text: t }, db);
      await moveClip(c!.id, b.id, db);
    }
    expect(a.order).toBeLessThan(b.order);
    expect(await names()).toEqual(['A', 'B']);
  });

  it('saves the folder order as shown; folders made meanwhile go after', async () => {
    for (const n of ['A', 'B', 'C', 'D']) await createCollection(n, undefined, db);
    const id = async (n: string) => (await listCollections(db)).find((s) => s.collection.name === n)!.collection.id;
    await setCollectionOrder([await id('B'), await id('C'), await id('A'), await id('D')], db);
    expect(await names()).toEqual(['B', 'C', 'A', 'D']);
    await setCollectionOrder([await id('D'), await id('B')], db);
    expect(await names()).toEqual(['D', 'B', 'C', 'A']);
  });

  it('puts a new folder last, even after one was deleted', async () => {
    const a = await createCollection('A', undefined, db);
    await createCollection('B', undefined, db);
    await deleteCollection(a.id, db);
    await createCollection('C', undefined, db);
    expect(await names()).toEqual(['B', 'C']);
  });

  it('keeps the order folders had before the upgrade (most clips first)', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(6).stores({
      clips: 'id, createdAt, lastUsedAt, pinned, kind, hash, collectionId',
      images: 'id',
      collections: 'id, &key, order',
    });
    await old.table('collections').bulkAdd([
      { id: 'few', key: 'manual:few', name: 'Few', color: 'blue', kind: 'manual', order: 0, createdAt: 1 },
      { id: 'many', key: 'manual:many', name: 'Many', color: 'blue', kind: 'manual', order: 1, createdAt: 2 },
    ]);
    await old.table('clips').bulkAdd([
      { id: '1', createdAt: 1, kind: 'text', text: 'a', title: 'a', collectionId: 'many' },
      { id: '2', createdAt: 2, kind: 'text', text: 'b', title: 'b', collectionId: 'many' },
      { id: '3', createdAt: 3, kind: 'text', text: 'c', title: 'c', collectionId: 'few' },
    ]);
    old.close();
    const upgraded = new ClipDatabase(name);
    expect((await listCollections(upgraded)).map((s) => s.collection.name)).toEqual(['Many', 'Few']);
  });
});
