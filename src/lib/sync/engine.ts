import { ClipDatabase, type Clip, type StoredImage } from '../db';
import { enforceLimit } from '../clips';
import { DriveError, type Drive, type DriveChange, type DriveFile } from './drive';
import { canonical, groupsOf, metaKey, SYNCED_TABLES, tick, type SyncedTable, type SyncMeta } from './meta';
import { decodeRecord, encodeRecord, fileName, mergeRecords, parseFileName, sameRecord, type SyncRecord } from './record';

/**
 * One sync with Drive: pull what other computers changed and merge it in, then push what changed here.
 * Every step can be cut short and run again: a pull saves its place a page at a time, and a push clears a
 * row's `dirty` mark only once Drive has that exact version.
 */

/** Marks this Drive copy: when it's deleted or replaced, every computer stops instead of following along. */
export const COPY_FILE = 'copy';
/** How long a deleted row's tombstone stays in Drive, so computers that were off still hear of the delete. */
export const TOMBSTONE_DAYS = 60;
const DAY = 86_400_000;
const PARALLEL = 6;
/** Pull and apply order: folders before the clips in them, images last since they're the largest. */
const ORDER: SyncedTable[] = ['collections', 'clips', 'images'];

export interface SyncCursor {
  /** Where the next pull continues in Drive's change list. Missing: compare everything. */
  pageToken?: string;
  lastSyncAt?: number;
  lastPurgeAt?: number;
}

export interface SyncProgress {
  phase: 'down' | 'up';
  done: number;
  total: number;
}

export interface SyncContext {
  db: ClipDatabase;
  drive: Drive;
  copyId: string;
  copyFileId: string;
  cursor: { get(): Promise<SyncCursor>; set(patch: Partial<SyncCursor>): Promise<void> };
  onProgress?: (p: SyncProgress) => void;
}

/** The Drive copy was deleted or started again, maybe on another computer. */
export class CopyChangedError extends Error {
  override name = 'CopyChangedError';
}

export async function syncOnce(ctx: SyncContext): Promise<void> {
  const quiet = new ClipDatabase(ctx.db.name, { tracked: false });
  try {
    await pull(ctx, quiet);
    await push(ctx);
    const { lastPurgeAt = 0 } = await ctx.cursor.get();
    if (Date.now() - lastPurgeAt > DAY) await purge(ctx, quiet);
    await ctx.cursor.set({ lastSyncAt: Date.now() });
  } finally {
    quiet.close();
  }
}

/** Before the first sync: every row here goes up, and keeps the age it has. */
export async function markAllForUpload(db: ClipDatabase): Promise<void> {
  await db.transaction('rw', [db.clips, db.images, db.collections, db.syncMeta], async () => {
    for (const table of SYNCED_TABLES) {
      const rows = (await db.table(table).toArray()) as Row[];
      const metas = await db.syncMeta.bulkGet(rows.map((r) => metaKey(table, r.id)));
      await db.syncMeta.bulkPut(
        rows.map((r, i): SyncMeta => {
          const m = metas[i];
          const born = Number(r.createdAt ?? 1);
          const t = m?.t ?? Object.fromEntries(Object.keys(groupsOf(table)).map((g) => [g, born]));
          return { ...m, key: metaKey(table, r.id), t, dirty: 1, rev: (m?.rev ?? 0) + 1 };
        }),
      );
    }
  });
}

type Row = Record<string, unknown> & { id: string };

function parseKey(key: string): { table: SyncedTable; id: string } {
  const slash = key.indexOf('/');
  return { table: key.slice(0, slash) as SyncedTable, id: key.slice(slash + 1) };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ---------- Pull ----------

async function pull(ctx: SyncContext, quiet: ClipDatabase) {
  let token = (await ctx.cursor.get()).pageToken;
  if (!token) return reconcile(ctx, quiet);
  for (;;) {
    let page;
    try {
      page = await ctx.drive.changes(token);
    } catch (e) {
      if (e instanceof DriveError && e.kind === 'token') return reconcile(ctx, quiet);
      throw e;
    }
    await applyChanges(ctx, quiet, page.changes);
    token = (page.nextPageToken ?? page.newStartPageToken)!;
    await ctx.cursor.set({ pageToken: token });
    if (!page.nextPageToken) return;
  }
}

/** Compares everything in Drive with everything here: at the first sync, or when the change list can't continue. */
async function reconcile(ctx: SyncContext, quiet: ClipDatabase) {
  const start = await ctx.drive.startPageToken();
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const page = await ctx.drive.list(pageToken);
    files.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);
  const copy = files.find((f) => f.name === COPY_FILE);
  if (copy?.id !== ctx.copyFileId) throw new CopyChangedError('The Drive copy was replaced.');

  await applyChanges(
    ctx,
    quiet,
    files.map((file) => ({ fileId: file.id, removed: false, file })),
  );
  // Rows that were in Drive and are gone: deleted elsewhere, and the tombstone since cleared away.
  const inDrive = new Set(files.map((f) => f.id));
  const lost = await quiet.syncMeta.filter((m) => !!m.fileId && !inDrive.has(m.fileId)).toArray();
  for (const m of lost) await forgetFile(quiet, m);
  await ctx.cursor.set({ pageToken: start });
}

