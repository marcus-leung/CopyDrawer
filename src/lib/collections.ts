import { db as defaultDb, type Clip, type ClipDatabase, type Collection } from './db';
import { CATEGORIES, classifyByRules, detectDestination, type CategoryId } from './classify';

interface CollectionColor {
  accent: string;
  tint: string;
  text: string;
  accentDark: string;
  tintDark: string;
}

export const COLORS: Record<string, CollectionColor> = {
  blue: { accent: '#2457C5', tint: '#E6EEFC', text: '#173D8F', accentDark: '#7EA6FF', tintDark: '#1E2C4D' },
  orange: { accent: '#B35A00', tint: '#FCEBD9', text: '#7A3D00', accentDark: '#FFB36B', tintDark: '#3D2A17' },
  violet: { accent: '#6A46C9', tint: '#EEE8FB', text: '#4A2FA0', accentDark: '#B69CFF', tintDark: '#2D2547' },
  green: { accent: '#0E7A62', tint: '#DDF3EC', text: '#0B5C4A', accentDark: '#5FD6B5', tintDark: '#163A33' },
  pink: { accent: '#B83280', tint: '#FBE4F0', text: '#7A1F55', accentDark: '#F28CC0', tintDark: '#43192F' },
  mustard: { accent: '#7C6A0A', tint: '#F6F0D5', text: '#4D4200', accentDark: '#E3C860', tintDark: '#3A3214' },
  grey: { accent: '#5B6170', tint: '#F1F2F6', text: '#3E4357', accentDark: '#A3A8BC', tintDark: '#232636' },
};
const COLOR_ORDER = ['blue', 'orange', 'violet', 'green', 'pink', 'mustard', 'grey'];

const CATEGORY_COLOR: Record<CategoryId, string> = {
  research: 'blue',
  links: 'orange',
  code: 'violet',
  shopping: 'green',
  recipes: 'pink',
  travel: 'mustard',
  personal: 'grey',
};

export const PRESET_COLORS = COLOR_ORDER;

export const MAX_COLLECTION_NAME = 100;

/** Trims a collection name and keeps it within the limit. */
export function cleanName(name: string): string {
  return name.trim().slice(0, MAX_COLLECTION_NAME).trim();
}

