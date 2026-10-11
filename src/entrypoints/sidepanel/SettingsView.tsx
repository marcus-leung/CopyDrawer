import { useContext, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft } from 'lucide-react';
import { db } from '@/lib/db';
import { MAX_CLIPS, clearAll, countOlderThan, deleteOlderThan } from '@/lib/clips';
import { isPaused, PAUSE_MS, updateSettings, type Settings } from '@/lib/settings';
import { disableAutosave, enableAutosave } from '@/lib/autosave';
import { BUILT_IN_BLOCKED, normalizeSite } from '@/lib/exclusions';
import { useNowUntil, useSettings } from '@/lib/useSettings';
import { Button, IconButton } from '@/components/ui';
import { ExpandButton, ExpandContext } from '@/components/ExpandButton';
import { InlineConfirm } from '@/components/InlineConfirm';
import { BackupError, importFile } from '@/lib/backup';
import { useExport } from '@/lib/useExport';
import { keyLabel, useShortcuts } from '@/lib/useShortcuts';
import { NOT_SET } from '@/lib/shortcuts';

const selectClass = 'h-9 rounded-lg border border-line-strong bg-bg px-2 text-[13px] text-ink';

export function SettingsView({ onBack, notify }: { onBack: () => void; notify: (message: string) => void }) {
  const settings = useSettings();
  const now = useNowUntil(settings?.pausedUntil ?? 0);
  const count = useLiveQuery(() => db.clips.count(), [], 0);
  const [site, setSite] = useState('');
  /** Auto-delete waiting for the user to confirm, with how many clips it would delete now. */
  const [pendingRetention, setPendingRetention] = useState<{ days: Settings['retentionDays']; old: number } | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  // Set only in the toolbar popup, which Chrome closes when a file dialog takes focus.
  const expand = useContext(ExpandContext);
  const keys = useShortcuts();
  const backup = useExport(notify);

  async function changeRetention(days: Settings['retentionDays']) {
    const old = await countOlderThan(days);
    if (old) setPendingRetention({ days, old });
    else await change({ retentionDays: days });
  }

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

  async function importFrom(file: File | undefined) {
    if (!file) return;
    try {
      const { added, skipped } = await importFile(file);
      const done = added ? `Imported ${added} ${added === 1 ? 'clip' : 'clips'}.` : 'Nothing new to import.';
      notify(skipped ? `${done} Skipped ${skipped} that ${skipped === 1 ? 'was' : 'were'} damaged or missing an image.` : done);
    } catch (e) {
      notify(e instanceof BackupError ? e.message : "Couldn't read that file.");
    }
  }

  async function deleteEverything() {
    setConfirmDeleteAll(false);
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
        <ExpandButton className="ml-auto" />
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
                <Button size="sm" onClick={() => void change({ pausedUntil: paused ? 0 : Date.now() + PAUSE_MS })}>
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
              value={pendingRetention?.days ?? settings.retentionDays}
              onChange={(e) => void changeRetention(Number(e.target.value) as Settings['retentionDays'])}
              className={selectClass}
            >
              <option value={0}>Never</option>
              <option value={30}>After 30 days</option>
              <option value={90}>After 90 days</option>
            </select>
          </div>
          {pendingRetention && (
            <div className="mt-2">
              <InlineConfirm
                message={`Delete ${pendingRetention.old === 1 ? '1 clip' : `${pendingRetention.old.toLocaleString()} clips`} older than ${pendingRetention.days} days now? Pinned clips are kept. This also applies on your other computers through Chrome sync, and can't be undone.`}
                confirmLabel="Delete and turn on"
                onConfirm={() => {
                  const { days } = pendingRetention;
                  setPendingRetention(null);
                  void change({ retentionDays: days });
                }}
                onCancel={() => setPendingRetention(null)}
              />
            </div>
          )}
        </Section>

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
          <div className="flex min-h-11 items-center justify-between gap-3">
            <label htmlFor="font" className="text-sm">
              Font
            </label>
            <select
              id="font"
              value={settings.font}
              onChange={(e) => void change({ font: e.target.value as Settings['font'] })}
              className={selectClass}
            >
              <option value="default">Default</option>
              <option value="system">System</option>
              <option value="mono">Monospace</option>
            </select>
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <label htmlFor="text-size" className="text-sm">
              Text size
            </label>
            <select
              id="text-size"
              value={settings.textSize}
              onChange={(e) => void change({ textSize: Number(e.target.value) as Settings['textSize'] })}
              className={selectClass}
            >
              <option value={90}>Small</option>
              <option value={100}>Default</option>
              <option value={115}>Large</option>
              <option value={130}>Larger</option>
            </select>
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <label htmlFor="popup-size" className="text-sm">
              Popup size
            </label>
            <select
              id="popup-size"
              value={settings.popupSize}
              onChange={(e) => void change({ popupSize: e.target.value as Settings['popupSize'] })}
              className={selectClass}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>
        </Section>

        <Section id="s-keys" title="Shortcuts">
          <Row label="Quick paste on any page" value={<kbd>{keyLabel(keys, 'quick-paste')}</kbd>} />
          <Row label="Save selection" value={<kbd>{keyLabel(keys, 'save-selection')}</kbd>} />
          <Row label="Screenshot an area" value={<kbd>{keyLabel(keys, 'screenshot-area')}</kbd>} />
          {keys && Object.values(keys).includes(NOT_SET) && (
            <p className="mb-2 text-[13px] leading-[19px] text-text-2">
              Chrome leaves a shortcut Not set when another extension or app already uses those keys. Pick one with Change
              shortcuts in Chrome.
            </p>
          )}
          <button
            type="button"
            className="cursor-pointer text-[13px] font-semibold text-link hover:text-link-hover"
            onClick={() => void browser.tabs.create({ url: 'chrome://extensions/shortcuts' })}
          >
            Change shortcuts in Chrome
          </button>
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
              Always blocked: {BUILT_IN_BLOCKED.length} password manager, bank, government, sign-in, email, payment, tax and
              health sites
            </summary>
            <p className="mt-2 leading-5">{BUILT_IN_BLOCKED.join(', ')}</p>
          </details>
        </Section>

        <Section id="s-data" title="Your data">
          <p className="mb-3 text-[13px] leading-[19px] text-text-2">
            Clips are stored only on this computer. Nothing is uploaded. Your settings (theme, blocked sites, auto-delete) follow
            you to other computers through Chrome sync, if it's on.
          </p>
          <p className="mb-3 text-[13px] text-text-2">
            {settings.lastExportAt ? `Last exported: ${new Date(settings.lastExportAt).toLocaleDateString()}` : 'Never exported'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={backup.exporting} onClick={() => void backup.run()}>
              {backup.exporting ? 'Exporting…' : 'Export'}
            </Button>
            {expand ? (
              <Button size="sm" onClick={expand}>
                Import
              </Button>
            ) : (
              <label className="inline-flex h-9 cursor-pointer items-center rounded-full bg-surface px-3 text-[13px] font-semibold text-ink focus-within:outline-2 focus-within:outline-text-3 hover:opacity-90">
                Import
                <input
                  type="file"
                  accept=".zip,application/zip,.json,application/json"
                  className="sr-only"
                  onChange={(e) => {
                    void importFrom(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
            <Button size="sm" variant="danger" aria-expanded={confirmDeleteAll} onClick={() => setConfirmDeleteAll(true)}>
              Delete all
            </Button>
          </div>
          <div className="mt-3">
            <Toggle
              id="t-backup-reminder"
              label="Remind me to export every month"
              hint="Once you have 50 clips or more. Uninstalling Clipboard deletes your clips, so a copy is worth keeping."
              checked={settings.backupReminder}
              onChange={(on) => void updateSettings({ backupReminder: on })}
            />
          </div>
          {confirmDeleteAll && (
            <div className="mt-3">
              <InlineConfirm
                message="Delete all clips, including pinned ones? This can't be undone."
                confirmLabel="Delete all clips"
                onConfirm={() => void deleteEverything()}
                onCancel={() => setConfirmDeleteAll(false)}
              />
            </div>
          )}
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
