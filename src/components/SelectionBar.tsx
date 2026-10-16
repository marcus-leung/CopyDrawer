import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, MoreHorizontal, Trash2, X } from 'lucide-react';
import { db } from '@/lib/db';
import { JOIN_OPTIONS, type JoinWith } from '@/lib/join';
import { Button, IconButton } from './ui';
import { InlineConfirm } from './InlineConfirm';

const NONE = '\u0000none';
const field = 'h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-bg px-2 text-[13px] text-ink';

export function SelectionBar({
  count,
  notShown,
  hasText,
  joinWith,
  onJoinWith,
  onCopy,
  onMove,
  onDelete,
  onClear,
}: {
  count: number;
  /** Picks the list isn't showing right now (a search or filter hides them). */
  notShown: number;
  /** False when only images are picked: there's no plain text to copy. */
  hasText: boolean;
  joinWith: JoinWith;
  onJoinWith: (joinWith: JoinWith) => void;
  onCopy: (plain: boolean) => void;
  onMove: (collectionId: string | undefined) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [more, setMore] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const collections = useLiveQuery(() => db.collections.orderBy('order').toArray(), []);
  return (
    <div className="border-t border-line px-[18px] pt-2.5 pb-4" role="region" aria-label="Picked clips">
      {more && (
        <div className="mb-3 flex flex-col gap-2.5 rounded-2xl bg-surface p-3.5">
          <label className="flex items-center gap-2 text-[13px] text-text-2">
            <span className="w-16 shrink-0">Join with</span>
            <select value={joinWith} onChange={(e) => onJoinWith(e.target.value as JoinWith)} className={field}>
              {JOIN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[13px] text-text-2">
            <span className="w-16 shrink-0">Move to</span>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) onMove(e.target.value === NONE ? undefined : e.target.value);
              }}
              className={field}
            >
              <option value="" disabled>
                Choose a collection
              </option>
              <option value={NONE}>None</option>
              {collections?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!hasText} onClick={() => onCopy(true)}>
              Copy as plain text
            </Button>
            <Button size="sm" variant="danger" onClick={() => (notShown ? setConfirming(true) : onDelete())}>
              <Trash2 size={15} aria-hidden />
              Delete {count}
            </Button>
          </div>
          {confirming && (
            <InlineConfirm
              message={`${notShown === 1 ? '1 of these isn’t' : `${notShown} of these aren’t`} shown in the list. Delete all ${count}?`}
              confirmLabel={`Delete ${count}`}
              onConfirm={() => {
                setConfirming(false);
                onDelete();
              }}
              onCancel={() => setConfirming(false)}
            />
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <IconButton label="Clear picks" className="size-9 bg-surface" onClick={onClear}>
          <X size={17} aria-hidden />
        </IconButton>
        <span className="min-w-0 flex-1 text-[13px] font-semibold" aria-live="polite">
          {count} picked
          {notShown > 0 && <span className="font-normal text-text-2"> · {notShown} not shown</span>}
        </span>
        <IconButton
          label="More for picked clips"
          aria-expanded={more}
          className="size-9 bg-surface"
          onClick={() => setMore(!more)}
        >
          <MoreHorizontal size={18} aria-hidden />
        </IconButton>
        <Button size="sm" variant="primary" onClick={() => onCopy(false)}>
          <Copy size={15} aria-hidden />
          Copy all
        </Button>
      </div>
    </div>
  );
}
