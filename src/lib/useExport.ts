import { useCallback, useRef, useState } from 'react';
import { downloadBackup } from './backup';

/** Export with feedback: one at a time, and a message either way. */
export function useExport(notify: (message: string) => void) {
  const [exporting, setExporting] = useState(false);
  const busy = useRef(false);
  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setExporting(true);
    try {
      const n = await downloadBackup();
      notify(`Exported ${n} ${n === 1 ? 'clip' : 'clips'}`);
    } catch (e) {
      console.warn('Export failed', e);
      notify("Couldn't export. Try again.");
    } finally {
      busy.current = false;
      setExporting(false);
    }
  }, [notify]);
  return { exporting, run };
}
