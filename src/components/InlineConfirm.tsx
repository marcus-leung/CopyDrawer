import { useEffect, useId, useRef } from 'react';
import { Button } from './ui';

/** A confirmation shown in place, instead of a browser dialog. Esc cancels; focus returns where it was. */
export function InlineConfirm({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  children,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** More choices, between the message and the buttons. */
  children?: React.ReactNode;
}) {
  const id = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    return () => before?.focus();
  }, []);
  return (
    <div
      role="alertdialog"
      aria-labelledby={id}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
      className="rounded-2xl border border-danger/40 bg-surface p-3.5"
    >
      <p id={id} className="text-sm leading-5">
        {message}
      </p>
      {children}
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button ref={cancel} size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
