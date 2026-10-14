import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ClipDatabase } from '@/lib/db';
import { saveClip } from '@/lib/clips';
import { DriveError, type Drive } from '@/lib/sync/drive';
import { FakeDrive } from './fakeDrive';

/** Web Locks, as Chrome has them: `ifAvailable` gets null while another holder has the lock. */
function stubLocks() {
  const held = new Set<string>();
  vi.stubGlobal('navigator', {
    ...navigator,
    locks: {
      request: async (name: string, opts: { ifAvailable?: boolean }, fn: (lock: object | null) => Promise<void>) => {
        if (held.has(name)) return fn(null);
        held.add(name);
        try {
          return await fn({ name });
        } finally {
          held.delete(name);
        }
      },
    },
  });
  return held;
}

let drive: FakeDrive;
let sync: typeof import('@/lib/sync/controller');

/**
 * A computer: its own clips and extension storage. One test process holds one browser's storage,
 * so each step swaps this computer's storage in, runs, and saves it again.
 */
async function computer() {
  const db = new ClipDatabase(`test-${crypto.randomUUID()}`);
  await db.open();
  const client = drive.client();
  let saved: Record<string, unknown> = {};
  async function as<T>(fn: () => Promise<T>): Promise<T> {
    fakeBrowser.reset();
    await fakeBrowser.storage.local.set(saved);
    try {
      return await fn();
    } finally {
      saved = await fakeBrowser.storage.local.get();
    }
  }
  return {
    db,
    client,
    as,
    setUp: () => as(() => sync.setUpSync(db, client)),
    run: (d: Drive = client) => as(() => sync.runSync(db, d)),
    status: () => as(() => sync.syncStatusItem.getValue()),
  };
}

beforeEach(async () => {
  stubLocks();
  drive = new FakeDrive();
  sync = await import('@/lib/sync/controller');
});

describe('Drive sync controller', () => {
  it('starts a Drive copy, then another computer joins it', async () => {
    const a = await computer();
    await saveClip({ text: 'from a' }, a.db);
    await a.setUp();
    await a.run();
    expect(await a.status()).toMatchObject({ state: 'idle', lastSyncAt: expect.any(Number) });

    const b = await computer();
    await saveClip({ text: 'from b' }, b.db);
    await b.setUp();
    await b.run();
    await a.run();
    for (const c of [a, b]) expect((await c.db.clips.toArray()).map((x) => x.text).sort()).toEqual(['from a', 'from b']);
    expect([...drive.files.values()].filter((f) => f.name === 'copy')).toHaveLength(1);
  });

  it('says what went wrong, and syncs again once it can', async () => {
    const a = await computer();
    await a.setUp();
    const failing = (kind: DriveError['kind']): Drive => ({
      ...a.client,
      startPageToken: async () => Promise.reject(new DriveError(kind, kind)),
      changes: async () => Promise.reject(new DriveError(kind, kind)),
    });
    for (const [kind, state] of [
      ['auth', 'signin'],
      ['full', 'drive-full'],
      ['offline', 'offline'],
      ['failed', 'error'],
    ] as const) {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await a.run(failing(kind));
      expect((await a.status()).state).toBe(state);
    }
    await a.run();
    expect((await a.status()).state).toBe('idle');
  });

  it('runs once more after a sync asked for while one was running, never two at once', async () => {
    const a = await computer();
    await a.setUp();
    let running = 0;
    let most = 0;
    let calls = 0;
    let release!: () => void;
    /** Each sync starts with one of these: the first compares everything, later ones read the change list. */
    const start = async <T>(next: () => Promise<T>) => {
      calls++;
      most = Math.max(most, ++running);
      if (calls === 1) await new Promise<void>((r) => (release = r));
      running--;
      return next();
    };
    const slow: Drive = {
      ...a.client,
      startPageToken: () => start(() => a.client.startPageToken()),
      changes: (token) => start(() => a.client.changes(token)),
    };
    await a.as(async () => {
      const first = sync.runSync(a.db, slow);
      await vi.waitFor(() => expect(calls).toBe(1));
      await sync.runSync(a.db, slow);
      await sync.runSync(a.db, slow);
      release();
      await first;
    });
    expect(calls).toBe(2);
    expect(most).toBe(1);
  });

  it('when another computer deletes the Drive copy, this one stops, keeps its clips, and Sync again starts a new copy', async () => {
    const a = await computer();
    const b = await computer();
    await saveClip({ text: 'kept' }, a.db);
    await a.setUp();
    await a.run();
    await b.setUp();
    await b.run();
    await b.as(() => sync.turnOffSync({ eraseDrive: true }, b.client));
    expect(drive.files.size).toBe(0);
    expect(await b.status()).toEqual({ state: 'off' });

    await a.run();
    expect((await a.status()).state).toBe('stopped');
    expect(await a.db.clips.count()).toBe(1);
    // Nothing more runs by itself.
    await a.run();
    expect(drive.files.size).toBe(0);

    await a.setUp();
    await a.run();
    expect((await a.status()).state).toBe('idle');
    await b.setUp();
    await b.run();
    expect((await b.db.clips.toArray()).map((c) => c.text)).toEqual(['kept']);
  });
});
