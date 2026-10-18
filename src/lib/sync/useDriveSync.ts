import { useEffect, useState } from 'react';
import { setupPendingItem, syncSettingsItem, syncStatusItem, type SyncSettings, type SyncStatus } from './controller';

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
