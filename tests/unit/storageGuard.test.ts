import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import Dexie from 'dexie';
import type { ClipDatabase } from '@/lib/db';
import { importFile } from '@/lib/backup';
import { stubImageDecoding } from './imageStubs';

const PNG = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])], { type: 'image/png' });

/** Fresh modules for each test, as a page that just opened: the guard reads the stored state once at start. */
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
    expect((await guard.storageState()).reason).toBe('low');

    // The notice clears once there's room, before any save.
    stubFreeSpace(500 * 1024 * 1024);
    expect((await guard.storageState()).reason).toBe('ok');
  });

  it('checks before importing a backup', async () => {
    const { db } = await load();
    stubFreeSpace(10 * 1024 * 1024);
    await expect(importFile(new Blob(['{}']), db)).rejects.toMatchObject({ name: 'StorageFullError' });
  });
});

describe('after a disk error', () => {
  it('stops every write in every page, and marks the clips to move even with the disk still full', async () => {
    const { guard, clips, db, ClipDatabase } = await load();
    await clips.saveClip({ text: 'kept' }, db);
    stubFreeSpace(0);
    await failWrites(db);
    const error = await db.clips.add({ ...(await db.clips.toArray())[0]!, id: 'x' }).catch((e: unknown) => e);
    expect(guard.isDiskFailure(error)).toBe(true);

    expect(guard.writesPaused()).toBe(true);
    expect((await guard.storageState()).reason).toBe('disk');
    expect((await fakeBrowser.storage.local.get('dbRebuild')).dbRebuild).toBe('needed');

    // Another connection, without the failing disk, may not write either.
    const other = new ClipDatabase(db.name);
    await expect(other.clips.update((await other.clips.toArray())[0]!.id, { text: 'edited' })).rejects.toBeInstanceOf(
      guard.StoragePausedError,
    );
    await expect(clips.saveClip({ text: 'later' }, other)).rejects.toBeInstanceOf(guard.StoragePausedError);
    expect(guard.storageProblem(new guard.StoragePausedError(), 'deleted')?.title).toMatch(/^Not deleted: saving is paused/);
    expect((await other.clips.toArray()).map((c) => c.text)).toEqual(['kept']);
  });

  it('also stops writes when the error comes as the transaction commits', async () => {
    const { guard, db } = await load();
    // Below the guard: catch the abort listener it puts on each write transaction.
    const onAbort: (() => void)[] = [];
    let tx: IDBTransaction | undefined;
    db.close();
    db.use({
      stack: 'dbcore',
      name: 'catchAbortListener',
      level: 1,
      create: (down) => ({
        ...down,
        transaction: (tables, mode, options) => {
          const t = down.transaction(tables, mode, options) as IDBTransaction;
          const listen = t.addEventListener.bind(t);
          t.addEventListener = ((type: string, fn: () => void) => {
            if (type !== 'abort') return listen(type, fn);
            onAbort.push(fn);
            tx = t;
          }) as IDBTransaction['addEventListener'];
          return t;
        },
      }),
    });
    await db.open();
    await db.clips.put({ id: 'a', text: 'a' } as never);
    expect(guard.writesPaused()).toBe(false);
    // The commit fails the way Chrome's does on a full disk.
    const error = new DOMException('IO error: FILE_ERROR_NO_SPACE', 'UnknownError');
    Object.defineProperty(tx!, 'error', { get: () => error });
    for (const fn of onAbort) fn();
    expect(guard.writesPaused()).toBe(true);
  });

  it('a page opened after an update or reload in that session still may not write', async () => {
    await fakeBrowser.storage.local.set({ dbRebuild: 'needed' });
    const { guard, clips, db } = await load();
    await expect(db.clips.add({ id: 'a' } as never)).rejects.toBeInstanceOf(guard.StoragePausedError);
    await expect(clips.saveClip({ text: 'x' }, db)).rejects.toBeInstanceOf(guard.StoragePausedError);
    expect((await guard.storageState()).reason).toBe('disk');
  });

  it('leaves no image without its clip when the save fails', async () => {
    const { images, db } = await load();
    await failWrites(db);
    await expect(images.saveImageClip({ blob: PNG() }, db)).rejects.toBeTruthy();
    expect(await db.images.count()).toBe(0);
    expect(await db.clips.count()).toBe(0);
  });
});

