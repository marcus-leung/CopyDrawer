/**
 * Export and import. An export is a .zip: clips.html to read, clips.json (what Import reads),
 * and images/ with the full-size files. Import rebuilds previews, so an older export's .thumbnails/ is ignored.
 * Older exports were a single .json with images inlined as data URLs; Import still reads those.
 */
import { strFromU8, strToU8, unzipSync, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { db as defaultDb, type Clip, type ClipDatabase, type Collection } from './db';
import { CLIP_KINDS, detectKind } from './kinds';
import { checkImage, dataUrlToBlob, imageHash, makeThumbnail } from './images';
import { enforceLimit, hashText, makeTitle } from './clips';
import { cleanName, nextOrder } from './collections';
import { updateSettings, type Settings } from './settings';
import { renderBackupPage } from './backupPage';

/** A clip as written to clips.json. `image.data` is a path in the zip (version 2) or a data URL (version 1). */
export interface ExportedClip extends Omit<Clip, 'image'> {
  /** The collection's name, for people reading the file. */
  collection?: string;
  image?: Omit<NonNullable<Clip['image']>, 'thumb'> & { thumb?: string; data?: string };
}

/** Exports write the first; the second is from before the rename, and still imports. */
const APPS: unknown[] = ['copydrawer', 'clipboard-extension'];

export interface BackupFile {
  app: 'copydrawer' | 'clipboard-extension';
  version: 1 | 2;
  exportedAt: string;
  collections: Collection[];
  clips: ExportedClip[];
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const MIME = Object.fromEntries(Object.entries(EXT).map(([mime, ext]) => [ext, mime]));
const extOf = (mime: string) => EXT[mime] ?? 'bin';
// fflate always allocates plain ArrayBuffers, which is what Blob wants.
const bytesPart = (u: Uint8Array) => u as Uint8Array<ArrayBuffer>;

export async function exportBackup(db: ClipDatabase = defaultDb): Promise<{ file: BackupFile; images: Map<string, Blob> }> {
  const [clips, collections] = await Promise.all([db.clips.orderBy('createdAt').reverse().toArray(), db.collections.toArray()]);
  const names = new Map(collections.map((c) => [c.id, c.name]));
  const images = new Map<string, Blob>();
  const out: ExportedClip[] = [];
  let n = 0;
  for (const { image, title, text, kind, ...rest } of clips) {
    // Readable fields first.
    const clip: ExportedClip = {
      title,
      text,
      kind,
      collection: rest.collectionId ? names.get(rest.collectionId) : undefined,
      ...rest,
    };
    if (image) {
      const stored = await db.images.get(image.imageId);
      // Named by position: a clip's id came from who knows where (an imported file).
      n++;
      const data = stored ? `images/${n}.${extOf(image.mime)}` : undefined;
      if (stored) images.set(data!, stored.blob);
      const { thumb: _thumb, ...meta } = image;
      clip.image = { ...meta, data };
    }
    out.push(clip);
  }
  const file: BackupFile = {
    app: 'copydrawer',
    version: 2,
    exportedAt: new Date().toISOString(),
    collections,
    clips: out,
  };
  return { file, images };
}

export async function exportZip(db: ClipDatabase = defaultDb): Promise<Blob> {
  return zipBackup(await exportBackup(db));
}

/**
 * Builds the zip a file at a time, letting the panel paint in between. Each piece becomes a Blob as it's made,
 * which Chrome can keep out of the page's memory, so the bytes read for one image can go before the next.
 */
async function zipBackup({ file, images }: { file: BackupFile; images: Map<string, Blob> }): Promise<Blob> {
  const parts: BlobPart[] = [];
  let failed: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) failed = err;
    else parts.push(new Blob([bytesPart(chunk)]));
  });
  const add = (entry: ZipDeflate | ZipPassThrough, data: Uint8Array) => {
    zip.add(entry);
    entry.push(data, true);
  };
  add(new ZipDeflate('clips.html'), strToU8(renderBackupPage(file)));
  add(new ZipDeflate('clips.json'), strToU8(JSON.stringify(file, null, 2)));
  // Images are already compressed: store them as they are.
  for (const [path, blob] of images) {
    add(new ZipPassThrough(path), new Uint8Array(await blob.arrayBuffer()));
    await new Promise((r) => setTimeout(r));
  }
  zip.end();
  if (failed) throw failed;
  return new Blob(parts, { type: 'application/zip' });
}

