import { storage } from '#imports';
import type { JoinWith } from './join';
import { normalizeSite } from './exclusions';

export type ThemePref = 'system' | 'light' | 'dark';
export type FontPref = 'default' | 'mono';
export type TextSize = 90 | 100 | 115 | 130;
const TEXT_SIZES: TextSize[] = [90, 100, 115, 130];
export type PopupSize = 'small' | 'medium' | 'large';
const POPUP_SIZES: PopupSize[] = ['small', 'medium', 'large'];
/** Font stacks for the non-default fonts (the default comes from the stylesheet). */
export const FONT_STACKS: Record<Exclude<FontPref, 'default'>, string> = {
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

export interface Settings {
  /** Delete unpinned clips older than this many days. 0 = never. */
  retentionDays: 0 | 30 | 90;
  theme: ThemePref;
  font: FontPref;
  textSize: TextSize;
  popupSize: PopupSize;
  /** Also needs the all-sites permission. */
  autoSave: boolean;
  /** Time (ms) auto-save resumes. 0 = not paused. */
  pausedUntil: number;
  blockedSites: string[];
  saveInIncognito: boolean;
  dismissedTips: string[];
  /** When clips were last exported from this computer. 0 = never. */
  lastExportAt: number;
  /** The export reminder shows from this time (0 = not scheduled yet). */
  backupRemindAfter: number;
  backupReminder: boolean;
  joinWith: JoinWith;
  /** Blurs clip text in lists until pointed at, for screen sharing. This computer only. */
  hidePreviews: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  retentionDays: 0,
  theme: 'light',
  font: 'default',
  textSize: 100,
  popupSize: 'medium',
  autoSave: false,
  pausedUntil: 0,
  blockedSites: [],
  saveInIncognito: false,
  dismissedTips: [],
  lastExportAt: 0,
  backupRemindAfter: 0,
  backupReminder: true,
  joinWith: 'line',
  hidePreviews: false,
};

export const PAUSE_MS = 60 * 60 * 1000;

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export async function getSettings(): Promise<Settings> {
  const s = { ...DEFAULT_SETTINGS, ...(await settingsItem.getValue()) };
  return s.font === 'mono' ? s : { ...s, font: 'default' };
}

let writing: Promise<unknown> = Promise.resolve();

/** Changes some settings. Writes from this page run one after another, so two quick changes can't undo each other. */
export function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const write = async () => {
    const next = { ...(await getSettings()), ...patch };
    await settingsItem.setValue(next);
    if (Object.keys(patch).some((k) => (SYNCED_KEYS as readonly string[]).includes(k))) await pushSyncedSettings(next);
    return next;
  };
  const run = writing.then(write, write);
  writing = run;
  return run;
}

// ---------- Sync between computers (chrome.storage.sync) ----------

/** Settings that follow the user to other computers. Auto-save, pause and tips stay per computer. */
const SYNCED_KEYS = ['retentionDays', 'theme', 'font', 'textSize', 'popupSize', 'blockedSites', 'saveInIncognito'] as const;
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
  // A stored 'system' font reads as 'default'.
  if (r.font === 'default' || r.font === 'system' || r.font === 'mono') out.font = r.font === 'mono' ? 'mono' : 'default';
  if (TEXT_SIZES.includes(r.textSize as TextSize)) out.textSize = r.textSize as TextSize;
  if (POPUP_SIZES.includes(r.popupSize as PopupSize)) out.popupSize = r.popupSize as PopupSize;
  if (Array.isArray(r.blockedSites))
    out.blockedSites = [...new Set(r.blockedSites.flatMap((x) => (typeof x === 'string' ? (normalizeSite(x) ?? []) : [])))].slice(
      0,
      500,
    );
  if (typeof r.saveInIncognito === 'boolean') out.saveInIncognito = r.saveInIncognito;
  return out;
}

/** Chrome sync's limit for one item, less room for the key. */
const SYNC_ITEM_BYTES = 8_000;

/** The synced copy, with the most recent blocked sites that fit in one sync item when the list is long. */
export function syncedCopy(s: Settings, updatedAt: number): SyncedSettings {
  const copy: SyncedSettings = { ...pickSynced(s), updatedAt };
  let keep = copy.blockedSites.length;
  while (new TextEncoder().encode(JSON.stringify(copy)).length > SYNC_ITEM_BYTES && keep > 0) {
    keep = Math.floor(keep * 0.9);
    copy.blockedSites = s.blockedSites.slice(-keep);
  }
  return copy;
}

async function pushSyncedSettings(s: Settings): Promise<void> {
  const updatedAt = Date.now();
  const before = await syncedAtItem.getValue();
  try {
    // Mark it as ours first: the background watches sync and would otherwise take this write for another computer's.
    await syncedAtItem.setValue(updatedAt);
    await syncedSettingsItem.setValue(syncedCopy(s, updatedAt));
  } catch (e) {
    // Sync turned off or over quota: settings still work on this computer, and the next change tries again.
    await syncedAtItem.setValue(before);
    console.warn('Settings not synced', e);
  }
}

/**
 * Applies settings changed on another computer, if newer than what this one has. Returns true when something
 * changed here. Nothing is published until the user changes a setting: right after install, sync may not have
 * arrived yet, and publishing this computer's defaults then would overwrite the user's real settings everywhere.
 */
export async function pullSyncedSettings(): Promise<boolean> {
  const remote = await syncedSettingsItem.getValue();
  if (!remote) return false;
  if (typeof remote.updatedAt !== 'number' || remote.updatedAt <= (await syncedAtItem.getValue())) return false;
  await settingsItem.setValue({ ...(await getSettings()), ...validSynced(remote) });
  await syncedAtItem.setValue(remote.updatedAt);
  return true;
}

export function isPaused(s: Settings, now = Date.now()): boolean {
  return s.pausedUntil > now;
}
