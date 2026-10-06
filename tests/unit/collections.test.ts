import { beforeEach, describe, expect, it } from 'vitest';
import { ClipDatabase } from '@/lib/db';
import { saveClip } from '@/lib/clips';
import { classifyByRules, detectDestination } from '@/lib/classify';
import { createCollection, deleteCollection, listCollections, moveClip, renameCollection } from '@/lib/collections';

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
    expect(classifyByRules(clip('Photosynthesis is the process…', 'https://en.wikipedia.org/wiki/Photosynthesis'))).toBe('research');
    expect(classifyByRules(clip('Trail running shoes, size 10', 'https://www.rei.com/product/123'))).toBe('shopping');
    expect(classifyByRules(clip('Lemon garlic pasta', 'https://cooking.nytimes.com/recipes/1'))).toBe('recipes');
    expect(classifyByRules(clip('Chiado studio, €84 a night', 'https://www.airbnb.com/rooms/1'))).toBe('travel');
    expect(classifyByRules(clip('git rebase -i HEAD~3', 'https://stackoverflow.com/q/1'))).toBe('code');
  });

  it('sorts by content when the site is unknown', () => {
    expect(classifyByRules(clip('2 cups flour, 1 tbsp sugar. Preheat the oven to 200C.'))).toBe('recipes');
    expect(classifyByRules(clip('Flight TP 1355 LHR to LIS, departure 07:40, check-in opens 2h before'))).toBe('travel');
    expect(classifyByRules(clip('alex.morgan@example.com'))).toBe('personal');
    expect(classifyByRules(clip('https://example.com/article', undefined, 'link'))).toBe('links');
    expect(classifyByRules(clip('const x = 1;\nexport default x;', undefined, 'code'))).toBe('code');
  });

  it('leaves ordinary text unsorted for the AI to handle', () => {
    expect(classifyByRules(clip('Remember to call grandma on Sunday'))).toBeUndefined();
  });
});

describe('detectDestination', () => {
  it('finds the most mentioned city and maps neighborhoods to it', () => {
    expect(detectDestination('Loft in Alfama, Lisbon. Walk to Belém.')).toBe('Lisbon');
    expect(detectDestination('Cheap flights to Tokyo and a day in Kyoto, Tokyo again')).toBe('Tokyo');
    expect(detectDestination('A nice sunny day')).toBeUndefined();
  });
});

describe('collections', () => {
  it('creates smart collections and named trips as clips are saved', async () => {
    await saveClip({ text: 'Photosynthesis definition', source: { url: 'https://en.wikipedia.org/wiki/P' } }, db);
    await saveClip({ text: 'Loft in Alfama, Lisbon. €96 a night', source: { url: 'https://www.airbnb.com/rooms/9' } }, db);
    await saveClip({ text: 'Chiado studio in Lisbon', source: { url: 'https://www.booking.com/hotel/pt/x' } }, db);
    await saveClip({ text: 'just a note to self' }, db);

    const list = await listCollections(db);
    expect(list.map((s) => [s.collection.name, s.count])).toEqual([
      ['Lisbon trip', 2],
      ['Research', 1],
    ]);
    expect(list[0]?.collection.color).toBe('mustard');
    expect(list[0]?.newCount).toBe(2);
  });

  it('keeps clips where the user moved them', async () => {
    const c = (await saveClip({ text: 'Photosynthesis', source: { url: 'https://en.wikipedia.org/wiki/P' } }, db))!;
    const mine = await createCollection('Biology essay', db);
    await moveClip(c.id, mine.id, db);
    // Saving the same text again must not move it back.
    await saveClip({ text: 'Photosynthesis', source: { url: 'https://en.wikipedia.org/wiki/P' } }, db);
    expect((await db.clips.get(c.id))?.collectionId).toBe(mine.id);
    await renameCollection(mine.id, 'Bio essay', db);
    expect((await db.collections.get(mine.id))?.name).toBe('Bio essay');
  });

  it('deleting a collection keeps its clips', async () => {
    const c = (await saveClip({ text: 'Photosynthesis', source: { url: 'https://en.wikipedia.org/wiki/P' } }, db))!;
    const { collectionId } = (await db.clips.get(c.id))!;
    await deleteCollection(collectionId!, db);
    expect((await db.clips.get(c.id))?.collectionId).toBeUndefined();
    expect(await db.clips.count()).toBe(1);
  });
});
