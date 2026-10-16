import { hostOf } from './format';
import { isPrivateHost } from './exclusions';
import { dataUrlToBlob, IMAGE_TYPES, MAX_IMAGE_BYTES } from './images';
import { fetchImageInPage } from './injected';

/** A data URL longer than this decodes to more than an image may be. */
const MAX_DATA_URL = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 100;
export const TOO_BIG = 'too-big';
type Fetched = Blob | typeof TOO_BIG | null;

async function readImage(res: Response): Promise<Fetched> {
  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
  if (!res.ok || !res.body || !IMAGE_TYPES.includes(type)) return null;
  if (Number(res.headers.get('content-length')) > MAX_IMAGE_BYTES) return TOO_BIG;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return new Blob(chunks as BlobPart[], { type });
    total += value.length;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      return TOO_BIG;
    }
    chunks.push(value);
  }
}

/**
 * An image's bytes. The page picks the URL, so the extension never sends cookies, and it won't reach this
 * computer or the local network unless the page itself is there; fetching from inside the page uses the page's
 * own access. Auto-save asks the page first (where it was copied), the right-click menu asks the extension
 * first. Too big ends it: no second download.
 */
export async function fetchImage(
  srcUrl: string,
  tab: Browser.tabs.Tab | undefined,
  { frameId, pageFirst = false }: { frameId?: number; pageFirst?: boolean } = {},
): Promise<Fetched> {
  if (srcUrl.startsWith('data:')) {
    if (srcUrl.length > MAX_DATA_URL) return null;
    try {
      return dataUrlToBlob(srcUrl);
    } catch {
      return null;
    }
  }
  const fromExtension = async (): Promise<Fetched> => {
    const host = hostOf(srcUrl);
    if (!/^https?:/i.test(srcUrl) || !host) return null;
    const pageHost = hostOf(tab?.url);
    if (isPrivateHost(host) && !(pageHost && isPrivateHost(pageHost))) return null;
    try {
      // A redirect could lead to this computer or the local network; it ends here, and the page gets a try.
      return await readImage(await fetch(srcUrl, { credentials: 'omit', redirect: 'manual' }));
    } catch {
      return null;
    }
  };
  const fromPage = (): Promise<Fetched> | null => (tab?.id == null ? null : fetchImageFromPage(srcUrl, tab.id, frameId));
  const [first, second] = pageFirst ? [fromPage, fromExtension] : [fromExtension, fromPage];
  return (await first()) ?? (await second());
}

async function fetchImageFromPage(srcUrl: string, tabId: number, frameId?: number): Promise<Fetched> {
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId, frameIds: frameId == null ? undefined : [frameId] },
      func: fetchImageInPage,
      args: [srcUrl, MAX_IMAGE_BYTES, IMAGE_TYPES],
    });
    const got = result?.result as string | { tooBig: true } | null;
    if (got && typeof got === 'object') return TOO_BIG;
    return got ? dataUrlToBlob(got) : null;
  } catch {
    return null;
  }
}

/** The image's file name from its address. A stray "%" in it must not stop the save. */
export function fileNameOf(srcUrl: string, pageUrl?: string): string | undefined {
  try {
    const last = new URL(srcUrl, pageUrl).pathname.split('/').pop() ?? '';
    try {
      return decodeURIComponent(last) || undefined;
    } catch {
      return last || undefined;
    }
  } catch {
    return undefined;
  }
}
