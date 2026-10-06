import { beforeEach, describe, expect, it } from 'vitest';
import { ClipDatabase } from '@/lib/db';
import { saveClip } from '@/lib/clips';
import { createCollection, moveClip } from '@/lib/collections';
import { hashEmbed, hashEmbedder, HASH_KEY } from '@/lib/embed/hash';
import { indexPending, semanticSearch } from '@/lib/embed/indexer';
import { cosine, normalize, type Embedder } from '@/lib/embed/vector';

let db: ClipDatabase;
beforeEach(async () => {
  db = new ClipDatabase(`test-${crypto.randomUUID()}`);
  await db.open();
});

/** A tiny stand-in for a language model: one axis per topic word. */
const AXES = [
  ['cook', 'recipe', 'lasagna'],
  ['hotel', 'flight', 'trip'],
  ['code', 'command', 'sql'],
];
const fakeModel: Embedder = {
  key: 'fake-semantic',
  semantic: true,
  embed: async (texts) =>
    texts.map((t) => {
      const v = new Float32Array(AXES.length + 1);
      AXES.forEach((words, i) => (v[i] = words.filter((w) => t.toLowerCase().includes(w)).length));
      v[AXES.length] = 0.01;
      return normalize(v);
    }),
};

describe('hash embedder', () => {
  it('scores shared words and typos above unrelated text', () => {
    const a = hashEmbed('Photosynthesis converts sunlight into energy');
    const b = hashEmbed('photosynthesis sunlight energy notes');
    const c = hashEmbed('Cheap flights to Tokyo');
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c));
    expect(cosine(a, a)).toBeCloseTo(1, 5);
  });
});

describe('indexPending', () => {
  it('adds vectors to every clip once', async () => {
    await saveClip({ text: 'one note' }, db);
    await saveClip({ text: 'another note' }, db);
    expect(await indexPending(hashEmbedder, db)).toBe(2);
    expect(await indexPending(hashEmbedder, db)).toBe(0);
    const clips = await db.clips.toArray();
    expect(clips.every((c) => c.embeddingModel === HASH_KEY && c.embedding?.length === 512)).toBe(true);
  });

  it('sorts clips the rules missed when the model is semantic', async () => {
    const c = (await saveClip({ text: "Grandma's lasagna, the way she used to cook it" }, db))!;
    expect((await db.clips.get(c.id))?.collectionId).toBeUndefined();
    await indexPending(fakeModel, db);
    const sorted = await db.clips.get(c.id);
    expect((await db.collections.get(sorted!.collectionId!))?.name).toBe('Recipes');
  });

  it('never sorts by category with the offline fallback', async () => {
    const c = (await saveClip({ text: "Grandma's lasagna, the way she used to cook it" }, db))!;
    await indexPending(hashEmbedder, db);
    expect((await db.clips.get(c.id))?.collectionId).toBeUndefined();
  });

  it('follows where the user put similar clips', async () => {
    const first = (await saveClip({ text: 'Quarterly budget review meeting notes' }, db))!;
    const work = await createCollection('Work', db);
    await moveClip(first.id, work.id, db);
    await indexPending(hashEmbedder, db);
    const next = (await saveClip({ text: 'Quarterly budget review meeting agenda' }, db))!;
    await indexPending(hashEmbedder, db);
    expect((await db.clips.get(next.id))?.collectionId).toBe(work.id);
  });
});

describe('semanticSearch', () => {
  it('ranks clips by similarity and ignores other models', async () => {
    await saveClip({ text: 'Recipe for lasagna' }, db);
    await saveClip({ text: 'Hotel near the station' }, db);
    await indexPending(fakeModel, db);
    const results = await semanticSearch('what should I cook', fakeModel, await db.clips.toArray());
    expect(results[0]?.clip.text).toBe('Recipe for lasagna');
    expect(await semanticSearch('cook', hashEmbedder, await db.clips.toArray())).toEqual([]);
  });
});

describe('searchClips', () => {
  it('lists word matches first, then meaning matches, and applies filters', async () => {
    const { searchClips, NO_FILTERS } = await import('@/lib/search');
    await saveClip({ text: 'Lemon garlic pasta recipe' }, db);
    await saveClip({ text: 'Lasagna for Sunday dinner' }, db);
    await saveClip({ text: 'Hotel near the station', source: { url: 'https://www.booking.com/h/1' } }, db);
    await indexPending(fakeModel, db);
    const clips = await db.clips.orderBy('createdAt').reverse().toArray();
    const r = await searchClips('recipe', clips, NO_FILTERS, fakeModel);
    expect(r.map((x) => [x.clip.text, x.match])).toEqual([
      ['Lemon garlic pasta recipe', 'words'],
      ['Lasagna for Sunday dinner', 'meaning'],
    ]);
    const bySite = await searchClips('', clips, { ...NO_FILTERS, site: 'booking.com' }, null);
    expect(bySite.map((x) => x.clip.text)).toEqual(['Hotel near the station']);
  });
});

describe('typo-tolerant word search', () => {
  it('allows small typos in longer words only', async () => {
    const { matchesWithTypos, withinEdits } = await import('@/lib/search');
    const clip = {
      title: 'Photosynthesis',
      text: 'Photosynthesis is how plants turn sunlight into energy',
      source: undefined,
    } as never;
    expect(matchesWithTypos(clip, 'photosynthsis')).toBe(true);
    expect(matchesWithTypos(clip, 'photosinthesys plants')).toBe(true);
    expect(matchesWithTypos(clip, 'sunn')).toBe(false); // under 5 letters: no typos allowed
    expect(matchesWithTypos(clip, 'sunlight zzqx')).toBe(false);
    expect(withinEdits('kitten', 'sitting', 2)).toBe(false);
    expect(withinEdits('kitten', 'sitten', 1)).toBe(true);
  });
});
