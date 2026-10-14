/**
 * Keeps clips safe when the disk fills up. Once Chrome's database hits a disk error, any later write
 * (even after space is freed) can make Chrome throw the whole database away at a later start.
 * So saves stop short of a full disk; after a disk error no write reaches the database until Chrome has
 * restarted and the clips have been moved to fresh storage (see rebuild.ts).
 *
 * Writes are allowed only once this page knows the state, and while neither of these is set:
 * - `storagePaused` (session storage): why writing is stopped in this Chrome session;
 * - `dbRebuild` (local storage, outlasts restarts): the database still has to be moved.
 */

/** Saving was refused: the disk is almost full. */
export class StorageFullError extends Error {
  override name = 'StorageFullError';
}

/** Writing is stopped to protect the clips (see PauseReason). */
export class StoragePausedError extends Error {
  override name = 'StoragePausedError';
}

/**
 * disk: a disk error in this Chrome session; restart Chrome. rebuilding: moving the clips to fresh storage.
 * space: the move needs more free space. failed: the move failed; the next start tries again.
 */
export type PauseReason = 'disk' | 'rebuilding' | 'space' | 'failed';

export const MIN_FREE_BYTES = 50 * 1024 * 1024;
const PAUSED_KEY = 'storagePaused';
const NEED_KEY = 'storageNeedBytes';
const LOW_KEY = 'storageLow';
/** In local storage: 'needed', then 'copied' once the rescue copy is complete. */
export const REBUILD_KEY = 'dbRebuild';
/** In session storage, set when Chrome starts: only then may the database be moved. */
export const REBUILD_ALLOWED_KEY = 'rebuildAllowed';
/** Retries writing the rebuild mark, and a move that's waiting for space. */
export const STORAGE_ALARM = 'storage-guard';
/** Test builds only: a smaller margin, so tests can fill a small disk past it. */
const E2E_MIN_FREE_KEY = 'e2eMinFreeBytes';

const area = (name: 'session' | 'local') => (typeof browser === 'undefined' ? undefined : browser.storage?.[name]);

let known = false;
let pauseReason: PauseReason | undefined;
let rebuildMarked = false;

const ready: Promise<void> = Promise.all([
  area('session')
    ?.get(PAUSED_KEY)
    .then((r) => (pauseReason ??= r[PAUSED_KEY] as PauseReason | undefined)),
  area('local')
    ?.get(REBUILD_KEY)
    .then((r) => (rebuildMarked ||= !!r[REBUILD_KEY])),
])
  .catch(() => {})
  .then(() => {
    known = true;
  });
area('session')?.onChanged.addListener((changes) => {
  if (PAUSED_KEY in changes) pauseReason = changes[PAUSED_KEY]!.newValue as PauseReason | undefined;
});
area('local')?.onChanged.addListener((changes) => {
  if (REBUILD_KEY in changes) rebuildMarked = !!changes[REBUILD_KEY]!.newValue;
});

/** Whether writing is stopped. Until `stateKnown()`, wait for `whenStateKnown()` first. */
export const writesPaused = () => !!pauseReason || rebuildMarked;
export const stateKnown = () => known;
export const whenStateKnown = () => ready;

/**
 * The database reported a disk error: stop every write in every page, and have the next start move the clips.
 * Not while the clips are being moved: deleting the old database closes connections and aborts writes everywhere.
 */
export function pauseForDiskError() {
  if (pauseReason) return;
  pauseReason = 'disk';
  console.warn('Disk error: saving is paused until Chrome restarts, to protect your clips.');
  void area('session')
    ?.set({ [PAUSED_KEY]: 'disk' satisfies PauseReason })
    .catch(() => {});
  void markRebuildNeeded();
  void browser.alarms?.create(STORAGE_ALARM, { periodInMinutes: 0.5 });
}

/** Records that the clips must move to fresh storage. Retried on the alarm until it's written. */
export async function markRebuildNeeded(): Promise<void> {
  try {
    await browser.storage.local.set({ [REBUILD_KEY]: 'needed' });
    rebuildMarked = true;
  } catch {
    // The disk is still full; the alarm tries again.
  }
}

