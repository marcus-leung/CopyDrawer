import { beforeEach, describe, expect, it } from 'vitest';
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
