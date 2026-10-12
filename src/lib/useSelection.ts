import { useCallback, useEffect, useMemo, useState } from 'react';

/** Picking several clips: the clip's place in the pick order (0 = not picked) and what a pick does. */
export interface RowPick {
  number: number;
  selecting: boolean;
  onPick: (e: { shiftKey: boolean }) => void;
}

export function togglePick(picked: string[], id: string): string[] {
  return picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
}

/** Adds everything from the last pick to `id`, in the order `list` shows them. Without an anchor in `list`, adds `id`. */
export function pickRange(picked: string[], id: string, list: string[]): string[] {
  const anchor = list.indexOf(picked.at(-1) ?? '');
  const end = list.indexOf(id);
  if (anchor < 0 || end < 0) return picked.includes(id) ? picked : [...picked, id];
  const span = anchor < end ? list.slice(anchor, end + 1) : list.slice(end, anchor + 1).reverse();
  return [...picked, ...span.filter((x) => !picked.includes(x))];
}

export function pickAll(picked: string[], list: string[]): string[] {
  return [...picked, ...list.filter((x) => !picked.includes(x))];
}

export interface Selection {
  /** Picked clip ids, in the order they were picked. */
  ids: string[];
  selecting: boolean;
  /** 1-based place in the pick order, or 0 when not picked. */
  numberOf: (id: string) => number;
  toggle: (id: string) => void;
  range: (id: string, list: string[]) => void;
  all: (list: string[]) => void;
  clear: () => void;
}

/** Picks clips in order. `exists` drops picks whose clip was deleted. */
export function useSelection(exists: (id: string) => boolean): Selection {
  const [picked, setPicked] = useState<string[]>([]);
  const ids = useMemo(() => picked.filter(exists), [picked, exists]);
  const toggle = useCallback((id: string) => setPicked((p) => togglePick(p.filter(exists), id)), [exists]);
  const range = useCallback((id: string, list: string[]) => setPicked((p) => pickRange(p.filter(exists), id, list)), [exists]);
  const all = useCallback((list: string[]) => setPicked((p) => pickAll(p.filter(exists), list)), [exists]);
  const clear = useCallback(() => setPicked([]), []);
  const numberOf = useCallback((id: string) => ids.indexOf(id) + 1, [ids]);
  return { ids, selecting: ids.length > 0, numberOf, toggle, range, all, clear };
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/**
 * Picking within one list, in the order it shows `ids`: Shift-click ranges follow that order. With `keys`,
 * ⌘/Ctrl+A picks that list and Esc clears the picks, except while typing.
 */
export function useListPicks(selection: Selection, ids: string[], keys = false): (id: string) => RowPick {
  const { numberOf, selecting, toggle, range, all, clear } = selection;
  useEffect(() => {
    if (!keys) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === 'Escape' && selecting) {
        e.preventDefault();
        clear();
      } else if (e.key.toLowerCase() === 'a' && (e.metaKey || e.ctrlKey) && ids.length) {
        e.preventDefault();
        all(ids);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keys, ids, selecting, all, clear]);
  return (id) => ({
    number: numberOf(id),
    selecting,
    onPick: (e) => (e.shiftKey ? range(id, ids) : toggle(id)),
  });
}
