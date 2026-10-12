import { extensionAlive, safeSend } from './safeSend';
import { MAX_HTML, MAX_TEXT } from './limits';

/**
 * Sends what's copied or cut in `win` (text, or a selected image) to the
 * background. Stops listening once the extension is reloaded or updated, since
 * this copy of the script can no longer reach it. Returns a function that stops it.
 */
export function watchCopies(win: Window): () => void {
  const stop = () => {
    win.removeEventListener('copy', onCopy);
    win.removeEventListener('cut', onCopy);
  };
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

    void safeSend(
      srcUrl
        ? { type: 'autosave-image', srcUrl }
        : {
            type: 'autosave-copy',
            text: text.slice(0, MAX_TEXT),
            html: html.slice(0, MAX_HTML) || undefined,
            title: win.document.title,
          },
    );
  }
  win.addEventListener('copy', onCopy);
  win.addEventListener('cut', onCopy);
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
