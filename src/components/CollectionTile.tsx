import type { CSSProperties } from 'react';
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

export function countLine(count: number, newCount: number): string {
  const base = `${count} ${count === 1 ? 'clip' : 'clips'}`;
  return newCount ? `${base}, ${newCount} new` : base;
}

/** Folder tile: an accent tab over a tinted body (docs/05-ui-design-system.md §4). */
export function CollectionTile({ summary, onOpen }: { summary: CollectionSummary; onOpen: () => void }) {
  const { collection, count, newCount } = summary;
  return (
    <li style={collectionVars(collection.color)}>
      <button type="button" onClick={onOpen} className="group block w-full cursor-pointer text-left">
        <span className="block h-2.5 w-14 rounded-t-lg bg-[var(--c-accent)] dark:bg-[var(--c-accent-d)]" aria-hidden />
        <span className="block rounded-tr-xl rounded-b-xl border-t-[3px] border-[var(--c-accent)] bg-[var(--c-tint)] px-3 pt-2.5 pb-3 text-[var(--c-text)] group-hover:brightness-[0.98] dark:border-[var(--c-accent-d)] dark:bg-[var(--c-tint-d)] dark:text-ink">
          <span className="block truncate text-[15px] font-semibold">{collection.name}</span>
          <span className="block truncate text-[13px]">{countLine(count, newCount)}</span>
        </span>
      </button>
    </li>
  );
}
