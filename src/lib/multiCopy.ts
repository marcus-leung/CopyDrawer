import type { Clip } from './db';
import { copyClipToClipboard } from './clipboard';
import { escapeHtml } from './format';
import { blobToDataUrl, getImageBlob, MAX_IMAGE_BYTES } from './images';
import { joinTexts, type JoinWith } from './join';

export interface Combined {
  text: string;
  /** Undefined when nothing needs formatting or pictures. */
  html?: string;
  /** Images left out of the plain text. */
  skippedImages: number;
}

const textHtml = (text: string) => escapeHtml(text).replace(/\n/g, '<br>');

/**
 * A saved clip's formatting is a whole clipboard document: a `<meta charset>`, sometimes `<html>`/`<body>`, a
 * `<head>`, and Windows/Word "fragment" comments. This keeps just the content, so joined clips form one document.
 * It also drops Google Docs' `docs-internal-guid` id: pasting HTML that carries one into Docs makes Docs paste its
 * own stored copy of that one clip instead of what's on the clipboard.
 */
export function fragmentOf(html: string): string {
  return html
    .replace(/<head[\s>][\s\S]*?<\/head>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?(?:html|body|meta|link|title)\b[^>]*>/gi, '')
    .replace(/\sid=(["'])docs-internal-guid-[^"']*\1/gi, '')
    .trim();
}

/** Several clips as one clipboard item, in the order given. `images` maps image clip ids to data URLs. */
export function buildCombined(clips: Clip[], joinWith: JoinWith, images: Map<string, string>): Combined {
  const texts = clips.filter((c) => c.kind !== 'image').map((c) => c.text);
  const skippedImages = clips.length - texts.length;
  const needsHtml = skippedImages > 0 || clips.some((c) => c.html);
  if (!needsHtml) return { text: joinTexts(texts, joinWith), skippedImages };

  const img = (c: Clip) => {
    const src = images.get(c.id);
    return src ? `<img src="${src}" alt="${escapeHtml(c.title)}">` : '';
  };
  let html: string;
  if (joinWith === 'space' || joinWith === 'comma') {
    const parts = clips.map((c) => (c.kind === 'image' ? img(c) : textHtml(c.text))).filter(Boolean);
    html = parts.join(joinWith === 'comma' ? ', ' : ' ');
  } else {
    const blocks = clips.map((c) => `<div>${c.kind === 'image' ? img(c) : c.html ? fragmentOf(c.html) : textHtml(c.text)}</div>`);
    html = blocks.join(joinWith === 'blank' ? '<div><br></div>' : '');
  }
  return { text: joinTexts(texts, joinWith), html, skippedImages };
}

export type CopyResult = { ok: true; skippedImages: number } | { ok: false; reason: 'too-big' | 'nothing' };

/** Copies clips together. One clip copies exactly like its own Copy button. */
export async function copyClips(clips: Clip[], joinWith: JoinWith, { plain = false } = {}): Promise<CopyResult> {
  if (clips.length === 1 && !plain) {
    await copyClipToClipboard(clips[0]!);
    return { ok: true, skippedImages: 0 };
  }
  const images = new Map<string, string>();
  if (!plain) {
    const blobs = await Promise.all(
      clips.filter((c) => c.kind === 'image').map(async (c) => [c.id, await getImageBlob(c)] as const),
    );
    if (blobs.reduce((sum, [, b]) => sum + (b?.size ?? 0), 0) > MAX_IMAGE_BYTES) return { ok: false, reason: 'too-big' };
    for (const [id, blob] of blobs) if (blob) images.set(id, await blobToDataUrl(blob));
  }
  const combined = buildCombined(clips, joinWith, images);
  if (plain || !combined.html) {
    if (!combined.text) return { ok: false, reason: 'nothing' };
    await navigator.clipboard.writeText(combined.text);
    return { ok: true, skippedImages: combined.skippedImages };
  }
  const parts: Record<string, Blob> = { 'text/html': new Blob([combined.html], { type: 'text/html' }) };
  if (combined.text) parts['text/plain'] = new Blob([combined.text], { type: 'text/plain' });
  await navigator.clipboard.write([new ClipboardItem(parts)]);
  return { ok: true, skippedImages: combined.skippedImages };
}
