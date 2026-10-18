import { useState } from 'react';
import { Button, Section, Toggle } from '@/components/ui';
import { InlineConfirm } from '@/components/InlineConfirm';
import { canSync, startSync, turnOffSync, type SyncStatus } from '@/lib/sync/controller';
import { useDriveSync } from '@/lib/sync/useDriveSync';
import { safeSend } from '@/lib/safeSend';

export const SYNC_STOPPED = 'The Drive copy was deleted or replaced on another computer. Your clips here are safe.';

function syncedAt(ts: number, now: number): string {
  if (now - ts < 60_000) return 'just now';
  const d = new Date(ts);
  return new Date(now).toDateString() === d.toDateString()
    ? `at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : `on ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

function statusLine(status: SyncStatus, now = Date.now()): string {
  switch (status.state) {
    case 'syncing':
      return status.progress && status.progress.total > 20
        ? `Syncing… ${status.progress.done.toLocaleString()} of ${status.progress.total.toLocaleString()}`
        : 'Syncing…';
    case 'idle':
      return status.lastSyncAt ? `Last synced ${syncedAt(status.lastSyncAt, now)}` : 'Synced';
    case 'offline':
      return "Can't reach Google Drive right now. It tries again every minute.";
    case 'signin':
      return 'Sign in to Google again to keep syncing.';
    case 'stopped':
      return `Sync stopped. ${SYNC_STOPPED}`;
    case 'drive-full':
      return 'Your Google Drive is full. Free up space there to keep syncing.';
    case 'error':
      return `Sync stopped: ${status.message ?? 'something went wrong'}. It tries again every minute.`;
    default:
      return '';
  }
}

export function DriveSync({ notify }: { notify: (message: string) => void }) {
  const sync = useDriveSync();
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [erase, setErase] = useState(false);

  if (!sync || !canSync()) return null;
  const { settings, status, settingUp } = sync;

  async function start() {
    if (!(await startSync())) notify('Sync needs permission to sign in to Google');
  }

  async function turnOff() {
    setConfirmOff(false);
    setBusy(true);
    try {
      await turnOffSync({ eraseDrive: erase });
      notify(erase ? 'Sync is off and the Drive copy is deleted' : 'Sync is off');
    } catch {
      notify("Sync is off, but some of the Drive copy couldn't be deleted. Turn sync on and off again to finish.");
    } finally {
      setBusy(false);
      setErase(false);
    }
  }

  return (
    <Section id="s-sync" title="Sync with Google Drive">
      {!settings.on ? (
        <>
          <Toggle
            id="t-drive-sync"
            label="Sync with Google Drive"
            hint="Your clips on every computer where you turn this on, kept in a hidden folder in your Google Drive."
            checked={settingUp}
            disabled={settingUp}
            onChange={(on) => on && void start()}
          />
          {status.message && !settingUp && (
            <p className="mt-1 text-[13px] text-danger" role="status">
              {status.message}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm" role="status">
            {statusLine(status)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {status.state === 'signin' ? (
              <Button size="sm" variant="primary" disabled={settingUp} onClick={() => void start()}>
                Sign in
              </Button>
            ) : status.state === 'stopped' ? (
              <Button size="sm" variant="primary" disabled={settingUp} onClick={() => void start()}>
                Sync again
              </Button>
            ) : (
              <Button size="sm" disabled={status.state === 'syncing'} onClick={() => void safeSend({ type: 'sync-now' })}>
                Sync now
              </Button>
            )}
            <Button size="sm" variant="danger" disabled={busy} aria-expanded={confirmOff} onClick={() => setConfirmOff(true)}>
              Turn off
            </Button>
          </div>
          {confirmOff && (
            <div className="mt-3">
              <InlineConfirm
                message="Stop syncing this computer? Its clips stay here."
                confirmLabel="Turn off sync"
                onConfirm={() => void turnOff()}
                onCancel={() => {
                  setConfirmOff(false);
                  setErase(false);
                }}
              >
                <label className="mt-2 flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={erase}
                    onChange={(e) => setErase(e.target.checked)}
                    className="size-4 accent-[var(--accent)]"
                  />
                  Also delete the copy in Google Drive. Other computers stop syncing.
                </label>
              </InlineConfirm>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
