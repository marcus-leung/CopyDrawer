import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ImagePlus } from 'lucide-react';
import { listClips } from '@/lib/clips';
import { NO_FILTERS, type SearchFilters } from '@/lib/search';
import { updateSettings } from '@/lib/settings';
import { useNowUntil, useSettings } from '@/lib/useSettings';
import { useAppearance } from '@/lib/useAppearance';
import { useSearch } from '@/lib/useSearch';
import { cancelViewRequest, requestView, useOpenViewRequests, type OpenViewRequest, type View } from '@/lib/openView';
import { summarizeCollections } from '@/lib/collections';
import { db } from '@/lib/db';
import { SelectionBar } from '@/components/SelectionBar';
import { useListPicks, useSelection } from '@/lib/useSelection';
import { ExpandContext } from '@/components/ExpandButton';
import { Toast, type ToastState } from '@/components/Toast';
import { ClipDetail } from './ClipDetail';
import { SettingsView } from './SettingsView';
import { CollectionView } from './CollectionView';
import { HomeView } from './HomeView';
import { Onboarding } from './Onboarding';
import { usePanelInput } from './usePanelInput';
import { usePickActions } from './usePickActions';
import { useClipActions } from './useClipActions';
import { usePaged } from '@/lib/usePaged';
import { safeSend } from '@/lib/safeSend';
import { useShortcuts } from '@/lib/useShortcuts';

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
  const collections = useLiveQuery(() => db.collections.toArray(), [], undefined);
  const summaries = useMemo(
    () => (clips && collections ? summarizeCollections(collections, clips, now) : undefined),
    [clips, collections, now],
  );

  const keys = useShortcuts();
  const notify = useCallback((message: string, onUndo?: () => void) => setToast({ id: Date.now(), message, onUndo }), []);

  // Opening CopyDrawer brings in what changed on other computers, if Drive sync is on.
  useEffect(() => void safeSend({ type: 'sync-now' }), []);

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

  const { copy, remove, saveContents, saveFromClipboard } = useClipActions({ notify, setView });

  const clipsById = useMemo(() => new Map(clips?.map((c) => [c.id, c])), [clips]);
  const exists = useCallback((id: string) => clipsById.has(id), [clipsById]);
  const selection = useSelection(exists);
  const { clear: clearPicks } = selection;
  useEffect(() => clearPicks(), [view, clearPicks]);
  const pickedClips = selection.ids.map((id) => clipsById.get(id)!);
  const pickActions = usePickActions({
    selection,
    picked: pickedClips,
    joinWith: settings?.joinWith ?? 'line',
    summaries,
    notify,
  });

  const dragging = usePanelInput(useCallback((c) => void saveContents(c), [saveContents]));

  const { searching, filtering, results } = useSearch(query, filters, clips);
  // Stays open while you change filters, even back to "Any".
  const showFilters = filtersOpen || filtering || query.trim() !== '';
  const visible = searching ? (results ?? []) : (clips ?? []);
  const paged = usePaged(visible, `${query}\n${JSON.stringify(filters)}`);

  const shownIds = useMemo(() => paged.shown.map((c) => c.id), [paged.shown]);
  const homePick = useListPicks(selection, shownIds, view.name === 'home');
  const picking = (view.name === 'home' || view.name === 'collection') && selection.selecting;
  // Picks stay while the search changes, so the bar says how many the list isn't showing.
  const listed = view.name === 'home' && selection.selecting ? new Set(visible.map((c) => c.id)) : null;
  const notShown = listed ? selection.ids.filter((id) => !listed.has(id)).length : 0;

  const shell = (children: React.ReactNode) => (
    <ExpandContext value={surface === 'popup' ? expand : null}>
      <div className="relative flex h-full flex-col overflow-hidden bg-bg text-ink">
        {children}
        {dragging && <DropOverlay />}
        <div className="relative">
          <Toast toast={toast} onDone={() => setToast(null)} above={picking} />
          {picking && (
            <SelectionBar
              count={pickedClips.length}
              hasText={pickedClips.some((c) => c.kind !== 'image')}
              joinWith={settings?.joinWith ?? 'line'}
              onJoinWith={(joinWith) => void updateSettings({ joinWith })}
              notShown={notShown}
              onCopy={(plain) => void pickActions.copy(plain)}
              onMove={(id) => void pickActions.move(id)}
              onDelete={() => void pickActions.remove()}
              onClear={clearPicks}
            />
          )}
        </div>
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
        selection={selection}
      />,
    );
  }

  if (view.name === 'settings') {
    return shell(<SettingsView onBack={() => setView({ name: 'home' })} notify={notify} />);
  }

  return shell(
    <HomeView
      surface={surface}
      settings={settings}
      now={now}
      clips={clips}
      summaries={summaries}
      keys={keys}
      selection={selection}
      pick={homePick}
      picking={picking}
      query={query}
      setQuery={setQuery}
      filters={filters}
      setFilters={setFilters}
      showFilters={showFilters}
      setFiltersOpen={setFiltersOpen}
      searching={searching}
      results={results}
      visible={visible}
      paged={paged}
      adding={adding}
      setAdding={setAdding}
      creating={creating}
      setCreating={setCreating}
      setView={setView}
      onCopy={copy}
      onGrab={saveFromClipboard}
      notify={notify}
    />,
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
