import { useEffect, useState } from 'react';
import type { Clip } from './db';
import { searchClips, type SearchFilters, type SearchResult } from './search';
import { activeEmbedder } from './useIndexer';

/**
 * Searches as you type (150 ms debounce). `results` is null while searching
 * and the latest results aren't for the current query, filters and clips yet.
 */
export function useSearch(query: string, filters: SearchFilters, clips: Clip[] | undefined) {
  const filtering = filters.kind !== 'any' || filters.site !== 'any' || filters.date !== 'any';
  const searching = query.trim() !== '' || filtering;
  const [found, setFound] = useState<{ items: SearchResult[]; query: string; filters: SearchFilters; clips: Clip[] }>();

  useEffect(() => {
    if (!searching || !clips) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void searchClips(query, clips, filters, activeEmbedder())
        .then((items) => !cancelled && setFound({ items, query, filters, clips }))
        .catch(() => {});
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searching, query, filters, clips]);

  const fresh = found && found.query === query && found.filters === filters && found.clips === clips;
  return { searching, filtering, results: searching && fresh ? found.items : null };
}
