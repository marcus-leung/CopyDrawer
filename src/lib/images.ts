import { db as defaultDb, type Clip, type ClipDatabase, type ClipSource } from './db';
import { enforceLimit, saveTime } from './clips';
import { autoAssign } from './collections';
import { clearLowSpace, ensureSpace, storageProblem } from './storageGuard';

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const THUMB_MAX = 320;

export const NOT_AN_IMAGE = 'Only PNG, JPG, GIF and WebP images can be saved.';

export class ImageError extends Error {}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function imageHash(blob: Blob): Promise<string> {
  return `img:${await sha256Hex(blob)}`;
}

/** Throws unless the blob is an image type we keep and isn't too big. */
export function checkImage(blob: Blob) {
  if (!IMAGE_TYPES.includes(blob.type)) throw new ImageError(NOT_AN_IMAGE);
  if (blob.size > MAX_IMAGE_BYTES) throw new ImageError('Images up to 20 MB can be saved.');
}

/** Makes a small preview; decoding also proves the bytes are an image. Works in pages and in the service worker. */
export async function makeThumbnail(blob: Blob): Promise<{ thumb: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  const scale = Math.min(1, THUMB_MAX / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('Canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const thumb = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
  return { thumb, width, height };
}

function imageTitle(source?: ClipSource, fileName?: string, alt?: string): string {
  if (alt?.trim()) return alt.trim().slice(0, 80);
  if (fileName) return fileName;
  if (source?.title) return `Image from ${source.title}`.slice(0, 80);
  return 'Image';
}

interface NewImage {
  blob: Blob;
  source?: ClipSource;
  srcUrl?: string;
  fileName?: string;
  alt?: string;
  note?: string;
}

/** Saves an image clip; duplicates (same bytes) move to the top. `created` is false for those. */
export async function saveImageClip(input: NewImage, db: ClipDatabase = defaultDb): Promise<{ clip: Clip; created: boolean }> {
  const { blob } = input;
  checkImage(blob);
  await ensureSpace(blob.size * 2);

  const hash = await imageHash(blob);
  const note = input.note?.trim() || undefined;
  const { thumb, width, height } = await makeThumbnail(blob);
  const now = saveTime();

  const result = await db.transaction('rw', [db.clips, db.images, db.collections, db.syncMeta], async () => {
    const existing = await db.clips.where('hash').equals(hash).first();
    if (existing) {
      const updated = { ...existing, createdAt: now, source: input.source ?? existing.source, note: note ?? existing.note };
      await db.clips.put(updated);
      return { clip: updated, created: false };
    }
    const imageId = crypto.randomUUID();
    await db.images.add({ id: imageId, blob });
    const clip: Clip = {
      id: crypto.randomUUID(),
      createdAt: now,
      lastUsedAt: 0,
      useCount: 0,
      kind: 'image',
      text: input.alt?.trim() ?? '',
      title: imageTitle(input.source, input.fileName, input.alt),
      source: input.source,
      pinned: 0,
      hash,
      image: { imageId, mime: blob.type, width, height, bytes: blob.size, thumb, srcUrl: input.srcUrl },
      note,
    };
    await db.clips.add(clip);
    const sorted = await autoAssign(clip, db);
    await enforceLimit(db);
    return { clip: sorted, created: true };
  });
  clearLowSpace();
  return result;
}

/** Saves each file as an image clip, carrying on past ones that fail. */
export async function saveImages<T extends Blob>(
  files: T[],
  note?: string,
): Promise<{ saved: number; failed: T[]; error?: string }> {
  let saved = 0;
  const failed: T[] = [];
  let error: string | undefined;
  for (const blob of files) {
    try {
      await saveImageClip({ blob, fileName: blob instanceof File ? blob.name : undefined, note });
      saved++;
    } catch (e) {
      failed.push(blob);
      error = e instanceof ImageError ? e.message : (storageProblem(e)?.title ?? "Couldn't save that image.");
    }
  }
  return { saved, failed, error };
}

export async function getImageBlob(clip: Clip, db: ClipDatabase = defaultDb): Promise<Blob | undefined> {
  if (!clip.image) return undefined;
  return (await db.images.get(clip.image.imageId))?.blob;
}

/** Converts any image to PNG, the one type the async clipboard always accepts. */
export async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/png' });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta = '', data = ''] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? 'application/octet-stream';
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
