import { useEffect, useState } from 'react';
import { fromDataTransfer, type ClipboardContents } from '@/lib/clipboard';
import { CLIP_DRAG_TYPE } from '@/components/ClipRow';

type Contents = ClipboardContents & { images?: File[] };

/**
 * Pasting (outside a text field) or dropping files/text anywhere in the panel
 * saves them. Returns true while something is being dragged over the panel.
 */
export function usePanelInput(save: (contents: Contents) => void): boolean {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable="true"]')) return;
      const contents = fromDataTransfer(e.clipboardData);
      if (!contents.text.trim() && !contents.images.length) return;
      e.preventDefault();
      save(contents);
    };

    let depth = 0;
    // Files or text from outside; not a clip row being dragged onto a collection.
    const hasPayload = (e: DragEvent) => {
      const types = Array.from(e.dataTransfer?.types ?? []);
      return !types.includes(CLIP_DRAG_TYPE) && types.some((t) => t === 'Files' || t.startsWith('text/'));
    };
    const onEnter = (e: DragEvent) => {
      if (!hasPayload(e)) return;
      depth++;
      setDragging(true);
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasPayload(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasPayload(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const contents = fromDataTransfer(e.dataTransfer);
      if (contents.text.trim() || contents.images.length) save(contents);
    };

    const listeners = { paste: onPaste, dragenter: onEnter, dragleave: onLeave, dragover: onOver, drop: onDrop } as const;
    for (const [type, fn] of Object.entries(listeners)) window.addEventListener(type, fn as EventListener);
    return () => {
      for (const [type, fn] of Object.entries(listeners)) window.removeEventListener(type, fn as EventListener);
    };
  }, [save]);

  return dragging;
}
