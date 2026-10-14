import { canonical, groupsOf, MAX_FIELDS, type SyncedTable } from './meta';

type Row = Record<string, unknown>;

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

/** One row as it travels through Drive: its fields (none once deleted) and when each group changed. */
export interface SyncRecord {
  row?: Row;
  t: Record<string, number>;
  deletedAt?: number;
  /** A folder deleted because another with the same key won: clips in it belong there. */
  mergedInto?: string;
}

const PREFIX: Record<SyncedTable, string> = { clips: 'c', collections: 'f', images: 'i' };
const TABLE_OF = Object.fromEntries(Object.entries(PREFIX).map(([table, p]) => [p, table])) as Record<string, SyncedTable>;

export const fileName = (table: SyncedTable, id: string) => `${PREFIX[table]}.${id}`;

export function parseFileName(name: string): { table: SyncedTable; id: string } | undefined {
  const dot = name.indexOf('.');
  const table = TABLE_OF[name.slice(0, dot)];
  return table && dot > 0 ? { table, id: name.slice(dot + 1) } : undefined;
}

export const sameRecord = (a: SyncRecord, b: SyncRecord) => canonical(a) === canonical(b);

/**
 * Merges two versions of one row, field group by field group: the newer change wins, ties go to the larger
 * value so every computer picks the same. Created and used times and counts take the larger. A delete wins
 * unless a group changed after it.
 */
export function mergeRecords(table: SyncedTable, a: SyncRecord, b: SyncRecord): SyncRecord {
  const t: Record<string, number> = { ...a.t };
  for (const [g, ts] of Object.entries(b.t)) t[g] = Math.max(t[g] ?? 0, ts);
  const deletedAt = Math.max(a.deletedAt ?? 0, b.deletedAt ?? 0) || undefined;
  const mergedInto = a.mergedInto ?? b.mergedInto;
  // An image is stored once and never edited, so any delete stands.
  const latest = table === 'images' ? 0 : Math.max(0, ...Object.values(t));
  if (!a.row && !b.row) return { t, deletedAt, ...(mergedInto && { mergedInto }) };
  if (deletedAt && latest <= deletedAt) return { t, deletedAt, ...(mergedInto && { mergedInto }) };

  const row: Row = { ...b.row, ...a.row };
  if (a.row && b.row) {
    for (const [group, fields] of Object.entries(groupsOf(table))) {
      const [ta, tb] = [a.t[group] ?? 0, b.t[group] ?? 0];
      const pick = (side: Row) => fields.map((f) => side[f]);
      const fromB = tb > ta || (tb === ta && canonical(pick(b.row)) > canonical(pick(a.row)));
      if (fromB) for (const f of fields) row[f] = b.row[f];
    }
    for (const f of MAX_FIELDS[table]) row[f] = Math.max(Number(a.row[f] ?? 0), Number(b.row[f] ?? 0));
  }
  for (const [f, v] of Object.entries(row)) if (v === undefined) delete row[f];
  return { row, t };
}

/**
 * A file's contents: the record as JSON, then any raw bytes (an image), behind a 4-byte length.
 * Blobs inside the row (a clip's preview) travel inline as base64.
 */
export async function encodeRecord(record: SyncRecord, bytes?: Blob): Promise<Uint8Array<ArrayBuffer>> {
  const json = new TextEncoder().encode(JSON.stringify(record.row ? { ...record, row: await inlineBlobs(record.row) } : record));
  const body = bytes ? new Uint8Array(await bytes.arrayBuffer()) : new Uint8Array();
  const out = new Uint8Array(4 + json.length + body.length);
  new DataView(out.buffer).setUint32(0, json.length);
  out.set(json, 4);
  out.set(body, 4 + json.length);
  return out;
}

/** An image's bytes come back as a Blob of the type its record names. */
export function decodeRecord(data: Uint8Array<ArrayBuffer>): { record: SyncRecord; bytes?: Blob } {
  const length = new DataView(data.buffer, data.byteOffset).getUint32(0);
  const record = JSON.parse(new TextDecoder().decode(data.subarray(4, 4 + length)), (_, v) =>
    v && typeof v === 'object' && typeof v.$blob === 'string' ? new Blob([fromBase64(v.$blob)], { type: v.type }) : v,
  ) as SyncRecord;
  const rest = data.subarray(4 + length);
  return { record, bytes: rest.length ? new Blob([rest], { type: String(record.row?.type ?? '') }) : undefined };
}

async function inlineBlobs(value: unknown): Promise<unknown> {
  if (value instanceof Blob) return { $blob: toBase64(new Uint8Array(await value.arrayBuffer())), type: value.type };
  if (Array.isArray(value)) return Promise.all(value.map(inlineBlobs));
  if (value && typeof value === 'object') {
    const entries = await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await inlineBlobs(v)] as const));
    return Object.fromEntries(entries);
  }
  return value;
}