function hsl(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** A collection's color: a preset name ("blue") or a custom hue ("hue:200"). */
export function colorOf(collection: Pick<Collection, 'color'> | undefined): CollectionColor {
  const color = collection?.color ?? 'grey';
  const hue = /^hue:(\d{1,3})$/.exec(color);
  if (hue && Number(hue[1]) < 360) {
    const h = Number(hue[1]);
    // Lightness steps chosen so every hue stays readable (see tests).
    return {
      accent: hsl(h, 70, 34),
      tint: hsl(h, 70, 93),
      text: hsl(h, 75, 22),
      accentDark: hsl(h, 80, 68),
      tintDark: hsl(h, 35, 20),
    };
  }
  return COLORS[color] ?? COLORS.grey!;
}

/** The order for a new collection: after every existing one. */
export async function nextOrder(db: ClipDatabase = defaultDb): Promise<number> {
  const last = await db.collections.orderBy('order').last();
  return last ? last.order + 1 : 0;
}

/** Finds or creates the collection for a key. Must run inside a transaction that includes `collections`. */
async function ensureCollection(
  db: ClipDatabase,
  key: string,
  init: { name: string; color: string; kind: Collection['kind'] },
): Promise<Collection> {
  const existing = await db.collections.where('key').equals(key).first();
  if (existing) return existing;
  const collection: Collection = { id: crypto.randomUUID(), key, createdAt: Date.now(), order: await nextOrder(db), ...init };
  await db.collections.add(collection);
  return collection;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The collection key and setup for a category, turning travel into a named trip when possible. */
function targetFor(category: CategoryId, clip: Pick<Clip, 'text' | 'title' | 'source'>) {
  if (category === 'travel') {
    const city = detectDestination(`${clip.title}\n${clip.text}\n${clip.source?.title ?? ''}`);
    if (city) return { key: `trip:${slug(city)}`, name: `${city} trip`, color: 'mustard', kind: 'trip' as const };
  }
  return { key: `cat:${category}`, name: CATEGORIES[category].name, color: CATEGORY_COLOR[category], kind: 'smart' as const };
}

/**
 * Sorts a clip into a collection using the rules. Leaves clips the user placed alone.
 * Must run inside a transaction that includes `clips` and `collections`.
 */
export async function autoAssign(clip: Clip, db: ClipDatabase = defaultDb): Promise<Clip> {
  if (clip.collectionLocked) return clip;
  const category = classifyByRules(clip);
  if (!category) return clip;
  const target = targetFor(category, clip);
  // A travel clip that names no city ("check-in 15:00") joins the trip being planned.
  const trip = target.key === 'cat:travel' ? await currentTrip(db, clip.createdAt) : undefined;
  const collection = trip ?? (await ensureCollection(db, target.key, target));
  if (clip.collectionId !== collection.id) {
    clip = { ...clip, collectionId: collection.id };
    await db.clips.update(clip.id, { collectionId: collection.id });
  }
  return clip;
}

const TRIP_ACTIVE_MS = 14 * 86_400_000;

/** The trip with the latest clip in the last two weeks, if any. */
async function currentTrip(db: ClipDatabase, now: number): Promise<Collection | undefined> {
  const trips = await db.collections.filter((c) => c.kind === 'trip').toArray();
  let best: { trip: Collection; at: number } | undefined;
  for (const trip of trips) {
    const latest = await db.clips.where('collectionId').equals(trip.id).reverse().sortBy('createdAt');
    const at = latest[0]?.createdAt ?? trip.createdAt;
    if (now - at <= TRIP_ACTIVE_MS && (!best || at > best.at)) best = { trip, at };
  }
  return best?.trip;
}

/** Assigns a clip to a category found by the AI model (when the rules had no answer). */
export async function assignCategory(clipId: string, category: CategoryId, db: ClipDatabase = defaultDb): Promise<void> {
  await db.transaction('rw', db.clips, db.collections, async () => {
    const clip = await db.clips.get(clipId);
    if (!clip || clip.collectionLocked || clip.collectionId) return;
    const target = targetFor(category, clip);
    const trip = target.key === 'cat:travel' ? await currentTrip(db, clip.createdAt) : undefined;
    const collection = trip ?? (await ensureCollection(db, target.key, target));
    await db.clips.update(clipId, { collectionId: collection.id });
  });
}

/** The user moves a clip; it stays there. Pass undefined to remove it from any collection. */
export async function moveClip(clipId: string, collectionId: string | undefined, db: ClipDatabase = defaultDb): Promise<void> {
  await moveClips([clipId], collectionId, db);
}

export async function moveClips(
  clipIds: string[],
  collectionId: string | undefined,
  db: ClipDatabase = defaultDb,
): Promise<void> {
  await db.clips.bulkUpdate(clipIds.map((key) => ({ key, changes: { collectionId, collectionLocked: 1 } })));
}

/** The first preset no collection uses yet, so new collections look different by default. */
export async function nextColor(db: ClipDatabase = defaultDb): Promise<string> {
  const used = new Set((await db.collections.toArray()).map((c) => c.color));
  return COLOR_ORDER.find((c) => !used.has(c)) ?? COLOR_ORDER[(await db.collections.count()) % COLOR_ORDER.length]!;
}

export async function createCollection(name: string, color?: string, db: ClipDatabase = defaultDb): Promise<Collection> {
  return db.transaction('rw', db.collections, async () => {
    const id = crypto.randomUUID();
    return ensureCollection(db, `manual:${id}`, {
      name: cleanName(name) || 'New collection',
      color: color ?? (await nextColor(db)),
      kind: 'manual',
    });
  });
}

export async function renameCollection(id: string, name: string, db: ClipDatabase = defaultDb): Promise<void> {
  if (cleanName(name)) await db.collections.update(id, { name: cleanName(name) });
}

export async function recolorCollection(id: string, color: string, db: ClipDatabase = defaultDb): Promise<void> {
  await db.collections.update(id, { color });
}

/** Saves the folder order shown to the user. Folders missing from `ids` (made meanwhile) keep their order after these. */
export async function setCollectionOrder(ids: string[], db: ClipDatabase = defaultDb): Promise<void> {
  await db.transaction('rw', db.collections, async () => {
    const all = await db.collections.orderBy('order').toArray();
    const rank = (id: string) => (ids.includes(id) ? ids.indexOf(id) : ids.length);
    const sorted = all.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c.id) - rank(b.c.id) || a.i - b.i);
    await Promise.all(sorted.map(({ c }, order) => (c.order === order ? null : db.collections.update(c.id, { order }))));
  });
}

/** Deletes a collection; its clips stay in history without a collection. */
export async function deleteCollection(id: string, db: ClipDatabase = defaultDb): Promise<void> {
  await db.transaction('rw', db.clips, db.collections, async () => {
    await db.clips.where('collectionId').equals(id).modify({ collectionId: undefined, collectionLocked: 0 });
    await db.collections.delete(id);
  });
}

export interface CollectionSummary {
  collection: Collection;
  count: number;
  newCount: number;
}

/** Collections with clip counts, in the user's order; empty ones hidden. "New" = saved in the last 24 h. */
export async function listCollections(db: ClipDatabase = defaultDb, now = Date.now()): Promise<CollectionSummary[]> {
  const [collections, clips] = await Promise.all([db.collections.toArray(), db.clips.toArray()]);
  const counts = new Map<string, { count: number; newCount: number }>();
  for (const clip of clips) {
    if (!clip.collectionId) continue;
    const c = counts.get(clip.collectionId) ?? { count: 0, newCount: 0 };
    c.count++;
    if (now - clip.createdAt < 86_400_000) c.newCount++;
    counts.set(clip.collectionId, c);
  }
  return collections
    .map((collection) => ({ collection, ...(counts.get(collection.id) ?? { count: 0, newCount: 0 }) }))
    .filter((s) => s.count > 0 || s.collection.kind === 'manual')
    .sort((a, b) => a.collection.order - b.collection.order);
}
