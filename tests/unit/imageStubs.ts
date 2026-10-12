import { vi } from 'vitest';

/** Unit tests run without image decoding: only PNG bytes "decode", and every preview is the same small webp. */
export function stubImageDecoding() {
  vi.stubGlobal('createImageBitmap', async (blob: Blob) => {
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    if (head[0] !== 0x89 || head[1] !== 0x50 || head[2] !== 0x4e || head[3] !== 0x47) throw new Error('not an image');
    return { width: 2, height: 3, close() {} };
  });
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return { drawImage() {} };
      }
      async convertToBlob() {
        return new Blob(['thumb'], { type: 'image/webp' });
      }
    },
  );
}