describe('moving the clips to fresh storage', () => {
  async function filled(stage: 'needed' | 'copied' = 'needed', session: Record<string, unknown> = { rebuildAllowed: true }) {
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
    await fakeBrowser.storage.local.set({ dbRebuild: stage });
    await fakeBrowser.storage.session.set(session);
    return { ...ctx, snapshot };
  }

  it('copies everything into fresh storage after Chrome restarts, then lets saving carry on', async () => {
    const { rebuild, guard, clips, db, snapshot } = await filled();
    expect(guard.writesPaused()).toBe(true);
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

  it('never moves them in the Chrome session of the error, nor before Chrome has restarted', async () => {
    for (const session of [{}, { rebuildAllowed: true, storagePaused: 'disk' }]) {
      fakeBrowser.reset();
      const { rebuild, guard, db, snapshot } = await filled('needed', session);
      expect(await rebuild.rebuildIfNeeded(db)).toBe(false);
      expect(guard.writesPaused()).toBe(true);
      expect(await db.clips.count()).toBe(snapshot.clips.length);
    }
  });

  it('waits for room for the copy, and says how much to free', async () => {
    const { rebuild, guard, db } = await filled();
    vi.stubGlobal('navigator', { ...navigator, storage: { estimate: async () => ({ quota: 300e6, usage: 200e6 }) } });
    expect(await rebuild.rebuildIfNeeded(db)).toBe(false);
    expect(await guard.storageState()).toEqual({ reason: 'space', needBytes: 200e6 + guard.MIN_FREE_BYTES - 100e6 });
    expect(await fakeBrowser.alarms.get('storage-guard')).toBeTruthy();
    vi.unstubAllGlobals();
    expect(await rebuild.rebuildIfNeeded(db)).toBe(true);
  });

  it('finishes from the rescue copy when Chrome closed halfway', async () => {
    const { rebuild, db, snapshot, ClipDatabase } = await filled('copied');
    const rescue = new ClipDatabase('clipboard-rescue', { guarded: false });
    await rescue.clips.bulkPut(await db.clips.toArray());
    await rescue.images.bulkPut(await db.images.toArray());
    await rescue.collections.bulkPut(await db.collections.toArray());
    rescue.close();
    await new ClipDatabase(db.name, { guarded: false }).clips.clear();

    expect(await rebuild.rebuildIfNeeded(db)).toBe(true);
    expect(await db.clips.toArray()).toEqual(snapshot.clips);
    expect(await Dexie.exists('clipboard-rescue')).toBe(false);
  });

  it('copies again from the original when the rescue copy is missing', async () => {
    const { rebuild, db, snapshot } = await filled('copied');
    expect(await rebuild.rebuildIfNeeded(db)).toBe(true);
    expect(await db.clips.toArray()).toEqual(snapshot.clips);
  });

  it('keeps saving paused, and the mark, when the move fails', async () => {
    const { rebuild, guard, db, snapshot } = await filled();
    const original = Dexie.delete;
    const spy = vi
      .spyOn(Dexie, 'delete')
      .mockImplementation((name: string) =>
        name === db.name ? Promise.reject(new Error('blocked')) : original.call(Dexie, name),
      );
    await expect(rebuild.rebuildIfNeeded(db)).rejects.toThrow('blocked');
    spy.mockRestore();
    expect(guard.writesPaused()).toBe(true);
    expect((await guard.storageState()).reason).toBe('failed');
    expect((await fakeBrowser.storage.local.get('dbRebuild')).dbRebuild).toBe('copied');
    expect(await db.clips.count()).toBe(snapshot.clips.length);
  });

  it('does nothing without a disk error', async () => {
    await fakeBrowser.storage.session.set({ rebuildAllowed: true });
    const { rebuild, db } = await load();
    expect(await rebuild.rebuildIfNeeded(db)).toBe(false);
  });
});
