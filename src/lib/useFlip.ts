import { useLayoutEffect, useRef, type RefObject } from 'react';

type Point = { x: number; y: number };

function positions(box: HTMLElement): Map<string, Point> {
  const origin = box.getBoundingClientRect();
  const out = new Map<string, Point>();
  for (const el of box.querySelectorAll<HTMLElement>('[data-flip-key]')) {
    const r = el.getBoundingClientRect();
    out.set(el.dataset.flipKey!, { x: r.left - origin.left, y: r.top - origin.top });
  }
  return out;
}

/**
 * Slides children marked `data-flip-key` to their new places whenever `key` changes. Call the returned
 * `capture()` just before changing the order: it records where tiles are on screen right now, mid-slide
 * included, so a new move continues from there instead of jumping. Positions are relative to the container.
 */
export function useFlip(container: RefObject<HTMLElement | null>, key: string): () => void {
  const last = useRef(new Map<string, Point>());
  const captured = useRef<Map<string, Point> | null>(null);
  const running = useRef(new Set<Animation>());
  const capture = () => {
    if (container.current) captured.current = positions(container.current);
  };

  useLayoutEffect(() => {
    const box = container.current;
    if (!box) return;
    const before = captured.current ?? last.current;
    captured.current = null;
    const els = [...box.querySelectorAll<HTMLElement>('[data-flip-key]')];
    // Only this hook's own slides: other animations (the tiles' CSS transitions) carry on.
    for (const a of running.current) a.cancel();
    running.current.clear();
    const now = positions(box);
    last.current = now;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const el of els) {
      const from = before.get(el.dataset.flipKey!);
      const to = now.get(el.dataset.flipKey!)!;
      if (!from || (from.x === to.x && from.y === to.y)) continue;
      const slide = el.animate([{ transform: `translate(${from.x - to.x}px, ${from.y - to.y}px)` }, { transform: 'none' }], {
        duration: 220,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      });
      running.current.add(slide);
      slide.onfinish = () => running.current.delete(slide);
    }
  }, [container, key]);

  return capture;
}
