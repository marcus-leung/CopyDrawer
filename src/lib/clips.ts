import { db as defaultDb, type Clip, type ClipDatabase, type ClipKind, type ClipSource, type StoredImage } from './db';
import { autoAssign } from './collections';
import { cleanUrl } from './actions';

/** History limit, pins included. */
export const MAX_CLIPS = 2000;

interface NewClip {
  text: string;
  html?: string;
  source?: ClipSource;
}

export function hashText(text: string): string {
  // FNV-1a, 32-bit. Good enough to spot exact duplicates.
  let h = 0x811c9dc5;
  const s = text.trim().replace(/\s+/g, ' ');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const URL_RE = /^(https?:\/\/|www\.)\S+$/i;
const CODE_HINTS = /[{};]\s*$|^\s*(const|let|var|function|import|export|def|class|SELECT|INSERT|UPDATE|<\w+)[\s(]/m;

export function detectKind(text: string): ClipKind {
  const t = text.trim();
  if (URL_RE.test(t)) return 'link';
  if (t.includes('\n') && CODE_HINTS.test(t)) return 'code';
  // One-line SQL ("SELECT … FROM …"); uppercase only, so ordinary sentences don't match.
  if (/^(SELECT|INSERT|UPDATE|DELETE)\b.*\b(FROM|INTO|SET|WHERE)\b/.test(t)) return 'code';
  return 'text';
}

export function makeTitle(text: string, kind: ClipKind): string {
  const t = text.trim();
  if (kind === 'link') {
    try {
      const u = new URL(t.startsWith('www.') ? `https://${t}` : t);
      const path = u.pathname === '/' ? '' : u.pathname;
      return truncate(`${u.hostname.replace(/^www\./, '')}${path}`, 80);
    } catch {
      return truncate(t, 80);
    }
  }
  const firstLine = t.split('\n').find((l) => l.trim().length > 0) ?? t;
  return truncate(firstLine.trim(), 80);
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

let lastSave = 0;
/** Save timestamps, strictly increasing so clips saved in the same millisecond keep their order. */
export function saveTime(): number {
  lastSave = Math.max(Date.now(), lastSave + 1);
  return lastSave;
}

/**
 * Saves a clip. An exact duplicate of an existing clip moves that clip to the
 * top instead of creating a new one. Returns the saved clip, or null when the
 * text is empty.
 */
export async function saveClip(input: NewClip, db: ClipDatabase = defaultDb): Promise<Clip | null> {
  let text = input.text.replace(/\r\n/g, '\n');
  if (!text.trim()) return null;
  // Links are saved without tracking parameters (utm_*, fbclid…).
  if (detectKind(text) === 'link') text = cleanUrl(text.trim());
  const hash = hashText(text);
  const now = saveTime();

  return db.transaction('rw', [db.clips, db.images, db.collections], async () => {
    const existing = await db.clips.where('hash').equals(hash).first();
    if (existing) {
      const updated: Clip = {
        ...existing,
        createdAt: now,
        source: input.source ?? existing.source,
        html: input.html ?? existing.html,
      };
      await db.clips.put(updated);
      return updated;
    }
    const kind = detectKind(text);
    const clip: Clip = {
      id: crypto.randomUUID(),
      createdAt: now,
      lastUsedAt: 0,
      useCount: 0,
      kind,
      text,
      html: input.html || undefined,
      title: makeTitle(text, kind),
      source: input.source,
      pinned: 0,
      hash,
      titleSource: 'heuristic',
    };
    await db.clips.add(clip);
    const sorted = await autoAssign(clip, db);
    await enforceLimit(db);
    return sorted;
  });
}

/** Deletes clips and any image files they own. */
async function removeClips(db: ClipDatabase, clips: Clip[]): Promise<void> {
  await db.clips.bulkDelete(clips.map((c) => c.id));
  const imageIds = clips.flatMap((c) => (c.image ? [c.image.imageId] : []));
  if (imageIds.length) await db.images.bulkDelete(imageIds);
}

/** Drops the oldest unpinned clips until the history fits MAX_CLIPS. */
export async function enforceLimit(db: ClipDatabase = defaultDb, max = MAX_CLIPS): Promise<number> {
  const total = await db.clips.count();
  const over = total - max;
  if (over <= 0) return 0;
  const victims = await db.clips
    .orderBy('createdAt')
    .filter((c) => c.pinned === 0)
    .limit(over)
    .toArray();
  await removeClips(db, victims);
  return victims.length;
}

/** Newest first, pinned clips on top. */
export async function listClips(db: ClipDatabase = defaultDb): Promise<Clip[]> {
  const all = await db.clips.orderBy('createdAt').reverse().toArray();
  return [...all.filter((c) => c.pinned === 1), ...all.filter((c) => c.pinned === 0)];
}

export function matchesQuery(clip: Clip, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    clip.text,
    clip.title,
    clip.source?.title,
    clip.source?.url,
    clip.kind === 'image' ? 'image picture photo screenshot' : '',
  ]
    .join('\n')
    .toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

interface DeletedClip {
  clip: Clip;
  image?: StoredImage;
}

export async function deleteClip(id: string, db: ClipDatabase = defaultDb): Promise<DeletedClip | undefined> {
  return db.transaction('rw', db.clips, db.images, async () => {
    const clip = await db.clips.get(id);
    if (!clip) return undefined;
    const image = clip.image ? await db.images.get(clip.image.imageId) : undefined;
    await removeClips(db, [clip]);
    return { clip, image };
  });
}

export async function restoreClip(deleted: DeletedClip, db: ClipDatabase = defaultDb): Promise<void> {
  await db.transaction('rw', db.clips, db.images, async () => {
    if (deleted.image) await db.images.put(deleted.image);
    await db.clips.put(deleted.clip);
  });
}

interface ClipEdit {
  text?: string;
  title?: string;
}

/**
 * Changes a saved clip's text or title (only this saved copy; nothing on the
 * page). New text gets a fresh type and title, and is sorted
 * again unless the user placed the clip. Returns false for empty text.
 */
export async function editClip(id: string, edit: ClipEdit, db: ClipDatabase = defaultDb): Promise<boolean> {
  return db.transaction('rw', [db.clips, db.images, db.collections], async () => {
    const clip = await db.clips.get(id);
    if (!clip) return false;
    let next: Clip = { ...clip };
    if (edit.text !== undefined && clip.kind !== 'image') {
      const text = edit.text.replace(/\r\n/g, '\n');
      if (!text.trim()) return false;
      if (text !== clip.text) {
        const kind = detectKind(text);
        next = {
          ...next,
          text,
          kind,
          html: undefined, // the formatted copy no longer matches
          hash: hashText(text),
        };
        if (clip.titleSource !== 'user') next = { ...next, title: makeTitle(text, kind), titleSource: 'heuristic' };
        if (!clip.collectionLocked) next.collectionId = undefined;
      }
    }
    if (edit.title !== undefined) {
      const title = edit.title.trim();
      if (title && title !== clip.title) next = { ...next, title, titleSource: 'user' };
      // Clearing the title goes back to one made from the text.
      if (!title)
        next = { ...next, title: clip.kind === 'image' ? clip.title : makeTitle(next.text, next.kind), titleSource: 'heuristic' };
    }
    await db.clips.put(next);
    if (!next.collectionLocked && !next.collectionId) await autoAssign(next, db);
    return true;
  });
}

/** Where a clip sits in the "Images and colors" strip: reordered position, else newest first. */
export function stripRank(clip: Clip): number {
  return clip.stripRank ?? clip.createdAt;
}

/** Moves a clip just before `beforeId` in the strip, given the strip in its current order. */
export async function moveInStrip(id: string, beforeId: string, strip: Clip[], db: ClipDatabase = defaultDb): Promise<void> {
  const rest = strip.filter((c) => c.id !== id);
  const at = rest.findIndex((c) => c.id === beforeId);
  if (id === beforeId || at < 0) return;
  const next = stripRank(rest[at]!);
  // To the front: half a millisecond ahead, so a clip saved later (whole-ms times) still comes first.
  const prev = at > 0 ? stripRank(rest[at - 1]!) : next + 1;
  await db.clips.update(id, { stripRank: (prev + next) / 2 });
}

export async function togglePin(id: string, db: ClipDatabase = defaultDb): Promise<void> {
  const clip = await db.clips.get(id);
  if (!clip) return;
  await db.clips.update(id, { pinned: clip.pinned === 1 ? 0 : 1 });
}

export async function markUsed(id: string, db: ClipDatabase = defaultDb): Promise<void> {
  const clip = await db.clips.get(id);
  if (!clip) return;
  await db.clips.update(id, { lastUsedAt: Date.now(), useCount: clip.useCount + 1 });
}

/** Unpinned clips older than `days`. 0 means keep forever. */
function olderThan(days: number, db: ClipDatabase) {
  const cutoff = Date.now() - days * 86_400_000;
  return db.clips
    .where('createdAt')
    .below(cutoff)
    .filter((c) => c.pinned === 0);
}

export async function countOlderThan(days: number, db: ClipDatabase = defaultDb): Promise<number> {
  return days > 0 ? olderThan(days, db).count() : 0;
}

/** Deletes unpinned clips older than `days`. 0 means keep forever. */
export async function deleteOlderThan(days: number, db: ClipDatabase = defaultDb): Promise<number> {
  if (days <= 0) return 0;
  const old = await olderThan(days, db).toArray();
  await removeClips(db, old);
  return old.length;
}

export async function clearAll(db: ClipDatabase = defaultDb): Promise<void> {
  await db.transaction('rw', db.clips, db.images, async () => {
    await db.clips.clear();
    await db.images.clear();
  });
}
