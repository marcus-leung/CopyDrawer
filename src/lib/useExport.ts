import { useCallback, useSyncExternalStore } from 'react';
import { downloadBackup } from './backup';

// One export at a time on this page, whichever screen started it.
let running: Promise<void> | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const setRunning = (p: Promise<void> | null) => {
  running = p;
  listeners.forEach((l) => l());
};

/** Export with feedback: one at a time, and a message either way. */
export function useExport(notify: (message: string) => void) {
  const exporting = useSyncExternalStore(subscribe, () => running !== null);
  const run = useCallback(() => {
    if (running) return running;
    const p = downloadBackup()
      .then((n) => notify(`Exported ${n} ${n === 1 ? 'clip' : 'clips'}`))
      .catch((e: unknown) => {
        console.warn('Export failed', e);
        notify("Couldn't export. Try again.");
      })
      .finally(() => setRunning(null));
    setRunning(p);
    return p;
  }, [notify]);
  return { exporting, run };
}
