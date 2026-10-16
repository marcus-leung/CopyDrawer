import { useEffect, useState } from 'react';
import { getSettings, settingsItem, type Settings } from './settings';

export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    let alive = true;
    void getSettings().then((s) => alive && setSettings(s));
    const unwatch = settingsItem.watch(() => void getSettings().then((s) => alive && setSettings(s)));
    return () => {
      alive = false;
      unwatch();
    };
  }, []);
  return settings;
}

/** Re-renders once the given time passes (used to end "paused" states). */
export function useNowUntil(until: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const ms = until - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), Math.min(ms + 50, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [until]);
  return now;
}
