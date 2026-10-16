import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipDatabase, type Collection } from '@/lib/db';
import { clearAll, deleteClip, editClip, markUsed, restoreClip, saveClip, togglePin } from '@/lib/clips';
import { saveImageClip } from '@/lib/images';
import { createCollection, deleteCollection, moveClip, renameCollection } from '@/lib/collections';
import { CopyChangedError, markAllForUpload, syncOnce, TOMBSTONE_DAYS, type SyncCursor } from '@/lib/sync/engine';
import { canonical } from '@/lib/sync/meta';
import { decodeRecord, encodeRecord } from '@/lib/sync/record';
import { FakeDrive } from './fakeDrive';
import { stubImageDecoding } from './imageStubs';

const PNG = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 8, 7])], { type: 'image/png' });
const DAY = 86_400_000;

let drive: FakeDrive;
let copy: { copyId: string; copyFileId: string };
const marker = (copyId: string) => new TextEncoder().encode(JSON.stringify({ v: 1, copyId }));

async function setUpDrive() {
  drive = new FakeDrive();
  const copyId = crypto.randomUUID();
  const made = await drive.client().create('copy', marker(copyId));
  copy = { copyId, copyFileId: made.id };
}

/** A computer with its own database, syncing with the shared Drive. */
async function computer({ maxClips }: { maxClips?: number } = {}) {
  const db = new ClipDatabase(`test-${crypto.randomUUID()}`);
  await db.open();
  let cursor: SyncCursor = {};
  const ctx = {
    db,
    drive: drive.client(),
    ...copy,
    maxClips,
    cursor: {
      get: async () => cursor,
      set: async (p: Partial<SyncCursor>) => void (cursor = { ...cursor, ...p }),
    },
  };
  return {
    db,
    ctx,
    /** Turns sync on: what's here goes up at the first sync. */
    join: () => markAllForUpload(db),
    sync: () => syncOnce(ctx),
    forgetPlace: () => void (cursor = { ...cursor, pageToken: undefined }),
  };
}

/** Everything a person could see, in a form two computers can be compared by. */
async function view(db: ClipDatabase) {
  return canonical(await viewObj(db));
}
async function viewObj(db: ClipDatabase) {
  const clips = await db.clips.orderBy('id').toArray();
  const collections = await db.collections.orderBy('id').toArray();
  const images = await db.images.orderBy('id').toArray();
  return { clips, collections, images: images.map((i) => [i.id, i.blob.size, i.blob.type]) };
}

