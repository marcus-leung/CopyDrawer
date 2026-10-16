import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ClipDatabase } from '@/lib/db';
import { deleteClip, editClip, saveClip, togglePin } from '@/lib/clips';
import { saveImageClip } from '@/lib/images';
import { createCollection, moveClip } from '@/lib/collections';
import { DriveError, listAll, restDrive, SIMPLE_UPLOAD_MAX, type Drive } from '@/lib/sync/drive';
import { COPY_FILE, markAllForUpload, syncOnce, type SyncCursor } from '@/lib/sync/engine';
import { canonical } from '@/lib/sync/meta';
import { stubImageDecoding } from '../unit/imageStubs';

/**
 * Runs the Drive client and the sync engine against real Google Drive. Every test starts by emptying the token's
 * app folder, so use a token whose app folder holds only test data (an OAuth Playground token does).
 */

const drive = restDrive(async () => process.env.DRIVE_TOKEN!);
const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const PNG = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 8, 7])], { type: 'image/png' });

async function kindOf(p: Promise<unknown>) {
  const e = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(e).toBeInstanceOf(DriveError);
  return (e as DriveError).kind;
}

async function emptyAppFolder() {
  for (const f of await listAll(drive)) await drive.remove(f.id);
}

/** Pages through the change feed from `token` and returns every change and the next start token. */
async function changesSince(token: string) {
  const all = [];
  let page = await drive.changes(token);
  all.push(...page.changes);
  while (page.nextPageToken) {
    page = await drive.changes(page.nextPageToken);
    all.push(...page.changes);
  }
  return { changes: all, next: page.newStartPageToken! };
}

beforeAll(async () => {
  stubImageDecoding();
});

beforeEach(emptyAppFolder);
afterAll(emptyAppFolder);

describe('the Drive client against real Drive', () => {
  it('creates, finds, reads, updates and removes a file in the app folder', async () => {
    const name = "it's a test";
    const made = await drive.create(name, bytes('one'), { kind: 'test', gone: 'soon' });
    expect(made).toMatchObject({ name, appProperties: { kind: 'test', gone: 'soon' } });
    expect(made.md5Checksum).toMatch(/^[0-9a-f]{32}$/);

    expect((await drive.find(name))?.id).toBe(made.id);
    expect(await drive.find('no such file')).toBeUndefined();
    expect((await drive.get(made.id)).name).toBe(name);
    expect(text(await drive.download(made.id))).toBe('one');
    expect((await listAll(drive)).map((f) => f.id)).toEqual([made.id]);

    const updated = await drive.update(made.id, bytes('two'), { gone: null });
    expect(updated.appProperties).toEqual({ kind: 'test' });
    expect(updated.md5Checksum).not.toBe(made.md5Checksum);
    expect(text(await drive.download(made.id))).toBe('two');

    await drive.remove(made.id);
    expect(await kindOf(drive.get(made.id))).toBe('gone');
    expect(await kindOf(drive.remove(made.id))).toBe('gone');
  });

  it('finds the oldest of two files with the same name', async () => {
    const first = await drive.create('twin', bytes('1'));
    await drive.create('twin', bytes('2'));
    expect((await drive.find('twin'))?.id).toBe(first.id);
  });

  it('uploads and updates a file larger than one request takes', async () => {
    const big = new Uint8Array(SIMPLE_UPLOAD_MAX + 1024).map((_, i) => i % 251);
    const made = await drive.create('big', big, { size: 'big' });
    expect(made.appProperties).toEqual({ size: 'big' });
    expect(await drive.download(made.id)).toEqual(big);

    big[0] = 250;
    await drive.update(made.id, big);
    expect((await drive.download(made.id))[0]).toBe(250);
  });

  it('reports creates, updates and removes in the change feed', async () => {
    const start = await drive.startPageToken();
    const made = await drive.create('watched', bytes('a'));
    const other = await drive.create('removed', bytes('b'));
    await drive.update(made.id, bytes('c'));
    await drive.remove(other.id);

    const { changes, next } = await changesSince(start);
    const last = new Map(changes.map((c) => [c.fileId, c]));
    expect(last.get(made.id)?.file).toMatchObject({ name: 'watched', md5Checksum: (await drive.get(made.id)).md5Checksum });
    expect(last.get(other.id)?.removed).toBe(true);
    expect((await changesSince(next)).changes).toEqual([]);
  });

  it('maps Drive errors to the kinds sync acts on', async () => {
    expect(await kindOf(drive.changes('not-a-page-token'))).toBe('token');
    expect(await kindOf(drive.get('no-such-file-id'))).toBe('gone');
    expect(await kindOf(restDrive(async () => 'not-a-token').find('x'))).toBe('auth');
  });
});

/** A computer with its own database, syncing with real Drive. */
async function computer(copy: { copyId: string; copyFileId: string }) {
  const db = new ClipDatabase(`live-${crypto.randomUUID()}`);
  await db.open();
  let cursor: SyncCursor = {};
  const ctx = {
    db,
    drive: drive as Drive,
    ...copy,
    cursor: { get: async () => cursor, set: async (p: Partial<SyncCursor>) => void (cursor = { ...cursor, ...p }) },
  };
  return { db, join: () => markAllForUpload(db), sync: () => syncOnce(ctx) };
}

async function view(db: ClipDatabase) {
  const clips = await db.clips.orderBy('id').toArray();
  const collections = await db.collections.orderBy('id').toArray();
  const images = await db.images.orderBy('id').toArray();
  return canonical({ clips, collections, images: images.map((i) => [i.id, i.blob.size, i.blob.type]) });
}

describe('sync between two computers through real Drive', () => {
  it('carries clips, a folder, an image, edits, a pin and a delete across', async () => {
    const copyId = crypto.randomUUID();
    const marker = await drive.create(COPY_FILE, bytes(JSON.stringify({ v: 1, copyId })));
    const copy = { copyId, copyFileId: marker.id };
    const a = await computer(copy);
    const b = await computer(copy);

    const folder = await createCollection('Work', 'green', a.db);
    const note = (await saveClip({ text: 'meeting notes', source: { url: 'https://example.com', title: 'Ex' } }, a.db))!;
    const doomed = (await saveClip({ text: 'delete me' }, a.db))!;
    await moveClip(note.id, folder.id, a.db);
    const { clip: image } = await saveImageClip({ blob: PNG(), note: 'a chart' }, a.db);
    await a.join();
    await b.join();
    await a.sync();
    await b.sync();

    expect(await view(b.db)).toBe(await view(a.db));
    expect((await b.db.clips.get(note.id))?.collectionId).toBe(folder.id);
    const stored = await b.db.images.get(image.image!.imageId);
    expect(new Uint8Array(await stored!.blob.arrayBuffer())).toEqual(new Uint8Array(await PNG().arrayBuffer()));

    await editClip(note.id, { text: 'meeting notes, edited' }, a.db);
    await togglePin(note.id, b.db);
    await deleteClip(doomed.id, b.db);
    await a.sync();
    await b.sync();
    await a.sync();

    for (const c of [a, b]) {
      expect(await c.db.clips.get(note.id)).toMatchObject({ text: 'meeting notes, edited', pinned: 1 });
      expect(await c.db.clips.get(doomed.id)).toBeUndefined();
    }
    expect(await view(a.db)).toBe(await view(b.db));
  });
});
