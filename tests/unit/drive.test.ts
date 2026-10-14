import { afterEach, describe, expect, it, vi } from 'vitest';
import { DriveError, restDrive } from '@/lib/sync/drive';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fail = (status: number, reason: string, message = 'no') =>
  new Response(JSON.stringify({ error: { message, errors: [{ reason }] } }), { status });

function stubFetch(...responses: Response[]) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => responses.shift() ?? ok({}));
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('setTimeout', (fn: () => void) => fn());
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe('Drive REST client', () => {
  it('uploads into the app folder as one multipart request with the bytes intact', async () => {
    const fetch = stubFetch(ok({ id: 'x', name: 'c.1', md5Checksum: 'abc' }));
    const drive = restDrive(async () => 'tok');
    const data = new Uint8Array([0, 1, 2, 255]);
    expect(await drive.create('c.1', data, { del: '5' })).toEqual({ id: 'x', name: 'c.1', md5Checksum: 'abc' });

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toMatch(/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?uploadType=multipart&fields=/);
    expect(init!.method).toBe('POST');
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    const boundary = headers['Content-Type']!.match(/boundary=(.+)$/)![1]!;
    const body = new Uint8Array(await (init!.body as Blob).arrayBuffer());
    const text = new TextDecoder('latin1').decode(body);
    expect(text).toContain(JSON.stringify({ name: 'c.1', parents: ['appDataFolder'], appProperties: { del: '5' } }));
    const start = text.indexOf('application/octet-stream\r\n\r\n') + 'application/octet-stream\r\n\r\n'.length;
    expect([...body.subarray(start, start + 4)]).toEqual([0, 1, 2, 255]);
    expect(text.endsWith(`\r\n--${boundary}--`)).toBe(true);
  });

  it('gets a fresh token once when Drive refuses the cached one', async () => {
    const fetch = stubFetch(fail(401, 'authError'), ok({ startPageToken: '7' }));
    const token = vi.fn(async (refresh: boolean) => (refresh ? 'new' : 'old'));
    expect(await restDrive(token).startPageToken()).toBe('7');
    expect(fetch.mock.calls.map(([, i]) => (i!.headers as Record<string, string>).Authorization)).toEqual([
      'Bearer old',
      'Bearer new',
    ]);
  });

  it('asks to sign in again when a fresh token is refused too', async () => {
    stubFetch(fail(401, 'authError'), fail(401, 'authError'));
    await expect(restDrive(async () => 't').startPageToken()).rejects.toMatchObject({ kind: 'auth' });
  });

  it('retries rate limits and server errors, then gives up', async () => {
    const fetch = stubFetch(fail(429, 'rateLimitExceeded'), fail(503, 'backendError'), ok({ startPageToken: '1' }));
    expect(await restDrive(async () => 't').startPageToken()).toBe('1');
    expect(fetch).toHaveBeenCalledTimes(3);

    stubFetch(...Array.from({ length: 10 }, () => fail(403, 'userRateLimitExceeded')));
    await expect(restDrive(async () => 't').startPageToken()).rejects.toMatchObject({ kind: 'retry' });
  });

  it('names the errors sync acts on', async () => {
    const kind = async (res: Response) => {
      stubFetch(res, res.clone());
      return (
        (await restDrive(async () => 't')
          .download('x')
          .catch((e) => e)) as DriveError
      ).kind;
    };
    expect(await kind(fail(403, 'storageQuotaExceeded'))).toBe('full');
    expect(await kind(fail(404, 'notFound'))).toBe('gone');
    expect(await kind(fail(400, 'invalid', 'Invalid pageToken'))).toBe('token');
    expect(await kind(fail(403, 'insufficientPermissions'))).toBe('auth');
    expect(await kind(fail(400, 'badRequest'))).toBe('failed');
    vi.stubGlobal('fetch', async () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(restDrive(async () => 't').download('x')).rejects.toMatchObject({ kind: 'offline' });
  });
});
