import { DriveError, type Drive, type DriveChange, type DriveFile } from '@/lib/sync/drive';

interface Stored extends DriveFile {
  data: Uint8Array<ArrayBuffer>;
}

/** An in-memory app folder with Drive's change list, shared by the computers in a test. */
export class FakeDrive {
  files = new Map<string, Stored>();
  private log: { fileId: string; removed: boolean }[] = [];
  private nextId = 1;
  /** Page tokens older than this are refused, as Drive does once it forgets old changes. */
  forgottenBefore = 0;
  calls = { download: 0, create: 0, update: 0 };

  private touch(fileId: string, removed = false) {
    this.log.push({ fileId, removed });
  }

  private meta({ data: _, ...file }: Stored): DriveFile {
    return structuredClone(file);
  }

  /** A view for one computer. `pageSize` makes paging visible in small tests. */
  client(pageSize = 3): Drive {
    const at = (token: string) => {
      const n = Number(token);
      if (n < this.forgottenBefore) throw new DriveError('token', 'Invalid pageToken');
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
      this.touch(file.id);
      return this.meta(file);
    };
    const get = (id: string) => {
      const file = this.files.get(id);
      if (!file) throw new DriveError('gone', `No file ${id}`);
      return file;
    };
    return {
      startPageToken: async () => String(this.log.length),
      changes: async (token) => {
        const from = at(token);
        const end = Math.min(this.log.length, from + pageSize);
        const changes: DriveChange[] = this.log.slice(from, end).map(({ fileId, removed }) => {
          const file = this.files.get(fileId);
          return { fileId, removed: removed || !file, file: file && this.meta(file) };
        });
        return end < this.log.length ? { changes, nextPageToken: String(end) } : { changes, newStartPageToken: String(end) };
      },
      list: async (token) => {
        const all = [...this.files.values()];
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
      download: async (id) => {
        this.calls.download++;
        return get(id).data.slice();
      },
      create: async (name, data, props) => {
        this.calls.create++;
        const file: Stored = { id: `f${this.nextId++}`, name, data };
        this.files.set(file.id, file);
        return write(file, data, props);
      },
      update: async (id, data, props) => {
        this.calls.update++;
        return write(get(id), data, props);
      },
      remove: async (id) => {
        get(id);
        this.files.delete(id);
        this.touch(id, true);
      },
    };
  }

  byName(name: string) {
    return [...this.files.values()].find((f) => f.name === name);
  }
}

function checksum(data: Uint8Array): string {
  let h = 0x811c9dc5;
  for (const b of data) h = Math.imul(h ^ b, 0x01000193);
  return `${(h >>> 0).toString(16)}-${data.length}`;
}
