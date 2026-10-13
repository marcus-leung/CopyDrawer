import { extensionAlive, safeSend } from './safeSend';
import { MAX_HTML, MAX_TEXT } from './limits';
import { CLIPBOARD_WRITE_EVENT } from './clipboardHook';

/**
 * Sends what's copied or cut in `win` (text, or a selected image), and what the page's copy buttons write,
 * to the background. Stops listening once the extension is reloaded or updated, since
 * this copy of the script can no longer reach it. Returns a function that stops it.
 */
export function watchCopies(win: Window): () => void {
  const stop = () => {
    win.removeEventListener('copy', onCopy);
    win.removeEventListener('cut', onCopy);
    win.removeEventListener(CLIPBOARD_WRITE_EVENT, onWrite);
  };
  const send = (text: string, html: string | undefined) =>
    void safeSend({
      type: 'autosave-copy',
      text: text.slice(0, MAX_TEXT),
      html: html?.slice(0, MAX_HTML) || undefined,
      title: win.document.title,
    });

  // A copy button wrote to the clipboard (reported by the page-world hook). The page could send this event
  // itself, so it only counts right after the user clicked or pressed a key, which the page can't fake.
  function onWrite(event: Event) {
    if (!win.navigator.userActivation?.isActive) return;
    if (!extensionAlive()) return stop();
    let data: unknown;
    try {
      data = JSON.parse(String((event as CustomEvent).detail));
    } catch {
      return;
    }
    const { text, html } = (data ?? {}) as { text?: unknown; html?: unknown };
    if (typeof text === 'string' && text.trim()) send(text, typeof html === 'string' ? html : undefined);
  }

  function onCopy(event: ClipboardEvent) {
    // Page scripts can dispatch copy events of their own; only the user's count.
    if (!event.isTrusted) return;
    if (!extensionAlive()) return stop();
    // The element actually copied from, also inside web components (where `target` is only their outer element).
    const target = event.composedPath()[0] ?? null;
    // Never read password fields.
    if (target instanceof HTMLInputElement && target.type === 'password') return;

    // Pages that customize copying put their data on clipboardData; read it
    // at the bubble phase on window, after the page's own handlers ran.
    let text = event.clipboardData?.getData('text/plain') ?? '';
    let html = event.clipboardData?.getData('text/html') ?? '';

    if (!text) {
      text = selectedText(target);
      html = text ? selectedHtml() : '';
    }
    const srcUrl = text.trim() ? undefined : selectedImage(target);
    if (!text.trim() && !srcUrl) return;

    if (srcUrl) void safeSend({ type: 'autosave-image', srcUrl });
    else send(text, html);
  }
  win.addEventListener('copy', onCopy);
  win.addEventListener('cut', onCopy);
  win.addEventListener(CLIPBOARD_WRITE_EVENT, onWrite);
  return stop;
}

function selectedText(target: EventTarget | null): string {
  if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== 'password')) {
    const { selectionStart, selectionEnd, value } = target;
    if (selectionStart != null && selectionEnd != null && selectionEnd > selectionStart) {
      return value.slice(selectionStart, selectionEnd);
    }
  }
  return window.getSelection()?.toString() ?? '';
}

/** The image being copied: the copied element itself, or the first image in the selection. */
function selectedImage(target: EventTarget | null): string | undefined {
  if (target instanceof HTMLImageElement) return target.currentSrc || target.src;
  const sel = window.getSelection();
  for (let i = 0; sel && i < sel.rangeCount; i++) {
    const img = sel.getRangeAt(i).cloneContents().querySelector('img');
    if (img?.src) return img.src;
  }
  return undefined;
}

function selectedHtml(): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return '';
  const box = document.createElement('div');
  for (let i = 0; i < sel.rangeCount; i++) box.appendChild(sel.getRangeAt(i).cloneContents());
  return box.innerHTML;
}
