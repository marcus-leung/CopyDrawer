import Dexie from 'dexie';
import { ClipDatabase, db as defaultDb } from './db';
import { pauseWrites, REBUILD_KEY, resumeWrites } from './storageGuard';

const RESCUE = 'clipboard-rescue';
const TABLES = ['clips', 'images', 'collections'] as const;
const BATCH = 50;

const counts = (db: ClipDatabase) => Promise.all(TABLES.map((t) => db.table(t).count()));

/** Copies every row of every table, a batch at a time so images never all sit in memory together. */
async function copyAll(from: ClipDatabase, to: ClipDatabase) {
  for (const name of TABLES) {
    let last: string | undefined;
    for (;;) {
      const source = from.table(name);
      const rows = await (last === undefined ? source.orderBy(':id') : source.where(':id').above(last)).limit(BATCH).toArray();
      if (!rows.length) break;
      await to.table(name).bulkPut(rows);
      last = (rows.at(-1) as { id: string }).id;
    }
  }
}

/**
 * After a disk error, Chrome's files for the database stay fragile: later writes can make Chrome discard
 * them at a restart. So the first start after one copies every clip into a fresh database, by way of a
 * rescue copy that a crash halfway can resume from. Returns whether it rebuilt.
 */
export async function rebuildIfNeeded(db: ClipDatabase = defaultDb): Promise<boolean> {
  const stage = (await browser.storage.local.get(REBUILD_KEY))[REBUILD_KEY] as 'needed' | 'copied' | undefined;
  if (!stage) return false;
  pauseWrites('rebuilding');
  try {
    // Without its rescue copy, a "copied" mark can't be trusted: copy again from the original.
    if (stage === 'needed' || !(await Dexie.exists(RESCUE))) {
      await Dexie.delete(RESCUE);
      const [source, rescue] = [new ClipDatabase(db.name, { guarded: false }), new ClipDatabase(RESCUE, { guarded: false })];
      await copyAll(source, rescue);
      const [had, copied] = await Promise.all([counts(source), counts(rescue)]);
      source.close();
      rescue.close();
      if (had.join() !== copied.join()) throw new Error(`Rescue copy incomplete: ${copied} of ${had}`);
      await browser.storage.local.set({ [REBUILD_KEY]: 'copied' });
    }
    db.close({ disableAutoOpen: false });
    await Dexie.delete(db.name);
    const [rescue, fresh] = [new ClipDatabase(RESCUE, { guarded: false }), new ClipDatabase(db.name, { guarded: false })];
    await copyAll(rescue, fresh);
    rescue.close();
    fresh.close();
    await Dexie.delete(RESCUE);
    await browser.storage.local.remove(REBUILD_KEY);
    resumeWrites();
    return true;
  } catch (e) {
    // The next start tries again from where this stopped; saving now could be lost then.
    pauseWrites('failed');
    throw e;
  }
}
