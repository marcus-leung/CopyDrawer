import { useMemo } from 'react';
import { ClipboardPaste, EyeOff, MoreHorizontal, Plus, SlidersHorizontal } from 'lucide-react';
import type { Clip } from '@/lib/db';
import type { CollectionSummary } from '@/lib/collections';
import { NO_FILTERS, topSites, type SearchFilters } from '@/lib/search';
import { isPaused, PAUSE_MS, updateSettings, type Settings } from '@/lib/settings';
import type { View } from '@/lib/openView';
import type { RowPick, Selection } from '@/lib/useSelection';
import type { Shortcuts } from '@/lib/shortcuts';
import { keyLabel } from '@/lib/useShortcuts';
import { AddClipForm } from '@/components/AddClipForm';
import { ImageStrip } from '@/components/ImageStrip';
import { ClipRow } from '@/components/ClipRow';
import { Button, IconButton, SearchField } from '@/components/ui';
import { Notice } from '@/components/Notice';
import { ExpandButton } from '@/components/ExpandButton';
import { ShowMore } from '@/components/ShowMore';
import type { usePaged } from '@/lib/usePaged';
import { FilterBar } from './FilterBar';
import { EmptyState } from './EmptyState';
import { HomeNotice } from './HomeNotice';
import { CollectionsSection } from './CollectionsSection';

interface HomeViewProps {
  surface: 'panel' | 'popup';
  settings: Settings | null;
  now: number;
  clips: Clip[] | undefined;
  summaries: CollectionSummary[] | undefined;
  keys: Shortcuts | null;
  selection: Selection;
  pick: (id: string) => RowPick;
  picking: boolean;
  query: string;
  setQuery: (query: string) => void;
  filters: SearchFilters;
  setFilters: (filters: SearchFilters) => void;
  showFilters: boolean;
  setFiltersOpen: (open: boolean) => void;
  searching: boolean;
  results: Clip[] | null;
  visible: Clip[];
  paged: ReturnType<typeof usePaged<Clip>>;
  adding: boolean;
  setAdding: (adding: boolean) => void;
  creating: boolean;
  setCreating: (creating: boolean) => void;
  setView: (view: View) => void;
  onCopy: (clip: Clip) => void;
  onGrab: () => void;
  notify: (message: string) => void;
}

export function HomeView(props: HomeViewProps) {
  const { surface, settings, now, clips, query, setQuery, filters, setFilters, showFilters, setFiltersOpen } = props;
  const { picking, adding, setAdding, setView, onGrab, notify } = props;
  const hidePreviews = settings?.hidePreviews ?? false;
  const paused = settings ? isPaused(settings, now) : false;
  const sites = useMemo(() => topSites(clips ?? []), [clips]);
  const sortedToday = useMemo(() => {
    const midnight = new Date(now).setHours(0, 0, 0, 0);
    return (clips ?? []).filter((c) => c.collectionId && c.createdAt >= midnight).length;
  }, [clips, now]);

  return (
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
          <IconButton
            label="Hide previews"
            aria-pressed={hidePreviews}
            className={hidePreviews ? 'bg-accent! text-on-accent!' : 'bg-surface'}
            onClick={() => void updateSettings({ hidePreviews: !hidePreviews })}
          >
            <EyeOff size={19} aria-hidden />
          </IconButton>
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
              className={showFilters ? 'bg-accent! text-on-accent!' : 'bg-surface'}
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
            <FilterBar filters={filters} sites={sites} query={query} onChange={setFilters} />
          </div>
        )}
      </div>

      {settings && clips && (
        <HomeNotice
          settings={settings}
          now={now}
          count={clips.length}
          onOpenSettings={() => setView({ name: 'settings' })}
          notify={notify}
        />
      )}

      <main className="min-h-0 flex-1 overflow-y-auto px-[18px]">{clips && <HomeClips {...props} clips={clips} />}</main>

      <footer
        className={`${picking ? 'hidden' : 'flex'} items-center justify-between gap-3 border-t border-line px-[18px] pt-2.5 pb-4`}
      >
        <span className="text-[13px] text-text-2">Private: stored and sorted on this device</span>
        {settings?.autoSave && !paused ? (
          <Button variant="outline" size="sm" onClick={() => void updateSettings({ pausedUntil: Date.now() + PAUSE_MS })}>
            Pause
          </Button>
        ) : (
          <Button size="sm" onClick={onGrab}>
            <ClipboardPaste size={16} aria-hidden />
            Grab clipboard
          </Button>
        )}
      </footer>
    </>
  );
}

function HomeClips({
  settings,
  clips,
  summaries,
  keys,
  selection,
  pick,
  query,
  setFilters,
  setFiltersOpen,
  searching,
  results,
  visible,
  paged,
  creating,
  setCreating,
  setView,
  onCopy,
  onGrab,
  notify,
}: HomeViewProps & { clips: Clip[] }) {
  // Every collection a clip is in has clips, so the (non-empty) summaries cover them all.
  const collectionsById = useMemo(() => new Map(summaries?.map((s) => [s.collection.id, s.collection])), [summaries]);

  if (clips.length === 0) return <EmptyState onGrab={onGrab} autoSave={!!settings?.autoSave} />;
  if (searching && results === null) return null;
  if (visible.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-text-3">
        {query.trim() ? `No clips match “${query.trim()}”.` : 'No clips match these filters.'}
      </p>
    );
  }

  return (
    <>
      {!searching && summaries && (
        <CollectionsSection
          summaries={summaries}
          creating={creating}
          setCreating={setCreating}
          onOpen={(id) => setView({ name: 'collection', id })}
          notify={notify}
        />
      )}
      {!searching && (
        <ImageStrip
          clips={clips}
          onOpen={(c) => setView({ name: 'detail', id: c.id })}
          selection={selection}
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
      {!searching && summaries && summaries.length > 0 && <h2 className="font-display text-[17px] font-semibold">Recent</h2>}
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
            onCopy={onCopy}
            pick={pick(clip.id)}
          />
        ))}
      </ul>
      <ShowMore rest={paged.rest} pageSize={paged.pageSize} onMore={paged.more} />
    </>
  );
}
