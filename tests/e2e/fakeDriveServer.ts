import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { DriveError } from '../../src/lib/sync/drive';
import { FakeDrive } from '../unit/fakeDrive';

export const TOKEN = 'e2e-token';

/** The Drive REST endpoints sync uses, over HTTP, backed by the unit tests' in-memory Drive. */
export async function startFakeDrive(): Promise<{ url: string; drive: FakeDrive; close: () => Promise<void> }> {
  const drive = new FakeDrive();
  const api = drive.client(100);
  const sessions = new Map<string, Session>();
  let url = '';
  const server = http.createServer((req, res) => {
    const chunks: Uint8Array[] = [];
    req.on('data', (c: Buffer) => chunks.push(new Uint8Array(c)));
    req.on('end', () => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE');
      res.setHeader('Access-Control-Expose-Headers', 'Location');
      if (req.method === 'OPTIONS') return void res.writeHead(204).end();
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, error('authError', 'Invalid Credentials'));
      route(api, req, Buffer.concat(chunks), url, sessions).then(
        (body) =>
          body instanceof Uint8Array
            ? void res.writeHead(200).end(body)
            : body instanceof Session
              ? void res.writeHead(200, { Location: body.location }).end()
              : send(res, 200, body ?? {}),
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
  url = `http://127.0.0.1:${port}`;
  return {
    url,
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

/** A resumable upload started, waiting for its bytes. */
class Session {
  constructor(
    readonly location: string,
    readonly method: string,
    readonly id: string | undefined,
    readonly metadata: { name: string; appProperties?: Record<string, string | null> },
  ) {}
}

async function route(
  api: ReturnType<FakeDrive['client']>,
  req: http.IncomingMessage,
  body: Buffer,
  base: string,
  sessions: Map<string, Session>,
) {
  const url = new URL(req.url!, 'http://x');
  const q = url.searchParams;
  const path = url.pathname;
  const id = path.split('/').pop()!;
  if (path.startsWith('/upload-session/')) {
    const session = sessions.get(path)!;
    sessions.delete(path);
    const data = new Uint8Array(body);
    return session.method === 'POST'
      ? api.create(session.metadata.name, data, session.metadata.appProperties)
      : api.update(session.id!, data, session.metadata.appProperties);
  }
  if (path.startsWith('/upload/drive/v3/files') && q.get('uploadType') === 'resumable') {
    const location = `/upload-session/${sessions.size + 1}-${Date.now()}`;
    const session = new Session(
      base + location,
      req.method!,
      req.method === 'PATCH' ? id : undefined,
      JSON.parse(body.toString('utf8')),
    );
    sessions.set(location, session);
    return session;
  }
  if (path === '/drive/v3/changes/startPageToken') return { startPageToken: await api.startPageToken() };
  if (path === '/drive/v3/changes') return api.changes(q.get('pageToken')!);
  if (path === '/drive/v3/files' && q.get('q')) {
    const name = /name = '(.*)'/.exec(q.get('q')!)![1]!;
    const file = await api.find(name);
    return { files: file ? [file] : [] };
  }
  if (path === '/drive/v3/files') return api.list(q.get('pageToken') ?? undefined);
  if (path.startsWith('/drive/v3/files/') && req.method === 'DELETE') return void (await api.remove(id));
  if (path.startsWith('/drive/v3/files/')) return q.get('alt') === 'media' ? api.download(id) : api.get(id);
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
