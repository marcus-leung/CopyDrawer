import type { Clip, ClipKind } from './db';
import { matchesQuery } from './clips';
import { hostOf } from './format';

export type DateFilter = 'any' | 'today' | 'week' | 'month';

export interface SearchFilters {
  kind: ClipKind | 'any';
  site: string | 'any';
  date: DateFilter;
}

export const NO_FILTERS: SearchFilters = { kind: 'any', site: 'any', date: 'any' };

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

/** Edit distance up to `max` (early exit beyond it). */
export function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]!);
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length]! <= max;
}

const WORD = /[\p{L}\p{N}]+/gu;

/**
 * Every query word appears in the clip, allowing small typos in longer words
 * ("photosynthsis" finds "Photosynthesis"): 1 edit from 5 letters, 2 from 9.
 */
export function matchesWithTypos(clip: Clip, query: string): boolean {
  const words = query.toLowerCase().match(WORD) ?? [];
  if (!words.length) return false;
  const hay = `${clip.title}\n${clip.text.slice(0, 5000)}\n${clip.note ?? ''}\n${clip.source?.title ?? ''}`.toLowerCase();
  const hayWords = new Set(hay.match(WORD) ?? []);
  return words.every((w) => {
    if (hay.includes(w)) return true;
    const max = w.length >= 9 ? 2 : w.length >= 5 ? 1 : 0;
    if (!max) return false;
    for (const h of hayWords) if (withinEdits(w, h, max)) return true;
    return false;
  });
}

/** Clips with every query word (small typos allowed), in the order given: pinned, then newest. */
export function searchClips(query: string, clips: Clip[], filters: SearchFilters, now = Date.now()): Clip[] {
  const pool = clips.filter((c) => passesFilters(c, filters, now));
  const q = query.trim();
  if (!q) return pool;
  return pool.filter((c) => matchesQuery(c, q) || matchesWithTypos(c, q));
}
