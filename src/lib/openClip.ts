/** Session-storage key the background uses to ask the side panel to show a clip. */
export const OPEN_CLIP_KEY = 'openClip';

export interface OpenClipRequest {
  clipId: string;
  at: number;
}

/** Requests older than this are stale (the panel opened for another reason). */
export const OPEN_CLIP_TTL_MS = 30_000;
