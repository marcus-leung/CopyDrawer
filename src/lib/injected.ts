/**
 * Functions injected into web pages with chrome.scripting.executeScript.
 * They must be self-contained: no imports, no closures over module scope.
 */

/** Shows a small "saved" card at the bottom right of the page, in Shadow DOM. */
export function showSavedToast(args: { title: string; detail: string; clipId: string; thumbUrl?: string; openShadow?: boolean }) {
  const HOST_ID = '__clipboard_ext_toast__';
  document.getElementById(HOST_ID)?.remove();
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all: initial; position: fixed; right: 24px; bottom: 24px; z-index: 2147483647;';
  // Closed so the page can't read it (open only in the test build, so tests can click it).
  const root = host.attachShadow({ mode: args.openShadow ? 'open' : 'closed' });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.innerHTML = `
    <style>
      .card { font: 14px/1.4 'Instrument Sans', system-ui, sans-serif; color: #1B1D2A; background: #fff;
        border-radius: 18px; box-shadow: 0 14px 36px rgba(27,29,42,.24), 0 0 0 1px rgba(27,29,42,.06);
        padding: 12px; display: flex; gap: 8px; align-items: center; width: 340px;
        ${reduce ? '' : 'animation: in 180ms ease-out;'} }
      @keyframes in { from { transform: translateY(8px); opacity: 0 } to { transform: none; opacity: 1 } }
      .thumb { width: 56px; height: 42px; border-radius: 10px; background: #F1F2F6 center/cover no-repeat; flex-shrink: 0; position: relative; }
      .check { position: absolute; right: -6px; bottom: -6px; width: 20px; height: 20px; border-radius: 10px; background: #0E7A62;
        display: flex; align-items: center; justify-content: center; }
      .text { flex: 1; min-width: 0; }
      .title { font-weight: 600; margin: 0; }
      .detail { margin: 2px 0 0; font-size: 13px; color: #3E4357; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      button { font: 600 12px/1 'Instrument Sans', system-ui, sans-serif; height: 30px; padding: 0 12px; border: 0; border-radius: 15px;
        background: #F1F2F6; color: #1B1D2A; cursor: pointer; flex-shrink: 0; }
      .open { background: #1B1D2A; color: #fff; }
      button:focus-visible { outline: 2px solid #2457C5; outline-offset: 2px; }
    </style>
    <div class="card" role="status">
      <div class="thumb"><span class="check"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></span></div>
      <div class="text"><p class="title"></p><p class="detail"></p></div>
      <button type="button" class="open">Open</button>
      <button type="button" class="undo">Undo</button>
    </div>`;
  (root.querySelector('.title') as HTMLElement).textContent = args.title;
  (root.querySelector('.detail') as HTMLElement).textContent = args.detail;
  if (args.thumbUrl) (root.querySelector('.thumb') as HTMLElement).style.backgroundImage = `url("${args.thumbUrl}")`;
  const remove = () => host.remove();
  // `chrome` exists in the isolated world executeScript runs in. After the extension is
  // reloaded it can't be reached: sendMessage then throws, so guard and catch both ways.
  const send = (msg: object) => {
    const runtime = (globalThis as unknown as { chrome: typeof browser }).chrome.runtime;
    if (!runtime?.id) return;
    try {
      void runtime.sendMessage(msg).catch(() => {});
    } catch {
      // Extension reloaded; nothing to tell.
    }
  };
  root.querySelector('.undo')!.addEventListener('click', () => {
    send({ type: 'undo-save', clipId: args.clipId });
    remove();
  });
  root.querySelector('.open')!.addEventListener('click', () => {
    send({ type: 'open-clip', clipId: args.clipId });
    remove();
  });
  document.documentElement.appendChild(host);
  setTimeout(remove, 5000);
}

/**
 * Lets the user drag a rectangle on the page. Resolves with the area in CSS
 * pixels plus the device pixel ratio, or null if they press Escape.
 */
