import { storage } from '#imports';

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  /** Delete unpinned clips older than this many days. 0 = never. */
  retentionDays: 0 | 30 | 90;
  theme: ThemePref;
}

export const DEFAULT_SETTINGS: Settings = {
  retentionDays: 0,
  theme: 'system',
};

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
