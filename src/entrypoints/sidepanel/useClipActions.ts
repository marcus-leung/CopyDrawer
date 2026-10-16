import { useCallback } from 'react';
import type { Clip } from '@/lib/db';
import { deleteClip, markUsed, restoreClip, saveClip } from '@/lib/clips';
import { storageProblem } from '@/lib/storageGuard';
import { copyClipToClipboard, readClipboard, type ClipboardContents } from '@/lib/clipboard';
import { saveImages } from '@/lib/images';
import { modKey } from '@/lib/format';
import type { View } from '@/lib/openView';

export function useClipActions({
  notify,
  setView,
}: {
  notify: (message: string, onUndo?: () => void) => void;
  setView: React.Dispatch<React.SetStateAction<View>>;
}) {
  const copy = useCallback(
    async (clip: Clip) => {
      try {
        await copyClipToClipboard(clip);
        void markUsed(clip.id).catch(() => {});
        notify(clip.kind === 'image' ? 'Image copied. Paste it anywhere.' : 'Copied. Paste it anywhere.');
      } catch {
        notify("Couldn't copy. Click the panel and try again.");
      }
    },
    [notify],
  );

  const remove = useCallback(
    async (id: string) => {
      let removed;
      try {
        removed = await deleteClip(id);
      } catch (e) {
        notify(storageProblem(e, 'deleted')?.title ?? "Couldn't delete that. Try again.");
        return;
      }
      setView((v) => (v.name === 'detail' && v.from ? v.from : { name: 'home' }));
      if (removed) notify('Clip deleted', () => void restoreClip(removed));
    },
    [notify, setView],
  );

  const saveContents = useCallback(
    async (contents: ClipboardContents & { images?: File[] }) => {
      const images = contents.images?.length ? contents.images : contents.image ? [contents.image] : [];
      if (images.length) {
        const { saved, error } = await saveImages(images);
        notify(error ?? (saved === 1 ? 'Image saved' : `${saved} images saved`));
        return;
      }
      try {
        const clip = await saveClip({ text: contents.text, html: contents.html });
        notify(clip ? 'Saved' : 'Nothing to save');
      } catch (e) {
        notify(storageProblem(e)?.title ?? "Couldn't save that.");
      }
    },
    [notify],
  );

  const saveFromClipboard = useCallback(async () => {
    try {
      const contents = await readClipboard();
      if (!contents.text.trim() && !contents.image) {
        notify('Your clipboard is empty');
        return;
      }
      await saveContents(contents);
    } catch {
      notify(`Chrome blocked reading the clipboard. Paste here with ${modKey('V')} instead.`);
    }
  }, [notify, saveContents]);

  return { copy, remove, saveContents, saveFromClipboard };
}
