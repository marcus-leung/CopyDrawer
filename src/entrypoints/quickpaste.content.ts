/**
 * Quick-paste box (Alt+Shift+V, or the key the user set): an overlay on the current page to find a clip
 * and paste it into the field you were typing in. Injected on demand with
 * activeTab, so it needs no site access.
 */
import type { QuickClip } from '@/lib/quickpaste';
import { modKey } from '@/lib/format';
import { safeSend } from '@/lib/safeSend';
import { FONT_STACKS, getSettings } from '@/lib/settings';

declare global {
  interface Window {
    __clipboardQuickPaste?: { open: () => void };
  }
}

const DARK = '--ink:#F4F5F8; --bg:#1B1D27; --surface:#262936; --line:#323646; --t3:#A3A8BC; --sel:#1E2C4D;';

// Follows the theme chosen in Settings; until that's read, the system setting.
const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.scrim { position: fixed; inset: 0; background: rgba(23,25,35,.28); z-index: 2147483647; display: flex; justify-content: center; align-items: flex-start; padding-top: 14vh; font: 14px/1.45 "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); }
.box { --ink:#171923; --bg:#fff; --surface:#F1F2F6; --line:#E5E7EE; --t3:#6B7080; --sel:#E6EEFC;
  width: min(560px, 92vw); background: var(--bg); color: var(--ink); border-radius: 18px; box-shadow: 0 18px 48px rgba(23,25,35,.22), 0 2px 6px rgba(23,25,35,.08); overflow: hidden; }
@media (prefers-color-scheme: dark) { .box:not([data-theme="light"]) { ${DARK} } }
.box[data-theme="dark"] { ${DARK} }
.head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.head input { flex: 1; border: 0; outline: 0; background: transparent; color: var(--ink); font: inherit; font-size: 16px; padding: 6px 0; }
ul { list-style: none; margin: 0; padding: 6px; max-height: 340px; overflow-y: auto; }
li { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 12px; cursor: pointer; }
li[aria-selected="true"] { background: var(--sel); }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--line); }
.txt { min-width: 0; flex: 1; }
.title, .sub { display: block; }
.title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { font-size: 12px; color: var(--t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
kbd { font: 600 11px/1 "JetBrains Mono", ui-monospace, monospace; padding: 3px 6px; border-radius: 6px; background: var(--surface); color: var(--ink); }
.foot { display: flex; gap: 14px; align-items: center; padding: 9px 16px; border-top: 1px solid var(--line); font-size: 12px; color: var(--t3); }
.foot .r { margin-left: auto; }
.empty { padding: 22px 16px; color: var(--t3); text-align: center; }
`;

type Target =
  | { kind: 'field'; el: HTMLInputElement | HTMLTextAreaElement; start: number | null; end: number | null }
  | { kind: 'editable'; el: HTMLElement; range: Range | null }
  | { kind: 'none' };

function captureTarget(): Target {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  const writable = (f: HTMLInputElement | HTMLTextAreaElement) => !f.readOnly && !f.disabled;
  if (
    (el instanceof HTMLTextAreaElement && writable(el)) ||
    (el instanceof HTMLInputElement && /^(text|search|email|url|tel|)$/.test(el.type) && writable(el))
  ) {
    // selectionStart is null on input types without a selection API (email).
    return { kind: 'field', el, start: el.selectionStart, end: el.selectionEnd };
  }
  if (el instanceof HTMLElement && el.isContentEditable) {
    const sel = getSelection();
    return { kind: 'editable', el, range: sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null };
  }
  return { kind: 'none' };
}

/** Puts text where the cursor was. Returns false when there was no text field. */
function insertAt(target: Target, text: string): boolean {
  if (target.kind === 'field') {
    const { el } = target;
    el.focus();
    // Email fields have no selection API (it throws); there the cursor stays where focus puts it.
    const hasSelection = target.start !== null;
    if (hasSelection) el.setSelectionRange(target.start, target.end);
    // execCommand keeps the page's undo history and fires the events frameworks listen to.
    if (!document.execCommand('insertText', false, text)) {
      if (hasSelection) el.setRangeText(text, target.start!, target.end!, 'end');
      else el.value += text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
    return true;
  }
  if (target.kind === 'editable') {
    target.el.focus();
    if (target.range) {
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(target.range);
    }
    document.execCommand('insertText', false, text);
    return true;
  }
  return false;
}

function matches(c: QuickClip, q: string): number {
  if (!q) return 1;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const title = c.title.toLowerCase();
  const hay = `${title}\n${c.text.toLowerCase()}\n${c.host ?? ''}\n${(c.collection ?? '').toLowerCase()}`;
  if (!words.every((w) => hay.includes(w))) return 0;
  return words.every((w) => title.includes(w)) ? 2 : 1;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const TOAST_ID = 'copydrawer-quick-paste-toast';

/** A short note at the bottom of the page. A new note replaces the last one. */
function toast(message: string) {
  document.getElementById(TOAST_ID)?.remove();
  const host = el('div');
  host.id = TOAST_ID;
  const root = host.attachShadow({ mode: 'open' });
  const box = el('div', '', message);
  box.style.cssText =
    'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;background:#171923;color:#fff;padding:12px 18px;border-radius:14px;font:600 14px system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2)';
  root.append(box);
  document.documentElement.append(host);
  setTimeout(() => host.remove(), 2600);
}

function open() {
  if (document.getElementById('copydrawer-quick-paste')) return;
  const target = captureTarget();
  const host = el('div');
  host.id = 'copydrawer-quick-paste';
  const root = host.attachShadow({ mode: 'open' });
  const style = el('style', '', CSS);
  const scrim = el('div', 'scrim');
  const box = el('div', 'box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Quick paste');
  void getSettings().then((s) => {
    if (s.theme !== 'system') box.dataset.theme = s.theme;
    if (s.font !== 'default') box.style.fontFamily = FONT_STACKS[s.font];
    if (s.textSize !== 100) box.style.zoom = String(s.textSize / 100);
  });
  const head = el('div', 'head');
  const input = el('input');
  input.placeholder = 'Filter clips';
  input.setAttribute('aria-label', 'Filter clips');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-controls', 'qp-list');
  input.setAttribute('aria-expanded', 'true');
  head.append(input);
  const list = el('ul');
  list.id = 'qp-list';
  list.setAttribute('role', 'listbox');
  const foot = el('div', 'foot');
  root.append(style, scrim);
  scrim.append(box);
  box.append(head, list, foot);

  let clips: QuickClip[] = [];
  let shortcut = '';
  let shown: QuickClip[] = [];
  let selected = 0;
  let loaded = false;
  // Keys pressed before the clips arrive (the background may still be waking up), replayed in order.
  const early: string[] = [];

  const close = () => {
    host.remove();
    document.removeEventListener('keydown', trap, true);
  };

  const finish = async (clip: QuickClip) => {
    const text = clip.text;
    close();
    void safeSend({ type: 'qp-used', id: clip.id });
    if (!insertAt(target, text)) {
      try {
        await navigator.clipboard.writeText(text);
        toast(`Copied. Click where you want it and press ${modKey('V')}.`);
      } catch {
        toast("Couldn't paste here. Open the side panel to copy it.");
      }
    }
  };

  const render = () => {
    list.replaceChildren();
    const q = input.value.trim();
    shown = clips
      .map((c, i) => ({ c, s: matches(c, q), i }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, 50)
      .map((x) => x.c);
    selected = Math.min(selected, Math.max(0, shown.length - 1));
    if (!shown.length) list.append(el('div', 'empty', clips.length ? 'No clips match' : 'No clips saved yet'));
    shown.forEach((c, i) => {
      const li = el('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === selected));
      const dot = el('span', 'dot');
      if (c.color) dot.style.background = c.color;
      const txt = el('span', 'txt');
      const preview = c.text.replace(/\s+/g, ' ').slice(0, 120);
      txt.append(
        el('span', 'title', c.title),
        el('span', 'sub', preview === c.title ? [c.collection, c.host].filter(Boolean).join(', ') : preview),
      );
      li.append(dot, txt);
      if (i === selected) li.append(el('kbd', '', 'Enter'));
      li.onmousedown = (e) => {
        e.preventDefault();
        void finish(c);
      };
      list.append(li);
    });
    foot.replaceChildren(hint('Enter', 'paste'), hint('Esc', 'close'), el('span', 'r', shortcut));
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };

  function hint(key: string, label: string) {
    const s = el('span');
    s.append(el('kbd', '', key), document.createTextNode(` ${label}`));
    return s;
  }

  /** Runs a box shortcut. Returns false for keys that aren't one. */
  const handleKey = (key: string): boolean => {
    const count = shown.length;
    if (key === 'Escape') close();
    else if (key === 'ArrowDown' || key === 'ArrowUp') {
      if (count) selected = (selected + (key === 'ArrowDown' ? 1 : count - 1)) % count;
      render();
    } else if (key === 'Enter') {
      if (shown[selected]) void finish(shown[selected]!);
    } else if (key !== 'Tab') return false; // Tab stays in the box, like any dialog.
    return true;
  };

  // Keep the page's own shortcuts from reacting while the box is open.
  const trap = (e: KeyboardEvent) => {
    if (!host.isConnected) return;
    e.stopPropagation();
    if (!loaded && e.key !== 'Escape' && !e.isComposing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      early.push(e.key);
    } else if (handleKey(e.key)) e.preventDefault();
  };
  document.addEventListener('keydown', trap, true);
  for (const type of ['keyup', 'keypress'] as const) host.addEventListener(type, (e) => e.stopPropagation());
  input.addEventListener('input', () => {
    selected = 0;
    render();
  });
  scrim.addEventListener('mousedown', (e) => {
    if (e.target === scrim) close();
  });

  document.documentElement.append(host);
  input.focus();
  render();
  void safeSend<{ clips: QuickClip[]; shortcut: string }>({ type: 'qp-clips' }).then((res) => {
    clips = res?.clips ?? [];
    shortcut = res?.shortcut ?? '';
    loaded = true;
    render();
    for (const key of early) {
      if (!host.isConnected) break;
      if (key.length === 1 || key === 'Backspace') {
        input.value = key === 'Backspace' ? input.value.slice(0, -1) : input.value + key;
        selected = 0;
        render();
      } else handleKey(key);
    }
  });
}

export default defineContentScript({
  registration: 'runtime',
  matches: ['<all_urls>'],
  main() {
    if (window.__clipboardQuickPaste) {
      window.__clipboardQuickPaste.open();
      return;
    }
    window.__clipboardQuickPaste = { open };
    open();
  },
});