async function applyChanges(ctx: SyncContext, quiet: ClipDatabase, changes: DriveChange[]) {
  // The marker goes before the rest of the copy, so nothing is deleted here because the copy was.
  for (const c of changes) {
    if (c.fileId === ctx.copyFileId && (c.removed || !c.file)) throw new CopyChangedError('The Drive copy was deleted.');
    if (c.file?.name === COPY_FILE && c.file.id === ctx.copyFileId) {
      const copy = JSON.parse(new TextDecoder().decode(await ctx.drive.download(c.file.id))) as { copyId?: string };
      if (copy.copyId !== ctx.copyId) throw new CopyChangedError('The Drive copy was started again.');
    }
  }

  for (const c of changes.filter((c) => c.removed || !c.file)) {
    const m = await quiet.syncMeta.where('fileId').equals(c.fileId).first();
    if (m) await forgetFile(quiet, m);
  }

  const live = changes.flatMap((c) => {
    const parsed = !c.removed && c.file ? parseFileName(c.file.name) : undefined;
    return parsed ? [{ file: c.file!, ...parsed }] : [];
  });
  live.sort((a, b) => ORDER.indexOf(a.table) - ORDER.indexOf(b.table));
  const metas = await quiet.syncMeta.bulkGet(live.map((f) => metaKey(f.table, f.id)));
  const fresh = live.filter((f, i) => !(metas[i]?.md5 && metas[i]!.md5 === f.file.md5Checksum));

  const fetchOne = (f: (typeof fresh)[number]) => ctx.drive.download(f.file.id).then(decodeRecord);
  // Downloads run a few ahead in parallel; merging goes one file at a time, in order.
  const ahead: (Promise<{ record: SyncRecord; bytes?: Blob }> | undefined)[] = [];
  const prefetch = (i: number) => {
    if (i < fresh.length && !ahead[i]) (ahead[i] = fetchOne(fresh[i]!)).catch(() => {});
  };
  let clipsAdded = false;
  for (const [i, f] of fresh.entries()) {
    for (let j = i; j < i + PARALLEL; j++) prefetch(j);
    const { record, bytes } = await ahead[i]!;
    ahead[i] = undefined;
    const changed = await applyRecord(ctx, quiet, f.table, f.id, f.file, record, bytes);
    clipsAdded ||= changed && f.table === 'clips';
    ctx.onProgress?.({ phase: 'down', done: i + 1, total: fresh.length });
  }
  if (clipsAdded) await enforceLimit(ctx.db);
}

/** The Drive file of this row is gone. */
async function forgetFile(quiet: ClipDatabase, m: SyncMeta) {
  const { table, id } = parseKey(m.key);
  await quiet.transaction('rw', [quiet.table(table), quiet.syncMeta], async () => {
    const now = await quiet.syncMeta.get(m.key);
    if (!now || now.fileId !== m.fileId) return;
    if (now.deletedAt) await quiet.syncMeta.delete(m.key);
    else if (now.dirty) await quiet.syncMeta.put({ ...now, fileId: undefined, md5: undefined });
    else {
      // It was in Drive, unchanged here since: deleted on another computer.
      await quiet.table(table).delete(id);
      await quiet.syncMeta.delete(m.key);
    }
  });
}

/** A row as it travels: an image goes as its type, its bytes follow the record. */
function toRecordRow(table: SyncedTable, row: Row): Row {
  return table === 'images' ? { id: row.id, type: (row as unknown as StoredImage).blob.type } : row;
}

