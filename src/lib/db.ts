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
  image?: ClipImage;
}

export interface StoredImage {
  id: string;
  blob: Blob;
}

export class ClipDatabase extends Dexie {
  clips!: EntityTable<Clip, 'id'>;
  images!: EntityTable<StoredImage, 'id'>;

  constructor(name = 'clipboard') {
    super(name);
    this.version(1).stores({
      clips: 'id, createdAt, lastUsedAt, pinned, kind, hash, collectionId',
    });
    this.version(2).stores({
      images: 'id',
    });
  }
}

export const db = new ClipDatabase();
