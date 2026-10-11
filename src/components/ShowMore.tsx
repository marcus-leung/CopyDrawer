import { useEffect, useRef } from 'react';
import { Button } from './ui';

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
  }
  return null;
}

/** Under a long list: loads the next page when scrolled near, or when pressed. */
export function ShowMore({ rest, pageSize, onMore }: { rest: number; pageSize: number; onMore: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onMore(), {
      root: scrollParent(el),
      rootMargin: '400px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [onMore]);
  if (rest <= 0) return null;
  return (
    <div className="flex justify-center py-3">
      <Button ref={ref} size="sm" variant="outline" onClick={onMore}>
        Show {Math.min(rest, pageSize)} more
      </Button>
    </div>
  );
}
