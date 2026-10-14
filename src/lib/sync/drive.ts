/** The parts of the Drive v3 REST API that sync uses, all inside the hidden app folder. */

export interface DriveFile {
  id: string;
  name: string;
  md5Checksum?: string;
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
  ) {
    super(message);
  }
}

export const FILE_FIELDS = 'id,name,md5Checksum,appProperties';
const RETRIES = 4;

/** `token(true)` must return a fresh token, not the cached one Drive just refused. */
export type TokenSource = (refresh: boolean) => Promise<string>;

export function restDrive(token: TokenSource, base = 'https://www.googleapis.com'): Drive {
  async function call(method: string, path: string, body?: BodyInit, contentType?: string): Promise<Response> {
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(base + path, {
          method,
          body,
          headers: { Authorization: `Bearer ${await token(refreshed)}`, ...(contentType && { 'Content-Type': contentType }) },
        });
      } catch (e) {
        throw new DriveError('offline', String(e));
      }
      if (res.ok) return res;
      const error = await driveError(res);
      if (error.kind === 'auth' && !refreshed) refreshed = true;
      else if (error.kind !== 'retry' || attempt >= RETRIES) throw error;
      else await new Promise((r) => setTimeout(r, 2 ** attempt * 1000 * (0.5 + Math.random())));
    }
  }

  const json = async <T>(method: string, path: string) => (await (await call(method, path)).json()) as T;

  function upload(method: 'POST' | 'PATCH', path: string, metadata: object, data: Uint8Array<ArrayBuffer>) {
    const boundary = `copydrawer-${crypto.randomUUID()}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
      data,
      `\r\n--${boundary}--`,
    ]);
    return call(
      method,
      `/upload/drive/v3/files${path}?uploadType=multipart&fields=${FILE_FIELDS}`,
      body,
      `multipart/related; boundary=${boundary}`,
    ).then((r) => r.json() as Promise<DriveFile>);
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
    download: async (id) => new Uint8Array(await (await call('GET', `/drive/v3/files/${id}?alt=media`)).arrayBuffer()),
    create: (name, data, appProperties) => upload('POST', '', { name, parents: ['appDataFolder'], appProperties }, data),
    update: (id, data, appProperties) => upload('PATCH', `/${id}`, { appProperties }, data),
    remove: async (id) => {
      await call('DELETE', `/drive/v3/files/${id}`);
    },
  };
}

async function driveError(res: Response): Promise<DriveError> {
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } };
  const reason = body.error?.errors?.[0]?.reason ?? '';
  const message = `Drive ${res.status} ${reason}: ${body.error?.message ?? res.statusText}`;
  if (res.status === 401 || /insufficientPermissions|authError/.test(reason)) return new DriveError('auth', message);
  if (res.status === 404) return new DriveError('gone', message);
  if (reason === 'storageQuotaExceeded' || reason === 'quotaExceeded') return new DriveError('full', message);
  if (res.status === 429 || res.status >= 500 || /rateLimit/i.test(reason)) return new DriveError('retry', message);
  if (res.status === 400 && /pageToken/i.test(message)) return new DriveError('token', message);
  return new DriveError('failed', message);
}
