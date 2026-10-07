/**
 * Auto-save: notices copy/cut on web pages and sends the copied text to the
 * background. Registered at runtime only after the user grants all-sites
 * access, so it's not in the manifest.
 */
export default defineContentScript({
  registration: 'runtime',
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  main() {
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
      if (!text.trim()) return;

      void browser.runtime
        .sendMessage({
          type: 'autosave-copy',
          text: text.slice(0, 200_000),
          html: html.slice(0, 400_000) || undefined,
          title: document.title,
        })
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

function selectedHtml(): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return '';
  const box = document.createElement('div');
  for (let i = 0; i < sel.rangeCount; i++) box.appendChild(sel.getRangeAt(i).cloneContents());
  return box.innerHTML;
}
