/** The parts of the Drive v3 REST API that sync uses, all inside the hidden app folder. */

export interface DriveFile {
  id: string;
  name: string;
  md5Checksum?: string;
  createdTime?: string;
  appProperties?: Record<string, string>;
}

export interface DriveChange {
  fileId: string;
  removed: boolean;
  file?: DriveFile;
}

export interface ChangePage {
  changes: DriveChange[];
  nextPageToken?: string;
  /** Present on the last page: where the next pull starts. */
  newStartPageToken?: string;
}

export interface Drive {
  startPageToken(): Promise<string>;
  changes(pageToken: string): Promise<ChangePage>;
  list(pageToken?: string): Promise<{ files: DriveFile[]; nextPageToken?: string }>;
  /** The oldest file with this name, if any. */
  find(name: string): Promise<DriveFile | undefined>;
  /** One file's details; DriveError `gone` if it no longer exists. */
  get(id: string): Promise<DriveFile>;
  download(id: string): Promise<Uint8Array<ArrayBuffer>>;
  create(name: string, data: Uint8Array<ArrayBuffer>, appProperties?: Record<string, string | null>): Promise<DriveFile>;
  update(id: string, data: Uint8Array<ArrayBuffer>, appProperties?: Record<string, string | null>): Promise<DriveFile>;
  remove(id: string): Promise<void>;
}

/**
 * auth: sign in again. full: the Drive is out of space. gone: the file no longer exists.
 * token: the change list can't continue from that point. offline and retry: try again later. failed: anything else.
 */
export type DriveErrorKind = 'auth' | 'full' | 'gone' | 'token' | 'offline' | 'retry' | 'failed';

export class DriveError extends Error {
  override name = 'DriveError';
  constructor(
    readonly kind: DriveErrorKind,
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

export const FILE_FIELDS = 'id,name,md5Checksum,createdTime,appProperties';
/** Drive takes a body this size or smaller in one request; larger ones go up as a resumable upload. */
export const SIMPLE_UPLOAD_MAX = 5 * 1024 * 1024;
const RETRIES = 4;

/** `token(true)` must return a fresh token, not the cached one Drive just refused. */
export type TokenSource = (refresh: boolean) => Promise<string>;

export function restDrive(token: TokenSource, base = 'https://www.googleapis.com'): Drive {
  /**
   * One request, retried on rate limits and server errors. A request that creates a file isn't retried after a
   * server error, which may have come after the file was made: the next sync tries again instead.
   */
  async function call(
    method: string,
    path: string,
    body?: BodyInit,
    headers: Record<string, string> = {},
    creates = false,
  ): Promise<Response> {
    // A fresh token is asked for once, on the attempt right after Drive refused the cached one.
    let refreshed = false;
    let refresh = false;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(path.startsWith('http') ? path : base + path, {
          method,
          body,
          headers: { Authorization: `Bearer ${await token(refresh)}`, ...headers },
        });
      } catch (e) {
        throw new DriveError('offline', String(e));
      }
      if (res.ok) return res;
      const error = await driveError(res);
      refresh = false;
      if (error.kind === 'auth' && !refreshed) {
        refreshed = refresh = true;
        continue;
      }
      if (error.kind !== 'retry' || attempt >= RETRIES || (creates && res.status >= 500)) throw error;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000 * (0.5 + Math.random())));
    }
  }

  const json = async <T>(method: string, path: string) => (await (await call(method, path)).json()) as T;

  async function upload(method: 'POST' | 'PATCH', path: string, metadata: object, data: Uint8Array<ArrayBuffer>) {
    const creates = method === 'POST';
    if (data.length > SIMPLE_UPLOAD_MAX) {
      const session = await call(
        method,
        `/upload/drive/v3/files${path}?uploadType=resumable&fields=${FILE_FIELDS}`,
        JSON.stringify(metadata),
        { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/octet-stream' },
        creates,
      );
      const location = session.headers.get('Location');
      if (!location) throw new DriveError('failed', 'Drive gave no upload address');
      return (await (await call('PUT', location, new Blob([data]), {}, creates)).json()) as DriveFile;
    }
    const boundary = `copydrawer-${crypto.randomUUID()}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
      data,
      `\r\n--${boundary}--`,
    ]);
    const res = await call(
      method,
      `/upload/drive/v3/files${path}?uploadType=multipart&fields=${FILE_FIELDS}`,
      body,
      { 'Content-Type': `multipart/related; boundary=${boundary}` },
      creates,
    );
    return (await res.json()) as DriveFile;
  }

  return {
    startPageToken: async () =>
      (await json<{ startPageToken: string }>('GET', '/drive/v3/changes/startPageToken')).startPageToken,
    changes: (pageToken) =>
      json(
        'GET',
        `/drive/v3/changes?spaces=appDataFolder&pageSize=1000&pageToken=${encodeURIComponent(pageToken)}` +
          `&fields=nextPageToken,newStartPageToken,changes(fileId,removed,file(${FILE_FIELDS}))`,
      ),
    list: (pageToken) =>
      json(
        'GET',
        `/drive/v3/files?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(${FILE_FIELDS})` +
          (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''),
      ),
    find: async (name) =>
      (
        await json<{ files: DriveFile[] }>(
          'GET',
          `/drive/v3/files?spaces=appDataFolder&orderBy=createdTime&pageSize=1&fields=files(${FILE_FIELDS})` +
            `&q=${encodeURIComponent(`name = '${name.replace(/['\\]/g, '\\$&')}'`)}`,
        )
      ).files[0],
    get: (id) => json('GET', `/drive/v3/files/${id}?fields=${FILE_FIELDS}`),
    download: async (id) => new Uint8Array(await (await call('GET', `/drive/v3/files/${id}?alt=media`)).arrayBuffer()),
    create: (name, data, appProperties) =>
      upload('POST', '', { name, parents: ['appDataFolder'], ...(appProperties && { appProperties }) }, data),
    update: (id, data, appProperties) => upload('PATCH', `/${id}`, { appProperties }, data),
    remove: async (id) => {
      await call('DELETE', `/drive/v3/files/${id}`);
    },
  };
}

/** For `.catch`: a file that no longer exists gives undefined; any other error is passed on. */
export function ignoreGone(e: unknown): undefined {
  if (e instanceof DriveError && e.kind === 'gone') return undefined;
  throw e;
}

async function driveError(res: Response): Promise<DriveError> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; errors?: { reason?: string; location?: string }[] };
  };
  const { reason = '', location = '' } = body.error?.errors?.[0] ?? {};
  const message = `Drive ${res.status} ${reason}: ${body.error?.message ?? res.statusText}`;
  const error = (kind: DriveErrorKind) => new DriveError(kind, message, res.status);
  if (res.status === 401 || /insufficientPermissions|authError/.test(reason)) return error('auth');
  if (res.status === 404) return error('gone');
  if (reason === 'storageQuotaExceeded' || reason === 'quotaExceeded') return error('full');
  if (res.status === 429 || res.status >= 500 || /rateLimit/i.test(reason)) return error('retry');
  // Drive names the bad parameter in `location`; its message is just "Invalid Value".
  if (res.status === 400 && (location === 'pageToken' || /pageToken/i.test(message))) return error('token');
  return error('failed');
}
