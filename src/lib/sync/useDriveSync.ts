import { useEffect, useState } from 'react';
import { safeSend } from '../safeSend';
import {
  requestSetup,
  setupPendingItem,
  syncSettingsItem,
  syncStatusItem,
  type SyncSettings,
  type SyncStatus,
} from './controller';

interface DriveSyncState {
  settings: SyncSettings;
  status: SyncStatus;
  /** Signing in and joining the Drive copy is under way in the background. */
  settingUp: boolean;
}

/** Drive sync's settings and status, live. Null until read. */
export function useDriveSync(): DriveSyncState | null {
  const [state, setState] = useState<DriveSyncState | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () =>
      void Promise.all([syncSettingsItem.getValue(), syncStatusItem.getValue(), setupPendingItem.getValue()]).then(
        ([settings, status, settingUp]) => alive && setState({ settings, status, settingUp }),
      );
    read();
    const unwatch = [syncSettingsItem.watch(read), syncStatusItem.watch(read), setupPendingItem.watch(read)];
    return () => {
      alive = false;
      unwatch.forEach((u) => u());
    };
  }, []);
  return state;
}

/**
 * Turns sync on, or signs in again. The background does the rest, since a popup closes when Chrome asks for
 * permission or Google's sign-in window opens. False if the person refused the sign-in permission.
 */
export async function startSync(): Promise<boolean> {
  await requestSetup(true);
  if (!__E2E__ && !(await browser.permissions.request({ permissions: ['identity'] }))) {
    await requestSetup(false);
    return false;
  }
  void safeSend({ type: 'sync-setup' });
  return true;
}
