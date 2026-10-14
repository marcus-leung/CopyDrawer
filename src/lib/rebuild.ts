import Dexie from 'dexie';
import { ClipDatabase, db as defaultDb } from './db';
import {
  clearPause,
  freeSpace,
  markRebuildNeeded,
  MIN_FREE_BYTES,
  REBUILD_ALLOWED_KEY,
  REBUILD_KEY,
  setPause,
  STORAGE_ALARM,
} from './storageGuard';

const RESCUE = 'clipboard-rescue';
const TABLES = ['clips', 'images', 'collections', 'syncMeta'] as const;
const BATCH = 50;

const counts = (db: ClipDatabase) => Promise.all(TABLES.map((t) => db.table(t).count()));

/** Copies every row of every table a batch at a time, then checks nothing is missing. */
async function copyAll(from: ClipDatabase, to: ClipDatabase) {
  for (const name of TABLES) {
    let last: string | undefined;
    for (;;) {
      const source = from.table(name);
      const rows = await (last === undefined ? source.orderBy(':id') : source.where(':id').above(last)).limit(BATCH).toArray();
      if (!rows.length) break;
      await to.table(name).bulkPut(rows);
      last = (rows.at(-1) as Record<string, string>)[source.schema.primKey.keyPath as string];
    }
  }
  const [had, copied] = await Promise.all([counts(from), counts(to)]);
  if (had.join() !== copied.join()) throw new Error(`Copy incomplete: ${copied} of ${had}`);
}

/** Copies one database into a fresh one under `to`, replacing whatever is there. */
async function copyInto(fromName: string, to: string) {
  await Dexie.delete(to);
  const [from, fresh] = [
    new ClipDatabase(fromName, { guarded: false, tracked: false }),
    new ClipDatabase(to, { guarded: false, tracked: false }),
  ];
  try {
    await copyAll(from, fresh);
  } finally {
    from.close();
    fresh.close();
  }
}

/** Chrome just started: from now until it quits, the clips may be moved to fresh storage. */
export async function allowRebuild() {
  await browser.storage.session.set({ [REBUILD_ALLOWED_KEY]: true });
}

/**
 * After a disk error, Chrome's files for the database stay fragile: later writes can make Chrome discard
 * them at a restart. So once Chrome has restarted, every clip moves to a fresh database, by way of a rescue
 * copy that a crash halfway can resume from. Never in the session of the error itself (its storage is the
 * fragile one), and only with room for the copies. Returns whether it rebuilt.
 */
export async function rebuildIfNeeded(db: ClipDatabase = defaultDb): Promise<boolean> {
  const [{ [REBUILD_KEY]: stage }, session] = await Promise.all([
    browser.storage.local.get(REBUILD_KEY),
    browser.storage.session.get([REBUILD_ALLOWED_KEY, 'storagePaused']),
  ]);
  if (!stage || !session[REBUILD_ALLOWED_KEY] || session.storagePaused === 'disk') return false;

  const space = await freeSpace();
  // The rescue copy sits next to the original until the original is deleted.
  const need = space ? space.usage + MIN_FREE_BYTES - space.free : 0;
  if (need > 0) {
    await setPause('space', need);
    await browser.alarms.create(STORAGE_ALARM, { periodInMinutes: 1 });
    return false;
  }

  await setPause('rebuilding');
  try {
    // Without its rescue copy, a "copied" mark can't be trusted: copy again from the original.
    if (stage === 'needed' || !(await Dexie.exists(RESCUE))) {
      await copyInto(db.name, RESCUE);
      await browser.storage.local.set({ [REBUILD_KEY]: 'copied' });
    }
    db.close({ disableAutoOpen: false });
    await copyInto(RESCUE, db.name);
    await Dexie.delete(RESCUE);
    await browser.storage.local.remove(REBUILD_KEY);
    await browser.alarms.clear(STORAGE_ALARM);
    await clearPause();
    return true;
  } catch (e) {
    // The next start tries again from where this stopped.
    await setPause('failed');
    throw e;
  }
}

/** The storage alarm: keep trying to write the rebuild mark after a disk error, or to move the clips once there's room. */
export async function storageAlarm(db: ClipDatabase = defaultDb) {
  const { storagePaused } = await browser.storage.session.get('storagePaused');
  if (storagePaused === 'disk') {
    await markRebuildNeeded();
    if ((await browser.storage.local.get(REBUILD_KEY))[REBUILD_KEY]) await browser.alarms.clear(STORAGE_ALARM);
  } else await rebuildIfNeeded(db);
}
