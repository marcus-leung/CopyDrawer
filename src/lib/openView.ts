import { useEffect } from 'react';
import type { SearchFilters } from './search';

export type View =
  { name: 'home' } | { name: 'detail'; id: string; from?: View } | { name: 'settings' } | { name: 'collection'; id: string };

/** Session-storage key the popup and background use to ask the side panel to show a screen. */
export const OPEN_VIEW_KEY = 'openView';

export interface OpenViewRequest {
  view: View;
  /** Left out to keep the panel's own search and filters. */
  query?: string;
  filters?: SearchFilters;
  /** Only that window's panel takes it. */
  windowId?: number;
  at: number;
}

/** Requests older than this are stale (the panel opened for another reason). */
const OPEN_VIEW_TTL_MS = 30_000;

export function requestView(req: Omit<OpenViewRequest, 'at'>): Promise<void> {
  return browser.storage.session.set({ [OPEN_VIEW_KEY]: { ...req, at: Date.now() } });
}

/** Drops a request no panel will take (the panel didn't open). */
export function cancelViewRequest(): Promise<void> {
  return browser.storage.session.remove(OPEN_VIEW_KEY);
}

/** Calls `onOpen` for requests: one waiting now, and any made while the panel is open. */
export function useOpenViewRequests(onOpen: (req: OpenViewRequest) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const windowId = browser.windows.getCurrent().then((w) => w.id);
    const take = async (req: OpenViewRequest | undefined) => {
      if (!req || Date.now() - req.at > OPEN_VIEW_TTL_MS) return;
      if (req.windowId != null && req.windowId !== (await windowId)) return;
      onOpen(req);
      void cancelViewRequest();
    };
    void browser.storage.session.get(OPEN_VIEW_KEY).then((r) => take(r[OPEN_VIEW_KEY] as OpenViewRequest | undefined));
    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'session' && changes[OPEN_VIEW_KEY]) void take(changes[OPEN_VIEW_KEY].newValue as OpenViewRequest | undefined);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, [onOpen, enabled]);
}
