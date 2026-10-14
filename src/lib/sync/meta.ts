import type { DBCore, DBCoreMutateRequest, DBCoreTable, Middleware } from 'dexie';

/**
 * Change tracking for Drive sync. Each synced row has a `syncMeta` entry holding when each group of its fields
 * last changed on any computer, so concurrent edits to different groups (a pin here, a text edit there) both
 * survive a merge. Deleting a row that was already uploaded leaves its entry behind as a tombstone.
 */

export const META_TABLE = 'syncMeta';

const GROUPS = {
  clips: {
    content: ['text', 'html', 'kind', 'hash', 'image'],
    title: ['title', 'titleSource'],
    note: ['note'],
    pinned: ['pinned'],
    place: ['collectionId', 'collectionLocked'],
    stripRank: ['stripRank'],
    source: ['source'],
  },
  collections: { name: ['name'], color: ['color'], order: ['order'], key: ['key', 'kind'] },
  images: { blob: ['blob'] },
} as const satisfies Record<string, Record<string, readonly string[]>>;

export type SyncedTable = keyof typeof GROUPS;
export const SYNCED_TABLES = Object.keys(GROUPS) as SyncedTable[];
export const isSynced = (table: string): table is SyncedTable => table in GROUPS;

/** Fields merged by taking the larger value, so they need no timestamps. */
export const MAX_FIELDS: Record<SyncedTable, readonly string[]> = {
  clips: ['createdAt', 'lastUsedAt', 'useCount'],
  collections: ['createdAt'],
  images: [],
};

export interface SyncMeta {
  /** `<table>/<id>` */
  key: string;
  /** When each field group last changed. A missing group counts as 0. */
  t: Record<string, number>;
  /** Set once the row is deleted. */
  deletedAt?: number;
  /** 1 while the change hasn't reached Drive. */
  dirty: 0 | 1;
  /** Goes up with every change, so an upload can tell whether the row changed while it was on its way. */
  rev: number;
  /** A folder deleted because another with the same key won: clips in it belong there. */
  mergedInto?: string;
  fileId?: string;
  md5?: string;
}

export const metaKey = (table: SyncedTable, id: string) => `${table}/${id}`;

let last = 0;
/** Milliseconds that never go backwards on this computer. */
export const tick = () => (last = Math.max(Date.now(), last + 1));

type Row = Record<string, unknown>;

/** For comparing: keys in order, missing and undefined alike, and blobs (never changed once stored) by size and type. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) => {
    if (v instanceof Blob) return `blob:${v.size}:${v.type}`;
    if (v && typeof v === 'object' && !Array.isArray(v))
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    return v;
  });
}

const same = (a: unknown, b: unknown) => a === b || canonical(a) === canonical(b);

/** The field groups that differ between two versions of a row; all of them for a new row. */
export function changedGroups(table: SyncedTable, before: Row | undefined, after: Row): string[] {
  return Object.entries(groupsOf(table))
    .filter(([, fields]) => !before || fields.some((f) => !same(before[f], after[f])))
    .map(([group]) => group);
}

export function groupsOf(table: SyncedTable): Readonly<Record<string, readonly string[]>> {
  return GROUPS[table];
}

/** Records every write to a synced table in `syncMeta`, inside the same transaction. */
export const trackChanges: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'trackSyncChanges',
  create: (down) => ({
    ...down,
    transaction: (tables, mode, options) =>
      down.transaction(
        mode === 'readwrite' && tables.some(isSynced) && !tables.includes(META_TABLE) ? [...tables, META_TABLE] : tables,
        mode,
        options,
      ),
    table: (name) => {
      const table = down.table(name);
      if (!isSynced(name)) return table;
      const idOf = (row: Row) => table.schema.primaryKey.extractKey!(row) as string;
      return {
        ...table,
        // Schema upgrades rewrite rows without changing them, and run before syncMeta exists.
        mutate: (req) =>
          (req.trans as unknown as IDBTransaction).mode === 'versionchange'
            ? table.mutate(req)
            : trackMutate(name, table, down.table(META_TABLE), idOf, req),
      };
    },
  }),
};

async function trackMutate(
  name: SyncedTable,
  table: DBCoreTable,
  meta: DBCoreTable,
  idOf: (row: Row) => string,
  req: DBCoreMutateRequest,
) {
  const { trans } = req;
  if (req.type === 'add' || req.type === 'put') {
    const rows = req.values as Row[];
    const before: (Row | undefined)[] =
      req.type === 'put' ? await table.getMany({ trans, keys: rows.map(idOf) }) : rows.map(() => undefined);
    const res = await table.mutate(req);
    const changes = rows.flatMap((row, i) =>
      i in res.failures ? [] : [{ id: idOf(row), groups: changedGroups(name, before[i], row), touched: !same(before[i], row) }],
    );
    await record(
      name,
      meta,
      trans,
      changes.filter((c) => c.touched),
      (m, c) => {
        const now = tick();
        const t = { ...m?.t };
        for (const g of c.groups) t[g] = now;
        return { t, dirty: 1, rev: (m?.rev ?? 0) + 1, fileId: m?.fileId, md5: m?.md5 };
      },
    );
    return res;
  }
  const keys: string[] =
    req.type === 'delete'
      ? req.keys
      : (await table.query({ trans, query: { index: table.schema.primaryKey, range: req.range } })).result;
  const res = await table.mutate(req);
  await record(
    name,
    meta,
    trans,
    keys.map((id) => ({ id })),
    (m) => (m?.fileId ? { t: m.t, deletedAt: tick(), dirty: 1, rev: m.rev + 1, fileId: m.fileId, md5: m.md5 } : null),
  );
  return res;
}

/** Writes the new meta for each changed row; `null` drops the entry (a row that never reached Drive). */
async function record<C extends { id: string }>(
  name: SyncedTable,
  meta: DBCoreTable,
  trans: DBCoreMutateRequest['trans'],
  changes: C[],
  next: (m: SyncMeta | undefined, c: C) => Omit<SyncMeta, 'key'> | null,
) {
  if (!changes.length) return;
  const keys = changes.map((c) => metaKey(name, c.id));
  const old: (SyncMeta | undefined)[] = await meta.getMany({ trans, keys });
  const put: SyncMeta[] = [];
  const drop: string[] = [];
  changes.forEach((c, i) => {
    const m = next(old[i], c);
    if (m) put.push({ key: keys[i]!, ...m });
    else drop.push(keys[i]!);
  });
  if (put.length) await meta.mutate({ trans, type: 'put', values: put });
  if (drop.length) await meta.mutate({ trans, type: 'delete', keys: drop });
}
