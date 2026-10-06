import type { Clip } from './db';
import { getImageBlob, IMAGE_TYPES, toPng } from './images';

/** Copies a clip to the system clipboard, keeping formatting (or the image) when we have it. */
export async function copyClipToClipboard(clip: Clip): Promise<void> {
  if (clip.kind === 'image') {
    const blob = await getImageBlob(clip);
    if (!blob) throw new Error('Image file missing');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': await toPng(blob) })]);
    return;
  }
  if (clip.html && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([clip.text], { type: 'text/plain' }),
          'text/html': new Blob([clip.html], { type: 'text/html' }),
        }),
      ]);
      return;
    } catch {
      // Some pages and browsers reject HTML; plain text below always works.
    }
  }
  await navigator.clipboard.writeText(clip.text);
}

export interface ClipboardContents {
  text: string;
  html?: string;
  image?: Blob;
}

/** Reads the system clipboard. Needs the panel to have focus. */
export async function readClipboard(): Promise<ClipboardContents> {
  try {
    const items = await navigator.clipboard.read();
    const out: ClipboardContents = { text: '' };
    for (const item of items) {
      const imageType = item.types.find((t) => IMAGE_TYPES.includes(t));
      if (imageType && !out.image) out.image = await item.getType(imageType);
      if (item.types.includes('text/plain')) out.text = await (await item.getType('text/plain')).text();
      if (item.types.includes('text/html')) out.html = await (await item.getType('text/html')).text();
    }
    return out;
  } catch {
    return { text: await navigator.clipboard.readText() };
  }
}

/** Pulls images and text out of a paste or drop. */
export function fromDataTransfer(data: DataTransfer | null): ClipboardContents & { images: File[] } {
  if (!data) return { text: '', images: [] };
  const images = Array.from(data.files).filter((f) => IMAGE_TYPES.includes(f.type));
  return {
    text: data.getData('text/plain'),
    html: data.getData('text/html') || undefined,
    images,
  };
}
