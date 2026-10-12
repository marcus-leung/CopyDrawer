import { useState, type CSSProperties } from 'react';
import { CLIP_DRAG_TYPE } from './ClipRow';
import type { CollectionSummary } from '@/lib/collections';
import { colorOf } from '@/lib/collections';

/** CSS variables for a collection's colors; classes pick light or dark values. */
export function collectionVars(color: string): CSSProperties {
  const c = colorOf({ color });
  return {
    '--c-accent': c.accent,
    '--c-tint': c.tint,
    '--c-text': c.text,
    '--c-accent-d': c.accentDark,
    '--c-tint-d': c.tintDark,
  } as CSSProperties;
}

export const COLLECTION_DRAG_TYPE = 'application/x-copydrawer-collection';

function countLine(count: number, newCount: number): string {
  const base = `${count} ${count === 1 ? 'clip' : 'clips'}`;
  return newCount ? `${base}, ${newCount} new` : base;
}

/** Folder tile: an accent tab over a tinted body. */
export function CollectionTile({
  summary,
  onOpen,
  onDropClip,
  onDropCollection,
}: {
  summary: CollectionSummary;
  onOpen: () => void;
  /** A clip row was dropped on this tile. */
  onDropClip?: (clipId: string) => void;
  /** Another tile was dropped on this one: it takes this one's place. */
  onDropCollection?: (collectionId: string) => void;
}) {
  const { collection, count, newCount } = summary;
  const [over, setOver] = useState(false);
  const dropType = (e: React.DragEvent) => {
    const { types } = e.dataTransfer;
    if (onDropCollection && types.includes(COLLECTION_DRAG_TYPE)) return COLLECTION_DRAG_TYPE;
    if (onDropClip && types.includes(CLIP_DRAG_TYPE)) return CLIP_DRAG_TYPE;
    return null;
  };
  return (
    <li
      style={collectionVars(collection.color)}
      onDragOver={(e) => {
        if (!dropType(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const type = dropType(e);
        if (!type) return;
        e.preventDefault();
        e.stopPropagation();
        const id = e.dataTransfer.getData(type);
        if (type === COLLECTION_DRAG_TYPE) onDropCollection?.(id);
        else onDropClip?.(id);
      }}
      data-drop-target={over || undefined}
      className="rounded-xl data-[drop-target]:outline-2 data-[drop-target]:outline-offset-2 data-[drop-target]:outline-ink"
    >
      <button
        type="button"
        draggable={!!onDropCollection}
        onDragStart={(e) => {
          e.dataTransfer.setData(COLLECTION_DRAG_TYPE, collection.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={onOpen}
        className="group block w-full cursor-pointer text-left"
      >
        <span className="block h-2.5 w-14 rounded-t-lg bg-[var(--c-accent)] dark:bg-[var(--c-accent-d)]" aria-hidden />
        <span className="block rounded-tr-xl rounded-b-xl border-t-[3px] border-[var(--c-accent)] bg-[var(--c-tint)] px-3 pt-2.5 pb-3 text-[var(--c-text)] group-hover:brightness-[0.98] dark:border-[var(--c-accent-d)] dark:bg-[var(--c-tint-d)] dark:text-ink">
          <span className="block truncate text-[15px] font-semibold">{collection.name}</span>
          <span className="block truncate text-[13px]">{countLine(count, newCount)}</span>
        </span>
      </button>
    </li>
  );
}
