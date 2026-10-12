import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardPaste, ImagePlus, MoreHorizontal, Plus, SlidersHorizontal } from 'lucide-react';
import type { Clip } from '@/lib/db';
import { deleteClip, deleteClips, listClips, markUsed, restoreClip, restoreClips, saveClip } from '@/lib/clips';
import { NO_FILTERS, topSites, type SearchFilters } from '@/lib/search';
import { copyClipToClipboard, readClipboard, type ClipboardContents } from '@/lib/clipboard';
import { saveImages } from '@/lib/images';
import { isPaused, PAUSE_MS, updateSettings } from '@/lib/settings';
import { useNowUntil, useSettings } from '@/lib/useSettings';
import { useAppearance } from '@/lib/useAppearance';
import { useSearch } from '@/lib/useSearch';
import { cancelViewRequest, requestView, useOpenViewRequests, type OpenViewRequest, type View } from '@/lib/openView';
import { modKey } from '@/lib/format';
import { listCollections, moveClip, moveClips, moveCollection } from '@/lib/collections';
import { COLLECTION_DRAG_TYPE, CollectionTile } from '@/components/CollectionTile';
import { useFlip } from '@/lib/useFlip';
import { NewCollectionForm } from '@/components/NewCollectionForm';
import { AddClipForm } from '@/components/AddClipForm';
import { ImageStrip } from '@/components/ImageStrip';
import { ClipRow, type RowPick } from '@/components/ClipRow';
import { SelectionBar } from '@/components/SelectionBar';
import { copyClips } from '@/lib/multiCopy';
import { useSelection } from '@/lib/useSelection';
import { Button, IconButton, SearchField } from '@/components/ui';
import { Notice } from '@/components/Notice';
import { ExpandButton, ExpandContext } from '@/components/ExpandButton';
import { Toast, type ToastState } from '@/components/Toast';
import { ClipDetail } from './ClipDetail';
import { SettingsView } from './SettingsView';
import { CollectionView } from './CollectionView';
import { FilterBar } from './FilterBar';
import { Onboarding } from './Onboarding';
import { EmptyState } from './EmptyState';
import { usePanelInput } from './usePanelInput';
import { HomeNotice } from './HomeNotice';
import { usePaged } from '@/lib/usePaged';
import { ShowMore } from '@/components/ShowMore';
import { keyLabel, useShortcuts } from '@/lib/useShortcuts';