/** Merges one record from Drive into this computer. Returns whether a row was added or changed here. */
async function applyRecord(
  ctx: SyncContext,
  quiet: ClipDatabase,
  table: SyncedTable,
  id: string,
  file: DriveFile,
  remote: SyncRecord,
  bytes: Blob | undefined,
): Promise<boolean> {
  if (table === 'collections' && remote.row) await settleSameKey(ctx, quiet, id, remote);
  const key = metaKey(table, id);
  const result = await quiet.transaction('rw', [quiet.clips, quiet.images, quiet.collections, quiet.syncMeta], async () => {
    const meta = await quiet.syncMeta.get(key);
    const stored = (await quiet.table(table).get(id)) as Row | undefined;
    const local: SyncRecord = {
      row: stored && toRecordRow(table, stored),
      t: meta?.t ?? {},
      deletedAt: meta?.deletedAt,
      mergedInto: meta?.mergedInto,
    };
    const merged = stored || meta ? mergeRecords(table, local, remote) : remote;

    if (table === 'clips' && merged.row?.collectionId) {
      // Its folder was merged into another, or deleted, on a computer that hadn't seen the clip go in.
      const folder = merged.row.collectionId as string;
      const gone = !(await quiet.collections.get(folder)) && (await quiet.syncMeta.get(metaKey('collections', folder)));
      if (gone && gone.mergedInto) merged.row = { ...merged.row, collectionId: gone.mergedInto };
      else if (gone && gone.deletedAt) merged.row = { ...merged.row, collectionId: undefined, collectionLocked: 0 };
    }

    let changed = false;
    if (merged.row) {
      if (table === 'images') {
        if (!stored && bytes) {
          await quiet.images.put({ id, blob: bytes });
          changed = true;
        }
      } else if (!stored || canonical(merged.row) !== canonical(local.row)) {
        await quiet.table(table).put(merged.row);
        changed = true;
      }
    } else if (stored) {
      await quiet.table(table).delete(id);
    }

    const upToDate = sameRecord(merged, remote);
    await quiet.syncMeta.put({
      key,
      t: merged.t,
      ...(merged.deletedAt && { deletedAt: merged.deletedAt }),
      ...(merged.mergedInto && { mergedInto: merged.mergedInto }),
      dirty: upToDate ? 0 : 1,
      rev: (meta?.rev ?? 0) + 1,
      // A second file for the same row (two computers made it at once): keep using the first.
      fileId: meta?.fileId && meta.fileId < file.id ? meta.fileId : file.id,
      md5: upToDate ? file.md5Checksum : meta?.md5,
    });
    return { changed, removed: merged.row ? undefined : stored, mergedInto: merged.mergedInto };
  });

  if (table === 'clips' && result.removed) await dropImageOf(ctx.db, result.removed as unknown as Clip);
  if (table === 'collections' && result.removed) {
    const into = result.mergedInto;
    await ctx.db.clips
      .where('collectionId')
      .equals(id)
      .modify(into ? { collectionId: into } : { collectionId: undefined, collectionLocked: 0 });
  }
  if (table === 'clips' && result.changed) await settleTwin(ctx, quiet, id);
  return result.changed;
}

/** A clip deleted by a merge takes its image along, through the tracked connection so Drive hears of it. */
async function dropImageOf(db: ClipDatabase, clip: Clip) {
  const imageId = clip.image?.imageId;
  if (imageId && !(await db.clips.filter((c) => c.image?.imageId === imageId).first())) await db.images.delete(imageId);
}

/**
 * Two computers saved the same text (or image) as two clips. The one with the smaller id stays, with the
 * newer of each field group from both; the other is deleted. Every computer picks the same one.
 */
async function settleTwin(ctx: SyncContext, quiet: ClipDatabase, id: string) {
  const clip = await quiet.clips.get(id);
  if (!clip) return;
  const twin = await quiet.clips
    .where('hash')
    .equals(clip.hash)
    .filter(
      (c) =>
        c.id !== id &&
        (c.kind === 'image') === (clip.kind === 'image') &&
        (clip.kind === 'image' || c.text.trim() === clip.text.trim()),
    )
    .first();
  if (!twin) return;
  const [keep, drop] = clip.id < twin.id ? [clip, twin] : [twin, clip];
  await quiet.transaction('rw', [quiet.clips, quiet.syncMeta], async () => {
    const [mk, md] = await quiet.syncMeta.bulkGet([metaKey('clips', keep.id), metaKey('clips', drop.id)]);
    const merged = mergeRecords(
      'clips',
      { row: { ...keep } as Row, t: mk?.t ?? {} },
      { row: { ...drop, id: keep.id } as Row, t: md?.t ?? {} },
    );
    await quiet.clips.put(merged.row as unknown as Clip);
    await quiet.syncMeta.put({ ...mk, key: metaKey('clips', keep.id), t: merged.t, dirty: 1, rev: (mk?.rev ?? 0) + 1 });
  });
  await ctx.db.clips.delete(drop.id);
  const kept = await ctx.db.clips.get(keep.id);
  if (drop.image && drop.image.imageId !== kept?.image?.imageId) await ctx.db.images.delete(drop.image.imageId);
}

