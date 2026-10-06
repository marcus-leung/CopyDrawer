import Dexie, { type EntityTable } from 'dexie';

export type ClipKind = 'text' | 'link' | 'image' | 'code';

export interface ClipSource {
  url?: string;
  title?: string;
  favicon?: string;
}

export interface ClipImage {
  /** Key into the `images` table holding the full-size file. */
  imageId: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  /** Small JPEG/PNG preview shown in lists. */
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
  image?: ClipImage;
  /** Where the title came from: rules from the text, on-device AI, or the user. */
  titleSource?: 'heuristic' | 'ai' | 'user';
  /** Search vector (normalized) and the model that made it. */
  embedding?: Float32Array;
  embeddingModel?: string;
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
  }
}

export const db = new ClipDatabase();
