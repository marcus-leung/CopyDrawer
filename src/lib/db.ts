import Dexie, { type EntityTable } from 'dexie';

export type ClipKind = 'text' | 'link' | 'image' | 'code';

export interface ClipSource {
  url?: string;
  title?: string;
  favicon?: string;
}

export interface Clip {
  id: string;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  kind: ClipKind;
  /** Plain-text form; always present for text-like clips. */
  text: string;
  /** Rich form when copied from a page, used when pasting back. */
  html?: string;
  title: string;
  source?: ClipSource;
  /** 1 = pinned, 0 = not. Numbers because IndexedDB can't index booleans. */
  pinned: 0 | 1;
  /** Hash of the normalized text, used to merge duplicates. */
  hash: string;
  collectionId?: string;
}

export class ClipDatabase extends Dexie {
  clips!: EntityTable<Clip, 'id'>;

  constructor(name = 'clipboard') {
    super(name);
    this.version(1).stores({
      clips: 'id, createdAt, lastUsedAt, pinned, kind, hash, collectionId',
    });
  }
}

export const db = new ClipDatabase();
