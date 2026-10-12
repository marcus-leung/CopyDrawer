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
  await writeClipboard({ text: clip.text, html: clip.html });
}

/** Writes text with its formatting. If HTML is refused, plain text still goes through. Text may be empty when the HTML holds only images. */
export async function writeClipboard({ text, html }: { text: string; html?: string }): Promise<void> {
  if (html && typeof ClipboardItem !== 'undefined') {
    try {
      const parts: Record<string, Blob> = { 'text/html': new Blob([html], { type: 'text/html' }) };
      if (text) parts['text/plain'] = new Blob([text], { type: 'text/plain' });
      await navigator.clipboard.write([new ClipboardItem(parts)]);
      return;
    } catch (e) {
      // Some pages and browsers reject HTML; plain text below always works.
      if (!text) throw e;
    }
  }
  await navigator.clipboard.writeText(text);
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

/** Pulls files and text out of a paste or drop. Unsupported files are kept so saving can say why. */
export function fromDataTransfer(data: DataTransfer | null): ClipboardContents & { images: File[] } {
  if (!data) return { text: '', images: [] };
  return {
    text: data.getData('text/plain'),
    html: data.getData('text/html') || undefined,
    images: Array.from(data.files),
  };
}
