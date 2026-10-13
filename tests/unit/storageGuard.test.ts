import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import Dexie from 'dexie';
import type { ClipDatabase } from '@/lib/db';
import { stubImageDecoding } from './imageStubs';

const PNG = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])], { type: 'image/png' });

/** Fresh modules for each test: the write latch lives in module state for the whole Chrome session. */
async function load() {
  vi.resetModules();
  const guard = await import('@/lib/storageGuard');
  const { ClipDatabase } = await import('@/lib/db');
  const clips = await import('@/lib/clips');
  const images = await import('@/lib/images');
  const rebuild = await import('@/lib/rebuild');
  const db = new ClipDatabase(`test-${crypto.randomUUID()}`);
  await db.open();
  return { guard, clips, images, rebuild, db, ClipDatabase };
}

/** Makes every write below the guard fail the way Chrome's does when the disk is full. */
async function failWrites(db: ClipDatabase) {
  db.close();
  db.use({
    stack: 'dbcore',
    name: 'diskFull',
    level: 1,
    create: (down) => ({
      ...down,
      table: (name) => {
        const table = down.table(name);
        return {
          ...table,
          mutate: () =>
            Promise.reject(new DOMException('Connection is closing because of: IO error: FILE_ERROR_NO_SPACE', 'UnknownError')),
        };
      },
    }),
  });
  await db.open();
}

function stubFreeSpace(bytes: number) {
  vi.stubGlobal('navigator', { ...navigator, storage: { estimate: async () => ({ quota: bytes + 1000, usage: 1000 }) } });
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.unstubAllGlobals();
  stubImageDecoding();
});

describe('isDiskFailure', () => {
  it('knows the errors Chrome gives for a full disk, also wrapped by Dexie', async () => {
    const { guard } = await load();
    expect(guard.isDiskFailure(new DOMException('x', 'QuotaExceededError'))).toBe(true);
    expect(guard.isDiskFailure({ name: 'AbortError', inner: { name: 'UnknownError' } })).toBe(true);
    expect(guard.isDiskFailure({ name: 'DatabaseClosedError', message: 'IO error: FILE_ERROR_NO_SPACE' })).toBe(true);
    expect(guard.isDiskFailure(new Error('nope'))).toBe(false);
    expect(guard.isDiskFailure(undefined)).toBe(false);
  });
});

describe('space check', () => {
  it('refuses to save when the disk is almost full, and keeps what is there', async () => {
    const { guard, clips, images, db } = await load();
    await clips.saveClip({ text: 'already here' }, db);
    stubFreeSpace(10 * 1024 * 1024);
    await expect(clips.saveClip({ text: 'new' }, db)).rejects.toBeInstanceOf(guard.StorageFullError);
    await expect(images.saveImageClip({ blob: PNG() }, db)).rejects.toBeInstanceOf(guard.StorageFullError);
    expect((await db.clips.toArray()).map((c) => c.text)).toEqual(['already here']);
    expect(await guard.storageState()).toBe('low');

    stubFreeSpace(500 * 1024 * 1024);
    await clips.saveClip({ text: 'room again' }, db);
    expect(await guard.storageState()).toBe('ok');
  });
});

describe('after a disk error', () => {
  it('stops every write until Chrome restarts, and asks for a rebuild', async () => {
    const { guard, clips, db } = await load();
    await clips.saveClip({ text: 'kept' }, db);
    await failWrites(db);
    const error = await clips.saveClip({ text: 'lost' }, db).catch((e: unknown) => e);
    expect(guard.isDiskFailure(error)).toBe(true);
    expect(guard.storageProblem(error)?.title).toMatch(/paused to protect/);

    expect(guard.writesPaused()).toBe(true);
    expect(await guard.storageState()).toBe('disk');
    await vi.waitFor(async () => expect((await fakeBrowser.storage.local.get('dbRebuild')).dbRebuild).toBe('needed'));

    // Another page's connection, without the failing disk, still may not write.
    const { ClipDatabase } = await import('@/lib/db');
    const other = new ClipDatabase(db.name);
    await expect(other.clips.put({ ...(await other.clips.toArray())[0]!, text: 'edited' })).rejects.toBeInstanceOf(
      guard.StoragePausedError,
    );
    await expect(clips.saveClip({ text: 'later' }, other)).rejects.toBeInstanceOf(guard.StoragePausedError);
    expect((await other.clips.toArray()).map((c) => c.text)).toEqual(['kept']);
  });

  it('leaves no image without its clip when the save fails', async () => {
    const { images, db } = await load();
    await failWrites(db);
    await expect(images.saveImageClip({ blob: PNG() }, db)).rejects.toBeTruthy();
    expect(await db.images.count()).toBe(0);
    expect(await db.clips.count()).toBe(0);
  });
});