export function selectArea(): Promise<{ x: number; y: number; w: number; h: number; dpr: number } | null> {
  return new Promise((resolve) => {
    const HOST_ID = '__clipboard_ext_shot__';
    document.getElementById(HOST_ID)?.remove();
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; cursor: crosshair;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        .dim { position: fixed; inset: 0; background: rgba(27,29,42,.45); }
        .box { position: fixed; border: 2px solid #fff; box-shadow: 0 0 0 1px #2457C5, 0 0 0 9999px rgba(27,29,42,.45); display: none; }
        .size { position: absolute; right: 6px; bottom: 6px; padding: 2px 8px; border-radius: 6px; background: #1B1D2A; color: #fff;
          font: 600 12px/1.5 system-ui, sans-serif; }
        .bar { position: fixed; left: 50%; top: 16px; transform: translateX(-50%); display: flex; gap: 12px; align-items: center;
          padding: 6px 6px 6px 16px; border-radius: 24px; background: #fff; box-shadow: 0 8px 24px rgba(27,29,42,.25);
          font: 13px/1 system-ui, sans-serif; color: #1B1D2A; cursor: default; }
        button { font: 600 13px/1 system-ui, sans-serif; height: 36px; padding: 0 14px; border: 0; border-radius: 18px; background: #F1F2F6; color: #1B1D2A; cursor: pointer; }
      </style>
      <div class="dim"></div>
      <div class="box"><span class="size"></span></div>
      <div class="bar"><span>Drag to choose an area</span><button type="button">Cancel</button></div>`;
    const dim = root.querySelector('.dim') as HTMLElement;
    const box = root.querySelector('.box') as HTMLElement;
    const size = root.querySelector('.size') as HTMLElement;
    const bar = root.querySelector('.bar') as HTMLElement;
    let start: { x: number; y: number } | null = null;
    let rect = { x: 0, y: 0, w: 0, h: 0 };

    const finish = (result: typeof rect | null) => {
      window.removeEventListener('keydown', onKey, true);
      host.remove();
      // Wait two frames so the overlay is gone from the screenshot.
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          resolve(result && result.w > 4 && result.h > 4 ? { ...result, dpr: devicePixelRatio } : null),
        ),
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(null);
      }
    };
    root.querySelector('button')!.addEventListener('click', () => finish(null));
    host.addEventListener('pointerdown', (e) => {
      if (bar.contains(e.composedPath()[0] as Node)) return;
      start = { x: e.clientX, y: e.clientY };
      dim.style.display = 'none';
      box.style.display = 'block';
      host.setPointerCapture(e.pointerId);
    });
    host.addEventListener('pointermove', (e) => {
      if (!start) return;
      rect = {
        x: Math.min(start.x, e.clientX),
        y: Math.min(start.y, e.clientY),
        w: Math.abs(e.clientX - start.x),
        h: Math.abs(e.clientY - start.y),
      };
      Object.assign(box.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
      size.textContent = `${Math.round(rect.w)} × ${Math.round(rect.h)}`;
    });
    host.addEventListener('pointerup', () => {
      if (start) finish(rect);
    });
    window.addEventListener('keydown', onKey, true);
    document.documentElement.appendChild(host);
  });
}

/** Reads the current selection as text and HTML. */
export function readSelection(): { text: string; html: string } {
  const sel = window.getSelection();
  const text = sel?.toString() ?? '';
  let html = '';
  if (sel && sel.rangeCount > 0) {
    const box = document.createElement('div');
    for (let i = 0; i < sel.rangeCount; i++) box.appendChild(sel.getRangeAt(i).cloneContents());
    html = box.innerHTML;
  }
  return { text, html };
}

/**
 * Fetches an image from the page's own context (helps with same-site and CORS-enabled images), as a data URL.
 * Stops reading past `maxBytes`. Only `types` count as an image. Runs in the page: no outside helpers.
 */
export async function fetchImageInPage(
  url: string,
  maxBytes: number,
  types: string[],
): Promise<string | { tooBig: true } | null> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
    if (!res.ok || !res.body || !types.includes(type)) return null;
    if (Number(res.headers.get('content-length')) > maxBytes) return { tooBig: true };
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        return { tooBig: true };
      }
      chunks.push(value);
    }
    const blob = new Blob(chunks as BlobPart[], { type });
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
