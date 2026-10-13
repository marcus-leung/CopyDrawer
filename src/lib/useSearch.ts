import { useEffect, useState } from 'react';
import type { Clip } from './db';
import { searchClips, type SearchFilters } from './search';

/**
 * Searches as you type (150 ms debounce). `results` is null while searching
 * and the latest results aren't for the current query, filters and clips yet.
 */
export function useSearch(query: string, filters: SearchFilters, clips: Clip[] | undefined) {
  const sorted = filters.sort !== 'best' && (query.trim() !== '' || filters.sort !== 'newest');
  const filtering = filters.kind !== 'any' || filters.site !== 'any' || filters.date !== 'any' || sorted;
  const searching = query.trim() !== '' || filtering;
  const [found, setFound] = useState<{ items: Clip[]; query: string; filters: SearchFilters; clips: Clip[] }>();

  useEffect(() => {
    if (!searching || !clips) return;
    const t = setTimeout(() => setFound({ items: searchClips(query, clips, filters), query, filters, clips }), 150);
    return () => clearTimeout(t);
  }, [searching, query, filters, clips]);

  const fresh = found && found.query === query && found.filters === filters && found.clips === clips;
  return { searching, filtering, results: searching && fresh ? found.items : null };
}
