import { useEffect, useState } from 'react';
import { MAX_CLIPS } from '@/lib/clips';
import { hostOf } from '@/lib/format';
import { isPaused, updateSettings, type Settings } from '@/lib/settings';
import { Notice } from '@/components/Notice';
import { BACKUP_SNOOZE, backupDue } from '@/lib/backup';
import { useExport } from '@/lib/useExport';
import { STORAGE_STATE_KEYS, storageState } from '@/lib/storageGuard';

/** The hostname of the tab next to the panel, when Chrome lets us see it. */
function useActiveHost(): string | null {
  const [host, setHost] = useState<string | null>(null);
  useEffect(() => {
    const read = () =>
      void browser.tabs
        .query({ active: true, currentWindow: true })
        .then(([tab]) => setHost(tab?.url ? (hostOf(tab.url) ?? null) : null))
        .catch(() => setHost(null));
    read();
    const onActivated = () => read();
    const onUpdated = (_id: number, info: { url?: string }) => info.url && read();
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);
  return host;
}

/** Whether saving is paused or the disk was found almost full in this Chrome session. */
function useStorageState() {
  const [state, setState] = useState<Awaited<ReturnType<typeof storageState>>>('ok');
  useEffect(() => {
    const read = () => void storageState().then(setState);
    read();
    const onChanged = (changes: Record<string, unknown>) => STORAGE_STATE_KEYS.some((k) => k in changes) && read();
    browser.storage.session.onChanged.addListener(onChanged);
    return () => browser.storage.session.onChanged.removeListener(onChanged);
  }, []);
  return state;
}

/** One notice at a time under the search bar: disk full, paused, site blocked, history full, time to back up. */
export function HomeNotice({
  settings,
  now,
  count,
  onCleanUp,
  notify,
}: {
  settings: Settings;
  now: number;
  count: number;
  onCleanUp: () => void;
  notify: (message: string) => void;
}) {
  const host = useActiveHost();
  const backup = useExport(notify);
  const storage = useStorageState();

  let notice: React.ReactNode = null;
  if (storage === 'rebuilding') {
    notice = (
      <Notice
        tone="info"
        title="Checking your clips"
        body="After the disk problem, CopyDrawer is moving your clips to fresh storage. This takes a moment."
      />
    );
  } else if (storage === 'disk' || storage === 'failed') {
    notice = (
      <Notice
        tone="warning"
        title="Saving is paused to protect your clips"
        body="Your computer ran out of disk space. Free up some space, then restart Chrome. Your saved clips are safe."
      />
    );
  } else if (storage === 'low') {
    notice = (
      <Notice
        tone="warning"
        title="Your computer is almost out of space"
        body="New clips aren't being saved. Free up some disk space and saving starts again. Your saved clips are safe."
      />
    );
  } else if (isPaused(settings, now)) {
    const mins = Math.max(1, Math.round((settings.pausedUntil - now) / 60_000));
    notice = (
      <Notice
        tone="warning"
        title="Auto-save is paused"
        body={`Nothing you copy is being saved. Resumes in ${mins} ${mins === 1 ? 'minute' : 'minutes'}.`}
        action={{ label: 'Resume now', onClick: () => void updateSettings({ pausedUntil: 0 }) }}
      />
    );
  } else if (settings.autoSave && host && settings.blockedSites.includes(host)) {
    notice = (
      <Notice
        tone="neutral"
        title="This site isn't saved"
        body={`You blocked ${host}.`}
        action={{
          label: 'Unblock this site',
          onClick: () => void updateSettings({ blockedSites: settings.blockedSites.filter((s) => s !== host) }),
        }}
      />
    );
  } else if (count >= MAX_CLIPS) {
    notice = (
      <Notice
        tone="neutral"
        title={`History is full: ${count.toLocaleString()} of ${MAX_CLIPS.toLocaleString()}`}
        body="New clips replace your oldest unpinned ones. Pinned clips are kept."
        action={{ label: 'Clean up', onClick: onCleanUp }}
      />
    );
  } else if (backupDue(settings, count, now)) {
    notice = (
      <Notice
        tone="info"
        title="Back up your clips"
        body="They're stored only on this computer, so uninstalling CopyDrawer deletes them. Export a copy every so often."
        action={{
          label: backup.exporting ? 'Exporting…' : 'Export now',
          onClick: () => void backup.run(),
          disabled: backup.exporting,
        }}
        secondary={{ label: 'Not now', onClick: () => void updateSettings({ backupRemindAfter: Date.now() + BACKUP_SNOOZE }) }}
      />
    );
  }
  return notice ? <div className="px-[18px] pb-3">{notice}</div> : null;
}
