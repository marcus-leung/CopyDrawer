import { storage } from '#imports';
import { db as defaultDb, type ClipDatabase } from '../db';
import { StoragePausedError, whenStateKnown, writesPaused } from '../storageGuard';
import { DriveError, ignoreGone, restDrive, type Drive, type TokenSource } from './drive';
import {
  COPY_FILE,
  CopyChangedError,
  markAllForUpload,
  SyncCancelled,
  syncOnce,
  type SyncCursor,
  type SyncProgress,
} from './engine';

/**
 * Turning Drive sync on and off, and running it. The background runs a sync every minute while it's on,
 * and finishes setting it up once the panel asks: signing in needs the person.
 */

export const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const SYNC_ALARM = 'drive-sync';
const LOCK = 'drive-sync';

export interface SyncSettings {
  on: boolean;
  /** The Drive copy this computer syncs with. Cleared when that copy is deleted or replaced elsewhere. */
  copyId?: string;
  copyFileId?: string;
}

/**
 * off: not set up. idle: in step. syncing: under way. signin: sign in again. stopped: the Drive copy was deleted or
 * replaced elsewhere; waits for Sync again. drive-full: Drive is out of space. offline: will retry. error: something else.
 */
export type SyncState = 'off' | 'idle' | 'syncing' | 'signin' | 'stopped' | 'drive-full' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  lastSyncAt?: number;
  progress?: SyncProgress;
  /** Why the last attempt failed, in words for the person. */
  message?: string;
}

export const syncSettingsItem = storage.defineItem<SyncSettings>('local:driveSync', { fallback: { on: false } });
export const syncStatusItem = storage.defineItem<SyncStatus>('local:driveSyncStatus', { fallback: { state: 'off' } });
/** Set by the panel before it asks for sign-in permission; the background finishes setting up, as the popup may close. */
export const setupPendingItem = storage.defineItem<boolean>('local:driveSyncSetup', { fallback: false });

const cursorOf = (db: ClipDatabase) => ({
  get: async (): Promise<SyncCursor> => {
    const { key: _, ...cursor } = (await db.syncState.get('cursor')) ?? { key: 'cursor' };
    return cursor;
  },
  set: (patch: Partial<SyncCursor>) =>
    db.transaction('rw', db.syncState, async () => {
      await db.syncState.put({ ...(await db.syncState.get('cursor')), ...patch, key: 'cursor' });
    }),
  clear: () => db.syncState.delete('cursor'),
});

/** The Google account's token from Chrome. `refresh` drops the cached one first. */
export const chromeToken: TokenSource = async (refresh) => {
  if (__E2E__) {
    const { e2eDriveToken } = await browser.storage.session.get('e2eDriveToken');
    if (typeof e2eDriveToken === 'string') return e2eDriveToken;
  }
  const get = async () => (await chrome.identity.getAuthToken({ interactive: false, scopes: [SCOPE] })).token;
  try {
    if (refresh) {
      const old = await get().catch(() => undefined);
      if (old) await chrome.identity.removeCachedAuthToken({ token: old });
    }
    const token = await get();
    if (token) return token;
  } catch {
    // Falls through: signing in needs the person.
  }
  throw new DriveError('auth', 'Not signed in');
};

/** Chrome's sign-in prompt for Drive access. Call from a click. */
export async function signIn(): Promise<void> {
  if (__E2E__ && (await browser.storage.session.get('e2eDriveToken')).e2eDriveToken) return;
  const { token } = await chrome.identity.getAuthToken({ interactive: true, scopes: [SCOPE] });
  if (!token) throw new DriveError('auth', 'Sign-in was cancelled');
}

/** Whether this build can sign in to Google: it needs the OAuth client from the Google Cloud project. */
export const canSync = () => __E2E__ || !!browser.runtime.getManifest().oauth2?.client_id;

export async function defaultDrive(): Promise<Drive> {
  if (__E2E__) {
    const { e2eDriveBase } = await browser.storage.session.get('e2eDriveBase');
    if (typeof e2eDriveBase === 'string') return restDrive(chromeToken, e2eDriveBase);
  }
  return restDrive(chromeToken);
}

/**
 * Turns sync on, or back on after the Drive copy was deleted or replaced elsewhere: joins the copy in Drive,
 * or starts one. Everything here is then uploaded and merged at the next sync. Waits for a running sync.
 */
export async function setUpSync(db: ClipDatabase = defaultDb, drive?: Drive): Promise<void> {
  const d = drive ?? (await defaultDrive());
  await navigator.locks.request(LOCK, async () => {
    let file = await d.find(COPY_FILE);
    if (!file) {
      const made = await d.create(COPY_FILE, encodeCopy(crypto.randomUUID()));
      // Another computer may have made one at the same moment: the oldest is the copy, and the other goes.
      file = (await d.find(COPY_FILE)) ?? made;
      if (file.id !== made.id) await d.remove(made.id).catch((e: unknown) => ignoreGone(e));
    }
    const { copyId } = JSON.parse(new TextDecoder().decode(await d.download(file.id))) as { copyId: string };
    await cursorOf(db).clear();
    await markAllForUpload(db);
    await syncSettingsItem.setValue({ on: true, copyId, copyFileId: file.id });
    await syncStatusItem.setValue({ state: 'syncing' });
  });
}

const encodeCopy = (copyId: string) => new TextEncoder().encode(JSON.stringify({ v: 1, copyId }));

