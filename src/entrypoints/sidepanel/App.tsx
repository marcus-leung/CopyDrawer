import { useCallback, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardPaste, ImagePlus, MoreHorizontal, Plus, SlidersHorizontal } from 'lucide-react';
import type { Clip } from '@/lib/db';
import { deleteClip, listClips, markUsed, restoreClip, saveClip } from '@/lib/clips';
import { NO_FILTERS, topSites, type SearchFilters } from '@/lib/search';
import { copyClipToClipboard, readClipboard, type ClipboardContents } from '@/lib/clipboard';
import { ImageError, saveImageClip } from '@/lib/images';
import { isPaused, PAUSE_MS, updateSettings } from '@/lib/settings';
import { useNowUntil, useSettings } from '@/lib/useSettings';
import { useTheme } from '@/lib/useTheme';
import { useIndexer } from '@/lib/useIndexer';
import { useSearch } from '@/lib/useSearch';
import { useOpenClipRequests } from '@/lib/openClip';
import { listCollections, moveClip, promptNewCollection } from '@/lib/collections';
import { CollectionTile } from '@/components/CollectionTile';
import { ImageStrip } from '@/components/ImageStrip';
import { ClipRow } from '@/components/ClipRow';
import { Button, IconButton, SearchField } from '@/components/ui';
import { Notice } from '@/components/Notice';
import { Toast, type ToastState } from '@/components/Toast';
import { ClipDetail } from './ClipDetail';
import { SettingsView } from './SettingsView';
import { CollectionView } from './CollectionView';
import { FilterBar } from './FilterBar';
import { Onboarding } from './Onboarding';
import { EmptyState } from './EmptyState';
import { usePanelInput } from './usePanelInput';
import { HomeNotice } from './HomeNotice';
import { ProWaitlist } from './ProWaitlist';

type View =
  | { name: 'home' }
  | { name: 'detail'; id: string; from?: View }
  | { name: 'settings' }
  | { name: 'collection'; id: string }
  | { name: 'pro'; from?: View };

export function App() {
  useTheme();
  const settings = useSettings();
  const now = useNowUntil(settings?.pausedUntil ?? 0);
  const [view, setView] = useState<View>(() => {
    // "Open" from the in-page card when no panel could open: a tab with ?clip=<id>.
    const clip = new URLSearchParams(location.search).get('clip');
    return clip ? { name: 'detail', id: clip } : { name: 'home' };
  });
  const [onboarding, setOnboarding] = useState(() => new URLSearchParams(location.search).has('onboarding'));

  useOpenClipRequests(useCallback((id: string) => setView({ name: 'detail', id }), []));
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const clips = useLiveQuery(() => listClips(), [], undefined);
  const summaries = useLiveQuery(() => listCollections(), [], undefined);
  // Every collection a clip is in has clips, so the (non-empty) summaries cover them all.
  const collectionsById = useMemo(() => new Map(summaries?.map((s) => [s.collection.id, s.collection])), [summaries]);
  const modelState = useIndexer(settings?.smartModel);

  const notify = useCallback((message: string, onUndo?: () => void) => setToast({ id: Date.now(), message, onUndo }), []);

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

  const dragging = usePanelInput(useCallback((c) => void saveContents(c), [saveContents]));

  const { searching, filtering, results: current } = useSearch(query, filters, clips);
  // Stays open while you change filters, even back to "Any".
  const showFilters = filtersOpen || filtering || query.trim() !== '';
  const visible = useMemo(() => (searching ? (current ?? []).map((r) => r.clip) : (clips ?? [])), [searching, current, clips]);
  const meaningCount = current?.filter((r) => r.match === 'meaning').length ?? 0;
  const sites = useMemo(() => topSites(clips ?? []), [clips]);
  const paused = settings ? isPaused(settings, now) : false;
  const sortedToday = useMemo(() => {
    const midnight = new Date(now).setHours(0, 0, 0, 0);
    return (clips ?? []).filter((c) => c.collectionId && c.createdAt >= midnight).length;
  }, [clips, now]);

  async function newCollection() {
    const created = await promptNewCollection();
    if (created) setView({ name: 'collection', id: created.id });
  }

  const shell = (children: React.ReactNode) => (
    <div className="relative flex h-screen flex-col overflow-hidden bg-bg text-ink">
      {children}
      {dragging && <DropOverlay />}
      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
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
      />,
    );
  }

  if (view.name === 'settings') {
    return shell(
      <SettingsView
        onBack={() => setView({ name: 'home' })}
        notify={notify}
        onPro={() => setView({ name: 'pro', from: { name: 'settings' } })}
      />,
    );
  }

  if (view.name === 'pro') {
    const back = view.from ?? { name: 'home' as const };
    return shell(<ProWaitlist onBack={() => setView(back)} />);
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
        <div className="flex items-center gap-2">
          <SearchField
            className="min-w-0 flex-1"
            label="Search your clips"
            placeholder="Search your clips"
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
          <div className="pt-2.5">
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
          onPro={() => setView({ name: 'pro' })}
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
                      onDropClip={(clipId) => {
                        void moveClip(clipId, s.collection.id).then(() => notify(`Moved to ${s.collection.name}`));
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
                  body="Click into any text box and press Alt+Shift+V to pick from your clips."
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
