import type { Clip } from '@/lib/db';
import { deleteClips, markUsed, restoreClips } from '@/lib/clips';
import { moveClips, type CollectionSummary } from '@/lib/collections';
import { storageProblem } from '@/lib/storageGuard';
import type { JoinWith } from '@/lib/join';
import { copyClips } from '@/lib/multiCopy';
import type { Selection } from '@/lib/useSelection';

const clipsWord = (n: number) => (n === 1 ? '1 clip' : `${n} clips`);

/** What the selection bar does with the picked clips, and what it tells the user. */
export function usePickActions({
  selection,
  picked,
  joinWith,
  summaries,
  notify,
}: {
  selection: Selection;
  picked: Clip[];
  joinWith: JoinWith;
  summaries: CollectionSummary[] | undefined;
  notify: (message: string, onUndo?: () => void) => void;
}) {
  const copy = async (plain: boolean) => {
    const n = picked.length;
    let result;
    try {
      result = await copyClips(picked, joinWith, { plain });
    } catch {
      notify("Couldn't copy. Click the panel and try again.");
      return;
    }
    if (!result.ok) {
      notify(
        result.reason === 'too-big'
          ? 'Too big to copy together (20 MB max). Pick fewer images.'
          : 'Nothing to copy as plain text.',
      );
      return;
    }
    for (const c of picked) void markUsed(c.id).catch(() => {});
    const what = n === 1 ? 'Copied' : `Copied ${n} clips`;
    if (plain) notify(result.skippedImages ? `${what} as plain text. Images left out.` : `${what} as plain text.`);
    else notify(result.skippedImages ? `${what}. Images paste where pictures are allowed.` : `${what}. Paste anywhere.`);
  };

  const move = async (collectionId: string | undefined) => {
    const n = selection.ids.length;
    try {
      await moveClips(selection.ids, collectionId);
    } catch (e) {
      notify(storageProblem(e, 'moved')?.title ?? `Couldn't move ${clipsWord(n)}. Try again.`);
      return;
    }
    const name = collectionId ? summaries?.find((s) => s.collection.id === collectionId)?.collection.name : undefined;
    notify(`Moved ${clipsWord(n)} ${name ? `to ${name}` : 'out of their collections'}`);
    selection.clear();
  };

  const remove = async () => {
    let removed;
    try {
      removed = await deleteClips(selection.ids);
    } catch (e) {
      notify(storageProblem(e, 'deleted')?.title ?? `Couldn't delete ${clipsWord(selection.ids.length)}. Try again.`);
      return;
    }
    selection.clear();
    notify(removed.length === 1 ? 'Clip deleted' : `${removed.length} clips deleted`, () => void restoreClips(removed));
  };

  return { copy, move, remove };
}
