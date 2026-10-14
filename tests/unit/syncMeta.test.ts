import { beforeEach, describe, expect, it } from 'vitest';
import { ClipDatabase } from '@/lib/db';
import { clearAll, deleteClip, editClip, markUsed, restoreClip, saveClip, togglePin } from '@/lib/clips';
import { createCollection, moveClip, renameCollection } from '@/lib/collections';
import { importBackup } from '@/lib/backup';
import { metaKey, type SyncMeta } from '@/lib/sync/meta';
import { stubImageDecoding } from './imageStubs';

let db: ClipDatabase;

beforeEach(async () => {
  stubImageDecoding();
  db = new ClipDatabase(`test-${crypto.randomUUID()}`);
  await db.open();
});

const meta = (id: string, table: 'clips' | 'collections' = 'clips') => db.syncMeta.get(metaKey(table, id));

/** Marks a row as uploaded and clean, as a finished sync leaves it. */
async function synced(id: string, table: 'clips' | 'collections' = 'clips'): Promise<SyncMeta> {
  const m = (await meta(id, table))!;
  const clean = { ...m, dirty: 0 as const, fileId: `file-${id}` };
  await db.syncMeta.put(clean);
  return clean;
}

/** The groups whose time moved past `before`. */
const changedSince = (before: SyncMeta, after: SyncMeta) =>
  Object.keys(after.t)
    .filter((g) => after.t[g]! > (before.t[g] ?? 0))
    .sort();

describe('sync change tracking', () => {
  it('stamps every group of a new clip and marks it for upload', async () => {
    const clip = (await saveClip({ text: 'hello world' }, db))!;
    const m = (await meta(clip.id))!;
    expect(m.dirty).toBe(1);
    expect(Object.keys(m.t).sort()).toEqual(['content', 'note', 'pinned', 'place', 'source', 'stripRank', 'title']);
  });

  it('stamps only the groups an edit changed', async () => {
    const clip = (await saveClip({ text: 'hello world' }, db))!;
    const before = await synced(clip.id);
    await togglePin(clip.id, db);
    const pinned = (await meta(clip.id))!;
    expect(changedSince(before, pinned)).toEqual(['pinned']);
    expect(pinned.dirty).toBe(1);
    expect(pinned.fileId).toBe(before.fileId);

    await editClip(clip.id, { title: 'Greeting' }, db);
    expect(changedSince(pinned, (await meta(clip.id))!)).toEqual(['title']);
  });

  it('marks a use for upload without stamping a group', async () => {
    const clip = (await saveClip({ text: 'hello world' }, db))!;
    const before = await synced(clip.id);
    await markUsed(clip.id, db);
    const after = (await meta(clip.id))!;
    expect(after.dirty).toBe(1);
    expect(after.t).toEqual(before.t);
  });

  it('stamps place when a clip moves to a folder, and name when a folder is renamed', async () => {
    const clip = (await saveClip({ text: 'hello world' }, db))!;
    const folder = await createCollection('Work', undefined, db);
    const before = await synced(clip.id);
    await moveClip(clip.id, folder.id, db);
    expect(changedSince(before, (await meta(clip.id))!)).toEqual(['place']);

    const f = await synced(folder.id, 'collections');
    await renameCollection(folder.id, 'Projects', db);
    expect(changedSince(f, (await meta(folder.id, 'collections'))!)).toEqual(['name']);
  });

  it('drops the entry of a deleted clip that never reached Drive', async () => {
    const clip = (await saveClip({ text: 'hello world' }, db))!;
    await deleteClip(clip.id, db);
    expect(await meta(clip.id)).toBeUndefined();
  });

  it('leaves a tombstone for a deleted clip that reached Drive, which a restore brings back', async () => {
    const clip = (await saveClip({ text: 'hello world' }, db))!;
    await synced(clip.id);
    const deleted = (await deleteClip(clip.id, db))!;
    const tomb = (await meta(clip.id))!;
    expect(tomb).toMatchObject({ dirty: 1, fileId: `file-${clip.id}` });
    expect(tomb.deletedAt).toBeGreaterThan(0);

    await restoreClip(deleted, db);
    const back = (await meta(clip.id))!;
    expect(back.deletedAt).toBeUndefined();
    expect(Math.min(...Object.values(back.t))).toBeGreaterThan(tomb.deletedAt!);
  });

  it('leaves tombstones for every uploaded clip when all are deleted', async () => {
    const a = (await saveClip({ text: 'one' }, db))!;
    const b = (await saveClip({ text: 'two' }, db))!;
    await synced(a.id);
    await clearAll(db);
    expect((await meta(a.id))?.deletedAt).toBeGreaterThan(0);
    expect(await meta(b.id)).toBeUndefined();
  });

  it('tracks imported clips', async () => {
    await importBackup(
      {
        app: 'copydrawer',
        version: 2,
        exportedAt: '',
        collections: [],
        clips: [{ id: 'imp-1', text: 'from a file', kind: 'text' }],
      },
      db,
    );
    expect((await meta('imp-1'))?.dirty).toBe(1);
  });

  it('records nothing for writes through an untracked connection', async () => {
    const quiet = new ClipDatabase(db.name, { tracked: false });
    const clip = (await saveClip({ text: 'from Drive' }, quiet))!;
    expect(await meta(clip.id)).toBeUndefined();
    quiet.close();
  });
});
