import { DriveError, type Drive, type DriveChange, type DriveFile } from '@/lib/sync/drive';

interface Stored extends DriveFile {
  data: Uint8Array<ArrayBuffer>;
}

/**
 * An in-memory app folder with Drive's change list, shared by the computers in a test. Less orderly than a
 * tidy fake, the way Drive is: each change entry shows the file as it was then (it may be gone by the time
 * it's downloaded), listings can come in any order or miss files, and find returns the oldest of a name.
 */
export class FakeDrive {
  files = new Map<string, Stored>();
  private log: DriveChange[] = [];
  private nextId = 1;
  private clock = 0;
  /** Page tokens older than this are refused, as Drive does once it forgets old changes. */
  forgottenBefore = 0;
  /** Listings come newest first instead of oldest first. */
  listReversed = false;
  /** Files a listing leaves out, as a listing that changed while it was paged through might. */
  unlisted = new Set<string>();
  /** Runs right after a file is created, before the caller hears back. */
  afterCreate?: (file: DriveFile) => Promise<void>;
  calls = { download: 0, create: 0, update: 0, remove: 0 };

  private meta({ data: _, ...file }: Stored): DriveFile {
    return structuredClone(file);
  }

  private touch(file: Stored | undefined, fileId: string) {
    this.log.push(file ? { fileId, removed: false, file: this.meta(file) } : { fileId, removed: true });
  }

  /** Removes files the way Drive's "Delete hidden app data" does: all of them, in no particular order. */
  removeAll(order: (ids: string[]) => string[] = (ids) => ids) {
    for (const id of order([...this.files.keys()])) {
      this.files.delete(id);
      this.touch(undefined, id);
    }
  }

  /** A view for one computer. `pageSize` makes paging visible in small tests. */
  client(pageSize = 3): Drive {
    const at = (token: string) => {
      const n = Number(token);
      if (n < this.forgottenBefore) throw new DriveError('token', 'Invalid Value', 400);
      return n;
    };
    const write = (file: Stored, data: Uint8Array<ArrayBuffer>, props?: Record<string, string | null>) => {
      file.data = data.slice();
      file.md5Checksum = checksum(data);
      for (const [k, v] of Object.entries(props ?? {})) {
        file.appProperties ??= {};
        if (v === null) delete file.appProperties[k];
        else file.appProperties[k] = v;
      }
      this.touch(file, file.id);
      return this.meta(file);
    };
    const get = (id: string) => {
      const file = this.files.get(id);
      if (!file) throw new DriveError('gone', `No file ${id}`, 404);
      return file;
    };
    return {
      startPageToken: async () => String(this.log.length),
      changes: async (token) => {
        const from = at(token);
        const end = Math.min(this.log.length, from + pageSize);
        const changes = structuredClone(this.log.slice(from, end));
        return end < this.log.length ? { changes, nextPageToken: String(end) } : { changes, newStartPageToken: String(end) };
      },
      list: async (token) => {
        let all = [...this.files.values()].filter((f) => !this.unlisted.has(f.id));
        if (this.listReversed) all = all.reverse();
        const from = Number(token ?? 0);
        const end = Math.min(all.length, from + pageSize);
        return {
          files: all.slice(from, end).map((f) => this.meta(f)),
          nextPageToken: end < all.length ? String(end) : undefined,
        };
      },
      find: async (name) => {
        const file = this.byName(name);
        return file && this.meta(file);
      },
      get: async (id) => this.meta(get(id)),
      download: async (id) => {
        this.calls.download++;
        return get(id).data.slice();
      },
      create: async (name, data, props) => {
        this.calls.create++;
        const createdTime = new Date(Date.UTC(2026, 0, 1) + ++this.clock).toISOString();
        const file: Stored = { id: `f${String(this.nextId++).padStart(6, '0')}`, name, data, createdTime };
        this.files.set(file.id, file);
        const made = write(file, data, props);
        await this.afterCreate?.(made);
        return made;
      },
      update: async (id, data, props) => {
        this.calls.update++;
        return write(get(id), data, props);
      },
      remove: async (id) => {
        this.calls.remove++;
        get(id);
        this.files.delete(id);
        this.touch(undefined, id);
      },
    };
  }

  /** The oldest file with this name. */
  byName(name: string) {
    return [...this.files.values()]
      .filter((f) => f.name === name)
      .sort((a, b) => a.createdTime!.localeCompare(b.createdTime!) || a.id.localeCompare(b.id))[0];
  }

  allNamed(name: string) {
    return [...this.files.values()].filter((f) => f.name === name);
  }
}

function checksum(data: Uint8Array): string {
  let h = 0x811c9dc5;
  for (const b of data) h = Math.imul(h ^ b, 0x01000193);
  return `${(h >>> 0).toString(16)}-${data.length}`;
}