export interface ImportResult {
  added: number;
  /** Damaged, or an image that's missing, not an image, or too big. Clips already here aren't counted. */
  skipped: number;
}

/** Imports an export: a .zip, or an older .json. */
export async function importFile(blob: Blob, db: ClipDatabase = defaultDb): Promise<ImportResult> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const notExport = () => new BackupError("This file isn't a CopyDrawer export.");
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes);
    } catch {
      throw notExport();
    }
    // The shallowest clips.json: an export re-zipped as a folder has everything one level down.
    const json = Object.keys(files)
      .filter((path) => path === 'clips.json' || path.endsWith('/clips.json'))
      .sort((a, b) => a.split('/').length - b.split('/').length)[0];
    if (!json) throw notExport();
    const root = json.slice(0, -'clips.json'.length);
    const inRoot = Object.entries(files).flatMap(([path, data]) =>
      path.startsWith(root) ? [[path.slice(root.length), data] as const] : [],
    );
    return importBackup(parse(strFromU8(files[json]!)), db, new Map(inRoot));
  }
  const data = parse(strFromU8(bytes));
  if (APPS.includes((data as Partial<BackupFile>)?.app) && (data as Partial<BackupFile>).version === 2) {
    throw new BackupError('This is the clips.json from an export. Import the whole .zip instead.');
  }
  return importBackup(data, db);

  function parse(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      throw notExport();
    }
  }
}

/** An image from the file: a data URL (version 1) or a path in the zip (version 2). */
function imageBlob(ref: string, files?: Map<string, Uint8Array>): Blob {
  if (ref.startsWith('data:')) return dataUrlToBlob(ref);
  const bytes = files?.get(ref);
  if (!bytes) throw new Error(`missing ${ref}`);
  return new Blob([bytesPart(bytes)], { type: MIME[ref.split('.').pop() ?? ''] ?? '' });
}

export class BackupError extends Error {}

