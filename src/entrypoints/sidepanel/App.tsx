import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardPaste, ImagePlus, MoreHorizontal } from 'lucide-react';
import type { Clip } from '@/lib/db';
import { deleteClip, listClips, markUsed, matchesQuery, restoreClip, saveClip } from '@/lib/clips';
import { copyClipToClipboard, fromDataTransfer, readClipboard, type ClipboardContents } from '@/lib/clipboard';
import { ImageError, saveImageClip } from '@/lib/images';
import { isPaused, PAUSE_MS, updateSettings } from '@/lib/settings';
import { useNowUntil, useSettings } from '@/lib/useSettings';
import { useTheme } from '@/lib/useTheme';
import { ClipRow } from '@/components/ClipRow';
import { Button, IconButton, SearchField } from '@/components/ui';
import { Notice } from '@/components/Notice';
import { Toast, type ToastState } from '@/components/Toast';
import { ClipDetail } from './ClipDetail';
import { SettingsView } from './SettingsView';

type View = { name: 'home' } | { name: 'detail'; id: string } | { name: 'settings' };

export function App() {
  useTheme();
  const settings = useSettings();
  const now = useNowUntil(settings?.pausedUntil ?? 0);
  const [view, setView] = useState<View>({ name: 'home' });
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [dragging, setDragging] = useState(false);
  const clips = useLiveQuery(() => listClips(), [], undefined);

  const notify = useCallback((message: string, onAction?: () => void, actionLabel?: string) => {
    setToast({ id: Date.now(), message, onAction, actionLabel });
  }, []);

  const copy = useCallback(
    async (clip: Clip) => {
      try {
        await copyClipToClipboard(clip);
        await markUsed(clip.id);
        notify(clip.kind === 'image' ? 'Image copied. Paste it anywhere.' : 'Copied. Paste it anywhere.');
      } catch {
        notify("Couldn't copy. Click the panel and try again.");
      }
    },
    [notify],
  );

  const remove = useCallback(
    async (id: string) => {
      const removed = await deleteClip(id);
      setView({ name: 'home' });
      if (removed) notify('Clip deleted', () => void restoreClip(removed));
    },
    [notify],
  );

  /** Saves whatever came in from a paste, drop or the clipboard. */
  const saveContents = useCallback(
    async (contents: ClipboardContents & { images?: File[] }) => {
      const images = contents.images?.length ? contents.images : contents.image ? [contents.image] : [];
      try {
        if (images.length) {
          for (const file of images) {
            await saveImageClip({ blob: file, fileName: file instanceof File ? file.name : undefined });
          }
          notify(images.length === 1 ? 'Image saved' : `${images.length} images saved`);
          return;
        }
        const clip = await saveClip({ text: contents.text, html: contents.html });
        notify(clip ? 'Saved' : 'Nothing to save');
      } catch (e) {
        notify(e instanceof ImageError ? e.message : "Couldn't save that.");
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
      notify('Chrome blocked reading the clipboard. Paste here with Ctrl+V instead.');
    }
  }, [notify, saveContents]);

  // Pasting anywhere in the panel (outside a text field) saves the clip.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target;
      if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) return;
      const contents = fromDataTransfer(e.clipboardData);
      if (!contents.text.trim() && contents.images.length === 0) return;
      e.preventDefault();
      void saveContents(contents);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [saveContents]);

  // Dropping images or text onto the panel saves them.
  useEffect(() => {
    let depth = 0;
    const hasPayload = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).some((t) => t === 'Files' || t.startsWith('text/'));
    const onEnter = (e: DragEvent) => {
      if (!hasPayload(e)) return;
      depth++;
      setDragging(true);
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasPayload(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const contents = fromDataTransfer(e.dataTransfer);
      if (contents.text.trim() || contents.images.length) void saveContents(contents);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [saveContents]);

  const visible = useMemo(() => (clips ?? []).filter((c) => matchesQuery(c, query)), [clips, query]);
  const paused = settings ? isPaused(settings, now) : false;

  const shell = (children: React.ReactNode) => (
    <div className="relative flex h-screen flex-col overflow-hidden bg-bg text-ink">
      {children}
      {dragging && <DropOverlay />}
      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  );

  if (view.name === 'detail') {
    return shell(<ClipDetail id={view.id} onBack={() => setView({ name: 'home' })} onCopy={copy} onDelete={remove} />);
  }

  if (view.name === 'settings') {
    return shell(<SettingsView onBack={() => setView({ name: 'home' })} notify={notify} />);
  }

  return shell(
    <>
      <header className="flex items-center justify-between px-[18px] pt-5 pb-3">
        <h1 className="font-display text-[26px] leading-tight font-extrabold">Your clips</h1>
        <IconButton label="Settings" className="bg-surface" onClick={() => setView({ name: 'settings' })}>
          <MoreHorizontal size={20} aria-hidden />
        </IconButton>
      </header>

      <div className="px-[18px] pb-3">
        <SearchField
          label="Search your clips"
          placeholder="Search your clips"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {paused && settings && (
        <div className="px-[18px] pb-3">
          <Notice
            tone="warning"
            title="Auto-save is paused"
            body={`Nothing you copy is being saved. Resumes at ${new Date(settings.pausedUntil).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.`}
            action={{ label: 'Resume now', onClick: () => void updateSettings({ pausedUntil: 0 }) }}
          />
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto px-[18px]">
        {clips === undefined ? null : clips.length === 0 ? (
          <EmptyState onGrab={saveFromClipboard} />
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-3">No clips match “{query}”.</p>
        ) : (
          <ul aria-label="Clips">
            {visible.map((clip) => (
              <ClipRow key={clip.id} clip={clip} onOpen={(c) => setView({ name: 'detail', id: c.id })} onCopy={copy} />
            ))}
          </ul>
        )}
      </main>

      <footer className="flex items-center justify-between gap-3 border-t border-line px-[18px] pt-2.5 pb-4">
        <span className="text-[13px] text-text-2">Private: stored on this device</span>
        {settings?.autoSave && !paused ? (
          <Button variant="outline" size="sm" onClick={() => void updateSettings({ pausedUntil: Date.now() + PAUSE_MS })}>
            Pause
          </Button>
        ) : (
          <Button size="sm" onClick={saveFromClipboard}>
            <ClipboardPaste size={16} aria-hidden />
            Grab clipboard
          </Button>
        )}
      </footer>
    </>,
  );
}

function DropOverlay() {
  return (
    <div className="pointer-events-none absolute inset-3.5 z-30 flex flex-col items-center justify-center gap-3 rounded-[22px] border-[3px] border-dashed border-link bg-ai-bg/95 p-6 text-center text-ai-fg">
      <ImagePlus size={36} aria-hidden />
      <p className="font-display text-2xl font-extrabold">Drop to save</p>
      <p className="text-sm">Images (PNG, JPG, GIF, WebP up to 20 MB) or text</p>
    </div>
  );
}

function EmptyState({ onGrab }: { onGrab: () => void }) {
  return (
    <section className="mt-2 rounded-[18px] bg-surface p-5" aria-labelledby="empty-title">
      <h2 id="empty-title" className="font-display text-[22px] font-extrabold">
        Save something to start
      </h2>
      <ol className="mt-3.5 flex flex-col gap-3 text-sm leading-5">
        <Step n={1}>
          Select text on any page and press <kbd className="bg-bg">Alt+Shift+S</kbd>, or right-click and choose{' '}
          <b>Save selection</b>
        </Step>
        <Step n={2}>
          Right-click an image and choose <b>Save image</b>, or drop it here
        </Step>
        <Step n={3}>Click a clip's Copy button to use it again</Step>
      </ol>
      <Button className="mt-4 bg-bg" onClick={onGrab}>
        Grab what's on my clipboard
      </Button>
    </section>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-bg text-[13px] font-bold">{n}</span>
      <span>{children}</span>
    </li>
  );
}
