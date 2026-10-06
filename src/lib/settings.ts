import { storage } from '#imports';

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  /** Delete unpinned clips older than this many days. 0 = never. */
  retentionDays: 0 | 30 | 90;
  theme: ThemePref;
  /** User wants copies saved automatically (also needs the all-sites permission). */
  autoSave: boolean;
  /** Auto-save is paused until this time (ms). 0 = not paused. */
  pausedUntil: number;
  /** Hostnames the user blocked, e.g. "mail.example.com". */
  blockedSites: string[];
  /** Save copies made in incognito windows. */
  saveInIncognito: boolean;
  /** Use the on-device AI model for sorting and search by meaning (downloads ~25 MB once). */
  smartModel: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  retentionDays: 0,
  theme: 'system',
  autoSave: false,
  pausedUntil: 0,
  blockedSites: [],
  saveInIncognito: false,
  smartModel: true,
};

export const PAUSE_MS = 60 * 60 * 1000;

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await settingsItem.getValue()) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await settingsItem.setValue(next);
  return next;
}

export function isPaused(s: Settings, now = Date.now()): boolean {
  return s.pausedUntil > now;
}
