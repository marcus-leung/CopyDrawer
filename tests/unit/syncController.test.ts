import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ClipDatabase } from '@/lib/db';
import { saveClip } from '@/lib/clips';
import { DriveError, type Drive } from '@/lib/sync/drive';
import { FakeDrive } from './fakeDrive';

/** Web Locks, as Chrome has them: one holder per name, others wait their turn; `ifAvailable` gets null instead. */
function stubLocks() {
  const held = new Map<string, Promise<void>>();
  type Fn = (lock: object | null) => Promise<unknown>;
  vi.stubGlobal('navigator', {
    ...navigator,
    locks: {
      request: async (name: string, a: { ifAvailable?: boolean } | Fn, b?: Fn) => {
        const [opts, fn] = typeof a === 'function' ? [{}, a] : [a, b!];
        if (opts.ifAvailable && held.has(name)) return fn(null);
        while (held.has(name)) await held.get(name);
        let release!: () => void;
        held.set(name, new Promise<void>((r) => (release = r)));
        try {
          return await fn({ name });
        } finally {
          held.delete(name);
          release();
        }
      },
    },
  });
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
    await b.as(() => sync.turnOffSync({ eraseDrive: true }, b.db, b.client));
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

  it('turning off during a long first sync stops it, and the erase holds', async () => {
    const a = await computer();
    for (let i = 0; i < 80; i++) await saveClip({ text: `clip ${i}` }, a.db);
    await a.setUp();
    const slow: Drive = {
      ...a.client,
      create: async (...args) => {
        await new Promise((r) => setTimeout(r, 5));
        return a.client.create(...args);
      },
    };
    await a.as(async () => {
      const running = sync.runSync(a.db, slow);
      await vi.waitFor(() => expect(drive.calls.create).toBeGreaterThan(3));
      await sync.turnOffSync({ eraseDrive: true }, a.db, a.client);
      await running;
    });
    await new Promise((r) => setTimeout(r, 50));
    // It stopped well short of uploading all 80.
    expect(drive.calls.create).toBeLessThan(60);
    expect(drive.files.size).toBe(0);
    expect(await a.status()).toEqual({ state: 'off' });
    expect(await a.as(() => sync.syncSettingsItem.getValue())).toEqual({ on: false });
  });

  it('turning off with erase says so when part of the Drive copy could not be deleted', async () => {
    const a = await computer();
    await saveClip({ text: 'x' }, a.db);
    await a.setUp();
    await a.run();
    let removes = 0;
    const flaky: Drive = {
      ...a.client,
      remove: async (id) => (++removes === 2 ? Promise.reject(new Error('network went away')) : a.client.remove(id)),
    };
    await expect(a.as(() => sync.turnOffSync({ eraseDrive: true }, a.db, flaky))).rejects.toThrow('network went away');
    expect(await a.as(() => sync.syncSettingsItem.getValue())).toEqual({ on: false });
    expect(drive.byName('copy')).toBeUndefined();
  });

  it('when two computers make a marker at the same moment, both end up on the oldest', async () => {
    const a = await computer();
    drive.afterCreate = async (file) => {
      if (file.name !== 'copy' || drive.files.has('f-older')) return;
      const data = new TextEncoder().encode(JSON.stringify({ v: 1, copyId: 'older-copy' }));
      drive.files.set('f-older', { id: 'f-older', name: 'copy', data, createdTime: '2000-01-01T00:00:00.000Z' });
    };
    await a.setUp();
    drive.afterCreate = undefined;
    expect(await a.as(() => sync.syncSettingsItem.getValue())).toEqual({ on: true, copyId: 'older-copy', copyFileId: 'f-older' });
    expect(drive.allNamed('copy')).toHaveLength(1);
    await a.run();
    expect((await a.status()).state).toBe('idle');
  });

  it('finishes setting up in the background, as the popup closes when Chrome asks to sign in', async () => {
    const a = await computer();
    const getAuthToken = vi.fn(async () => ({ token: 't' }));
    vi.stubGlobal('chrome', { identity: { getAuthToken } });
    await a.as(async () => {
      await sync.finishSetup(a.db, a.client);
      expect((await sync.syncSettingsItem.getValue()).on).toBe(false);
      await sync.requestSetup(true);
      await sync.finishSetup(a.db, a.client);
      expect(await sync.setupPendingItem.getValue()).toBe(false);
    });
    expect(getAuthToken).toHaveBeenCalledWith({ interactive: true, scopes: [sync.SCOPE] });
    expect((await a.as(() => sync.syncSettingsItem.getValue())).on).toBe(true);

    getAuthToken.mockRejectedValue(new Error('The user did not approve access.'));
    const b = await computer();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await b.as(async () => {
      await sync.requestSetup(true);
      await sync.finishSetup(b.db, b.client);
      expect(await sync.setupPendingItem.getValue()).toBe(false);
      expect((await sync.syncSettingsItem.getValue()).on).toBe(false);
      expect((await sync.syncStatusItem.getValue()).message).toMatch(/Couldn't sign in/);
    });
  });

  it('brings every clip back from Drive when Chrome loses the database', async () => {
    const a = await computer();
    for (let i = 0; i < 4; i++) await saveClip({ text: `kept ${i}` }, a.db);
    await a.setUp();
    await a.run();
    await a.run();
    // A fresh, empty database, as after Chrome discards one; extension storage still says sync is on.
    const fresh = new ClipDatabase(`test-${crypto.randomUUID()}`);
    await fresh.open();
    await a.as(() => sync.runSync(fresh, a.client));
    expect((await fresh.clips.toArray()).map((c) => c.text).sort()).toEqual(['kept 0', 'kept 1', 'kept 2', 'kept 3']);
  });
});
