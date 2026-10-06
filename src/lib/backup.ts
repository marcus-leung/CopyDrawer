/**
 * Export and import: one JSON file with clips, images and collections, so
 * people can move their history or keep a copy. Search vectors are left out
 * (they're rebuilt on this device after import).
 */
import { db as defaultDb, type Clip, type ClipDatabase, type Collection } from './db';
import { blobToDataUrl, dataUrlToBlob } from './images';
import { enforceLimit } from './clips';

interface ExportedClip extends Omit<Clip, 'embedding' | 'embeddingModel' | 'image'> {
  image?: Omit<NonNullable<Clip['image']>, 'thumb'> & { thumb: string; data?: string };
}

export interface BackupFile {
  app: 'clipboard-extension';
  version: 1;
  exportedAt: string;
  collections: Collection[];
  clips: ExportedClip[];
}

export async function exportBackup(db: ClipDatabase = defaultDb): Promise<BackupFile> {
  const [clips, collections] = await Promise.all([db.clips.orderBy('createdAt').reverse().toArray(), db.collections.toArray()]);
  const out: ExportedClip[] = [];
  for (const { embedding: _e, embeddingModel: _m, image, ...rest } of clips) {
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
        await db.collections.add({ ...c, id, order: await db.collections.count() });
        idMap.set(c.id, id);
      }
    }
    for (const c of data.clips!) {
      if (!c || typeof c.text !== 'string' || typeof c.hash !== 'string' || !c.kind) continue;
      if (await db.clips.where('hash').equals(c.hash).first()) continue;
      const id = (await db.clips.get(c.id)) ? crypto.randomUUID() : c.id || crypto.randomUUID();
      const clip: Clip = {
        ...c,
        id,
        pinned: c.pinned === 1 ? 1 : 0,
        collectionId: c.collectionId ? idMap.get(c.collectionId) : undefined,
        image: undefined,
      };
      if (c.image) {
        if (!c.image.data) continue; // an image without its file can't be used
        const imageId = crypto.randomUUID();
        await db.images.put({ id: imageId, blob: dataUrlToBlob(c.image.data) });
        const { data: _d, thumb, ...meta } = c.image;
        clip.image = { ...meta, imageId, thumb: dataUrlToBlob(thumb) };
      }
      await db.clips.add(clip);
      added++;
    }
  });
  await enforceLimit(db);
  return added;
}