/** The same app runs in the side panel and in the toolbar popup. */
export function App({ surface = 'panel' }: { surface?: 'panel' | 'popup' }) {
  useAppearance();
  const settings = useSettings();
  const now = useNowUntil(settings?.pausedUntil ?? 0);
  const [view, setView] = useState<View>(() => {
    // "Open" from the in-page card when no panel could open: a tab with ?clip=<id>.
    const clip = new URLSearchParams(location.search).get('clip');
    return clip ? { name: 'detail', id: clip } : { name: 'home' };
  });
  const [onboarding, setOnboarding] = useState(() => new URLSearchParams(location.search).has('onboarding'));

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  useOpenViewRequests(
    useCallback((req: OpenViewRequest) => {
      setView(req.view);
      if (req.query !== undefined) setQuery(req.query);
      if (req.filters !== undefined) setFilters(req.filters);
      setFiltersOpen(false);
    }, []),
    surface === 'panel',
  );
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const clips = useLiveQuery(() => listClips(), [], undefined);
  const summaries = useLiveQuery(() => listCollections(), [], undefined);
  // Every collection a clip is in has clips, so the (non-empty) summaries cover them all.
  const collectionsById = useMemo(() => new Map(summaries?.map((s) => [s.collection.id, s.collection])), [summaries]);

  const keys = useShortcuts();
  const notify = useCallback((message: string, onUndo?: () => void) => setToast({ id: Date.now(), message, onUndo }), []);

  // Looked up ahead of time: Chrome only opens the side panel straight from a click.
  const [windowId, setWindowId] = useState<number>();
  useEffect(() => {
    if (surface === 'popup') void browser.windows.getCurrent().then((w) => setWindowId(w.id));
  }, [surface]);

  const expand = useCallback(() => {
    if (windowId == null) return;
    void requestView({ view, query, filters, windowId });
    void browser.sidePanel
      .open({ windowId })
      .then(() => window.close())
      .catch(() => {
        void cancelViewRequest();
        notify("Couldn't open the panel. Try again.");
      });
  }, [windowId, view, query, filters, notify]);

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

  // Reordering folders: while dragging, the grid shows where the folder would land.
  const [folderDrag, setFolderDrag] = useState<{ id: string; order: string[]; dropped?: boolean } | null>(null);
  const savedOrder = useMemo(() => summaries?.map((s) => s.collection.id) ?? [], [summaries]);
  // After a drop, the dropped order stays on screen until the saved order catches up, so tiles don't flick back.
  const preview = folderDrag && !(folderDrag.dropped && folderDrag.order.join() === savedOrder.join()) ? folderDrag : null;
  const shownSummaries = useMemo(() => {
    if (!preview || !summaries) return summaries;
    const byId = new Map(summaries.map((s) => [s.collection.id, s]));
    return preview.order.flatMap((id) => byId.get(id) ?? []);
  }, [preview, summaries]);
  const folderGrid = useRef<HTMLUListElement>(null);
  const captureFolders = useFlip(folderGrid, (shownSummaries ?? []).map((s) => s.collection.id).join());
  /**
   * The slot under the pointer, from the tiles' layout boxes (offset*), which ignore the slide animations:
   * a tile sliding under the pointer must not count, or the order flips back and forth.
   */
  const hoverFolders = (e: React.DragEvent<HTMLUListElement>) => {
    const d = folderDrag;
    if (!d || d.dropped) return;
    const grid = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - grid.left;
    const y = e.clientY - grid.top;
    const slot = [...e.currentTarget.children].findIndex((li) => {
      const el = li as HTMLElement;
      return x >= el.offsetLeft && x < el.offsetLeft + el.offsetWidth && y >= el.offsetTop && y < el.offsetTop + el.offsetHeight;
    });
    if (slot < 0 || d.order[slot] === d.id) return;
    const order = d.order.filter((id) => id !== d.id);
    order.splice(slot, 0, d.id);
    captureFolders();
    setFolderDrag({ ...d, order });
  };
  const dropFolder = () => {
    if (!folderDrag || folderDrag.dropped) return;
    const target = savedOrder[folderDrag.order.indexOf(folderDrag.id)];
    setFolderDrag({ ...folderDrag, dropped: true });
    void moveCollection(folderDrag.id, target ?? folderDrag.id).finally(() =>
      setTimeout(() => setFolderDrag((d) => (d?.dropped ? null : d)), 1000),
    );
  };

  const clipsById = useMemo(() => new Map(clips?.map((c) => [c.id, c])), [clips]);
  const exists = useCallback((id: string) => clipsById.has(id), [clipsById]);
  const selection = useSelection(exists);
  const { clear: clearPicks } = selection;
  useEffect(() => clearPicks(), [view, clearPicks]);
  const pickedClips = selection.ids.map((id) => clipsById.get(id)!);
  const pickFor = useCallback(
    (clip: Clip, list: string[]): RowPick => ({
      number: selection.numberOf(clip.id),
      selecting: selection.selecting,
      onPick: (e) => (e.shiftKey ? selection.range(clip.id, list) : selection.toggle(clip.id)),
    }),
    [selection],
  );

  const copyPicked = async (plain: boolean) => {
    const n = pickedClips.length;
    try {
      const result = await copyClips(pickedClips, settings?.joinWith ?? 'line', { plain });
      if (!result.ok) {
        notify(
          result.reason === 'too-big'
            ? 'Too big to copy together (20 MB max). Pick fewer images.'
            : 'Nothing to copy as plain text.',
        );
        return;
      }
      await Promise.all(pickedClips.map((c) => markUsed(c.id)));
      const what = n === 1 ? 'Copied' : `Copied ${n} clips`;
      if (plain) notify(result.skippedImages ? `${what} as plain text. Images left out.` : `${what} as plain text.`);
      else notify(result.skippedImages ? `${what}. Images paste where pictures are allowed.` : `${what}. Paste anywhere.`);
    } catch {
      notify("Couldn't copy. Click the panel and try again.");
    }
  };

  const movePicked = async (collectionId: string | undefined) => {
    const n = pickedClips.length;
    await moveClips(selection.ids, collectionId);
    const name = collectionId ? summaries?.find((s) => s.collection.id === collectionId)?.collection.name : undefined;
    notify(`${n === 1 ? 'Moved 1 clip' : `Moved ${n} clips`} ${name ? `to ${name}` : 'out of their collections'}`);
    selection.clear();
  };

  const deletePicked = async () => {
    const removed = await deleteClips(selection.ids);
    selection.clear();
    notify(removed.length === 1 ? 'Clip deleted' : `${removed.length} clips deleted`, () => void restoreClips(removed));
  };

  /** Saves whatever came in from a paste, drop or the clipboard. */
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
      } catch {
        notify("Couldn't save that.");
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

  const dragging = usePanelInput(useCallback((c) => void saveContents(c), [saveContents]));

  const { searching, filtering, results: current } = useSearch(query, filters, clips);
  // Stays open while you change filters, even back to "Any".
  const showFilters = filtersOpen || filtering || query.trim() !== '';
  const visible = searching ? (current ?? []) : (clips ?? []);
  const paged = usePaged(visible, `${query}\n${JSON.stringify(filters)}`);
  const sites = useMemo(() => topSites(clips ?? []), [clips]);
  const paused = settings ? isPaused(settings, now) : false;
  const sortedToday = useMemo(() => {
    const midnight = new Date(now).setHours(0, 0, 0, 0);
    return (clips ?? []).filter((c) => c.collectionId && c.createdAt >= midnight).length;
  }, [clips, now]);

  const listIds =
    view.name === 'home'
      ? visible.map((c) => c.id)
      : view.name === 'collection'
        ? (clips ?? []).filter((c) => c.collectionId === view.id).map((c) => c.id)
        : null;
  const { all: pickAll } = selection;
  const picking = listIds !== null && selection.selecting;
  useEffect(() => {
    if (!listIds) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
      if (e.key === 'Escape' && picking) {
        e.preventDefault();
        clearPicks();
      } else if (e.key.toLowerCase() === 'a' && (e.metaKey || e.ctrlKey) && !typing && listIds.length) {
        e.preventDefault();
        pickAll(listIds);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listIds, picking, clearPicks, pickAll]);

  const shell = (children: React.ReactNode) => (
    <ExpandContext value={surface === 'popup' ? expand : null}>
      <div className="relative flex h-full flex-col overflow-hidden bg-bg text-ink">
        {children}
        {dragging && <DropOverlay />}
        {picking ? (
          <div className="relative">
            <Toast toast={toast} onDone={() => setToast(null)} above />
            <SelectionBar
              count={pickedClips.length}
              hasText={pickedClips.some((c) => c.kind !== 'image')}
              joinWith={settings?.joinWith ?? 'line'}
              onJoinWith={(joinWith) => void updateSettings({ joinWith })}
              onCopy={(plain) => void copyPicked(plain)}
              onMove={(id) => void movePicked(id)}
              onDelete={() => void deletePicked()}
              onClear={clearPicks}
            />
          </div>
        ) : (
          <Toast toast={toast} onDone={() => setToast(null)} />
        )}
      </div>
    </ExpandContext>
  );

  if (onboarding) {
    return (
      <Onboarding
        onDone={() => {
          history.replaceState(null, '', location.pathname);
          setOnboarding(false);
        }}
      />
    );
  }

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
        pickFor={pickFor}
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
        <div className="flex gap-2">
          <ExpandButton className="bg-surface" />
          <IconButton label="Add a clip" aria-expanded={adding} className="bg-surface" onClick={() => setAdding(!adding)}>
            <Plus size={20} aria-hidden />
          </IconButton>
          <IconButton label="Settings" className="bg-surface" onClick={() => setView({ name: 'settings' })}>
            <MoreHorizontal size={20} aria-hidden />
          </IconButton>
        </div>
      </header>

      {adding && (
        <div className="px-[18px] pb-3">
          <AddClipForm
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              notify('Saved');
            }}
          />
        </div>
      )}

      <div className="px-[18px] pb-3">
        <div className="flex items-center gap-2">
          <SearchField
            className="min-w-0 flex-1"
            label="Search your clips"
            placeholder="Search your clips"
            // Chrome focuses the popup's first button otherwise, showing a focus ring nobody asked for.
            autoFocus={surface === 'popup'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {clips && clips.length > 0 && (
            <IconButton
              label="Filters"
              aria-expanded={showFilters}
              className={showFilters ? 'bg-ink! text-on-ink!' : 'bg-surface'}
              onClick={() => {
                if (showFilters) setFilters(NO_FILTERS);
                setFiltersOpen(!showFilters);
              }}
            >
              <SlidersHorizontal size={18} aria-hidden />
            </IconButton>
          )}
        </div>
        {showFilters && clips && clips.length > 0 && (
          <div className="mt-3 border-b border-line pb-3">
            <FilterBar filters={filters} sites={sites} onChange={setFilters} />
          </div>
        )}
      </div>

      {settings && clips && (
        <HomeNotice
          settings={settings}
          now={now}
          count={clips.length}
          onCleanUp={() => setView({ name: 'settings' })}
          notify={notify}
        />
      )}

      <main className="min-h-0 flex-1 overflow-y-auto px-[18px]">
        {clips === undefined ? null : clips.length === 0 ? (
          <EmptyState onGrab={saveFromClipboard} autoSave={!!settings?.autoSave} />
        ) : searching && current === null ? null : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-3">
            {query.trim() ? `No clips match “${query.trim()}”.` : 'No clips match these filters.'}
          </p>
        ) : (
          <>
            {!searching && summaries && (
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
                <ul
                  ref={folderGrid}
                  className="relative grid grid-cols-2 gap-2.5"
                  aria-label="Collections"
                  onDragOver={(e) => {
                    if (!folderDrag || !e.dataTransfer.types.includes(COLLECTION_DRAG_TYPE)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    hoverFolders(e);
                  }}
                  onDrop={(e) => {
                    if (!folderDrag || !e.dataTransfer.types.includes(COLLECTION_DRAG_TYPE)) return;
                    e.preventDefault();
                    dropFolder();
                  }}
                >
                  {(shownSummaries ?? summaries).map((s) => (
                    <CollectionTile
                      key={s.collection.id}
                      summary={s}
                      onOpen={() => setView({ name: 'collection', id: s.collection.id })}
                      onDropClip={(clipId) => {
                        void moveClip(clipId, s.collection.id).then(() => notify(`Moved to ${s.collection.name}`));
                      }}
                      reorder={{
                        dragging: !!preview && !preview.dropped && preview.id === s.collection.id,
                        onStart: () => setFolderDrag({ id: s.collection.id, order: savedOrder }),
                        onEnd: () => setFolderDrag((d) => (d?.dropped ? d : null)),
                      }}
                    />
                  ))}
                </ul>
              </section>
            )}
            {!searching && (
              <ImageStrip
                clips={clips}
                onOpen={(c) => setView({ name: 'detail', id: c.id })}
                pickFor={pickFor}
                onSeeAll={() => {
                  setFilters({ ...NO_FILTERS, kind: 'image' });
                  setFiltersOpen(true);
                }}
              />
            )}
            {!searching && settings && !settings.dismissedTips.includes('quick-paste') && clips.length <= 3 && (
              <div className="pb-4">
                <Notice
                  tone="info"
                  title="Try pasting it back"
                  body={`Click into any text box and press ${keyLabel(keys, 'quick-paste')} to pick from your clips.`}
                  action={{
                    label: 'Got it',
                    onClick: () => void updateSettings({ dismissedTips: [...settings.dismissedTips, 'quick-paste'] }),
                  }}
                />
              </div>
            )}
            {!searching && summaries && summaries.length > 0 && (
              <h2 className="font-display text-[17px] font-semibold">Recent</h2>
            )}
            {searching && (
              <p className="pb-1 text-[13px] text-text-2" aria-live="polite">
                {visible.length} {visible.length === 1 ? 'clip matches' : 'clips match'}
              </p>
            )}
            <ul aria-label="Clips">
              {paged.shown.map((clip) => (
                <ClipRow
                  key={clip.id}
                  clip={clip}
                  collection={clip.collectionId ? collectionsById.get(clip.collectionId) : undefined}
                  onOpen={(c) => setView({ name: 'detail', id: c.id })}
                  onCopy={copy}
                  pick={pickFor(
                    clip,
                    visible.map((c) => c.id),
                  )}
                />
              ))}
            </ul>
            <ShowMore rest={paged.rest} pageSize={paged.pageSize} onMore={paged.more} />
          </>
        )}
      </main>

      <footer
        className={`${picking ? 'hidden' : 'flex'} items-center justify-between gap-3 border-t border-line px-[18px] pt-2.5 pb-4`}
      >
        <span className="text-[13px] text-text-2">Private: stored and sorted on this device</span>
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
    <div className="pointer-events-none absolute inset-3.5 z-30 flex flex-col items-center justify-center gap-3 rounded-[22px] border-[3px] border-dashed border-link bg-info-bg/95 p-6 text-center text-info-fg">
      <ImagePlus size={36} aria-hidden />
      <p className="font-display text-2xl font-extrabold">Drop to save</p>
      <p className="text-sm">Images (PNG, JPG, GIF, WebP up to 20 MB) or text</p>
    </div>
  );
}