/**
 * Turns sync off on this computer. Clips stay here; with `eraseDrive` the Drive copy is deleted too, its
 * marker first, so other computers stop before they see the rest go. A running sync stops first.
 * Throws if the Drive copy couldn't all be deleted; sync is off either way.
 */
export async function turnOffSync({ eraseDrive = false } = {}, db: ClipDatabase = defaultDb, drive?: Drive): Promise<void> {
  const { copyFileId } = await syncSettingsItem.getValue();
  // Off first: a running sync sees it between steps and stops, letting go of the lock.
  await syncSettingsItem.setValue({ on: false });
  await navigator.locks.request(LOCK, async () => {
    await cursorOf(db).clear();
    await syncStatusItem.setValue({ state: 'off' });
    if (eraseDrive) await eraseDriveCopy(drive ?? (await defaultDrive()), copyFileId);
  });
}

async function eraseDriveCopy(drive: Drive, copyFileId?: string) {
  const marker = copyFileId ?? (await drive.find(COPY_FILE))?.id;
  if (marker) await drive.remove(marker).catch((e: unknown) => ignoreGone(e));
  for (;;) {
    const { files } = await drive.list();
    if (!files.length) return;
    for (const f of files) await drive.remove(f.id).catch((e: unknown) => ignoreGone(e));
  }
}

/** The panel asks for setup before the sign-in permission prompt; the background then signs in and joins (`finishSetup`). */
export const requestSetup = (asked: boolean) => setupPendingItem.setValue(asked);

/**
 * Signs in and turns sync on, or back on, if the panel asked for it. Runs in the background, which outlives
 * the popup that Google's sign-in window closes.
 */
export async function finishSetup(db: ClipDatabase = defaultDb, drive?: Drive): Promise<void> {
  await navigator.locks.request('drive-sync-setup', async () => {
    if (!(await setupPendingItem.getValue())) return;
    try {
      await signIn();
      const settings = await syncSettingsItem.getValue();
      if (settings.on && settings.copyId) await runSync(db, drive);
      else await setUpSync(db, drive);
    } catch (e) {
      console.warn('Turning on Drive sync failed', e);
      const status = await syncStatusItem.getValue();
      await syncStatusItem.setValue({ ...status, message: "Couldn't sign in to Google. Try again." });
    } finally {
      await setupPendingItem.setValue(false);
    }
  });
}

let running = false;
let again = false;

/**
 * Syncs now. Asked for while a sync runs in this worker, it runs once more right after, so a change made
 * meanwhile doesn't wait for the next minute. Waits while setup or turning off holds the lock.
 */
export async function runSync(db: ClipDatabase = defaultDb, drive?: Drive): Promise<void> {
  if (running) return void (again = true);
  running = true;
  try {
    await whenStateKnown();
    await navigator.locks.request(LOCK, async () => {
      do {
        again = false;
        await syncAndRecord(db, drive);
      } while (again);
    });
  } finally {
    running = false;
  }
}

/** One sync, with how it went recorded in the status. */
async function syncAndRecord(db: ClipDatabase, drive?: Drive) {
  const settings = await syncSettingsItem.getValue();
  if (!settings.on || !settings.copyId || !settings.copyFileId) return;
  // Sync waits while writing is stopped to protect the clips.
  if (writesPaused()) return;
  const { copyId, copyFileId } = settings;
  const stillOn = async () => {
    const now = await syncSettingsItem.getValue();
    return now.on && now.copyId === copyId;
  };
  const status = await syncStatusItem.getValue();
  let progressAt = 0;
  // Progress is written in order and finished before the outcome, which must be the last word.
  let progressWrites = Promise.resolve();
  try {
    await syncStatusItem.setValue({ ...status, state: 'syncing', progress: undefined, message: undefined });
    await syncOnce({
      db,
      drive: drive ?? (await defaultDrive()),
      copyId,
      copyFileId,
      cursor: cursorOf(db),
      stillOn,
      onProgress: (progress) => {
        if (Date.now() - progressAt < 500 && progress.done < progress.total) return;
        progressAt = Date.now();
        progressWrites = progressWrites.then(() => syncStatusItem.setValue({ ...status, state: 'syncing', progress }));
      },
    });
    await progressWrites;
    if (await stillOn()) await syncStatusItem.setValue({ state: 'idle', lastSyncAt: Date.now() });
  } catch (e) {
    await progressWrites.catch(() => {});
    // Turned off or set up again meanwhile: whoever did that has the last word.
    if (e instanceof SyncCancelled || !(await stillOn())) return;
    await syncStatusItem.setValue({ ...status, progress: undefined, ...failure(e) });
    if (e instanceof CopyChangedError) {
      // Nothing more runs until the person chooses Sync again.
      await syncSettingsItem.setValue({ on: true });
      await cursorOf(db).clear();
    }
  }
}

function failure(e: unknown): Pick<SyncStatus, 'state' | 'message'> {
  if (e instanceof CopyChangedError) return { state: 'stopped' };
  if (e instanceof StoragePausedError) return { state: 'idle' };
  if (e instanceof DriveError) {
    if (e.kind === 'auth') return { state: 'signin' };
    if (e.kind === 'full') return { state: 'drive-full' };
    if (e.kind === 'offline' || e.kind === 'retry') return { state: 'offline' };
  }
  console.warn('Drive sync failed', e);
  return { state: 'error', message: e instanceof Error ? e.message : String(e) };
}