/**
 * A folder from Drive has the key of a different folder here ("Research" made on two computers). The one
 * with the smaller id stays and takes the other's clips; the other becomes a tombstone that points to it.
 */
async function settleSameKey(ctx: SyncContext, quiet: ClipDatabase, id: string, remote: SyncRecord) {
  const here = await quiet.collections.where('key').equals(String(remote.row!.key)).first();
  if (!here || here.id === id) return;
  const [keep, drop] = here.id < id ? [here.id, id] : [id, here.id];
  const clips = await ctx.db.clips.where('collectionId').equals(drop).primaryKeys();
  await ctx.db.clips.bulkUpdate(clips.map((key) => ({ key, changes: { collectionId: keep } })));
  if (drop === here.id) await ctx.db.collections.delete(drop);
  await quiet.transaction('rw', quiet.syncMeta, async () => {
    const key = metaKey('collections', drop);
    const m = await quiet.syncMeta.get(key);
    // The folder from Drive loses: it's never stored here, only remembered as merged.
    const t = m?.t ?? remote.t;
    await quiet.syncMeta.put({ ...m, key, t, deletedAt: tick(), mergedInto: keep, dirty: 1, rev: (m?.rev ?? 0) + 1 });
  });
}

// ---------- Push ----------

async function push(ctx: SyncContext) {
  const dirty = await ctx.db.syncMeta.where('dirty').equals(1).toArray();
  dirty.sort((a, b) => ORDER.indexOf(parseKey(a.key).table) - ORDER.indexOf(parseKey(b.key).table));
  let done = 0;
  await mapLimit(dirty, PARALLEL, async (m) => {
    await pushOne(ctx, m);
    ctx.onProgress?.({ phase: 'up', done: ++done, total: dirty.length });
  });
}

async function pushOne(ctx: SyncContext, m: SyncMeta) {
  const { table, id } = parseKey(m.key);
  const row = m.deletedAt ? undefined : ((await ctx.db.table(table).get(id)) as Row | undefined);
  const record: SyncRecord = row
    ? { row: toRecordRow(table, row), t: m.t }
    : { t: m.t, deletedAt: m.deletedAt ?? tick(), ...(m.mergedInto && { mergedInto: m.mergedInto }) };
  const name = fileName(table, id);
  const data = await encodeRecord(record, table === 'images' && row ? (row as unknown as StoredImage).blob : undefined);
  const props = { del: record.deletedAt ? String(record.deletedAt) : null };

  let file: DriveFile | undefined;
  if (m.fileId) {
    file = await ctx.drive.update(m.fileId, data, props).catch((e: unknown) => {
      if (e instanceof DriveError && e.kind === 'gone') return undefined;
      throw e;
    });
  }
  file ??= await ctx.drive.create(name, data, props);

  await ctx.db.transaction('rw', ctx.db.syncMeta, async () => {
    const now = await ctx.db.syncMeta.get(m.key);
    if (!now) return;
    const same = now.rev === m.rev;
    await ctx.db.syncMeta.put({ ...now, fileId: file.id, md5: same ? file.md5Checksum : now.md5, dirty: same ? 0 : now.dirty });
  });
}

// ---------- Tombstones ----------

/** Clears tombstones older than TOMBSTONE_DAYS, from Drive and from here. */
async function purge(ctx: SyncContext, quiet: ClipDatabase) {
  const cutoff = Date.now() - TOMBSTONE_DAYS * DAY;
  // Listed in full first: deleting while paging could skip files.
  const old: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await ctx.drive.list(pageToken);
    for (const f of page.files) if (f.appProperties?.del && Number(f.appProperties.del) < cutoff) old.push(f.id);
    pageToken = page.nextPageToken;
  } while (pageToken);
  for (const id of old) await ctx.drive.remove(id);
  await quiet.syncMeta.filter((m) => !!m.deletedAt && m.deletedAt < cutoff && !m.dirty).delete();
  await ctx.cursor.set({ lastPurgeAt: Date.now() });
}
