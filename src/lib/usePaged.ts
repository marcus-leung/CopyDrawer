import { useCallback, useState } from 'react';

/** The first `pageSize` items, growing a page at a time; back to one page when `resetKey` changes. */
export function usePaged<T>(items: T[], resetKey: unknown, pageSize = 100) {
  const [page, setPage] = useState({ key: resetKey, limit: pageSize });
  const limit = Object.is(page.key, resetKey) ? page.limit : pageSize;
  const more = useCallback(() => setPage({ key: resetKey, limit: limit + pageSize }), [resetKey, limit, pageSize]);
  const shown = items.length > limit ? items.slice(0, limit) : items;
  return { shown, rest: items.length - shown.length, more, pageSize };
}
