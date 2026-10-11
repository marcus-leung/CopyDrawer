import { useEffect, useState } from 'react';
import { getShortcuts, NO_SHORTCUTS, type Shortcuts } from './shortcuts';

/** Shortcut labels for the UI; read again when the window regains focus, in case they were changed in Chrome. */
export function useShortcuts(): Shortcuts {
  const [keys, setKeys] = useState(NO_SHORTCUTS);
  useEffect(() => {
    const read = () => void getShortcuts().then(setKeys);
    read();
    window.addEventListener('focus', read);
    return () => window.removeEventListener('focus', read);
  }, []);
  return keys;
}
