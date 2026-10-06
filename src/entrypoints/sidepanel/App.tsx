import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardPaste, MoreHorizontal } from 'lucide-react';
import type { Clip } from '@/lib/db';
import { deleteClip, listClips, markUsed, matchesQuery, restoreClip, saveClip } from '@/lib/clips';
import { copyClipToClipboard, readClipboardText } from '@/lib/clipboard';
import { useTheme } from '@/lib/useTheme';
import { ClipRow } from '@/components/ClipRow';
import { Button, IconButton, SearchField } from '@/components/ui';
import { Toast, type ToastState } from '@/components/Toast';
import { ClipDetail } from './ClipDetail';
import { SettingsView } from './SettingsView';

type View = { name: 'home' } | { name: 'detail'; id: string } | { name: 'settings' };

export function App() {
  useTheme();
  const [view, setView] = useState<View>({ name: 'home' });
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const clips = useLiveQuery(() => listClips(), [], undefined);

  const notify = useCallback((message: string, onAction?: () => void, actionLabel?: string) => {
    setToast({ id: Date.now(), message, onAction, actionLabel });
  }, []);

  const copy = useCallback(
    async (clip: Clip) => {
      try {
        await copyClipToClipboard(clip);
        await markUsed(clip.id);
        notify('Copied. Paste it anywhere.');
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

  const saveFromClipboard = useCallback(async () => {
    try {
      const { text, html } = await readClipboardText();
      const clip = await saveClip({ text, html });
      notify(clip ? 'Saved from your clipboard' : 'Your clipboard has no text to save');
    } catch {
      notify('Chrome blocked reading the clipboard. Paste here with Ctrl+V instead.');
    }
  }, [notify]);

  // Pasting anywhere in the panel (outside a text field) saves the clip.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target;
      if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const html = e.clipboardData?.getData('text/html') || undefined;
      if (!text.trim()) return;
      e.preventDefault();
      void saveClip({ text, html }).then((clip) => clip && notify('Saved'));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [notify]);

  const visible = useMemo(() => (clips ?? []).filter((c) => matchesQuery(c, query)), [clips, query]);

  if (view.name === 'detail') {
    return (
      <Shell toast={toast} onToastDone={() => setToast(null)}>
        <ClipDetail id={view.id} onBack={() => setView({ name: 'home' })} onCopy={copy} onDelete={remove} />
      </Shell>
    );
  }

  if (view.name === 'settings') {
    return (
      <Shell toast={toast} onToastDone={() => setToast(null)}>
        <SettingsView onBack={() => setView({ name: 'home' })} notify={notify} />
      </Shell>
    );
  }

  return (
    <Shell toast={toast} onToastDone={() => setToast(null)}>
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
        <Button size="sm" onClick={saveFromClipboard}>
          <ClipboardPaste size={16} aria-hidden />
          Grab clipboard
        </Button>
      </footer>
    </Shell>
  );
}

function Shell({
  children,
  toast,
  onToastDone,
}: {
  children: React.ReactNode;
  toast: ToastState | null;
  onToastDone: () => void;
}) {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-bg text-ink">
      {children}
      <Toast toast={toast} onDone={onToastDone} />
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
          Or paste here with <kbd className="bg-bg">Ctrl+V</kbd>
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
