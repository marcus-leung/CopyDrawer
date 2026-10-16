import { useCallback, useEffect, useRef } from 'react';
import { Button } from './ui';

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
  }
  return null;
}

export function ShowMore({ rest, pageSize, onMore }: { rest: number; pageSize: number; onMore: () => void }) {
  const latest = useRef(onMore);
  const watched = useRef<{ io: IntersectionObserver; el: HTMLElement } | null>(null);
  // A callback ref, so the observer follows the button whenever it appears, however the list grew.
  const observe = useCallback((el: HTMLButtonElement | null) => {
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && latest.current(), {
      root: scrollParent(el),
      rootMargin: '400px 0px',
    });
    io.observe(el);
    watched.current = { io, el };
    return () => {
      io.disconnect();
      watched.current = null;
    };
  }, []);
  // After each page, look again: if the button is still near the bottom, load the next one too.
  useEffect(() => {
    latest.current = onMore;
    const w = watched.current;
    if (w) {
      w.io.unobserve(w.el);
      w.io.observe(w.el);
    }
  }, [onMore]);
  if (rest <= 0) return null;
  return (
    <div className="flex justify-center py-3">
      <Button ref={observe} size="sm" variant="outline" onClick={onMore}>
        Show {Math.min(rest, pageSize)} more
      </Button>
    </div>
  );
}
