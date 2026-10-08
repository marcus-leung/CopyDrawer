import { useRef } from 'react';
import type { Clip } from './db';
import { blobToDataUrl, getImageBlob } from './images';

/**
 * Lets an image clip be dragged out of the panel onto a page, a document or
 * the desktop. The image is read ahead of time (on hover or focus), because the drag
 * data has to be set the moment the drag starts.
 */
export function useDragOut(clip: Clip) {
  const dataUrl = useRef<string | null>(null);

  async function prepare() {
    if (clip.kind !== 'image' || dataUrl.current) return;
    const blob = (await getImageBlob(clip)) ?? clip.image?.thumb;
    if (blob) dataUrl.current = await blobToDataUrl(blob);
  }

  function setData(data: DataTransfer) {
    const url = dataUrl.current;
    if (clip.kind !== 'image' || !url) return;
    const ext = clip.image?.mime.split('/')[1] ?? 'png';
    const name = /\.\w{3,4}$/.test(clip.title) ? clip.title : `${clip.title || 'image'}.${ext}`;
    data.setData('text/uri-list', url);
    const img = document.createElement('img');
    img.src = url;
    img.alt = clip.title;
    data.setData('text/html', img.outerHTML);
    // Chrome-only: lets the desktop and file pickers take the image as a file.
    data.setData('DownloadURL', `${clip.image?.mime ?? 'image/png'}:${name.replace(/:/g, '')}:${url}`);
  }

  return { prepare, setData };
}
