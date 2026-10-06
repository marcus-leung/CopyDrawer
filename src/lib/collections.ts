import { db as defaultDb, type Clip, type ClipDatabase, type Collection } from './db';
import { CATEGORIES, classifyByRules, detectDestination, type CategoryId } from './classify';

/** Collection colors: docs/05-ui-design-system.md §2.2. */
export interface CollectionColor {
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
export const COLOR_ORDER = ['blue', 'orange', 'violet', 'green', 'pink', 'mustard', 'grey'];

const CATEGORY_COLOR: Record<CategoryId, string> = {
  research: 'blue',
  links: 'orange',
  code: 'violet',
  shopping: 'green',
  recipes: 'pink',
  travel: 'mustard',
  personal: 'grey',
};

export function colorOf(collection: Pick<Collection, 'color'> | undefined): CollectionColor {
  return COLORS[collection?.color ?? 'grey'] ?? COLORS.grey!;
}

/** Finds or creates the collection for a key. Must run inside a transaction that includes `collections`. */
async function ensureCollection(
  db: ClipDatabase,
  key: string,
  init: { name: string; color: string; kind: Collection['kind'] },
): Promise<Collection> {
  const existing = await db.collections.where('key').equals(key).first();
  if (existing) return existing;
  const count = await db.collections.count();
  const collection: Collection = { id: crypto.randomUUID(), key, createdAt: Date.now(), order: count, ...init };
  await db.collections.add(collection);
  return collection;
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The collection key and setup for a category, turning travel into a named trip when possible. */
export function targetFor(category: CategoryId, clip: Pick<Clip, 'text' | 'title' | 'source'>) {
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
  // An existing trip wins for travel clips that don't name a city ("check-in 15:00").
  const category = classifyByRules(clip);
  if (!category) return clip;
  const target = targetFor(category, clip);
  const collection = await ensureCollection(db, target.key, target);
  if (clip.collectionId !== collection.id) {
    clip = { ...clip, collectionId: collection.id };
    await db.clips.update(clip.id, { collectionId: collection.id });
  }
  return clip;
}

/** Assigns a clip to a category found by the AI model (when the rules had no answer). */
export async function assignCategory(clipId: string, category: CategoryId, db: ClipDatabase = defaultDb): Promise<void> {
  await db.transaction('rw', db.clips, db.collections, async () => {
    const clip = await db.clips.get(clipId);
    if (!clip || clip.collectionLocked || clip.collectionId) return;
    const target = targetFor(category, clip);
    const collection = await ensureCollection(db, target.key, target);
    await db.clips.update(clipId, { collectionId: collection.id });
  });
}

/** The user moves a clip; it stays there. Pass undefined to remove it from any collection. */
export async function moveClip(clipId: string, collectionId: string | undefined, db: ClipDatabase = defaultDb): Promise<void> {
  await db.clips.update(clipId, { collectionId, collectionLocked: 1 });
}

export async function createCollection(name: string, db: ClipDatabase = defaultDb): Promise<Collection> {
  return db.transaction('rw', db.collections, async () => {
    const used = new Set((await db.collections.toArray()).map((c) => c.color));
    const color = COLOR_ORDER.find((c) => !used.has(c)) ?? COLOR_ORDER[(await db.collections.count()) % COLOR_ORDER.length]!;
    const id = crypto.randomUUID();
    return ensureCollection(db, `manual:${id}`, { name: name.trim() || 'New collection', color, kind: 'manual' });
  });
}

export async function renameCollection(id: string, name: string, db: ClipDatabase = defaultDb): Promise<void> {
  if (name.trim()) await db.collections.update(id, { name: name.trim() });
}

export async function recolorCollection(id: string, color: string, db: ClipDatabase = defaultDb): Promise<void> {
  if (COLORS[color]) await db.collections.update(id, { color });
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

/** Collections with clip counts, largest first; empty ones hidden. "New" = saved in the last 24 h. */
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
    .sort((a, b) => b.count - a.count || a.collection.order - b.collection.order);
}
