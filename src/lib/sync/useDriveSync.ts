import { useEffect, useState } from 'react';
import { syncSettingsItem, syncStatusItem, type SyncSettings, type SyncStatus } from './controller';

/** Drive sync's settings and status, live. Null until read. */
export function useDriveSync(): { settings: SyncSettings; status: SyncStatus } | null {
  const [state, setState] = useState<{ settings: SyncSettings; status: SyncStatus } | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () =>
      void Promise.all([syncSettingsItem.getValue(), syncStatusItem.getValue()]).then(
        ([settings, status]) => alive && setState({ settings, status }),
      );
    read();
    const unwatch = [syncSettingsItem.watch(read), syncStatusItem.watch(read)];
    return () => {
      alive = false;
      unwatch.forEach((u) => u());
    };
  }, []);
  return state;
}
