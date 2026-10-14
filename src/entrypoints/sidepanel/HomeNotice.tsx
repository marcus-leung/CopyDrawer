import { useEffect, useState } from 'react';
import { MAX_CLIPS } from '@/lib/clips';
import { hostOf } from '@/lib/format';
import { isPaused, updateSettings, type Settings } from '@/lib/settings';
import { Notice } from '@/components/Notice';
import { BACKUP_SNOOZE, backupDue } from '@/lib/backup';
import { useExport } from '@/lib/useExport';
import { useDriveSync } from '@/lib/sync/useDriveSync';
import type { SyncState } from '@/lib/sync/controller';
import { SYNC_STOPPED } from './DriveSync';
import { STORAGE_STATE_KEYS, storageState, type PauseReason, type StorageState } from '@/lib/storageGuard';

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

/** Why saving is stopped to protect the clips, if it is. */
function useStorageState() {
  const [state, setState] = useState<StorageState>({ reason: 'ok', needBytes: 0 });
  useEffect(() => {
    const read = () => void storageState().then(setState);
    read();
    const onChanged = (changes: Record<string, unknown>) => STORAGE_STATE_KEYS.some((k) => k in changes) && read();
    browser.storage.session.onChanged.addListener(onChanged);
    browser.storage.local.onChanged.addListener(onChanged);
    return () => {
      browser.storage.session.onChanged.removeListener(onChanged);
      browser.storage.local.onChanged.removeListener(onChanged);
    };
  }, []);
  return state;
}

const STORAGE_NOTICES: Record<Exclude<PauseReason | 'low', 'space'>, { title: string; body: string }> = {
  rebuilding: {
    title: 'Checking your clips',
    body: 'After the disk problem, CopyDrawer is moving your clips to fresh storage. This takes a moment.',
  },
  disk: {
    title: 'Saving is paused to protect your clips',
    body: 'Your computer ran out of disk space. Free up some space, then restart Chrome. Your saved clips are safe.',
  },
  failed: {
    title: 'Saving is paused to protect your clips',
    body: "CopyDrawer couldn't move your clips to fresh storage after the disk problem. Restart Chrome to try again. Your saved clips are safe.",
  },
  low: {
    title: 'Your computer is almost out of space',
    body: "New clips aren't being saved. Free up some disk space and saving starts again. Your saved clips are safe.",
  },
};

/** Sync problems only the person can fix. */
const SYNC_NOTICES: Partial<Record<SyncState, { title: string; body: string }>> = {
  signin: {
    title: 'Sync is waiting for you',
    body: 'Sign in to Google again to keep your clips in step with your other computers.',
  },
  stopped: { title: 'Sync stopped', body: SYNC_STOPPED },
  'drive-full': { title: "Sync can't upload", body: 'Your Google Drive is full. Free up space there to keep syncing.' },
};

/** One notice at a time under the search bar: disk full, paused, site blocked, history full, time to back up. */
export function HomeNotice({
  settings,
  now,
  count,
  onOpenSettings,
  notify,
}: {
  settings: Settings;
  now: number;
  count: number;
  onOpenSettings: () => void;
  notify: (message: string) => void;
}) {
  const host = useActiveHost();
  const backup = useExport(notify);
  const storage = useStorageState();
  const sync = useDriveSync();
  const syncProblem = sync?.settings.on ? SYNC_NOTICES[sync.status.state] : undefined;

  let notice: React.ReactNode = null;
  if (storage.reason === 'space') {
    notice = (
      <Notice
        tone="warning"
        title="Saving is paused to protect your clips"
        body={`After the disk problem, CopyDrawer needs to move your clips to fresh storage. Free up about ${Math.ceil(storage.needBytes / 1e6).toLocaleString()} MB and it carries on by itself. Your saved clips are safe.`}
      />
    );
  } else if (storage.reason !== 'ok') {
    notice = <Notice tone={storage.reason === 'rebuilding' ? 'info' : 'warning'} {...STORAGE_NOTICES[storage.reason]} />;
  } else if (syncProblem) {
    notice = <Notice tone="warning" {...syncProblem} action={{ label: 'Open settings', onClick: onOpenSettings }} />;
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
        action={{ label: 'Clean up', onClick: onOpenSettings }}
      />
    );
  } else if (backupDue(settings, count, now)) {
    notice = (
      <Notice
        tone="info"
        title="Back up your clips"
        body={
          sync?.settings.on
            ? "Sync copies every change, deletes too, so it isn't a backup. Export a copy every so often."
            : "They're stored only on this computer, so uninstalling CopyDrawer deletes them. Export a copy every so often."
        }
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
