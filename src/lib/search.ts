import type { Clip, ClipKind } from './db';
import { matchesQuery } from './clips';
import { KIND_WORDS } from './kinds';
import { hostOf } from './format';
import { rankByQuery, typoLimit, WORD, withinEdits } from './rank';

export type DateFilter = 'any' | 'today' | 'week' | 'month';

/** `best`: best match while searching, otherwise newest first. */
export type SortOrder = 'best' | 'newest' | 'oldest' | 'used' | 'az';

export interface SearchFilters {
  kind: ClipKind | 'any';
  site: string | 'any';
  date: DateFilter;
  sort: SortOrder;
}

export const NO_FILTERS: SearchFilters = { kind: 'any', site: 'any', date: 'any', sort: 'best' };

const ORDER: Record<SortOrder, (a: Clip, b: Clip) => number> = {
  best: (a, b) => b.createdAt - a.createdAt,
  newest: (a, b) => b.createdAt - a.createdAt,
  oldest: (a, b) => a.createdAt - b.createdAt,
  used: (a, b) => b.useCount - a.useCount || b.lastUsedAt - a.lastUsedAt,
  az: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }),
};

/** Sorts clips, pinned ones first. */
export function sortClips(clips: Clip[], sort: SortOrder): Clip[] {
  return [...clips].sort((a, b) => b.pinned - a.pinned || ORDER[sort](a, b));
}

function since(date: DateFilter, now: number): number {
  const d = new Date(now);
  if (date === 'today') return d.setHours(0, 0, 0, 0);
  if (date === 'week') return now - 7 * 86_400_000;
  if (date === 'month') return now - 30 * 86_400_000;
  return 0;
}

function passesFilters(clip: Clip, f: SearchFilters, now: number): boolean {
  if (f.kind !== 'any' && clip.kind !== f.kind) return false;
  if (f.site !== 'any' && hostOf(clip.source?.url) !== f.site) return false;
  return clip.createdAt >= since(f.date, now);
}

/** Sites the user saved from, most clips first (for the site filter). */
export function topSites(clips: Clip[], limit = 12): string[] {
  const counts = new Map<string, number>();
  for (const c of clips) {
    const s = hostOf(c.source?.url);
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([s]) => s);
}

/**
 * Every query word appears in the clip, allowing small typos in longer words
 * ("photosynthsis" finds "Photosynthesis"): 1 edit from 5 letters, 2 from 9.
 */
function matchesWithTypos(clip: Clip, query: string): boolean {
  const words = query.toLowerCase().match(WORD) ?? [];
  if (!words.length) return false;
  const hay =
    `${clip.title}\n${clip.text.slice(0, 5000)}\n${clip.note ?? ''}\n${clip.source?.title ?? ''}\n${KIND_WORDS[clip.kind]}`.toLowerCase();
  const hayWords = new Set(hay.match(WORD) ?? []);
  return words.every((w) => {
    if (hay.includes(w)) return true;
    const max = typoLimit(w);
    if (!max) return false;
    for (const h of hayWords) if (withinEdits(w, h, max)) return true;
    return false;
  });
}

const clipFields = (c: Clip) => ({
  title: c.title,
  body: [c.text, c.note, c.source?.title, c.source?.url, KIND_WORDS[c.kind]].filter(Boolean).join('\n'),
});

/**
 * Best match (the default): clips with most of the query words, best first. Any other order: only clips with
 * every word (small typos allowed), pinned first; newest keeps the order given.
 */
export function searchClips(query: string, clips: Clip[], filters: SearchFilters, now = Date.now()): Clip[] {
  const q = query.trim();
  const passing = clips.filter((c) => passesFilters(c, filters, now));
  if (q && filters.sort === 'best') return rankByQuery(passing, q, clipFields);
  const found = q ? passing.filter((c) => matchesQuery(c, q) || matchesWithTypos(c, q)) : passing;
  return filters.sort === 'newest' || filters.sort === 'best' ? found : sortClips(found, filters.sort);
}