/** Adds clips from a backup. Clips already here (same content) are skipped. Returns how many were added. */
export async function importBackup(
  file: unknown,
  db: ClipDatabase = defaultDb,
  files?: Map<string, Uint8Array>,
): Promise<ImportResult> {
  const data = file as Partial<BackupFile>;
  if (!data || !APPS.includes(data.app) || (data.version !== 1 && data.version !== 2) || !Array.isArray(data.clips)) {
    throw new BackupError("This file isn't a CopyDrawer export.");
  }
  // Images are checked, hashed and given a preview first: that can't run inside the database transaction.
  const images = new Map<ExportedClip, PreparedImage | 'duplicate' | null>();
  for (const c of data.clips) {
    if (c?.kind === 'image') images.set(c, await prepareImport(c, db, files));
  }
  let added = 0;
  let skipped = 0;
  await db.transaction('rw', [db.clips, db.images, db.collections], async () => {
    // Match collections by key so "Research" isn't duplicated.
    const idMap = new Map<string, string>();
    for (const c of data.collections ?? []) {
      if (!c?.id || !c.key || !c.name) continue;
      const existing = await db.collections.where('key').equals(c.key).first();
      if (existing) idMap.set(c.id, existing.id);
      else {
        const id = (await db.collections.get(c.id)) ? crypto.randomUUID() : c.id;
        await db.collections.add({ ...c, id, name: cleanName(c.name) || 'Collection', order: await nextOrder(db) });
        idMap.set(c.id, id);
      }
    }
    const now = Date.now();
    for (const c of data.clips!) {
      if (!c || typeof c.text !== 'string' || !CLIP_KINDS.includes(c.kind)) {
        skipped++;
        continue;
      }
      const isImage = c.kind === 'image';
      const img = isImage ? images.get(c) : undefined;
      if (img === 'duplicate') continue;
      if (isImage && !img) {
        skipped++;
        continue;
      }
      // Hashes are recomputed so a hand-edited file can't sneak in duplicates.
      const hash = img ? img.hash : hashText(c.text);
      if (await db.clips.where('hash').equals(hash).first()) continue;
      const blob = img ? imageBlob(c.image!.data!, files) : undefined;
      const image: Clip['image'] = img
        ? {
            imageId: crypto.randomUUID(),
            mime: blob!.type,
            bytes: blob!.size,
            width: img.width,
            height: img.height,
            thumb: img.thumb,
            srcUrl: typeof c.image?.srcUrl === 'string' ? c.image.srcUrl : undefined,
          }
        : undefined;
      const keepId = typeof c.id === 'string' && SAFE_ID.test(c.id) && !(await db.clips.get(c.id));
      const { collection: _name, ...fields } = c;
      const clip: Clip = {
        ...fields,
        id: keepId ? c.id : crypto.randomUUID(),
        hash,
        // Types are re-detected, so older exports get the newer types too.
        kind: isImage ? 'image' : detectKind(c.text),
        title: typeof c.title === 'string' && c.title.trim() ? c.title : makeTitle(c.text, c.kind),
        createdAt: Number.isFinite(c.createdAt) ? Math.min(c.createdAt, now) : now,
        lastUsedAt: Number.isFinite(c.lastUsedAt) ? c.lastUsedAt : 0,
        useCount: Number.isFinite(c.useCount) ? c.useCount : 0,
        pinned: c.pinned === 1 ? 1 : 0,
        collectionId: c.collectionId ? idMap.get(c.collectionId) : undefined,
        image,
        note: isImage && typeof c.note === 'string' && c.note.trim() ? c.note : undefined,
      };
      if (image) await db.images.put({ id: image.imageId, blob: blob! });
      await db.clips.add(clip);
      added++;
    }
  });
  await enforceLimit(db);
  return { added, skipped };
}

const SAFE_ID = /^[\w-]{1,64}$/;

interface PreparedImage {
  hash: string;
  thumb: Blob;
  width: number;
  height: number;
}

/**
 * An image clip held to the same rules as saving one: a real image type, not too big, and bytes that decode.
 * The preview and size are rebuilt, not taken from the file. Clips already here are spotted before decoding.
 * Only this small result is kept; the full image is read again from the file when it's written.
 */
async function prepareImport(c: ExportedClip, db: ClipDatabase, files?: Map<string, Uint8Array>) {
  try {
    const blob = imageBlob(c.image!.data!, files);
    checkImage(blob);
    const hash = await imageHash(blob);
    if (await db.clips.where('hash').equals(hash).first()) return 'duplicate' as const;
    const { thumb, width, height } = await makeThumbnail(blob);
    return { hash, thumb, width, height };
  } catch {
    return null; // missing, damaged, not an image or too big
  }
}

const DAY = 86_400_000;
export const BACKUP_EVERY = 30 * DAY;
export const BACKUP_SNOOZE = 7 * DAY;
/** Below this many clips there's little to lose, so no reminder. */
const BACKUP_MIN_CLIPS = 50;

export function backupDue(
  s: Pick<Settings, 'backupReminder' | 'backupRemindAfter'>,
  clipCount: number,
  now = Date.now(),
): boolean {
  return s.backupReminder && clipCount >= BACKUP_MIN_CLIPS && s.backupRemindAfter > 0 && now >= s.backupRemindAfter;
}

/** Downloads every clip as a .zip and puts the next reminder a month away. Returns how many clips it saved. */
export async function downloadBackup(): Promise<number> {
  const backup = await exportBackup();
  const url = URL.createObjectURL(await zipBackup(backup));
  const a = document.createElement('a');
  a.href = url;
  a.download = `copydrawer-export-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  const now = Date.now();
  await updateSettings({ lastExportAt: now, backupRemindAfter: now + BACKUP_EVERY });
  return backup.file.clips.length;
}
