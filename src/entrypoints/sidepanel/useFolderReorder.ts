import { useMemo, useRef, useState } from 'react';
import { COLLECTION_DRAG_TYPE } from '@/components/CollectionTile';
import { setCollectionOrder, type CollectionSummary } from '@/lib/collections';
import { useFlip } from '@/lib/useFlip';

interface FolderDrag {
  id: string;
  order: string[];
  /** The saved order when it was dropped: the shown order stays until the saved one moves on from this. */
  droppedOver?: string;
}

export function useFolderReorder(summaries: CollectionSummary[] | undefined, notify: (message: string) => void) {
  const [drag, setDrag] = useState<FolderDrag | null>(null);
  const savedOrder = useMemo(() => summaries?.map((s) => s.collection.id) ?? [], [summaries]);
  const savedKey = savedOrder.join();
  // Once the saved order has caught up, go back to showing it.
  if (drag?.droppedOver !== undefined && (savedKey !== drag.droppedOver || savedKey === drag.order.join())) setDrag(null);

  const shown = useMemo(() => {
    if (!drag || !summaries) return summaries;
    const byId = new Map(summaries.map((s) => [s.collection.id, s]));
    return drag.order.flatMap((id) => byId.get(id) ?? []);
  }, [drag, summaries]);

  const gridRef = useRef<HTMLUListElement>(null);
  const capture = useFlip(gridRef, (shown ?? []).map((s) => s.collection.id).join());

  const isFolderDrag = (e: React.DragEvent) => !!drag && e.dataTransfer.types.includes(COLLECTION_DRAG_TYPE);

  /**
   * The slot under the pointer, from the tiles' layout boxes (offset*), which ignore the slide animations:
   * a tile sliding under the pointer must not count, or the order flips back and forth.
   */
  const onDragOver = (e: React.DragEvent<HTMLUListElement>) => {
    if (!isFolderDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!drag || drag.droppedOver !== undefined) return;
    const grid = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - grid.left;
    const y = e.clientY - grid.top;
    const slot = [...e.currentTarget.children].findIndex((li) => {
      const el = li as HTMLElement;
      return x >= el.offsetLeft && x < el.offsetLeft + el.offsetWidth && y >= el.offsetTop && y < el.offsetTop + el.offsetHeight;
    });
    if (slot < 0 || drag.order[slot] === drag.id) return;
    const order = drag.order.filter((id) => id !== drag.id);
    order.splice(slot, 0, drag.id);
    capture();
    setDrag({ ...drag, order });
  };

  const onDrop = (e: React.DragEvent<HTMLUListElement>) => {
    if (!isFolderDrag(e) || !drag || drag.droppedOver !== undefined) return;
    e.preventDefault();
    setDrag({ ...drag, droppedOver: savedKey });
    setCollectionOrder(drag.order).catch(() => {
      setDrag(null);
      notify("Couldn't save the folder order. Try again.");
    });
  };

  const tile = (id: string) => ({
    dragging: drag?.id === id && drag.droppedOver === undefined,
    onStart: () => setDrag({ id, order: savedOrder }),
    // A drop keeps its order on screen until saved; anything else (Esc, letting go elsewhere) puts it back.
    onEnd: () => setDrag((d) => (d?.droppedOver !== undefined ? d : null)),
  });

  return { shown, gridRef, grid: { onDragOver, onDrop }, tile };
}
