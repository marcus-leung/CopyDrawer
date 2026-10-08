import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, PanelRight } from 'lucide-react';
import { db, type Clip, type Collection } from '@/lib/db';
import { listClips, markUsed } from '@/lib/clips';
import { colorOf } from '@/lib/collections';
import { copyClipToClipboard } from '@/lib/clipboard';
import { shortTime } from '@/lib/format';
import { disableAutosave, enableAutosave } from '@/lib/autosave';
import { useSettings } from '@/lib/useSettings';
import { useAppearance } from '@/lib/useAppearance';
import { useObjectUrl } from '@/lib/useObjectUrl';
import { OPEN_CLIP_KEY } from '@/lib/openClip';

/** Toolbar popup: recent clips. The copy icon copies; clicking a clip opens it in the side panel. */
export function Popup() {
  useAppearance();
  const settings = useSettings();
  const clips = useLiveQuery(async () => (await listClips()).slice(0, 8), []);
  const collections = useLiveQuery(async () => new Map((await db.collections.toArray()).map((c) => [c.id, c] as const)), []);
  const [status, setStatus] = useState<string | null>(null);
  // Looked up ahead of time: Chrome only opens the side panel straight from a click.
  const [windowId, setWindowId] = useState<number>();
  useEffect(() => {
    void browser.windows.getCurrent().then((w) => setWindowId(w.id));
  }, []);

  async function copy(clip: Clip) {
    try {
      await copyClipToClipboard(clip);
      await markUsed(clip.id);
      setStatus('Copied. Paste it anywhere.');
      setTimeout(() => window.close(), 700);
    } catch {
      setStatus("Couldn't copy. Try again.");
    }
  }

  function openPanel(clip?: Clip) {
    if (windowId == null) return;
    if (clip) void browser.storage.session.set({ [OPEN_CLIP_KEY]: { clipId: clip.id, at: Date.now() } });
    void browser.sidePanel
      .open({ windowId })
      .then(() => window.close())
      .catch(() => setStatus("Couldn't open the panel. Try again."));
  }

  return (
    <div className="w-[340px] bg-bg text-ink">
      <header className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <h1 className="font-display text-[17px] font-semibold">Recent clips</h1>
        <button
          type="button"
          onClick={() => openPanel()}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-surface px-3 text-[13px] font-semibold"
        >
          <PanelRight size={14} aria-hidden />
          Open panel
        </button>
      </header>
      {clips && clips.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-text-2">
          Nothing saved yet. Select text and press <kbd>Alt+Shift+S</kbd>, or open the panel.
        </p>
      ) : (
        <ul aria-label="Recent clips" className="px-2">
          {clips?.map((c) => (
            <li key={c.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => openPanel(c)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-surface"
              >
                <Lead clip={c} collection={c.collectionId ? collections?.get(c.collectionId) : undefined} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.title}</span>
                <span className="shrink-0 text-xs text-text-3">{shortTime(c.createdAt)}</span>
              </button>
              <button
                type="button"
                aria-label={`Copy ${c.title}`}
                title="Copy"
                onClick={() => void copy(c)}
                className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink hover:bg-surface"
              >
                <Copy size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p role="status" className="px-4 pt-1.5 pb-2.5 text-[13px] text-text-2">
        {status ?? 'Click a clip to open it, or the copy icon to copy it'}
      </p>
      {settings && (
        <footer className="border-t border-line px-4 py-2.5">
          <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px]">
            <span>
              <span className="block font-semibold">Save what I copy</span>
              <span className="block text-xs text-text-3">On: everything you copy on websites is saved. Off: save by hand.</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.autoSave}
              onChange={(e) => void (e.target.checked ? enableAutosave() : disableAutosave())}
              className="size-4 shrink-0 accent-[var(--color-ink)]"
            />
          </label>
        </footer>
      )}
    </div>
  );
}

function Lead({ clip, collection }: { clip: Clip; collection?: Collection }) {
  const thumb = useObjectUrl(clip.image?.thumb);
  if (clip.kind === 'image') {
    return (
      <span
        className="size-6 shrink-0 rounded-md bg-surface bg-cover bg-center"
        style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}
        aria-hidden
      />
    );
  }
  const c = collection ? colorOf(collection) : null;
  return (
    <span className="flex size-6 shrink-0 items-center justify-center" aria-hidden>
      <span
        className="size-2 rounded-full bg-[var(--d)] dark:bg-[var(--dd)]"
        style={
          {
            '--d': c?.accent ?? 'var(--color-line-strong)',
            '--dd': c?.accentDark ?? 'var(--color-line-strong)',
          } as React.CSSProperties
        }
      />
    </span>
  );
}
