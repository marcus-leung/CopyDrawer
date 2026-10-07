import { useEffect } from 'react';

/** Session-storage key the background uses to ask the side panel to show a clip. */
export const OPEN_CLIP_KEY = 'openClip';

interface OpenClipRequest {
  clipId: string;
  at: number;
}

/** Requests older than this are stale (the panel opened for another reason). */
const OPEN_CLIP_TTL_MS = 30_000;

/** Calls `onOpen` for "Open" requests: one waiting now, and any made while the panel is open. */
export function useOpenClipRequests(onOpen: (clipId: string) => void) {
  useEffect(() => {
    const take = (req: OpenClipRequest | undefined) => {
      if (!req || Date.now() - req.at > OPEN_CLIP_TTL_MS) return;
      onOpen(req.clipId);
      void browser.storage.session.remove(OPEN_CLIP_KEY);
    };
    void browser.storage.session.get(OPEN_CLIP_KEY).then((r) => take(r[OPEN_CLIP_KEY] as OpenClipRequest | undefined));
    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'session' && changes[OPEN_CLIP_KEY]) take(changes[OPEN_CLIP_KEY].newValue as OpenClipRequest | undefined);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, [onOpen]);
}