export async function setPause(reason: PauseReason, needBytes?: number) {
  pauseReason = reason;
  await area('session')?.set({ [PAUSED_KEY]: reason, [NEED_KEY]: needBytes ?? 0 });
}

export async function clearPause() {
  pauseReason = undefined;
  await area('session')?.remove([PAUSED_KEY, NEED_KEY]);
}

/** An error from the database that means the disk is full or failing. */
export function isDiskFailure(e: unknown, depth = 0): boolean {
  if (!e || typeof e !== 'object' || depth > 3) return false;
  const { name, message, inner } = e as { name?: string; message?: string; inner?: unknown };
  if (name === 'QuotaExceededError' || name === 'UnknownError') return true;
  if (/IO error|FILE_ERROR_NO_SPACE|No space left/i.test(message ?? '')) return true;
  return isDiskFailure(inner, depth + 1);
}

/** Free space for this extension's storage, or null when Chrome can't say. */
export async function freeSpace(): Promise<{ free: number; usage: number } | null> {
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  if (estimate?.quota == null || estimate.usage == null) return null;
  return { free: estimate.quota - estimate.usage, usage: estimate.usage };
}

async function minFree(): Promise<number> {
  if (!__E2E__) return MIN_FREE_BYTES;
  return ((await area('session')?.get(E2E_MIN_FREE_KEY))?.[E2E_MIN_FREE_KEY] as number | undefined) ?? MIN_FREE_BYTES;
}

export async function lowOnSpace(bytes = 0): Promise<boolean> {
  const space = await freeSpace();
  return space != null && space.free < (await minFree()) + bytes;
}

/** Throws unless saving `bytes` more is allowed. Call before a save's transaction, never inside one. */
export async function ensureSpace(bytes = 0): Promise<void> {
  await ready;
  if (writesPaused()) throw new StoragePausedError();
  if (await lowOnSpace(bytes)) {
    void area('session')
      ?.set({ [LOW_KEY]: true })
      .catch(() => {});
    throw new StorageFullError();
  }
}

/** A save worked, so the disk has room again. */
export function clearLowSpace() {
  void area('session')
    ?.remove(LOW_KEY)
    .catch(() => {});
}

/** What to tell the user when a write failed to protect the clips, or null for other failures. */
export function storageProblem(
  e: unknown,
  action: 'saved' | 'deleted' | 'moved' | 'imported' = 'saved',
): { title: string; detail: string } | null {
  if (e instanceof StorageFullError)
    return {
      title: `Not ${action}: your computer is almost out of space`,
      detail: 'Free up some disk space. Your saved clips are safe.',
    };
  if (e instanceof StoragePausedError || isDiskFailure(e))
    return {
      title: `Not ${action}: saving is paused to protect your clips`,
      detail: 'See the CopyDrawer panel for what to do. Your saved clips are safe.',
    };
  return null;
}

export type StorageState = { reason: PauseReason | 'low' | 'ok'; needBytes: number };

/** Why saving is stopped, if it is, for the panel's notice. A "low" state is checked again, so it clears once there's room. */
export async function storageState(): Promise<StorageState> {
  await ready;
  const s =
    (await area('session')
      ?.get([PAUSED_KEY, NEED_KEY, LOW_KEY])
      .catch(() => undefined)) ?? {};
  const paused = s[PAUSED_KEY] as PauseReason | undefined;
  if (paused) return { reason: paused, needBytes: (s[NEED_KEY] as number | undefined) ?? 0 };
  // Marked but not paused this session: an update or reload since the disk error. Chrome must still restart.
  if (rebuildMarked) return { reason: 'disk', needBytes: 0 };
  if (s[LOW_KEY] === true) {
    if (await lowOnSpace()) return { reason: 'low', needBytes: 0 };
    clearLowSpace();
  }
  return { reason: 'ok', needBytes: 0 };
}

export const STORAGE_STATE_KEYS = [PAUSED_KEY, NEED_KEY, LOW_KEY, REBUILD_KEY];
