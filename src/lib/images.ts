import { db as defaultDb, type Clip, type ClipDatabase, type ClipSource } from './db';
import { enforceLimit } from './clips';

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const THUMB_MAX = 320;

export class ImageError extends Error {}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Makes a small preview. Works in pages and in the service worker. */
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

export function imageTitle(source?: ClipSource, fileName?: string, alt?: string): string {
  if (alt?.trim()) return alt.trim().slice(0, 80);
  if (fileName) return fileName;
  if (source?.title) return `Image from ${source.title}`.slice(0, 80);
  return 'Image';
}

export interface NewImage {
  blob: Blob;
  source?: ClipSource;
  srcUrl?: string;
  fileName?: string;
  alt?: string;
}

/** Saves an image clip; duplicates (same bytes) move to the top. */
export async function saveImageClip(input: NewImage, db: ClipDatabase = defaultDb): Promise<Clip> {
  const { blob } = input;
  if (!IMAGE_TYPES.includes(blob.type)) throw new ImageError('Only PNG, JPG, GIF and WebP images can be saved.');
  if (blob.size > MAX_IMAGE_BYTES) throw new ImageError('Images up to 20 MB can be saved.');

  const hash = `img:${await sha256Hex(blob)}`;
  const { thumb, width, height } = await makeThumbnail(blob);
  const now = Date.now();

  return db.transaction('rw', db.clips, db.images, async () => {
    const existing = await db.clips.where('hash').equals(hash).first();
    if (existing) {
      const updated = { ...existing, createdAt: now, source: input.source ?? existing.source };
      await db.clips.put(updated);
      return updated;
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
    };
    await db.clips.add(clip);
    await enforceLimit(db);
    return clip;
  });
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

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
