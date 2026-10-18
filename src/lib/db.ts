import Dexie, { type EntityTable } from 'dexie';
import { detectKind, type ClipKind } from './kinds';
import { isDiskFailure, pauseForDiskError, stateKnown, StoragePausedError, whenStateKnown, writesPaused } from './storageGuard';
import { trackChanges, type SyncMeta } from './sync/meta';
import type { SyncCursor } from './sync/engine';

export type { ClipKind };

export interface ClipSource {
  url?: string;
  title?: string;
}

interface ClipImage {
  imageId: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  thumb: Blob;
  srcUrl?: string;
}

export interface Clip {
  id: string;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  kind: ClipKind;
  /** For images: alt text or file name, may be empty. */
  text: string;
  html?: string;
  title: string;
  source?: ClipSource;
  /** 1 = pinned, 0 = not. Numbers because IndexedDB can't index booleans. */
  pinned: 0 | 1;
  /** Hash of the normalized text (or image bytes), used to merge duplicates. */
  hash: string;
  collectionId?: string;
  /** 1 when the user put the clip in its collection; auto-sorting won't move it. */
  collectionLocked?: 0 | 1;
  /** Position in the "Images and colors" strip after the user reordered it (higher = earlier). */
  stripRank?: number;
  image?: ClipImage;
  note?: string;
  titleSource?: 'heuristic' | 'user';
}

export interface Collection {
  id: string;
  /** Stable key for auto collections: "cat:research", "trip:kyoto". Manual ones: "manual:<id>". */
  key: string;
  name: string;
  color: string;
  kind: 'smart' | 'trip' | 'manual';
  createdAt: number;
  order: number;
}

export interface StoredImage {
  id: string;
  blob: Blob;
}

export class ClipDatabase extends Dexie {
  clips!: EntityTable<Clip, 'id'>;
  images!: EntityTable<StoredImage, 'id'>;
  collections!: EntityTable<Collection, 'id'>;
  syncMeta!: EntityTable<SyncMeta, 'key'>;
  /** Where Drive sync is up to, kept with the clips: if they're lost, sync starts over and brings them back. */
  syncState!: EntityTable<SyncCursor & { key: 'cursor' }, 'key'>;

  /**
   * `guarded: false` only for the rebuild, which must write while saving is paused.
   * `tracked: false` for writes that must not count as changes made here: the rebuild, and applying changes from Drive.
   */
  constructor(name = 'clipboard', { guarded = true, tracked = true } = {}) {
    super(name);
    this.version(1).stores({
      clips: 'id, createdAt, lastUsedAt, pinned, kind, hash, collectionId',
    });
    this.version(2).stores({
      images: 'id',
    });
    this.version(3).stores({
      clips: 'id, createdAt, lastUsedAt, pinned, kind, hash, collectionId, embeddingModel',
      collections: 'id, &key, order',
    });
    this.version(4)
      .stores({ clips: 'id, createdAt, lastUsedAt, pinned, kind, hash, collectionId' })
      .upgrade((tx) =>
        tx
          .table('clips')
          .toCollection()
          .modify((c: Record<string, unknown>) => {
            delete c.embedding;
            delete c.embeddingModel;
            if (c.titleSource === 'ai') c.titleSource = 'heuristic';
          }),
      );
    // Re-detects text and code clips, giving emails, phone numbers, colors, JSON, dates, addresses and numbers their own types.
    this.version(5)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('clips')
          .toCollection()
          .modify((c: Clip) => {
            if (c.kind === 'text' || c.kind === 'code') c.kind = detectKind(c.text);
          }),
      );
    // Re-detects colors: without #, rgb() or hsl(), bare hex like "2FA" or a git hash is text.
    this.version(6)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('clips')
          .toCollection()
          .modify((c: Clip) => {
            if (c.kind === 'color') c.kind = detectKind(c.text);
          }),
      );
    // Sets each collection's order once, most clips first; from then on they keep the order the user gives them.
    this.version(7)
      .stores({})
      .upgrade(async (tx) => {
        const counts = new Map<string, number>();
        await tx
          .table('clips')
          .each((c: Clip) => c.collectionId && counts.set(c.collectionId, (counts.get(c.collectionId) ?? 0) + 1));
        const all: Collection[] = await tx.table('collections').toArray();
        all.sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.order - b.order);
        await Promise.all(all.map((c, order) => tx.table('collections').update(c.id, { order })));
      });
    this.version(8).stores({ syncMeta: 'key, dirty, fileId', syncState: 'key' });
    if (tracked) this.use(trackChanges);
    if (!guarded) return;
    // No write reaches the database while writing is stopped to protect the clips (see storageGuard).
    this.use({
      stack: 'dbcore',
      name: 'pauseOnDiskFailure',
      create: (down) => ({
        ...down,
        transaction: (tables, mode, options) => {
          const tx = down.transaction(tables, mode, options) as IDBTransaction;
          // A disk error can also surface when the transaction commits, after every write succeeded.
          if (mode === 'readwrite') tx.addEventListener('abort', () => isDiskFailure(tx.error) && pauseForDiskError());
          return tx;
        },
        table: (tableName) => {
          const table = down.table(tableName);
          return {
            ...table,
            mutate: (req) => {
              const write = () =>
                writesPaused()
                  ? Promise.reject(new StoragePausedError())
                  : table.mutate(req).catch((e: unknown) => {
                      if (isDiskFailure(e)) pauseForDiskError();
                      throw e;
                    });
              // Only at start-up, before the state is read; waiting may end the transaction, which is safe.
              return stateKnown() ? write() : whenStateKnown().then(write);
            },
          };
        },
      }),
    });
    // Chrome closes a connection itself when the disk fails (or site data is cleared), but also once another
    // page deletes the database, as moving the clips to fresh storage does.
    let deleting = false;
    this.on('versionchange', () => {
      deleting = true;
    });
    this.on(
      'ready',
      () => {
        deleting = false;
        this.backendDB().addEventListener('close', () => deleting || pauseForDiskError());
      },
      true,
    );
  }
}

export const db = new ClipDatabase();
