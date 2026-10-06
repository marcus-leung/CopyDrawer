import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PanelRight } from 'lucide-react';
import { db, type Clip, type Collection } from '@/lib/db';
import { listClips, markUsed } from '@/lib/clips';
import { colorOf } from '@/lib/collections';
import { copyClipToClipboard } from '@/lib/clipboard';
import { shortTime } from '@/lib/format';
import { disableAutosave, enableAutosave } from '@/lib/autosave';
import { useSettings } from '@/lib/useSettings';
import { useTheme } from '@/lib/useTheme';
import { useObjectUrl } from '@/lib/useObjectUrl';

/** Toolbar popup: recent clips, click to copy (screen 3.6). */
export function Popup() {
  useTheme();
  const settings = useSettings();
  const clips = useLiveQuery(async () => (await listClips()).slice(0, 8), []);
  const collections = useLiveQuery(async () => new Map((await db.collections.toArray()).map((c) => [c.id, c] as const)), []);
  const [status, setStatus] = useState<string | null>(null);

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

  async function openPanel() {
    const win = await browser.windows.getCurrent();
    if (win.id != null) await browser.sidePanel.open({ windowId: win.id });
    window.close();
  }

  return (
    <div className="w-[340px] bg-bg text-ink">
      <header className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <h1 className="font-display text-[17px] font-semibold">Recent clips</h1>
        <button
          type="button"
          onClick={() => void openPanel()}
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
            <li key={c.id}>
              <button
                type="button"
                onClick={() => void copy(c)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-surface"
              >
                <Lead clip={c} collection={c.collectionId ? collections?.get(c.collectionId) : undefined} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.title}</span>
                <span className="shrink-0 text-xs text-text-3">{shortTime(c.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <footer className="mt-1 flex items-center justify-between border-t border-line px-4 py-2.5 text-[13px] text-text-2">
        <span role="status">{status ?? 'Click a clip to copy it'}</span>
        {settings && (
          <label className="flex cursor-pointer items-center gap-2">
            Auto-save
            <input
              type="checkbox"
              role="switch"
              checked={settings.autoSave}
              onChange={(e) => void (e.target.checked ? enableAutosave() : disableAutosave())}
              className="size-4 accent-[var(--color-ink)]"
            />
          </label>
        )}
      </footer>
    </div>
  );
}

function Lead({ clip, collection }: { clip: Clip; collection?: Collection }) {
  const thumb = useObjectUrl(clip.image?.thumb);
  if (clip.kind === 'image') {
    return <span className="size-6 shrink-0 rounded-md bg-surface bg-cover bg-center" style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined} aria-hidden />;
  }
  const c = collection ? colorOf(collection) : null;
  return (
    <span className="flex size-6 shrink-0 items-center justify-center" aria-hidden>
      <span
        className="size-2 rounded-full bg-[var(--d)] dark:bg-[var(--dd)]"
        style={{ '--d': c?.accent ?? 'var(--color-line-strong)', '--dd': c?.accentDark ?? 'var(--color-line-strong)' } as React.CSSProperties}
      />
    </span>
  );
}
