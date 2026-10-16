import { Plus } from 'lucide-react';
import { moveClip, type CollectionSummary } from '@/lib/collections';
import { CollectionTile } from '@/components/CollectionTile';
import { NewCollectionForm } from '@/components/NewCollectionForm';
import { useFolderReorder } from './useFolderReorder';

export function CollectionsSection({
  summaries,
  creating,
  setCreating,
  onOpen,
  notify,
}: {
  summaries: CollectionSummary[];
  creating: boolean;
  setCreating: (creating: boolean) => void;
  onOpen: (id: string) => void;
  notify: (message: string) => void;
}) {
  const { shown, gridRef, grid, tile } = useFolderReorder(summaries, notify);

  return (
    <section aria-labelledby="collections-title" className="pb-4">
      <div className="flex items-center justify-between pb-2">
        <h2 id="collections-title" className="font-display text-[17px] font-semibold">
          Collections
        </h2>
        <button
          type="button"
          aria-expanded={creating}
          aria-label="New collection"
          onClick={() => setCreating(!creating)}
          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-text-2 hover:bg-surface"
        >
          <Plus size={14} aria-hidden />
          New
        </button>
      </div>
      {creating && (
        <div className="pb-2.5">
          <NewCollectionForm
            onCancel={() => setCreating(false)}
            onCreated={(c) => {
              setCreating(false);
              notify(`Created ${c.name}`);
            }}
          />
        </div>
      )}
      <ul ref={gridRef} className="relative grid grid-cols-2 gap-2.5" aria-label="Collections" {...grid}>
        {(shown ?? summaries).map((s) => (
          <CollectionTile
            key={s.collection.id}
            summary={s}
            onOpen={() => onOpen(s.collection.id)}
            onDropClip={(clipId) => {
              void moveClip(clipId, s.collection.id).then(() => notify(`Moved to ${s.collection.name}`));
            }}
            reorder={tile(s.collection.id)}
          />
        ))}
      </ul>
    </section>
  );
}
