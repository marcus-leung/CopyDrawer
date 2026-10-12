import Dexie, { type EntityTable } from 'dexie';
import { detectKind, type ClipKind } from './kinds';

export type { ClipKind };

export interface ClipSource {
  url?: string;
  title?: string;
}

interface ClipImage {
  /** Key into the `images` table holding the full-size file. */
  imageId: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  /** Small WebP preview shown in lists. */
  thumb: Blob;
  /** Where the image came from on the web, when known. */
  srcUrl?: string;
}

export interface Clip {
  id: string;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  kind: ClipKind;
  /** Plain-text form. For images: alt text or file name, may be empty. */
  text: string;
  /** Rich form when copied from a page, used when pasting back. */
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
  /** For images: the user's note. */
  note?: string;
  /** Where the title came from: rules from the text, or the user. */
  titleSource?: 'heuristic' | 'user';
}

export interface Collection {
  id: string;
  /** Stable key for auto collections: "cat:research", "trip:lisbon". Manual ones: "manual:<id>". */
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

  constructor(name = 'clipboard') {
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
    // Drops the embedding fields; titles the AI model wrote count as rule titles.
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
  }
}

export const db = new ClipDatabase();
