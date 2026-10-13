/**
 * Keeps clips safe when the disk fills up. Once Chrome's database hits a disk error, any later write
 * (even after space is freed) can make Chrome throw the whole database away at a later start.
 * So saves stop short of a full disk; after a disk error every write stops until Chrome restarts,
 * and the first start after that copies everything into a fresh database (see rebuild.ts).
 */

/** Saving was refused: the disk is almost full. */
export class StorageFullError extends Error {
  override name = 'StorageFullError';
}

/** Writes are stopped until Chrome restarts, after the database reported a disk error. */
export class StoragePausedError extends Error {
  override name = 'StoragePausedError';
}

const MIN_FREE_BYTES = 50 * 1024 * 1024;
const PAUSED_KEY = 'storagePaused';
const LOW_KEY = 'storageLow';
/** In local storage, so it outlasts the restart: 'needed', then 'copied' once the rescue copy is complete. */
export const REBUILD_KEY = 'dbRebuild';
export const REBUILD_ALARM = 'mark-db-rebuild';
/** Test builds only: a smaller margin, so tests can fill a small disk past it. */
const E2E_MIN_FREE_KEY = 'e2eMinFreeBytes';

/** disk: a disk error this session. rebuilding: moving the clips to fresh storage. failed: that move failed. */
type PauseReason = 'disk' | 'rebuilding' | 'failed';
let paused = false;
let diskFailed = false;
let startup: Promise<unknown> = Promise.resolve();

const session = () => (typeof browser === 'undefined' ? undefined : browser.storage?.session);

void session()
  ?.get(PAUSED_KEY)
  .then((r) => (paused ||= !!r[PAUSED_KEY]))
  .catch(() => {});
session()?.onChanged.addListener((changes) => {
  if (PAUSED_KEY in changes) paused = !!changes[PAUSED_KEY]!.newValue;
});

export const writesPaused = () => paused;

/** Saves wait for this first (the background's start-up rebuild check). */
export function holdSavesUntil(p: Promise<unknown>) {
  startup = p.catch(() => {});
}

/**
 * Stops all writes in every extension page: until Chrome restarts after a disk error (session storage is
 * cleared then), or while the database is being rebuilt.
 */
export function pauseWrites(reason: PauseReason = 'disk') {
  if (diskFailed && reason !== 'failed') return;
  paused = true;
  void session()
    ?.set({ [PAUSED_KEY]: reason })
    .catch(() => {});
  if (reason !== 'disk') return;
  diskFailed = true;
  console.warn('Disk error: saving is paused until Chrome restarts, to protect your clips.');
  void markRebuildNeeded();
  void browser.alarms?.create(REBUILD_ALARM, { periodInMinutes: 0.5 });
}

export function resumeWrites() {
  paused = false;
  void session()
    ?.remove(PAUSED_KEY)
    .catch(() => {});
}

/**
 * Records that the next start must rebuild the database. Only once there's room again, since a write
 * to a full disk is what started this. Retried on an alarm until it's written.
 */
export async function markRebuildNeeded(): Promise<void> {
  if (await lowOnSpace(0)) return;
  try {
    await browser.storage.local.set({ [REBUILD_KEY]: 'needed' });
    await browser.alarms?.clear(REBUILD_ALARM);
  } catch {}
}

/** An error from the database that means the disk is full or failing. */
export function isDiskFailure(e: unknown, depth = 0): boolean {
  if (!e || typeof e !== 'object' || depth > 3) return false;
  const { name, message, inner } = e as { name?: string; message?: string; inner?: unknown };
  if (name === 'QuotaExceededError' || name === 'UnknownError') return true;
  if (/IO error|FILE_ERROR_NO_SPACE|No space left/i.test(message ?? '')) return true;
  return isDiskFailure(inner, depth + 1);
}

/** Throws unless there's room to save `bytes` more. Call before a save's transaction, never inside one. */
export async function ensureSpace(bytes = 0): Promise<void> {
  await startup;
  if (paused) throw new StoragePausedError();
  if (await lowOnSpace(bytes)) {
    void session()
      ?.set({ [LOW_KEY]: true })
      .catch(() => {});
    throw new StorageFullError();
  }
}

async function lowOnSpace(bytes: number): Promise<boolean> {
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  if (estimate?.quota == null || estimate.usage == null) return false;
  let min = MIN_FREE_BYTES;
  if (__E2E__) min = ((await session()?.get(E2E_MIN_FREE_KEY))?.[E2E_MIN_FREE_KEY] as number | undefined) ?? min;
  return estimate.quota - estimate.usage < min + bytes;
}

/** A save worked, so the disk has room again. */
export function clearLowSpace() {
  void session()
    ?.remove(LOW_KEY)
    .catch(() => {});
}

/** What to tell the user when a save failed for lack of space, or null for other failures. */
export function storageProblem(e: unknown): { title: string; detail: string } | null {
  if (e instanceof StorageFullError)
    return {
      title: 'Not saved: your computer is almost out of space',
      detail: 'Free up some disk space. Your saved clips are safe.',
    };
  if (e instanceof StoragePausedError || isDiskFailure(e))
    return { title: 'Not saved: saving is paused to protect your clips', detail: 'Free up disk space, then restart Chrome.' };
  return null;
}

/** Why saving is stopped in this Chrome session, if it is, for the panel's notice. */
export async function storageState(): Promise<PauseReason | 'low' | 'ok'> {
  const r =
    (await session()
      ?.get([PAUSED_KEY, LOW_KEY])
      .catch(() => undefined)) ?? {};
  return (r[PAUSED_KEY] as PauseReason | undefined) ?? (r[LOW_KEY] === true ? 'low' : 'ok');
}

export const STORAGE_STATE_KEYS = [PAUSED_KEY, LOW_KEY];
