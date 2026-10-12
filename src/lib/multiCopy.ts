import type { Clip } from './db';
import { copyClipToClipboard, writeClipboard } from './clipboard';
import { escapeHtml } from './format';
import { blobToDataUrl, getImageBlob, MAX_IMAGE_BYTES } from './images';
import { joinTexts, type JoinWith } from './join';

interface Combined {
  text: string;
  /** Undefined when nothing needs formatting or pictures. */
  html?: string;
  /** Images left out of the plain text. */
  skippedImages: number;
}

const textHtml = (text: string) => escapeHtml(text).replace(/\n/g, '<br>');

/**
 * A saved clip's formatting is a whole clipboard document (a `<meta charset>`, sometimes `<html>`, `<head>` and
 * styles). This keeps just the content, so joined clips form one document. It also drops Google Docs'
 * `docs-internal-guid` id: pasting HTML that carries one into Docs makes Docs paste its own stored copy of that
 * one clip instead of what's on the clipboard.
 */
export function fragmentOf(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const el of doc.querySelectorAll('style, script, title, meta, link')) el.remove();
  for (const el of doc.querySelectorAll('[id^="docs-internal-guid"]')) el.removeAttribute('id');
  const comments = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  const found: Node[] = [];
  while (comments.nextNode()) found.push(comments.currentNode);
  for (const c of found) c.parentNode?.removeChild(c);
  return doc.body.innerHTML.trim();
}

/** Several clips as one clipboard item, in the order given. `images` maps image clip ids to data URLs. */
export function buildCombined(clips: Clip[], joinWith: JoinWith, images: Map<string, string>): Combined {
  const texts = clips.filter((c) => c.kind !== 'image').map((c) => c.text);
  const skippedImages = clips.length - texts.length;
  const text = joinTexts(texts, joinWith);
  if (!skippedImages && !clips.some((c) => c.html)) return { text, skippedImages };

  const fragment = (c: Clip) => {
    if (c.kind !== 'image') return c.html ? fragmentOf(c.html) : textHtml(c.text);
    const src = images.get(c.id);
    return src ? `<img src="${src}" alt="${escapeHtml(c.title)}">` : '';
  };
  const parts = clips.map(fragment).filter(Boolean);
  const inline = joinWith === 'space' || joinWith === 'comma';
  const html = inline
    ? parts.map((p) => `<span>${p}</span>`).join(joinWith === 'comma' ? ', ' : ' ')
    : parts.map((p) => `<div>${p}</div>`).join(joinWith === 'blank' ? '<div><br></div>' : '');
  return { text, html, skippedImages };
}

/** Images travel as base64 data URLs, a third bigger than the files. */
export function encodedImageBytes(clips: Clip[]): number {
  return clips.reduce((sum, c) => sum + (c.kind === 'image' && c.image ? Math.ceil(c.image.bytes / 3) * 4 : 0), 0);
}

type CopyResult = { ok: true; skippedImages: number } | { ok: false; reason: 'too-big' | 'nothing' };

/** Copies clips together. One clip copies exactly like its own Copy button. */
export async function copyClips(clips: Clip[], joinWith: JoinWith, { plain = false } = {}): Promise<CopyResult> {
  if (clips.length === 1 && !plain) {
    await copyClipToClipboard(clips[0]!);
    return { ok: true, skippedImages: 0 };
  }
  const images = new Map<string, string>();
  if (!plain) {
    if (encodedImageBytes(clips) > MAX_IMAGE_BYTES) return { ok: false, reason: 'too-big' };
    await Promise.all(
      clips.map(async (c) => {
        const blob = c.kind === 'image' ? await getImageBlob(c) : undefined;
        if (blob) images.set(c.id, await blobToDataUrl(blob));
      }),
    );
  }
  const combined = buildCombined(clips, joinWith, images);
  const html = plain ? undefined : combined.html;
  if (!combined.text && !html) return { ok: false, reason: 'nothing' };
  await writeClipboard({ text: combined.text, html });
  return { ok: true, skippedImages: combined.skippedImages };
}
