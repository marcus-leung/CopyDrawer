import { useEffect } from 'react';
import { getSettings, settingsItem, type ThemePref } from './settings';

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/** Keeps <html data-theme> in sync with the saved preference and the system setting. */
export function useTheme() {
  useEffect(() => {
    let pref: ThemePref = 'system';
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMedia = () => apply(pref);
    void getSettings().then((s) => {
      pref = s.theme;
      apply(pref);
    });
    const unwatch = settingsItem.watch((s) => {
      pref = s?.theme ?? 'system';
      apply(pref);
    });
    media.addEventListener('change', onMedia);
    return () => {
      unwatch();
      media.removeEventListener('change', onMedia);
    };
  }, []);
}
