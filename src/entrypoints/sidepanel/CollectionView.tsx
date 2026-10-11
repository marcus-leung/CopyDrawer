import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { db, type Clip } from '@/lib/db';
import {
  deleteCollection,
  listCollections,
  MAX_COLLECTION_NAME,
  moveCollection,
  recolorCollection,
  renameCollection,
} from '@/lib/collections';
import { ClipRow } from '@/components/ClipRow';
import { hostOf } from '@/lib/format';
import { collectionVars } from '@/components/CollectionTile';
import { IconButton } from '@/components/ui';
import { ExpandButton } from '@/components/ExpandButton';
import { ColorPicker } from '@/components/ColorPicker';
import { InlineConfirm } from '@/components/InlineConfirm';
import { ShowMore } from '@/components/ShowMore';
import { usePaged } from '@/lib/usePaged';

type Sort = 'newest' | 'used' | 'source';

const SORTS: Record<Sort, (a: Clip, b: Clip) => number> = {
  newest: (a, b) => b.createdAt - a.createdAt,
  used: (a, b) => b.useCount - a.useCount || b.lastUsedAt - a.lastUsedAt,
  // By site name ("airbnb.com" before "booking.com"); clips saved by hand last.
  source: (a, b) => (hostOf(a.source?.url) ?? '~').localeCompare(hostOf(b.source?.url) ?? '~') || b.createdAt - a.createdAt,
};

export function CollectionView({
  id,
  onBack,
  onOpen,
  onCopy,
  notify,
}: {
  id: string;
  onBack: () => void;
  onOpen: (clip: Clip) => void;
  onCopy: (clip: Clip) => void;
  notify: (message: string) => void;
}) {
  const collection = useLiveQuery(() => db.collections.get(id), [id]);
  const clips = useLiveQuery(() => db.clips.where('collectionId').equals(id).toArray(), [id]);
  const order = useLiveQuery(async () => (await listCollections()).map((s) => s.collection.id), []);
  const [sort, setSort] = useState<Sort>('newest');
  const [editing, setEditing] = useState(false);
  const [panel, setPanel] = useState<'color' | 'delete' | null>(null);
  const sorted = useMemo(() => [...(clips ?? [])].sort(SORTS[sort]), [clips, sort]);
  const paged = usePaged(sorted, `${id}\n${sort}`);

  if (collection === undefined || clips === undefined) return null;
  if (collection === null) return null;

  async function remove() {
    if (!collection) return;
    await deleteCollection(collection.id);
    notify('Collection deleted');
    onBack();
  }

  return (
    <>
      <div style={collectionVars(collection.color)} className="bg-[var(--c-tint)] dark:bg-[var(--c-tint-d)]">
        <header className="flex items-center justify-between px-3.5 pt-3.5">
          <IconButton label="Back to home" onClick={onBack}>
            <ChevronLeft size={20} aria-hidden />
          </IconButton>
          <div className="flex items-center gap-1.5">
            <ExpandButton className="size-9! bg-bg/70" iconSize={16} />
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="h-9 cursor-pointer rounded-full bg-bg/70 px-3 text-[13px] font-semibold text-ink"
            >
              Rename
            </button>
            <button
              type="button"
              aria-expanded={panel === 'color'}
              onClick={() => setPanel(panel === 'color' ? null : 'color')}
              className="h-9 cursor-pointer rounded-full bg-bg/70 px-3 text-[13px] font-semibold text-ink"
            >
              Color
            </button>
            <IconButton
              label="Delete collection"
              className="size-9! bg-bg/70 text-danger"
              onClick={() => setPanel(panel === 'delete' ? null : 'delete')}
            >
              <Trash2 size={16} aria-hidden />
            </IconButton>
          </div>
        </header>
        <div className="border-b-[3px] border-[var(--c-accent)] px-[18px] pt-1 pb-4 text-[var(--c-text)] dark:border-[var(--c-accent-d)] dark:text-ink">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = new FormData(e.currentTarget).get('name');
                void renameCollection(collection.id, String(name ?? ''));
                setEditing(false);
              }}
            >
              <label className="sr-only" htmlFor="collection-name">
                Collection name
              </label>
              <input
                id="collection-name"
                name="name"
                defaultValue={collection.name}
                maxLength={MAX_COLLECTION_NAME}
                autoFocus
                onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                className="w-full rounded-lg border border-line-strong bg-bg px-2 py-1 font-display text-[24px] font-extrabold text-ink"
              />
            </form>
          ) : (
            <h1 className="font-display text-[26px] leading-tight font-extrabold">{collection.name}</h1>
          )}
          <p className="mt-0.5 text-[13px]">
            {clips.length} {clips.length === 1 ? 'clip' : 'clips'}
          </p>
          {order && order.indexOf(id) >= 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-[13px]">
              <span className="mr-1">
                Folder {order.indexOf(id) + 1} of {order.length}
              </span>
              {(['earlier', 'later'] as const).map((way) => {
                const target = order[order.indexOf(id) + (way === 'earlier' ? -1 : 1)];
                return (
                  <button
                    key={way}
                    type="button"
                    disabled={!target}
                    onClick={() => target && void moveCollection(id, target).then(() => notify(`Moved ${way}`))}
                    className="h-8 cursor-pointer rounded-full bg-bg/70 px-3 font-semibold text-ink disabled:cursor-default disabled:opacity-40"
                  >
                    Move {way}
                  </button>
                );
              })}
            </div>
          )}
          {panel === 'color' && (
            <div className="mt-3 rounded-2xl bg-bg p-3.5 text-ink">
              <ColorPicker value={collection.color} onChange={(color) => void recolorCollection(collection.id, color)} />
            </div>
          )}
          {panel === 'delete' && (
            <div className="mt-3 text-ink">
              <InlineConfirm
                message={`Delete “${collection.name}”? Its clips stay in your history.`}
                confirmLabel="Delete collection"
                onConfirm={() => void remove()}
                onCancel={() => setPanel(null)}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-[18px] pt-3 pb-1">
        <label className="flex items-center gap-2 text-[13px] text-text-2">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-8 rounded-lg border border-line-strong bg-bg px-2 text-[13px] text-ink"
          >
            <option value="newest">Newest</option>
            <option value="used">Most used</option>
            <option value="source">Source</option>
          </select>
        </label>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-[18px]">
        {sorted.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-3">Nothing here yet. Open a clip and choose this collection.</p>
        ) : (
          <>
            <ul aria-label={`Clips in ${collection.name}`}>
              {paged.shown.map((clip) => (
                <ClipRow key={clip.id} clip={clip} onOpen={onOpen} onCopy={onCopy} />
              ))}
            </ul>
            <ShowMore rest={paged.rest} pageSize={paged.pageSize} onMore={paged.more} />
          </>
        )}
        {collection.kind !== 'manual' && (
          <p className="py-5 text-[13px] leading-5 text-text-3">
            Sorted here automatically. Wrong folder? Drag a clip onto another collection on the home screen, or open it and pick
            one.
          </p>
        )}
      </main>
    </>
  );
}
