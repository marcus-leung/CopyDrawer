import { ClipDatabase, type Clip, type StoredImage } from '../db';
import { enforceLimit } from '../clips';
import { DriveError, ignoreGone, type Drive, type DriveChange, type DriveFile } from './drive';
import { canonical, groupsOf, metaKey, stampAfter, SYNCED_TABLES, type SyncedTable, type SyncMeta } from './meta';
import {
  decodeRecord,
  encodeRecord,
  fileName,
  mergeRecords,
  parseFileName,
  sameRecord,
  UnreadableRecord,
  type SyncRecord,
} from './record';

/**
 * One sync with Drive: pull what other computers changed and merge it in, then push what changed here.
 * Every step can be cut short and run again: a pull saves its place a page at a time, a merged file is marked
 * as seen only after everything it led to is written, and a push clears a row's `dirty` mark only once Drive
 * has that exact version. Nothing is deleted here on the strength of a file being missing without checking.
 */

/** Marks this Drive copy: when it's deleted or replaced, every computer stops instead of following along. */
export const COPY_FILE = 'copy';
/** How long a deleted row's tombstone stays in Drive, so computers that were off still hear of the delete. */
export const TOMBSTONE_DAYS = 60;
const DAY = 86_400_000;
const PARALLEL = 6;
/** How often a long pull or push checks that sync is still on. */
const CHECK_EVERY = 25;
/** Pull and apply order: folders before the clips in them, images last since they're the largest. */
const ORDER: SyncedTable[] = ['collections', 'clips', 'images'];
const ALL_TABLES = ['clips', 'images', 'collections', 'syncMeta'] as const;

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
  /** Whether to keep going; checked between steps, so turning sync off stops a long sync. */
  stillOn?: () => Promise<boolean>;
  onProgress?: (p: SyncProgress) => void;
  /** The history cap; tests use a smaller one. */
  maxClips?: number;
}

/** The Drive copy was deleted or started again, maybe on another computer. */
export class CopyChangedError extends Error {
  override name = 'CopyChangedError';
}

/** Sync was turned off while this one ran. */
export class SyncCancelled extends Error {
  override name = 'SyncCancelled';
}

type Row = Record<string, unknown> & { id: string };

export async function syncOnce(ctx: SyncContext): Promise<void> {
  const quiet = new ClipDatabase(ctx.db.name, { tracked: false });
  try {
    const clipsAdded = await pull(ctx, quiet);
    await fetchMissingImages(ctx, quiet);
    await push(ctx);
    // Only now: a clip made here that hadn't gone up yet would otherwise be lost if it were the one to go.
    if (clipsAdded) await enforceLimit(ctx.db, ctx.maxClips);
    const { lastPurgeAt = 0 } = await ctx.cursor.get();
    if (Date.now() - lastPurgeAt > DAY) await purge(ctx, quiet);
    await ctx.cursor.set({ lastSyncAt: Date.now() });
  } finally {
    quiet.close();
  }
}

/** Before the first sync: every row here goes up, and keeps the age it has. Image bytes aren't read. */
export async function markAllForUpload(db: ClipDatabase): Promise<void> {
  await db.transaction('rw', [db.clips, db.images, db.collections, db.syncMeta], async () => {
    for (const table of SYNCED_TABLES) {
      const born = new Map<string, number>();
      if (table === 'images') for (const id of await db.images.toCollection().primaryKeys()) born.set(id, 1);
      else await db.table(table).each((r: Row) => born.set(r.id, Number(r.createdAt ?? 1)));
      const ids = [...born.keys()];
      const metas = await db.syncMeta.bulkGet(ids.map((id) => metaKey(table, id)));
      await db.syncMeta.bulkPut(
        ids.map((id, i): SyncMeta => {
          const m = metas[i];
          const t = m?.t ?? Object.fromEntries(Object.keys(groupsOf(table)).map((g) => [g, born.get(id)!]));
          return { ...m, key: metaKey(table, id), t, dirty: 1, rev: (m?.rev ?? 0) + 1 };
        }),
      );
    }
  });
}

async function checkOn(ctx: SyncContext) {
  if (ctx.stillOn && !(await ctx.stillOn())) throw new SyncCancelled('Sync was turned off');
}

function parseKey(key: string): { table: SyncedTable; id: string } {
  const slash = key.indexOf('/');
  return { table: key.slice(0, slash) as SyncedTable, id: key.slice(slash + 1) };
}

