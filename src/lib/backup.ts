/**
 * Export and import: one JSON file with clips, images and collections, so
 * people can move their history or keep a copy.
 */
import { db as defaultDb, type Clip, type ClipDatabase, type ClipKind, type Collection } from './db';
import { blobToDataUrl, dataUrlToBlob } from './images';
import { enforceLimit, hashText, makeTitle } from './clips';
import { cleanName } from './collections';

const KINDS: ClipKind[] = ['text', 'link', 'image', 'code'];

interface ExportedClip extends Omit<Clip, 'image'> {
  image?: Omit<NonNullable<Clip['image']>, 'thumb'> & { thumb: string; data?: string };
}

interface BackupFile {
  app: 'clipboard-extension';
  version: 1;
  exportedAt: string;
  collections: Collection[];
  clips: ExportedClip[];
}

export async function exportBackup(db: ClipDatabase = defaultDb): Promise<BackupFile> {
  const [clips, collections] = await Promise.all([db.clips.orderBy('createdAt').reverse().toArray(), db.collections.toArray()]);
  const out: ExportedClip[] = [];
  for (const { image, ...rest } of clips) {
    if (!image) {
      out.push(rest);
      continue;
    }
    const stored = await db.images.get(image.imageId);
    out.push({
      ...rest,
      image: { ...image, thumb: await blobToDataUrl(image.thumb), data: stored ? await blobToDataUrl(stored.blob) : undefined },
    });
  }
  return { app: 'clipboard-extension', version: 1, exportedAt: new Date().toISOString(), collections, clips: out };
}

export class BackupError extends Error {}

/** Adds clips from a backup. Clips already here (same content) are skipped. Returns how many were added. */
export async function importBackup(file: unknown, db: ClipDatabase = defaultDb): Promise<number> {
  const data = file as Partial<BackupFile>;
  if (!data || data.app !== 'clipboard-extension' || data.version !== 1 || !Array.isArray(data.clips)) {
    throw new BackupError("This file isn't a Clipboard export.");
  }
  let added = 0;
  await db.transaction('rw', [db.clips, db.images, db.collections], async () => {
    // Match collections by key so "Research" isn't duplicated.
    const idMap = new Map<string, string>();
    for (const c of data.collections ?? []) {
      if (!c?.id || !c.key || !c.name) continue;
      const existing = await db.collections.where('key').equals(c.key).first();
      if (existing) idMap.set(c.id, existing.id);
      else {
        const id = (await db.collections.get(c.id)) ? crypto.randomUUID() : c.id;
        await db.collections.add({ ...c, id, name: cleanName(c.name) || 'Collection', order: await db.collections.count() });
        idMap.set(c.id, id);
      }
    }
    const now = Date.now();
    for (const c of data.clips!) {
      if (!c || typeof c.text !== 'string' || !KINDS.includes(c.kind)) continue;
      const isImage = c.kind === 'image';
      // Text hashes are recomputed so a hand-edited file can't sneak in duplicates.
      const hash = isImage ? c.hash : hashText(c.text);
      if (typeof hash !== 'string' || (isImage && !c.image?.data)) continue;
      if (await db.clips.where('hash').equals(hash).first()) continue;
      let image: Clip['image'];
      let blob: Blob | undefined;
      if (isImage) {
        try {
          const { data: fileData, thumb, ...meta } = c.image!;
          blob = dataUrlToBlob(fileData!);
          image = { ...meta, imageId: crypto.randomUUID(), thumb: dataUrlToBlob(thumb) };
        } catch {
          continue; // damaged image data
        }
      }
      const id = typeof c.id === 'string' && c.id && !(await db.clips.get(c.id)) ? c.id : crypto.randomUUID();
      const clip: Clip = {
        ...c,
        id,
        hash,
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
  return added;
}
