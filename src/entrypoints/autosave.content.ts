/**
 * Auto-save: notices copy/cut on web pages and sends the copied text (or a
 * selected image) to the background. Registered at runtime only after the user grants all-sites
 * access, so it's not in the manifest.
 */
declare global {
  interface Window {
    __clipboardAutosave?: boolean;
  }
}

export default defineContentScript({
  registration: 'runtime',
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  main() {
    // Already-open pages get the script when auto-save starts; listen once even if it arrives twice.
    if (window.__clipboardAutosave) return;
    window.__clipboardAutosave = true;
    const onCopy = (event: ClipboardEvent) => {
      const target = event.target;
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

      void browser.runtime
        .sendMessage(
          srcUrl
            ? { type: 'autosave-image', srcUrl }
            : {
                type: 'autosave-copy',
                text: text.slice(0, 200_000),
                html: html.slice(0, 400_000) || undefined,
                title: document.title,
              },
        )
        .catch(() => {
          // Extension was reloaded or updated; ignore.
        });
    };

    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCopy);
  },
});

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
