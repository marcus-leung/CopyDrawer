import { useEffect, useState } from 'react';
import { getShortcuts, type CommandName, type Shortcuts } from './shortcuts';

/** Shortcut labels for the UI, or null until Chrome answers; read again when the window regains focus, in case they were changed. */
export function useShortcuts(): Shortcuts | null {
  const [keys, setKeys] = useState<Shortcuts | null>(null);
  useEffect(() => {
    const read = () => void getShortcuts().then(setKeys, () => {});
    read();
    window.addEventListener('focus', read);
    return () => window.removeEventListener('focus', read);
  }, []);
  return keys;
}

/** A shortcut's label, or an ellipsis while it loads. */
export const keyLabel = (keys: Shortcuts | null, name: CommandName) => keys?.[name] ?? '…';
