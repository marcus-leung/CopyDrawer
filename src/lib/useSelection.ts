import { useCallback, useMemo, useState } from 'react';

export interface Selection {
  /** Picked clip ids, in the order they were picked. */
  ids: string[];
  selecting: boolean;
  /** 1-based place in the pick order, or 0 when not picked. */
  numberOf: (id: string) => number;
  toggle: (id: string) => void;
  /** Picks everything from the last pick to `id`, in the order `list` shows them. */
  range: (id: string, list: string[]) => void;
  all: (list: string[]) => void;
  clear: () => void;
}

/** Picks clips in order. `exists` drops picks whose clip was deleted. */
export function useSelection(exists: (id: string) => boolean): Selection {
  const [picked, setPicked] = useState<string[]>([]);
  const ids = useMemo(() => picked.filter(exists), [picked, exists]);

  const toggle = useCallback(
    (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.filter(exists), id])),
    [exists],
  );
  const range = useCallback(
    (id: string, list: string[]) =>
      setPicked((p) => {
        const anchor = list.indexOf(p.filter(exists).at(-1) ?? '');
        const end = list.indexOf(id);
        if (anchor < 0 || end < 0) return p.includes(id) ? p : [...p, id];
        const span = anchor < end ? list.slice(anchor, end + 1) : list.slice(end, anchor + 1).reverse();
        return [...p.filter(exists), ...span.filter((x) => !p.includes(x))];
      }),
    [exists],
  );
  const all = useCallback(
    (list: string[]) => setPicked((p) => [...p.filter(exists), ...list.filter((x) => !p.includes(x))]),
    [exists],
  );
  const clear = useCallback(() => setPicked([]), []);
  const numberOf = useCallback((id: string) => ids.indexOf(id) + 1, [ids]);

  return { ids, selecting: ids.length > 0, numberOf, toggle, range, all, clear };
}
