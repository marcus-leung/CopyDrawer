import { storage } from '#imports';

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  /** Delete unpinned clips older than this many days. 0 = never. */
  retentionDays: 0 | 30 | 90;
  theme: ThemePref;
  /** Also needs the all-sites permission. */
  autoSave: boolean;
  /** Time (ms) auto-save resumes. 0 = not paused. */
  pausedUntil: number;
  blockedSites: string[];
  saveInIncognito: boolean;
  dismissedTips: string[];
  onboarded: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  retentionDays: 0,
  theme: 'system',
  autoSave: false,
  pausedUntil: 0,
  blockedSites: [],
  saveInIncognito: false,
  dismissedTips: [],
  onboarded: false,
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
  if (Object.keys(patch).some((k) => (SYNCED_KEYS as readonly string[]).includes(k))) await pushSyncedSettings(next);
  return next;
}

// ---------- Sync between computers (chrome.storage.sync) ----------

/** Settings that follow the user to other computers. Auto-save, pause and tips stay per computer. */
const SYNCED_KEYS = ['retentionDays', 'theme', 'blockedSites', 'saveInIncognito'] as const;
type SyncedKey = (typeof SYNCED_KEYS)[number];
type SyncedSettings = Pick<Settings, SyncedKey> & { updatedAt: number };

export const syncedSettingsItem = storage.defineItem<SyncedSettings | null>('sync:settings', { fallback: null });
/** The `updatedAt` of the synced copy this computer last applied or wrote. */
const syncedAtItem = storage.defineItem<number>('local:settingsSyncedAt', { fallback: 0 });

function pickSynced(s: Settings): Pick<Settings, SyncedKey> {
  return Object.fromEntries(SYNCED_KEYS.map((k) => [k, s[k]])) as Pick<Settings, SyncedKey>;
}

/** Keeps only well-formed values from another computer's copy. */
export function validSynced(remote: unknown): Partial<Pick<Settings, SyncedKey>> {
  const r = (remote ?? {}) as Record<string, unknown>;
  const out: Partial<Pick<Settings, SyncedKey>> = {};
  if (r.retentionDays === 0 || r.retentionDays === 30 || r.retentionDays === 90) out.retentionDays = r.retentionDays;
  if (r.theme === 'system' || r.theme === 'light' || r.theme === 'dark') out.theme = r.theme;
  if (Array.isArray(r.blockedSites))
    out.blockedSites = r.blockedSites.filter((x): x is string => typeof x === 'string').slice(0, 500);
  if (typeof r.saveInIncognito === 'boolean') out.saveInIncognito = r.saveInIncognito;
  return out;
}

async function pushSyncedSettings(s: Settings): Promise<void> {
  const updatedAt = Date.now();
  try {
    await syncedSettingsItem.setValue({ ...pickSynced(s), updatedAt });
    await syncedAtItem.setValue(updatedAt);
  } catch (e) {
    // Sync quota or sync turned off: settings still work on this computer.
    console.warn('Settings not synced', e);
  }
}

/**
 * Applies settings changed on another computer, if newer than what this one
 * has. The first computer to run publishes its settings. Returns true when
 * something changed here.
 */
export async function pullSyncedSettings(): Promise<boolean> {
  const remote = await syncedSettingsItem.getValue();
  if (!remote) {
    await pushSyncedSettings(await getSettings());
    return false;
  }
  if (typeof remote.updatedAt !== 'number' || remote.updatedAt <= (await syncedAtItem.getValue())) return false;
  await settingsItem.setValue({ ...(await getSettings()), ...validSynced(remote) });
  await syncedAtItem.setValue(remote.updatedAt);
  return true;
}

export function isPaused(s: Settings, now = Date.now()): boolean {
  return s.pausedUntil > now;
}
