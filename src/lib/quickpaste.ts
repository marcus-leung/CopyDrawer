import { listClips } from './clips';
import { db } from './db';
import { colorOf } from './collections';
import { hostOf } from './format';
import { getShortcuts, NOT_SET } from './shortcuts';

/** A clip as the quick-paste box sees it (sent from the background). */
export interface QuickClip {
  id: string;
  title: string;
  text: string;
  kind: string;
  host?: string;
  collection?: string;
  color?: string;
}

/**
 * Messages from a page's script are treated as untrusted: the clip list goes only to the tab where quick paste
 * was just opened, and Undo only removes the clip that tab just saved.
 */
const QUICK_PASTE_OPENED = 'quickPasteOpened';
export const LAST_SAVED = 'lastSavedInTab';
const QUICK_PASTE_WINDOW_MS = 30_000;

async function sessionValue<T>(key: string): Promise<T | undefined> {
  return (await browser.storage.session.get(key))[key] as T | undefined;
}

export async function quickPasteAllowed(sender: Browser.runtime.MessageSender): Promise<boolean> {
  const opened = await sessionValue<{ tabId: number; at: number }>(QUICK_PASTE_OPENED);
  return !!opened && sender.tab?.id === opened.tabId && sender.frameId === 0 && Date.now() - opened.at < QUICK_PASTE_WINDOW_MS;
}

export async function undoAllowed(sender: Browser.runtime.MessageSender, clipId: unknown): Promise<boolean> {
  const last = await sessionValue<{ tabId: number; clipId: string }>(LAST_SAVED);
  return !!last && sender.tab?.id === last.tabId && clipId === last.clipId;
}

/** Opens the quick-paste box on the page (activeTab from the shortcut grants access). */
export async function openQuickPaste(tabId: number) {
  await browser.storage.session.set({ [QUICK_PASTE_OPENED]: { tabId, at: Date.now() } });
  await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/quickpaste.js'] });
}

export async function quickPasteClips(): Promise<{ clips: QuickClip[]; shortcut: string }> {
  const [clips, collections, keys] = await Promise.all([listClips(), db.collections.toArray(), getShortcuts()]);
  const byId = new Map(collections.map((c) => [c.id, c]));
  return {
    // No hint for a shortcut Chrome left unset.
    shortcut: keys['quick-paste'] === NOT_SET ? '' : keys['quick-paste'],
    clips: clips
      .filter((c) => c.kind !== 'image')
      .slice(0, 300)
      .map((c) => {
        const col = c.collectionId ? byId.get(c.collectionId) : undefined;
        return {
          id: c.id,
          title: c.title,
          text: c.text.slice(0, 20_000),
          kind: c.kind,
          host: hostOf(c.source?.url),
          collection: col?.name,
          color: col ? colorOf(col).accent : undefined,
        };
      }),
  };
}
