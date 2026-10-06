import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardPaste, ImagePlus, MoreHorizontal, Plus } from 'lucide-react';
import { db, type Clip, type Collection } from '@/lib/db';
import { deleteClip, listClips, markUsed, restoreClip, saveClip } from '@/lib/clips';
import { NO_FILTERS, searchClips, topSites, type SearchFilters, type SearchResult } from '@/lib/search';
import { copyClipToClipboard, fromDataTransfer, readClipboard, type ClipboardContents } from '@/lib/clipboard';
import { ImageError, saveImageClip } from '@/lib/images';
import { isPaused, PAUSE_MS, updateSettings } from '@/lib/settings';
import { useNowUntil, useSettings } from '@/lib/useSettings';
import { useTheme } from '@/lib/useTheme';
import { activeEmbedder, useIndexer } from '@/lib/useIndexer';
import { createCollection, listCollections } from '@/lib/collections';
import { CollectionTile } from '@/components/CollectionTile';
import { ClipRow } from '@/components/ClipRow';
import { Button, IconButton, SearchField } from '@/components/ui';
import { Notice } from '@/components/Notice';
import { Toast, type ToastState } from '@/components/Toast';
import { ClipDetail } from './ClipDetail';
import { SettingsView } from './SettingsView';
import { CollectionView } from './CollectionView';
import { FilterBar } from './FilterBar';

type View =
  | { name: 'home' }
  | { name: 'detail'; id: string; from?: View }
  | { name: 'settings' }
  | { name: 'collection'; id: string };

export function App() {
  useTheme();
  const settings = useSettings();
  const now = useNowUntil(settings?.pausedUntil ?? 0);
  const [view, setView] = useState<View>({ name: 'home' });
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>(NO_FILTERS);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [dragging, setDragging] = useState(false);
  const clips = useLiveQuery(() => listClips(), [], undefined);
  const summaries = useLiveQuery(() => listCollections(), [], undefined);
  const collectionsById = useLiveQuery(
    async () => new Map((await db.collections.toArray()).map((c) => [c.id, c] as const)),
    [],
    new Map<string, Collection>(),
  );
  const modelState = useIndexer(settings?.smartModel);

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
      setView((v) => (v.name === 'detail' && v.from ? v.from : { name: 'home' }));
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

  const filtering = filters.kind !== 'any' || filters.site !== 'any' || filters.date !== 'any';
  const searching = query.trim() !== '' || filtering;
  useEffect(() => {
    if (!searching || !clips) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void searchClips(query, clips, filters, activeEmbedder())
        .then((r) => !cancelled && setResults(r))
        .catch(() => {});
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searching, query, filters, clips]);
  const visible = useMemo(() => (searching ? (results ?? []).map((r) => r.clip) : (clips ?? [])), [searching, results, clips]);
  const meaningCount = results?.filter((r) => r.match === 'meaning').length ?? 0;
  const sites = useMemo(() => topSites(clips ?? []), [clips]);
  const paused = settings ? isPaused(settings, now) : false;
  const sortedToday = useMemo(() => {
    const midnight = new Date().setHours(0, 0, 0, 0);
    return (clips ?? []).filter((c) => c.collectionId && c.createdAt >= midnight).length;
  }, [clips]);

  async function newCollection() {
    const name = prompt('Name the new collection');
    if (!name?.trim()) return;
    const created = await createCollection(name);
    setView({ name: 'collection', id: created.id });
  }

  const shell = (children: React.ReactNode) => (
    <div className="relative flex h-screen flex-col overflow-hidden bg-bg text-ink">
      {children}
      {dragging && <DropOverlay />}
      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  );

  if (view.name === 'detail') {
    const back = view.from ?? { name: 'home' as const };
    return shell(<ClipDetail id={view.id} onBack={() => setView(back)} onCopy={copy} onDelete={remove} notify={notify} />);
  }

  if (view.name === 'collection') {
    const here = view;
    return shell(
      <CollectionView
        id={view.id}
        onBack={() => setView({ name: 'home' })}
        onOpen={(c) => setView({ name: 'detail', id: c.id, from: here })}
        onCopy={copy}
        notify={notify}
      />,
    );
  }

  if (view.name === 'settings') {
    return shell(<SettingsView onBack={() => setView({ name: 'home' })} notify={notify} />);
  }

  return shell(
    <>
      <header className="flex items-start justify-between px-[18px] pt-5 pb-3">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] leading-tight font-extrabold">Your clips</h1>
          {sortedToday > 0 && (
            <p className="mt-0.5 text-[13px] text-text-2">
              Sorted {sortedToday} new {sortedToday === 1 ? 'clip' : 'clips'} today
            </p>
          )}
        </div>
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
        {(searching || query) && clips && clips.length > 0 && (
          <div className="pt-2.5">
            <FilterBar filters={filters} sites={sites} onChange={setFilters} />
          </div>
        )}
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
        ) : searching && results === null ? null : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-3">
            {query.trim() ? `No clips match “${query.trim()}”.` : 'No clips match these filters.'}
          </p>
        ) : (
          <>
            {!searching && summaries && summaries.length > 0 && (
              <section aria-labelledby="collections-title" className="pb-4">
                <div className="flex items-center justify-between pb-2">
                  <h2 id="collections-title" className="font-display text-[17px] font-semibold">
                    Smart collections
                  </h2>
                  <button
                    type="button"
                    onClick={() => void newCollection()}
                    className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-text-2 hover:bg-surface"
                  >
                    <Plus size={14} aria-hidden />
                    New
                  </button>
                </div>
                <ul className="grid grid-cols-2 gap-2.5" aria-label="Collections">
                  {summaries.map((s) => (
                    <CollectionTile
                      key={s.collection.id}
                      summary={s}
                      onOpen={() => setView({ name: 'collection', id: s.collection.id })}
                    />
                  ))}
                </ul>
              </section>
            )}
            {!searching && summaries && summaries.length > 0 && (
              <h2 className="font-display text-[17px] font-semibold">Recent</h2>
            )}
            {searching && (
              <p className="pb-1 text-[13px] text-text-2" aria-live="polite">
                {visible.length} {visible.length === 1 ? 'clip matches' : 'clips match'}
                {meaningCount > 0 && `, ${meaningCount} by meaning`}
              </p>
            )}
            <ul aria-label="Clips">
              {visible.map((clip) => (
                <ClipRow
                  key={clip.id}
                  clip={clip}
                  collection={clip.collectionId ? collectionsById.get(clip.collectionId) : undefined}
                  onOpen={(c) => setView({ name: 'detail', id: c.id })}
                  onCopy={copy}
                />
              ))}
            </ul>
          </>
        )}
      </main>

      <footer className="flex items-center justify-between gap-3 border-t border-line px-[18px] pt-2.5 pb-4">
        <span className="text-[13px] text-text-2">
          {modelState.status === 'loading'
            ? `Getting the AI ready${modelState.progress ? ` (${Math.round(modelState.progress)}%)` : ''}…`
            : 'Private: stored and sorted on this device'}
        </span>
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