/**
 * Runs `fn` over the items a few at a time. After the first failure no new item starts, and it returns only
 * once those under way have finished, so nothing is still uploading after the sync lets go of its lock.
 */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failure: { error: unknown } | undefined;
  const worker = async () => {
    while (!failure && next < items.length) {
      try {
        await fn(items[next++]!);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw failure.error;
}

const byAge = (a: DriveFile, b: DriveFile) =>
  (a.createdTime ?? '').localeCompare(b.createdTime ?? '') || a.id.localeCompare(b.id);

/** Stops unless this computer's copy is still the one in Drive: its marker is there and unchanged. */
async function verifyCopy(ctx: SyncContext) {
  let data: Uint8Array;
  try {
    data = await ctx.drive.download(ctx.copyFileId);
  } catch (e) {
    if (e instanceof DriveError && e.kind === 'gone') throw new CopyChangedError('The Drive copy was deleted.');
    throw e;
  }
  const { copyId } = JSON.parse(new TextDecoder().decode(data)) as { copyId?: string };
  if (copyId !== ctx.copyId) throw new CopyChangedError('The Drive copy was started again.');
}

// ---------- Pull ----------

/** Returns whether clips were added here, which may take the history over its cap. */
async function pull(ctx: SyncContext, quiet: ClipDatabase): Promise<boolean> {
  let token = (await ctx.cursor.get()).pageToken;
  if (!token) return reconcile(ctx, quiet);
  let added = false;
  for (;;) {
    await checkOn(ctx);
    let page;
    try {
      page = await ctx.drive.changes(token);
    } catch (e) {
      if (e instanceof DriveError && e.kind === 'token') return reconcile(ctx, quiet);
      throw e;
    }
    added = (await applyChanges(ctx, quiet, page.changes)) || added;
    token = (page.nextPageToken ?? page.newStartPageToken)!;
    await ctx.cursor.set({ pageToken: token });
    if (!page.nextPageToken) return added;
  }
}

/** Compares everything in Drive with everything here: at the first sync, or when the change list can't continue. */
async function reconcile(ctx: SyncContext, quiet: ClipDatabase): Promise<boolean> {
  const start = await ctx.drive.startPageToken();
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const page = await ctx.drive.list(pageToken);
    files.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);
  // Two computers turning sync on at once can each make a marker; the oldest is the copy, as `find` has it.
  const marker = files.filter((f) => f.name === COPY_FILE).sort(byAge)[0];
  if (marker?.id !== ctx.copyFileId) throw new CopyChangedError('The Drive copy was replaced.');
  await verifyCopy(ctx);

  let added = await applyLive(
    ctx,
    quiet,
    files.filter((f) => f.name !== COPY_FILE),
  );
  // Rows whose file wasn't listed. A listing can miss files, so each one is asked for before it's forgotten.
  const listed = new Set(files.map((f) => f.id));
  const unlisted = await quiet.syncMeta.filter((m) => !!m.fileId && !listed.has(m.fileId)).toArray();
  for (const m of unlisted) {
    await checkOn(ctx);
    const file = await ctx.drive.get(m.fileId!).catch((e: unknown) => ignoreGone(e));
    if (file) added = (await applyLive(ctx, quiet, [file])) || added;
    else await forgetFile(ctx, quiet, m);
  }
  await ctx.cursor.set({ pageToken: start });
  return added;
}

async function applyChanges(ctx: SyncContext, quiet: ClipDatabase, changes: DriveChange[]): Promise<boolean> {
  // A file can come up more than once in a page; its last entry is how it is now.
  const latest = new Map<string, DriveChange>();
  for (const c of changes) {
    latest.delete(c.fileId);
    latest.set(c.fileId, c);
  }
  const all = [...latest.values()];
  const removed = all.filter((c) => c.removed || !c.file);
  // Removals may come before the marker's own in the change list (Drive's "Delete hidden app data" removes
  // files in any order), so the copy is confirmed before any of them deletes anything here.
  if (removed.length || all.some((c) => c.fileId === ctx.copyFileId)) await verifyCopy(ctx);
  for (const c of removed) {
    const m = await quiet.syncMeta.where('fileId').equals(c.fileId).first();
    if (m) await forgetFile(ctx, quiet, m);
  }
  return applyLive(
    ctx,
    quiet,
    all.flatMap((c) => (!c.removed && c.file && c.file.name !== COPY_FILE ? [c.file] : [])),
  );
}

/** Downloads and merges the files that changed since this computer last saw them. Returns whether clips were added. */
async function applyLive(ctx: SyncContext, quiet: ClipDatabase, files: DriveFile[]): Promise<boolean> {
  const live = files.flatMap((file) => {
    const parsed = parseFileName(file.name);
    return parsed ? [{ file, ...parsed }] : [];
  });
  live.sort((a, b) => ORDER.indexOf(a.table) - ORDER.indexOf(b.table));
  const metas = await quiet.syncMeta.bulkGet(live.map((f) => metaKey(f.table, f.id)));
  const fresh = live.filter((f, i) => {
    const m = metas[i];
    return !(m?.md5 && m.md5 === f.file.md5Checksum && m.fileId === f.file.id);
  });

  // null: the file is gone since it was listed (its removal follows), or can't be read by this version.
  const fetchOne = (f: (typeof fresh)[number]) =>
    ctx.drive
      .download(f.file.id)
      .then(decodeRecord)
      .catch((e: unknown) => {
        if (e instanceof DriveError && e.kind === 'gone') return null;
        if (e instanceof UnreadableRecord) {
          console.warn(`Drive sync skipped ${f.file.name}:`, e.message);
          return null;
        }
        throw e;
      });
  // Downloads run a few ahead in parallel; merging goes one file at a time, in order.
  const ahead: (ReturnType<typeof fetchOne> | undefined)[] = [];
  const prefetch = (i: number) => {
    if (i < fresh.length && !ahead[i]) (ahead[i] = fetchOne(fresh[i]!)).catch(() => {});
  };
  let clipsAdded = false;
  for (const [i, f] of fresh.entries()) {
    if (i % CHECK_EVERY === 0) await checkOn(ctx);
    for (let j = i; j < i + PARALLEL; j++) prefetch(j);
    const got = await ahead[i]!;
    ahead[i] = undefined;
    if (got) {
      const changed = await applyRecord(ctx, quiet, f.table, f.id, f.file, got.record, got.bytes);
      clipsAdded ||= changed && f.table === 'clips';
    }
    ctx.onProgress?.({ phase: 'down', done: i + 1, total: fresh.length });
  }
  return clipsAdded;
}

/**
 * The Drive file of this row is gone. A row in step with Drive was deleted on another computer, unless Drive
 * still has it under another file (two computers once made it at the same time).
 */
async function forgetFile(ctx: SyncContext, quiet: ClipDatabase, m: SyncMeta) {
  const { table, id } = parseKey(m.key);
  if (!m.deletedAt && !m.evicted && !m.dirty) {
    const other = await ctx.drive.find(fileName(table, id));
    if (other && other.id !== m.fileId) {
      await quiet.syncMeta.put({ ...m, fileId: other.id, md5: undefined });
      await applyLive(ctx, quiet, [other]);
      return;
    }
  }
  await quiet.transaction('rw', ALL_TABLES, async () => {
    const now = await quiet.syncMeta.get(m.key);
    if (!now || now.fileId !== m.fileId) return;
    if (now.deletedAt || now.evicted) return quiet.syncMeta.delete(m.key);
    const unsent = { ...now, fileId: undefined, md5: undefined };
    if (now.dirty) return quiet.syncMeta.put(unsent);
    // An image goes with its clips: while one still shows it, it's uploaded again.
    if (table === 'images' && (await usedImage(quiet, id))) return quiet.syncMeta.put({ ...unsent, dirty: 1, rev: now.rev + 1 });
    const row = (await quiet.table(table).get(id)) as Row | undefined;
    await quiet.table(table).delete(id);
    await quiet.syncMeta.delete(m.key);
    await afterRemoval(quiet, table, id, row, stampAfter(now));
  });
}

const usedImage = async (quiet: ClipDatabase, imageId: string) =>
  !!(await quiet.clips.filter((c) => c.image?.imageId === imageId).first());

/** Deletes a row here as part of a merge, leaving a tombstone if Drive has it. */
async function deleteHere(quiet: ClipDatabase, table: SyncedTable, id: string, at: number) {
  await quiet.table(table).delete(id);
  const key = metaKey(table, id);
  const m = await quiet.syncMeta.get(key);
  if (!m?.fileId) return void (await quiet.syncMeta.delete(key));
  await quiet.syncMeta.put({ ...m, deletedAt: Math.max(at, stampAfter(m)), evicted: undefined, dirty: 1, rev: m.rev + 1 });
}

/**
 * Marks a change this merge made to a row as this computer's, to go up: its groups get at least time `at`.
 * At 0 they keep their times, so a newer change made elsewhere still wins.
 */
async function changedHere(quiet: ClipDatabase, table: SyncedTable, id: string, groups: string[], at: number) {
  const key = metaKey(table, id);
  const m = await quiet.syncMeta.get(key);
  const t = { ...m?.t };
  for (const g of groups) t[g] = Math.max(t[g] ?? 0, at);
  await quiet.syncMeta.put({ ...m, key, t, dirty: 1, rev: (m?.rev ?? 0) + 1 });
}

/**
 * What follows a row's deletion here: a clip's image goes if no other clip shows it, and a folder's clips
 * are unfiled, or moved to the folder it merged into. Must run inside a transaction over every table.
 */
async function afterRemoval(
  quiet: ClipDatabase,
  table: SyncedTable,
  id: string,
  row: Row | undefined,
  at: number,
  mergedInto?: string,
) {
  if (table === 'clips') {
    const imageId = (row as unknown as Clip | undefined)?.image?.imageId;
    if (imageId && !(await usedImage(quiet, imageId))) await deleteHere(quiet, 'images', imageId, at);
  }
  if (table === 'collections') {
    for (const clip of await quiet.clips.where('collectionId').equals(id).toArray()) {
      await quiet.clips.put({ ...clip, collectionId: mergedInto, collectionLocked: mergedInto ? clip.collectionLocked : 0 });
      // Stamped with the time of the delete, not now, so a later move made elsewhere still wins.
      await changedHere(quiet, 'clips', clip.id, ['place'], mergedInto ? 0 : at);
    }
  }
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
  if (table === 'collections' && remote.row) await settleSameKey(quiet, id, remote);
  const key = metaKey(table, id);
  const result = await quiet.transaction('rw', ALL_TABLES, async () => {
    const meta = await quiet.syncMeta.get(key);
    // A row taken off this computer to make room counts as not here.
    const known = meta?.evicted ? undefined : meta;
    const stored = (await quiet.table(table).get(id)) as Row | undefined;
    const local: SyncRecord = {
      row: stored && toRecordRow(table, stored),
      t: known?.t ?? {},
      deletedAt: known?.deletedAt,
      mergedInto: known?.mergedInto,
    };
    const merged = stored || known ? mergeRecords(table, local, remote) : remote;

    if (table === 'clips' && merged.row?.collectionId) {
      // Its folder was merged into another, or deleted, on a computer that hadn't seen the clip go in.
      const folder = merged.row.collectionId as string;
      const gone = !(await quiet.collections.get(folder)) && (await quiet.syncMeta.get(metaKey('collections', folder)));
      if (gone && gone.mergedInto) merged.row = { ...merged.row, collectionId: gone.mergedInto };
      else if (gone && gone.deletedAt) merged.row = { ...merged.row, collectionId: undefined, collectionLocked: 0 };
    }

    let changed = false;
    // An image is kept only while a clip here shows it; one whose clip went (merged away, deleted) isn't.
    let notHere = false;
    if (merged.row) {
      if (table === 'images') {
        if (!stored && bytes && (await usedImage(quiet, id))) {
          await quiet.images.put({ id, blob: bytes });
          changed = true;
        } else notHere = !stored;
      } else if (!stored || canonical(merged.row) !== canonical(local.row)) {
        await quiet.table(table).put(merged.row);
        changed = true;
      }
    } else if (stored) {
      await quiet.table(table).delete(id);
    }
    // A merge that gave the clip another image (its twin's) leaves the old one to go, unless another clip shows it.
    const shownBefore = table === 'clips' ? (stored as unknown as Clip | undefined)?.image?.imageId : undefined;
    const shownNow = (merged.row as unknown as Clip | undefined)?.image?.imageId;
    if (merged.row && shownBefore && shownBefore !== shownNow && !(await usedImage(quiet, shownBefore))) {
      await deleteHere(quiet, 'images', shownBefore, stampAfter(meta));
    }

    // A second file for the same row (two computers made it at once): keep the older, remove the other.
    const extra = meta?.fileId && meta.fileId !== file.id ? (meta.fileId < file.id ? file.id : meta.fileId) : undefined;
    const upToDate = sameRecord(merged, remote) && !extra;
    const rev = (meta?.rev ?? 0) + 1;
    await quiet.syncMeta.put({
      key,
      t: merged.t,
      ...(merged.deletedAt && { deletedAt: merged.deletedAt }),
      ...(merged.mergedInto && { mergedInto: merged.mergedInto }),
      dirty: upToDate || notHere ? 0 : 1,
      rev,
      fileId: extra === file.id ? meta!.fileId : file.id,
      md5: meta?.md5,
      ...(notHere && { evicted: 1 as const }),
    });
    if (!merged.row && stored)
      await afterRemoval(quiet, table, id, stored, merged.deletedAt ?? stampAfter(meta), merged.mergedInto);
    return { changed, upToDate, extra, rev, alive: !!merged.row };
  });

  if (table === 'clips' && result.alive) await settleTwin(quiet, id);
  if (result.extra) await ctx.drive.remove(result.extra).catch((e: unknown) => ignoreGone(e));
  // Last, so a sync cut short before here merges the file again, and redoes what followed from it.
  if (result.upToDate) {
    await quiet.transaction('rw', quiet.syncMeta, async () => {
      const now = await quiet.syncMeta.get(key);
      if (now?.rev === result.rev) await quiet.syncMeta.put({ ...now, md5: file.md5Checksum });
    });
  }
  return result.changed;
}

/**
 * Clips here whose image isn't: it came before any clip here showed it (and so wasn't kept), or a merge
 * gave a clip its twin's image. Fetched from Drive.
 */
async function fetchMissingImages(ctx: SyncContext, quiet: ClipDatabase) {
  const have = new Set(await quiet.images.toCollection().primaryKeys());
  const missing = new Set<string>();
  await quiet.clips.each((c) => c.image && !have.has(c.image.imageId) && missing.add(c.image.imageId));
  for (const imageId of missing) {
    const m = await quiet.syncMeta.get(metaKey('images', imageId));
    // A file this computer knows of is fetched by id; otherwise looked up by name.
    const file = m?.fileId
      ? await ctx.drive.get(m.fileId).catch((e: unknown) => ignoreGone(e))
      : await ctx.drive.find(fileName('images', imageId));
    if (!file) continue;
    // A clip shows it again, so a removal still waiting to go out is called off.
    if (m) await quiet.syncMeta.put({ ...m, deletedAt: undefined, evicted: undefined, dirty: 0, md5: undefined });
    await applyLive(ctx, quiet, [file]);
  }
}

/**
 * Two computers saved the same text (or image) as two clips. The one with the smaller id stays, with the
 * newer of each field group from both; the other is deleted. Every computer picks the same one.
 */
async function settleTwin(quiet: ClipDatabase, id: string) {
  await quiet.transaction('rw', ALL_TABLES, async () => {
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
    const [mk, md] = await quiet.syncMeta.bulkGet([metaKey('clips', keep.id), metaKey('clips', drop.id)]);
    const merged = mergeRecords(
      'clips',
      { row: { ...keep } as Row, t: mk?.t ?? {} },
      { row: { ...drop, id: keep.id } as Row, t: md?.t ?? {} },
    );
    await quiet.clips.put(merged.row as unknown as Clip);
    await quiet.syncMeta.put({ ...mk, key: metaKey('clips', keep.id), t: merged.t, dirty: 1, rev: (mk?.rev ?? 0) + 1 });
    await deleteHere(quiet, 'clips', drop.id, stampAfter(md));
    // The merged clip shows one of the two images; the other goes unless another clip shows it.
    const shown = (merged.row as unknown as Clip).image?.imageId;
    for (const imageId of new Set([keep.image?.imageId, drop.image?.imageId])) {
      if (imageId && imageId !== shown && !(await usedImage(quiet, imageId))) {
        await deleteHere(quiet, 'images', imageId, stampAfter(md));
      }
    }
  });
}

/**
 * A folder from Drive has the key of a different folder here ("Research" made on two computers). The one
 * with the smaller id stays and takes the other's clips; the other becomes a tombstone that points to it.
 */
async function settleSameKey(quiet: ClipDatabase, id: string, remote: SyncRecord) {
  await quiet.transaction('rw', ALL_TABLES, async () => {
    const here = await quiet.collections.where('key').equals(String(remote.row!.key)).first();
    if (!here || here.id === id) return;
    const [keep, drop] = here.id < id ? [here.id, id] : [id, here.id];
    if (drop === here.id) await quiet.collections.delete(drop);
    await afterRemoval(quiet, 'collections', drop, undefined, 0, keep);
    const key = metaKey('collections', drop);
    const m = await quiet.syncMeta.get(key);
    // The folder from Drive loses: it's never stored here, only remembered as merged.
    const t = m?.t ?? remote.t;
    await quiet.syncMeta.put({ ...m, key, t, deletedAt: stampAfter({ t }), mergedInto: keep, dirty: 1, rev: (m?.rev ?? 0) + 1 });
  });
}

// ---------- Push ----------

async function push(ctx: SyncContext) {
  const dirty = await ctx.db.syncMeta.where('dirty').equals(1).toArray();
  dirty.sort((a, b) => ORDER.indexOf(parseKey(a.key).table) - ORDER.indexOf(parseKey(b.key).table));
  let done = 0;
  await mapLimit(dirty, PARALLEL, async (m) => {
    if (done % CHECK_EVERY === 0) await checkOn(ctx);
    await pushOne(ctx, m);
    ctx.onProgress?.({ phase: 'up', done: ++done, total: dirty.length });
  });
}

/** Records the outcome of an upload, unless the row changed meanwhile: then it stays marked to go up again. */
async function uploaded(ctx: SyncContext, m: SyncMeta, file: DriveFile | null): Promise<'done' | 'orphan'> {
  return ctx.db.transaction('rw', ctx.db.syncMeta, async () => {
    const now = await ctx.db.syncMeta.get(m.key);
    // Deleted here while it went up for the first time: nothing here will ever delete that file.
    if (!now) return file && !m.fileId ? 'orphan' : 'done';
    if (!file) {
      if (now.rev === m.rev) await ctx.db.syncMeta.delete(m.key);
      return 'done';
    }
    const same = now.rev === m.rev;
    await ctx.db.syncMeta.put({ ...now, fileId: file.id, md5: same ? file.md5Checksum : now.md5, dirty: same ? 0 : now.dirty });
    return 'done';
  });
}

async function pushOne(ctx: SyncContext, m: SyncMeta) {
  const { table, id } = parseKey(m.key);
  // An image goes with its clip: once deleted here, its file is simply removed.
  if (table === 'images' && m.deletedAt) {
    if (m.fileId) await ctx.drive.remove(m.fileId).catch((e: unknown) => ignoreGone(e));
    await uploaded(ctx, m, null);
    return;
  }
  const row = m.deletedAt ? undefined : ((await ctx.db.table(table).get(id)) as Row | undefined);
  const record: SyncRecord = row
    ? { row: toRecordRow(table, row), t: m.t }
    : { t: m.t, deletedAt: m.deletedAt ?? stampAfter(m), ...(m.mergedInto && { mergedInto: m.mergedInto }) };
  const name = fileName(table, id);
  const data = await encodeRecord(record, table === 'images' && row ? (row as unknown as StoredImage).blob : undefined);
  const del = record.deletedAt ? String(record.deletedAt) : undefined;

  let file: DriveFile | undefined;
  if (m.fileId) file = await ctx.drive.update(m.fileId, data, { del: del ?? null }).catch((e: unknown) => ignoreGone(e));
  file ??= await ctx.drive.create(name, data, del ? { del } : undefined);
  if ((await uploaded(ctx, m, file)) === 'orphan') await ctx.drive.remove(file.id).catch((e: unknown) => ignoreGone(e));
}

// ---------- Tombstones ----------

/** Clears tombstones older than TOMBSTONE_DAYS, from Drive and from here. */
async function purge(ctx: SyncContext, quiet: ClipDatabase) {
  const cutoff = Date.now() - TOMBSTONE_DAYS * DAY;
  const old = (f: DriveFile | undefined) => !!f?.appProperties?.del && Number(f.appProperties.del) < cutoff;
  // Listed in full first: deleting while paging could skip files.
  const candidates: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await ctx.drive.list(pageToken);
    for (const f of page.files) if (old(f)) candidates.push(f.id);
    pageToken = page.nextPageToken;
  } while (pageToken);
  for (const id of candidates) {
    await checkOn(ctx);
    // Checked again just before: another computer may have brought the row back since the listing.
    const file = await ctx.drive.get(id).catch((e: unknown) => ignoreGone(e));
    if (old(file)) await ctx.drive.remove(id).catch((e: unknown) => ignoreGone(e));
  }
  await quiet.syncMeta.filter((m) => !!m.deletedAt && m.deletedAt < cutoff && !m.dirty).delete();
  await ctx.cursor.set({ lastPurgeAt: Date.now() });
}
