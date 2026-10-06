import type { Clip } from './db';

/** Copies a clip to the system clipboard, keeping formatting when we have it. */
export async function copyClipToClipboard(clip: Clip): Promise<void> {
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

/** Reads text from the system clipboard. Needs the panel to have focus. */
export async function readClipboardText(): Promise<{ text: string; html?: string }> {
  try {
    const items = await navigator.clipboard.read();
    let text = '';
    let html: string | undefined;
    for (const item of items) {
      if (item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
      if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
    }
    return { text, html };
  } catch {
    return { text: await navigator.clipboard.readText() };
  }
}
