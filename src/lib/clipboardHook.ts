import { MAX_HTML, MAX_TEXT } from './limits';

/** Event the page-world hook fires on `window` after a page script wrote to the clipboard. Detail: JSON `{ text, html? }`. */
export const CLIPBOARD_WRITE_EVENT = 'copydrawer:clipboard-write';

const HOOKED = Symbol.for('copydrawer.clipboardHook');

/**
 * Runs in the page's own JavaScript world, where copy buttons call `navigator.clipboard.writeText` and `write`.
 * Those fire no copy event, so this reports each successful write instead. The extension's side only accepts a
 * report right after a click or key press, so a page can't add clips any more than it could by copying itself.
 */
export function hookClipboardWrites(win: Window & typeof globalThis) {
  const proto = win.Clipboard?.prototype as (Clipboard & { [HOOKED]?: true }) | undefined;
  if (!proto || proto[HOOKED]) return;
  proto[HOOKED] = true;

  const report = (text: string, html?: string) => {
    if (!text.trim()) return;
    const detail = JSON.stringify({ text: text.slice(0, MAX_TEXT), html: html?.slice(0, MAX_HTML) });
    win.dispatchEvent(new CustomEvent(CLIPBOARD_WRITE_EVENT, { detail }));
  };

  const { writeText, write } = proto;
  proto.writeText = function (this: Clipboard, data: string) {
    const done = writeText.call(this, data);
    done.then(
      () => report(String(data)),
      () => {},
    );
    return done;
  };
  proto.write = function (this: Clipboard, items: ClipboardItems) {
    const done = write.call(this, items);
    done.then(
      () => void readItems(items).then(({ text, html }) => report(text, html)),
      () => {},
    );
    return done;
  };
}

async function readItems(items: ClipboardItems): Promise<{ text: string; html?: string }> {
  const read = async (item: ClipboardItem, type: string) =>
    item.types.includes(type)
      ? item
          .getType(type)
          .then((blob) => blob.text())
          .catch(() => '')
      : '';
  for (const item of items) {
    const text = await read(item, 'text/plain');
    if (text) return { text, html: (await read(item, 'text/html')) || undefined };
  }
  return { text: '' };
}
