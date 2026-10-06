import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft } from 'lucide-react';
import { db } from '@/lib/db';
import { MAX_CLIPS, clearAll, deleteOlderThan } from '@/lib/clips';
import { getSettings, updateSettings, type Settings } from '@/lib/settings';
import { Button, IconButton } from '@/components/ui';

export function SettingsView({
  onBack,
  notify,
}: {
  onBack: () => void;
  notify: (message: string) => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const count = useLiveQuery(() => db.clips.count(), [], 0);

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  async function change(patch: Partial<Settings>) {
    const next = await updateSettings(patch);
    setSettings(next);
    if (patch.retentionDays) {
      const removed = await deleteOlderThan(patch.retentionDays);
      if (removed) notify(`Deleted ${removed} old ${removed === 1 ? 'clip' : 'clips'}`);
    }
  }

  async function deleteEverything() {
    if (!confirm('Delete all clips, including pinned ones? This cannot be undone.')) return;
    await clearAll();
    notify('All clips deleted');
  }

  if (!settings) return null;
  const used = Math.min(100, (count / MAX_CLIPS) * 100);

  return (
    <>
      <header className="flex items-center gap-1.5 px-3.5 pt-3.5 pb-2">
        <IconButton label="Back to home" onClick={onBack}>
          <ChevronLeft size={20} aria-hidden />
        </IconButton>
        <h1 className="font-display text-[22px] font-extrabold">Settings</h1>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-[18px] pb-6">
        <section aria-labelledby="s-history">
          <h2 id="s-history" className="mb-2 text-[13px] font-semibold text-text-3">
            History
          </h2>
          <div className="flex justify-between text-sm">
            <span>Clips saved</span>
            <span className="font-semibold">
              {count.toLocaleString()} of {MAX_CLIPS.toLocaleString()}
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-line" aria-hidden>
            <div className="h-1.5 rounded-full bg-link" style={{ width: `${used}%` }} />
          </div>
          <p className="mt-2 text-xs text-text-3">When full, new clips replace your oldest unpinned ones.</p>
          <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
            <label htmlFor="retention" className="text-sm">
              Delete old clips
            </label>
            <select
              id="retention"
              value={settings.retentionDays}
              onChange={(e) => void change({ retentionDays: Number(e.target.value) as Settings['retentionDays'] })}
              className="h-9 rounded-lg border border-line-strong bg-bg px-2 text-[13px] text-ink"
            >
              <option value={0}>Never</option>
              <option value={30}>After 30 days</option>
              <option value={90}>After 90 days</option>
            </select>
          </div>
        </section>

        <section aria-labelledby="s-look">
          <h2 id="s-look" className="mb-2 text-[13px] font-semibold text-text-3">
            Appearance
          </h2>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <label htmlFor="theme" className="text-sm">
              Theme
            </label>
            <select
              id="theme"
              value={settings.theme}
              onChange={(e) => void change({ theme: e.target.value as Settings['theme'] })}
              className="h-9 rounded-lg border border-line-strong bg-bg px-2 text-[13px] text-ink"
            >
              <option value="system">Match system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </section>

        <section aria-labelledby="s-keys">
          <h2 id="s-keys" className="mb-2 text-[13px] font-semibold text-text-3">
            Shortcuts
          </h2>
          <div className="flex min-h-11 items-center justify-between text-sm">
            <span>Save selection</span>
            <kbd>Alt+Shift+S</kbd>
          </div>
          <button
            type="button"
            className="cursor-pointer text-[13px] font-semibold text-link hover:text-link-hover"
            onClick={() => void browser.tabs.create({ url: 'chrome://extensions/shortcuts' })}
          >
            Change shortcuts in Chrome
          </button>
        </section>

        <section aria-labelledby="s-data">
          <h2 id="s-data" className="mb-2 text-[13px] font-semibold text-text-3">
            Your data
          </h2>
          <p className="mb-3 text-[13px] leading-[19px] text-text-2">
            Clips are stored only on this computer. Nothing is uploaded.
          </p>
          <Button variant="danger" onClick={() => void deleteEverything()}>
            Delete all clips
          </Button>
        </section>
      </main>
    </>
  );
}