describe('rebuild after a disk error', () => {
  async function filled() {
    const ctx = await load();
    const { clips, images, db } = ctx;
    for (let i = 0; i < 120; i++) await clips.saveClip({ text: `clip ${i}` }, db);
    await images.saveImageClip({ blob: PNG() }, db);
    await db.collections.add({ id: 'c', key: 'manual:c', name: 'Mine', color: 'green', kind: 'manual', createdAt: 1, order: 0 });
    const snapshot = {
      clips: await db.clips.toArray(),
      images: await db.images.count(),
      collections: await db.collections.toArray(),
    };
    return { ...ctx, snapshot };
  }

  it('copies everything into fresh storage, then lets saving carry on', async () => {
    const { rebuild, guard, clips, db, snapshot } = await filled();
    await fakeBrowser.storage.local.set({ dbRebuild: 'needed' });
    expect(await rebuild.rebuildIfNeeded(db)).toBe(true);

    expect(await db.clips.toArray()).toEqual(snapshot.clips);
    expect(await db.images.count()).toBe(snapshot.images);
    expect(await db.collections.toArray()).toEqual(snapshot.collections);
    expect(await Dexie.exists('clipboard-rescue')).toBe(false);
    expect((await fakeBrowser.storage.local.get('dbRebuild')).dbRebuild).toBeUndefined();
    expect(guard.writesPaused()).toBe(false);
    await clips.saveClip({ text: 'after rebuild' }, db);
    expect(await db.clips.count()).toBe(snapshot.clips.length + 1);
  });

  it('finishes from the rescue copy when Chrome closed halfway', async () => {
    const { rebuild, db, snapshot, ClipDatabase } = await filled();
    const rescue = new ClipDatabase('clipboard-rescue', { guarded: false });
    await rescue.clips.bulkPut(await db.clips.toArray());
    await rescue.images.bulkPut(await db.images.toArray());
    await rescue.collections.bulkPut(await db.collections.toArray());
    rescue.close();
    await db.clips.clear();
    await fakeBrowser.storage.local.set({ dbRebuild: 'copied' });

    expect(await rebuild.rebuildIfNeeded(db)).toBe(true);
    expect(await db.clips.toArray()).toEqual(snapshot.clips);
    expect(await Dexie.exists('clipboard-rescue')).toBe(false);
  });

  it('copies again from the original when the rescue copy is missing', async () => {
    const { rebuild, db, snapshot } = await filled();
    await fakeBrowser.storage.local.set({ dbRebuild: 'copied' });
    expect(await rebuild.rebuildIfNeeded(db)).toBe(true);
    expect(await db.clips.toArray()).toEqual(snapshot.clips);
  });

  it('keeps saving paused, and the mark, when the rebuild fails', async () => {
    const { rebuild, guard, db, snapshot } = await filled();
    await fakeBrowser.storage.local.set({ dbRebuild: 'needed' });
    const original = Dexie.delete;
    const spy = vi
      .spyOn(Dexie, 'delete')
      .mockImplementation((name: string) =>
        name === db.name ? Promise.reject(new Error('blocked')) : original.call(Dexie, name),
      );
    await expect(rebuild.rebuildIfNeeded(db)).rejects.toThrow('blocked');
    spy.mockRestore();
    expect(guard.writesPaused()).toBe(true);
    expect(await guard.storageState()).toBe('failed');
    expect((await fakeBrowser.storage.local.get('dbRebuild')).dbRebuild).toBe('copied');
    expect(await db.clips.count()).toBe(snapshot.clips.length);
  });

  it('does nothing without a disk error', async () => {
    const { rebuild, db } = await load();
    expect(await rebuild.rebuildIfNeeded(db)).toBe(false);
  });
});
