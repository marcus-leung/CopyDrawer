import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { DriveError } from '../../src/lib/sync/drive';
import { FakeDrive } from '../unit/fakeDrive';

export const TOKEN = 'e2e-token';

/** The Drive REST endpoints sync uses, over HTTP, backed by the unit tests' in-memory Drive. */
export async function startFakeDrive(): Promise<{ url: string; drive: FakeDrive; close: () => Promise<void> }> {
  const drive = new FakeDrive();
  const api = drive.client(100);
  const server = http.createServer((req, res) => {
    const chunks: Uint8Array[] = [];
    req.on('data', (c: Buffer) => chunks.push(new Uint8Array(c)));
    req.on('end', () => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
      if (req.method === 'OPTIONS') return void res.writeHead(204).end();
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, error('authError', 'Invalid Credentials'));
      route(api, req, Buffer.concat(chunks)).then(
        (body) => (body instanceof Uint8Array ? void res.writeHead(200).end(body) : send(res, 200, body ?? {})),
        (e: unknown) => {
          if (!(e instanceof DriveError)) return send(res, 500, error('backendError', String(e)));
          if (e.kind === 'gone') return send(res, 404, error('notFound', e.message));
          if (e.kind === 'token') return send(res, 400, error('invalid', 'Invalid pageToken'));
          send(res, 500, error('backendError', e.message));
        },
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    drive,
    close: () =>
      new Promise((r) => {
        server.close(() => r());
        // A browser still open keeps its connection alive, which would hold close() forever.
        server.closeAllConnections();
      }),
  };
}

const error = (reason: string, message: string) => ({ error: { message, errors: [{ reason }] } });

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

async function route(api: ReturnType<FakeDrive['client']>, req: http.IncomingMessage, body: Buffer) {
  const url = new URL(req.url!, 'http://x');
  const q = url.searchParams;
  const path = url.pathname;
  const id = path.split('/').pop()!;
  if (path === '/drive/v3/changes/startPageToken') return { startPageToken: await api.startPageToken() };
  if (path === '/drive/v3/changes') return api.changes(q.get('pageToken')!);
  if (path === '/drive/v3/files' && q.get('q')) {
    const name = /name = '(.*)'/.exec(q.get('q')!)![1]!;
    const file = await api.find(name);
    return { files: file ? [file] : [] };
  }
  if (path === '/drive/v3/files') return api.list(q.get('pageToken') ?? undefined);
  if (path.startsWith('/drive/v3/files/') && req.method === 'DELETE') return void (await api.remove(id));
  if (path.startsWith('/drive/v3/files/')) return api.download(id);
  if (path.startsWith('/upload/drive/v3/files')) {
    const { metadata, data } = multipart(req.headers['content-type']!, body);
    return req.method === 'POST'
      ? api.create(metadata.name, data, metadata.appProperties)
      : api.update(id, data, metadata.appProperties);
  }
  throw new Error(`No route for ${req.method} ${path}`);
}

/** The two parts of a multipart/related upload: JSON metadata, then the bytes. */
function multipart(contentType: string, body: Buffer) {
  const boundary = `--${/boundary=(.+)$/.exec(contentType)![1]}`;
  const parts: Buffer[] = [];
  let at = body.indexOf(boundary);
  while (at >= 0) {
    const next = body.indexOf(boundary, at + boundary.length);
    if (next < 0) break;
    const part = body.subarray(at + boundary.length, next - 2);
    parts.push(part.subarray(part.indexOf('\r\n\r\n') + 4));
    at = next;
  }
  const metadata = JSON.parse(parts[0]!.toString('utf8')) as { name: string; appProperties?: Record<string, string | null> };
  return { metadata, data: new Uint8Array(parts[1]!) };
}
