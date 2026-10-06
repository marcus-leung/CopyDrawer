import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft } from 'lucide-react';
import { db } from '@/lib/db';
import { MAX_CLIPS, clearAll, deleteOlderThan } from '@/lib/clips';
import { isPaused, PAUSE_MS, updateSettings, type Settings } from '@/lib/settings';
import { disableAutosave, enableAutosave } from '@/lib/autosave';
import { BUILT_IN_BLOCKED, normalizeSite } from '@/lib/exclusions';
import { useNowUntil, useSettings } from '@/lib/useSettings';
import { Button, IconButton } from '@/components/ui';
import { AiSection } from './AiSection';

const selectClass = 'h-9 rounded-lg border border-line-strong bg-bg px-2 text-[13px] text-ink';

export function SettingsView({ onBack, notify }: { onBack: () => void; notify: (message: string) => void }) {
  const settings = useSettings();
  const now = useNowUntil(settings?.pausedUntil ?? 0);
  const count = useLiveQuery(() => db.clips.count(), [], 0);
  const [site, setSite] = useState('');

  async function change(patch: Partial<Settings>) {
    await updateSettings(patch);
    if (patch.retentionDays) {
      const removed = await deleteOlderThan(patch.retentionDays);
      if (removed) notify(`Deleted ${removed} old ${removed === 1 ? 'clip' : 'clips'}`);
    }
  }

  async function toggleAutosave(on: boolean) {
    if (on) {
      const ok = await enableAutosave();
      notify(ok ? 'Auto-save is on' : 'Auto-save needs permission to read the sites you copy from');
    } else {
      await disableAutosave();
      notify('Auto-save is off');
    }
  }

  async function addSite() {
    const host = normalizeSite(site);
    if (!host || !settings) {
      notify('Enter a site like example.com');
      return;
    }
    if (!settings.blockedSites.includes(host)) await change({ blockedSites: [...settings.blockedSites, host] });
    setSite('');
  }

  async function deleteEverything() {
    if (!confirm('Delete all clips, including pinned ones? This cannot be undone.')) return;
    await clearAll();
    notify('All clips deleted');
  }

  if (!settings) return null;
  const used = Math.min(100, (count / MAX_CLIPS) * 100);
  const paused = isPaused(settings, now);

  return (
    <>
      <header className="flex items-center gap-1.5 px-3.5 pt-3.5 pb-2">
        <IconButton label="Back to home" onClick={onBack}>
          <ChevronLeft size={20} aria-hidden />
        </IconButton>
        <h1 className="font-display text-[22px] font-extrabold">Settings</h1>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-[18px] pb-6">
        <Section id="s-saving" title="Saving">
          <Toggle
            id="t-autosave"
            label="Save what I copy automatically"
            hint="Chrome will ask to let the extension read the sites you visit. It only notices when you copy."
            checked={settings.autoSave}
            onChange={(on) => void toggleAutosave(on)}
          />
          {settings.autoSave && (
            <>
              <div className="flex min-h-11 items-center justify-between gap-3">
                <span className="text-sm">{paused ? 'Paused for now' : 'Pause for an hour'}</span>
                <Button
                  size="sm"
                  onClick={() => void change({ pausedUntil: paused ? 0 : Date.now() + PAUSE_MS })}
                >
                  {paused ? 'Resume' : 'Pause'}
                </Button>
              </div>
              <Toggle
                id="t-incognito"
                label="Also save in incognito windows"
                checked={settings.saveInIncognito}
                onChange={(on) => void change({ saveInIncognito: on })}
              />
            </>
          )}
        </Section>

        <Section id="s-blocked" title="Blocked sites">
          <p className="mb-2 text-[13px] leading-[19px] text-text-2">Nothing you copy on these sites is saved.</p>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="add-site">
              Site to block
            </label>
            <input
              id="add-site"
              value={site}
              onChange={(e) => setSite(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addSite()}
              placeholder="e.g. mybank.com"
              className="h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-bg px-4 text-sm text-ink placeholder:text-text-3"
            />
            <Button variant="primary" onClick={() => void addSite()}>
              Block
            </Button>
          </div>
          {settings.blockedSites.length > 0 && (
            <ul className="mt-2">
              {settings.blockedSites.map((host) => (
                <li key={host} className="flex min-h-12 items-center justify-between border-b border-line">
                  <span className="text-sm font-semibold">{host}</span>
                  <Button
                    size="sm"
                    onClick={() => void change({ blockedSites: settings.blockedSites.filter((h) => h !== host) })}
                  >
                    Unblock
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <details className="mt-3 text-[13px] text-text-2">
            <summary className="cursor-pointer font-semibold text-link">
              Always blocked: {BUILT_IN_BLOCKED.length} password manager and banking sites
            </summary>
            <p className="mt-2 leading-5">{BUILT_IN_BLOCKED.join(', ')}</p>
          </details>
        </Section>

        <Section id="s-history" title="History">
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
              className={selectClass}
            >
              <option value={0}>Never</option>
              <option value={30}>After 30 days</option>
              <option value={90}>After 90 days</option>
            </select>
          </div>
        </Section>

        <AiSection settings={settings} onChange={(patch) => void change(patch)} notify={notify} />

        <Section id="s-look" title="Appearance">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <label htmlFor="theme" className="text-sm">
              Theme
            </label>
            <select
              id="theme"
              value={settings.theme}
              onChange={(e) => void change({ theme: e.target.value as Settings['theme'] })}
              className={selectClass}
            >
              <option value="system">Match system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </Section>

        <Section id="s-keys" title="Shortcuts">
          <Row label="Save selection" value={<kbd>Alt+Shift+S</kbd>} />
          <Row label="Screenshot an area" value={<kbd>Alt+Shift+X</kbd>} />
          <button
            type="button"
            className="cursor-pointer text-[13px] font-semibold text-link hover:text-link-hover"
            onClick={() => void browser.tabs.create({ url: 'chrome://extensions/shortcuts' })}
          >
            Change shortcuts in Chrome
          </button>
        </Section>

        <Section id="s-data" title="Your data">
          <p className="mb-3 text-[13px] leading-[19px] text-text-2">
            Clips are stored only on this computer. Nothing is uploaded.
          </p>
          <Button variant="danger" onClick={() => void deleteEverything()}>
            Delete all clips
          </Button>
        </Section>
      </main>
    </>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-2 text-[13px] font-semibold text-text-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between text-sm">
      <span>{label}</span>
      {value}
    </div>
  );
}

export function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-1">
      <label htmlFor={id} className="text-sm">
        {label}
        {hint && <span className="mt-0.5 block text-xs leading-[17px] text-text-3">{hint}</span>}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 shrink-0 cursor-pointer accent-[var(--ink)]"
      />
    </div>
  );
}
