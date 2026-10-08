import { useEffect } from 'react';
import { FONT_STACKS, getSettings, settingsItem, validSynced, type Settings } from './settings';

type Appearance = Pick<Settings, 'theme' | 'font' | 'textSize'>;

const DEFAULT: Appearance = { theme: 'system', font: 'default', textSize: 100 };
const CACHE_KEY = 'appearance';

function apply(a: Appearance) {
  const root = document.documentElement;
  const dark = a.theme === 'dark' || (a.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  if (a.font === 'default') {
    delete root.dataset.font;
    root.style.removeProperty('--font-sans');
    root.style.removeProperty('--font-display');
  } else {
    root.dataset.font = a.font;
    root.style.setProperty('--font-sans', FONT_STACKS[a.font]);
    root.style.setProperty('--font-display', FONT_STACKS[a.font]);
  }
  // zoom scales text, spacing and icons together, so layouts keep their proportions.
  root.style.zoom = a.textSize === 100 ? '' : String(a.textSize / 100);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(a));
  } catch {
    // Storage unavailable: the appearance still applies once settings load.
  }
}

/** Applies the last known theme, font and size before the first paint, so nothing flashes or jumps. */
export function applyCachedAppearance() {
  let cached: unknown;
  try {
    cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
  } catch {
    cached = null;
  }
  apply({ ...DEFAULT, ...validSynced(cached) });
}

/** Keeps the page in sync with the saved theme, font and text size, and with the system color scheme. */
export function useAppearance() {
  useEffect(() => {
    let current = DEFAULT;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMedia = () => apply(current);
    const set = (s: Settings | null) => {
      const { theme, font, textSize } = { ...DEFAULT, ...validSynced(s) };
      current = { theme, font, textSize };
      apply(current);
    };
    void getSettings().then(set);
    const unwatch = settingsItem.watch(set);
    media.addEventListener('change', onMedia);
    return () => {
      unwatch();
      media.removeEventListener('change', onMedia);
    };
  }, []);
}