beforeEach(async () => {
  stubImageDecoding();
  await setUpDrive();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Drive sync between two computers', () => {
  it('brings clips, folders and images from one computer to another', async () => {
    const a = await computer();
    const b = await computer();
    const folder = await createCollection('Work', 'green', a.db);
    const clip = (await saveClip({ text: 'meeting notes', source: { url: 'https://example.com', title: 'Ex' } }, a.db))!;
    await moveClip(clip.id, folder.id, a.db);
    const { clip: image } = await saveImageClip({ blob: PNG(), note: 'a chart' }, a.db);
    await a.join();
    await b.join();
    await a.sync();
    await b.sync();

    expect(JSON.parse(await view(b.db))).toEqual(JSON.parse(await view(a.db)));
    expect((await b.db.clips.get(clip.id))?.collectionId).toBe(folder.id);
    const stored = await b.db.images.get(image.image!.imageId);
    expect(new Uint8Array(await stored!.blob.arrayBuffer())).toEqual(new Uint8Array(await PNG().arrayBuffer()));
    expect((await b.db.clips.get(image.id))?.image?.thumb).toBeInstanceOf(Blob);
  });

  it('keeps a text edit from one computer and a pin from the other', async () => {
    const a = await computer();
    const b = await computer();
    const clip = (await saveClip({ text: 'draft one' }, a.db))!;
    await a.join();
    await b.join();
    await a.sync();
    await b.sync();

    await editClip(clip.id, { text: 'draft two' }, a.db);
    await togglePin(clip.id, b.db);
    await a.sync();
    await b.sync();
    await a.sync();

    for (const c of [a, b]) expect(await c.db.clips.get(clip.id)).toMatchObject({ text: 'draft two', pinned: 1 });
    expect(await view(a.db)).toBe(await view(b.db));
  });

  it('deletes everywhere, unless the other computer changed the clip after the delete', async () => {
    const a = await computer();
    const b = await computer();
    const gone = (await saveClip({ text: 'delete me' }, a.db))!;
    const kept = (await saveClip({ text: 'keep me' }, a.db))!;
    await a.join();
    await b.join();
    await a.sync();
    await b.sync();

    await deleteClip(gone.id, a.db);
    await deleteClip(kept.id, a.db);
    await togglePin(kept.id, b.db);
    await a.sync();
    await b.sync();
    await a.sync();

    for (const c of [a, b]) {
      expect(await c.db.clips.get(gone.id)).toBeUndefined();
      expect(await c.db.clips.get(kept.id)).toMatchObject({ text: 'keep me', pinned: 1 });
    }
  });

  it('spreads Delete all', async () => {
    const a = await computer();
    const b = await computer();
    await saveClip({ text: 'one' }, a.db);
    await saveImageClip({ blob: PNG() }, a.db);
    await a.join();
    await a.sync();
    await b.join();
    await b.sync();
    expect(await b.db.clips.count()).toBe(2);

    await clearAll(a.db);
    await a.sync();
    await b.sync();
    expect(await b.db.clips.count()).toBe(0);
    expect(await b.db.images.count()).toBe(0);
  });

  it('makes one clip of the same text saved on both computers', async () => {
    const a = await computer();
    const b = await computer();
    await saveClip({ text: 'same text' }, a.db);
    await saveClip({ text: 'same text' }, b.db);
    await togglePin((await b.db.clips.toArray())[0]!.id, b.db);
    await a.join();
    await b.join();
    await a.sync();
    await b.sync();
    await a.sync();

    for (const c of [a, b]) {
      const all = await c.db.clips.toArray();
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ text: 'same text', pinned: 1 });
    }
    expect(await view(a.db)).toBe(await view(b.db));
  });

  it('makes one folder of a smart folder made on both computers, with the clips of both', async () => {
    const a = await computer();
    const b = await computer();
    const folder = (id: string): Collection => ({
      id,
      key: 'cat:code',
      name: 'Code',
      color: 'blue',
      kind: 'smart',
      createdAt: 1,
      order: 0,
    });
    await a.db.collections.add(folder('folder-a'));
    await b.db.collections.add(folder('folder-b'));
    const ca = (await saveClip({ text: 'from a' }, a.db))!;
    const cb = (await saveClip({ text: 'from b' }, b.db))!;
    await moveClip(ca.id, 'folder-a', a.db);
    await moveClip(cb.id, 'folder-b', b.db);
    await a.join();
    await b.join();
    await a.sync();
    await b.sync();
    await a.sync();
    await b.sync();

    for (const c of [a, b]) {
      expect((await c.db.collections.toArray()).map((f) => f.id)).toEqual(['folder-a']);
      expect((await c.db.clips.toArray()).map((x) => x.collectionId)).toEqual(['folder-a', 'folder-a']);
    }
    expect(await view(a.db)).toBe(await view(b.db));
  });

  it('unfiles a clip moved into a folder that the other computer deleted', async () => {
    const a = await computer();
    const b = await computer();
    const folder = await createCollection('Temp', undefined, a.db);
    const clip = (await saveClip({ text: 'loose' }, a.db))!;
    await a.join();
    await b.join();
    await a.sync();
    await b.sync();

    await deleteCollection(folder.id, a.db);
    await moveClip(clip.id, folder.id, b.db);
    await a.sync();
    await b.sync();
    await a.sync();

    for (const c of [a, b]) {
      expect(await c.db.collections.count()).toBe(0);
      expect((await c.db.clips.get(clip.id))?.collectionId).toBeUndefined();
    }
    expect(await view(a.db)).toBe(await view(b.db));
  });

  it('moves clips filed in the losing folder into the winning one', async () => {
    const a = await computer();
    const b = await computer();
    const folder = (id: string): Collection => ({
      id,
      key: 'cat:code',
      name: 'Code',
      color: 'blue',
      kind: 'smart',
      createdAt: 1,
      order: 0,
    });
    await a.db.collections.add(folder('folder-a'));
    await a.join();
    await a.sync();
    await b.db.collections.add(folder('folder-b'));
    const cb = (await saveClip({ text: 'filed on b' }, b.db))!;
    await moveClip(cb.id, 'folder-b', b.db);
    await b.join();
    // b settles the merge itself: folder-a wins.
    await b.sync();
    await a.sync();
    await b.sync();
    for (const c of [a, b]) {
      expect((await c.db.collections.toArray()).map((f) => f.id)).toEqual(['folder-a']);
      expect((await c.db.clips.get(cb.id))?.collectionId).toBe('folder-a');
    }
  });

  it("doesn't download its own uploads again", async () => {
    const a = await computer();
    await saveClip({ text: 'one' }, a.db);
    await a.join();
    await a.sync();
    const before = drive.calls.download;
    await saveClip({ text: 'two' }, a.db);
    await a.sync();
    await a.sync();
    expect(drive.calls.download).toBe(before);
  });

  it('only uploads what changed', async () => {
    const a = await computer();
    const clip = (await saveClip({ text: 'one' }, a.db))!;
    await saveClip({ text: 'two' }, a.db);
    await a.join();
    await a.sync();
    const before = { ...drive.calls };
    await markUsed(clip.id, a.db);
    await a.sync();
    expect(drive.calls.update - before.update).toBe(1);
    expect(drive.calls.create).toBe(before.create);
  });

  it('catches up by comparing everything when Drive has forgotten its place', async () => {
    const a = await computer();
    const b = await computer();
    await a.join();
    await b.join();
    await a.sync();
    await b.sync();
    await saveClip({ text: 'while b was away' }, a.db);
    await a.sync();
    drive.forgottenBefore = Infinity;
    await b.sync();
    drive.forgottenBefore = 0;
    expect(await view(b.db)).toBe(await view(a.db));
  });

  it('a computer off for longer than tombstones last still drops what was deleted, but keeps what it changed', async () => {
    const a = await computer();
    const b = await computer();
    const gone = (await saveClip({ text: 'deleted while b was off' }, a.db))!;
    const edited = (await saveClip({ text: 'edited on b while off' }, a.db))!;
    await a.join();
    await b.join();
    await a.sync();
    await b.sync();

    await deleteClip(gone.id, a.db);
    await deleteClip(edited.id, a.db);
    await a.sync();
    await togglePin(edited.id, b.db);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + (TOMBSTONE_DAYS + 1) * DAY);
    await a.sync();
    expect([...drive.files.values()].some((f) => f.appProperties?.del)).toBe(false);

    await b.sync();
    await a.sync();
    expect(await b.db.clips.get(gone.id)).toBeUndefined();
    for (const c of [a, b]) expect(await c.db.clips.get(edited.id)).toMatchObject({ pinned: 1 });
  });

  it('stops without deleting anything when the Drive copy was erased elsewhere', async () => {
    const a = await computer();
    const b = await computer();
    await saveClip({ text: 'precious' }, a.db);
    await a.join();
    await b.join();
    await a.sync();
    await b.sync();

    const admin = drive.client();
    await admin.update(copy.copyFileId, marker(crypto.randomUUID()));
    for (const f of [...drive.files.values()]) if (f.id !== copy.copyFileId) await admin.remove(f.id);

    await expect(b.sync()).rejects.toBeInstanceOf(CopyChangedError);
    expect(await b.db.clips.count()).toBe(1);
  });

  describe('found in review', () => {
    /** Two computers in step with one image clip, saved on a. */
    async function withImage() {
      const a = await computer();
      const b = await computer();
      const { clip } = await saveImageClip({ blob: PNG(), note: 'chart' }, a.db);
      await a.join();
      await b.join();
      await a.sync();
      await b.sync();
      return { a, b, clip };
    }
    const hasImage = async (db: ClipDatabase, imageId: string) => !!(await db.images.get(imageId));

    it('Undo after a delete brings the image back on both computers', async () => {
      const { a, b, clip } = await withImage();
      const deleted = (await deleteClip(clip.id, a.db))!;
      await a.sync();
      await b.sync();
      expect(await b.db.clips.get(clip.id)).toBeUndefined();
      await restoreClip(deleted, a.db);
      for (let i = 0; i < 3; i++) {
        await a.sync();
        await b.sync();
      }
      for (const c of [a, b]) {
        expect(await c.db.clips.get(clip.id)).toBeDefined();
        expect(await hasImage(c.db, clip.image!.imageId)).toBe(true);
      }
    });

    it('a clip deleted on one computer and pinned on the other keeps its image', async () => {
      const { a, b, clip } = await withImage();
      await deleteClip(clip.id, a.db);
      await togglePin(clip.id, b.db);
      for (let i = 0; i < 3; i++) {
        await a.sync();
        await b.sync();
      }
      for (const c of [a, b]) {
        expect(await c.db.clips.get(clip.id)).toMatchObject({ pinned: 1 });
        expect(await hasImage(c.db, clip.image!.imageId)).toBe(true);
      }
    });

    it("a clip deleted while its first upload is under way doesn't come back", async () => {
      const a = await computer();
      const b = await computer();
      const clip = (await saveClip({ text: 'oops, a password' }, a.db))!;
      await a.join();
      drive.afterCreate = async (file) => {
        if (file.name === `c.${clip.id}`) await deleteClip(clip.id, a.db);
      };
      await a.sync();
      drive.afterCreate = undefined;
      await b.join();
      await b.sync();
      await a.sync();
      expect(await a.db.clips.get(clip.id)).toBeUndefined();
      expect(await b.db.clips.get(clip.id)).toBeUndefined();
      expect(drive.allNamed(`c.${clip.id}`)).toHaveLength(0);
    });

    it('making room takes clips off this computer only: none is deleted from Drive or the other computer', async () => {
      const a = await computer({ maxClips: 5 });
      const b = await computer({ maxClips: 5 });
      for (let i = 0; i < 4; i++) {
        await saveClip({ text: `a note ${i}` }, a.db);
        await saveClip({ text: `b note ${i}` }, b.db);
      }
      await a.join();
      await b.join();
      for (let i = 0; i < 3; i++) {
        await a.sync();
        await b.sync();
      }
      const inDrive = await Promise.all(
        [...drive.files.values()].filter((f) => f.name.startsWith('c.')).map((f) => decodeRecord(f.data).record),
      );
      expect(
        inDrive
          .filter((r) => r.row)
          .map((r) => r.row!.text)
          .sort(),
      ).toEqual([0, 1, 2, 3].flatMap((i) => [`a note ${i}`, `b note ${i}`]).sort());
      expect(await a.db.clips.count()).toBe(5);
      expect(await b.db.clips.count()).toBe(5);
    });

    it("stops before deleting anything when Drive's copy is wiped in any order, marker last", async () => {
      const a = await computer();
      const b = await computer();
      for (let i = 0; i < 6; i++) await saveClip({ text: `kept ${i}` }, a.db);
      await a.join();
      await b.join();
      await a.sync();
      await b.sync();
      drive.removeAll((ids) => [...ids.filter((id) => id !== copy.copyFileId), copy.copyFileId]);
      await expect(b.sync()).rejects.toBeInstanceOf(CopyChangedError);
      expect(await b.db.clips.count()).toBe(6);
    });

    it("doesn't take a file missing from a listing for a deleted one", async () => {
      const a = await computer();
      const b = await computer();
      const clip = (await saveClip({ text: 'still here' }, a.db))!;
      await a.join();
      await b.join();
      await a.sync();
      await b.sync();
      drive.unlisted.add(drive.byName(`c.${clip.id}`)!.id);
      drive.listReversed = true;
      b.forgetPlace();
      await b.sync();
      expect(await b.db.clips.get(clip.id)).toBeDefined();
    });

    it('carries on past a file deleted since it was listed, one it cannot read, and one from a newer version', async () => {
      const a = await computer();
      const b = await computer();
      await a.join();
      await b.join();
      await a.sync();
      await b.sync();
      const admin = drive.client();
      const gone = await admin.create('c.gone', await encodeRecord({ row: { id: 'gone', text: 'x' }, t: {} }));
      await admin.remove(gone.id);
      await admin.create('c.broken', new Uint8Array([0, 0, 0, 99, 1, 2]));
      const newer = await encodeRecord({ row: { id: 'newer', text: 'x' }, t: {} });
      const json = JSON.parse(new TextDecoder().decode(newer.subarray(4)));
      const bytes = new TextEncoder().encode(JSON.stringify({ ...json, v: 99 }));
      const framed = new Uint8Array(4 + bytes.length);
      new DataView(framed.buffer).setUint32(0, bytes.length);
      framed.set(bytes, 4);
      await admin.create('c.newer', framed);
      await saveClip({ text: 'after the bad ones' }, a.db);
      await a.sync();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await b.sync();
      warn.mockRestore();
      expect((await b.db.clips.toArray()).map((c) => c.text)).toEqual(['after the bad ones']);
    });

    it('a later edit wins over a time from a computer whose clock runs ahead', async () => {
      const a = await computer();
      const b = await computer();
      const fast = await computer();
      const clip = (await saveClip({ text: 'pin me' }, a.db))!;
      for (const x of [a, b, fast]) await x.join();
      for (const x of [a, b, fast]) await x.sync();
      // `fast`, its clock 10 minutes ahead, pins it.
      const file = drive.byName(`c.${clip.id}`)!;
      const { record } = decodeRecord(file.data);
      const ahead = Math.max(...Object.values(record.t)) + 10 * 60_000;
      const pinned = { ...record, row: { ...record.row, pinned: 1 }, t: { ...record.t, pinned: ahead } };
      await drive.client().update(file.id, await encodeRecord(pinned));
      for (const x of [fast, b]) await x.sync();
      expect(await b.db.clips.get(clip.id)).toMatchObject({ pinned: 1 });
      // b unpins after seeing the pin; that comes later, whatever the clocks say.
      await togglePin(clip.id, b.db);
      for (let i = 0; i < 2; i++) for (const x of [b, fast, a]) await x.sync();
      for (const x of [a, b, fast]) expect(await x.db.clips.get(clip.id)).toMatchObject({ pinned: 0 });
    });

    it("unfiling the clips of a deleted folder doesn't undo a later move made elsewhere", async () => {
      const a = await computer();
      const b = await computer();
      const c = await computer();
      const old = await createCollection('Old', undefined, a.db);
      const next = await createCollection('Next', undefined, a.db);
      const clip = (await saveClip({ text: 'filed' }, a.db))!;
      await moveClip(clip.id, old.id, a.db);
      for (const x of [a, b, c]) await x.join();
      for (const x of [a, b, c]) await x.sync();
      await deleteCollection(old.id, b.db);
      await b.sync();
      await moveClip(clip.id, next.id, c.db);
      await c.sync();
      await a.sync();
      for (const x of [b, c, a]) await x.sync();
      for (const x of [a, b, c]) expect((await x.db.clips.get(clip.id))?.collectionId).toBe(next.id);
    });

    it('removes a second Drive file for one row, even when the first try is cut short', async () => {
      const a = await computer();
      const b = await computer();
      const clip = (await saveClip({ text: 'one row' }, a.db))!;
      await a.join();
      await b.join();
      await a.sync();
      await b.sync();
      const { record } = decodeRecord(drive.byName(`c.${clip.id}`)!.data);
      await drive.client().create(
        `c.${clip.id}`,
        await encodeRecord({
          ...record,
          row: { ...record.row, title: 'Copy' },
          t: { ...record.t, title: Math.max(...Object.values(record.t)) + 1 },
        }),
      );
      const remove = b.ctx.drive.remove;
      b.ctx.drive.remove = async () => Promise.reject(new Error('network went away'));
      await expect(b.sync()).rejects.toThrow('network went away');
      b.ctx.drive.remove = remove;
      await b.sync();
      await a.sync();
      expect(drive.allNamed(`c.${clip.id}`)).toHaveLength(1);
      for (const x of [a, b]) expect(await x.db.clips.get(clip.id)).toMatchObject({ title: 'Copy' });
    });
  });

  it.each([1, 7, 42])('two computers doing random things end up the same (seed %i)', async (start) => {
    let seed = start;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const a = await computer();
    const b = await computer();
    await a.join();
    await b.join();
    const words = ['alpha', 'beta', 'gamma', 'delta', 'omega'];

    for (let round = 0; round < 20; round++) {
      for (const c of [a, b]) {
        for (let k = 0; k < 4; k++) {
          const clips = await c.db.clips.toArray();
          const folders = await c.db.collections.toArray();
          const clip = clips[rand(Math.max(clips.length, 1))];
          const op = rand(11);
          if (op === 0 || !clip) await saveClip({ text: `${words[rand(5)]} ${rand(4)}` }, c.db);
          else if (op === 1) await editClip(clip.id, { text: `${words[rand(5)]} edited ${rand(3)}` }, c.db);
          else if (op === 2) await editClip(clip.id, { title: `Title ${rand(5)}` }, c.db);
          else if (op === 3) await togglePin(clip.id, c.db);
          else if (op === 4) await deleteClip(clip.id, c.db);
          else if (op === 5) await markUsed(clip.id, c.db);
          else if (op === 6) await createCollection(`Folder ${rand(3)}`, undefined, c.db);
          else if (op === 7 && folders.length) await moveClip(clip.id, folders[rand(folders.length)]!.id, c.db);
          else if (op === 8 && folders.length) {
            const f = folders[rand(folders.length)]!;
            if (rand(2)) await renameCollection(f.id, `Renamed ${rand(3)}`, c.db);
            else await deleteCollection(f.id, c.db);
          } else if (op === 9) {
            const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, rand(4), rand(4)]);
            await saveImageClip({ blob: new Blob([png], { type: 'image/png' }) }, c.db);
          } else if (op === 10) {
            // Deleted, then Undo, perhaps with a sync in between.
            const deleted = await deleteClip(clip.id, c.db);
            if (rand(2)) await c.sync();
            if (deleted) await restoreClip(deleted, c.db);
          }
        }
        if (rand(2)) await c.sync();
      }
    }
    await a.sync();
    await b.sync();
    await a.sync();
    await b.sync();
    expect(await view(b.db)).toBe(await view(a.db));
    // Every image clip still has its image.
    for (const c of [a, b]) {
      for (const clip of await c.db.clips.filter((x) => !!x.image).toArray()) {
        expect(await c.db.images.get(clip.image!.imageId)).toBeDefined();
      }
    }
    expect(await a.db.syncMeta.where('dirty').equals(1).count()).toBe(0);
    expect(await b.db.syncMeta.where('dirty').equals(1).count()).toBe(0);
  });
});
