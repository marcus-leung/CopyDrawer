import { db as defaultDb, type Clip, type ClipDatabase, type ClipKind, type ClipSource, type StoredImage } from './db';
import { autoAssign } from './collections';
import { cleanUrl } from './actions';

/** History limit, pins included (docs/02-design.md §10). */
export const MAX_CLIPS = 2000;

export interface NewClip {
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

function newId(): string {
  return crypto.randomUUID();
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
      id: newId(),
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
  const hay = [clip.text, clip.title, clip.source?.title, clip.source?.url, clip.kind === 'image' ? 'image picture photo screenshot' : '']
    .join('\n')
    .toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

export interface DeletedClip {
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

/** Deletes unpinned clips older than `days`. 0 means keep forever. */
export async function deleteOlderThan(days: number, db: ClipDatabase = defaultDb): Promise<number> {
  if (days <= 0) return 0;
  const cutoff = Date.now() - days * 86_400_000;
  const old = await db.clips
    .where('createdAt')
    .below(cutoff)
    .filter((c) => c.pinned === 0)
    .toArray();
  await removeClips(db, old);
  return old.length;
}

export async function clearAll(db: ClipDatabase = defaultDb): Promise<void> {
  await db.transaction('rw', db.clips, db.images, async () => {
    await db.clips.clear();
    await db.images.clear();
  });
}
