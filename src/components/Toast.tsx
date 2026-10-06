import { useEffect } from 'react';

export interface ToastState {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function Toast({ toast, onDone }: { toast: ToastState | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, toast.onAction ? 5000 : 2000);
    return () => clearTimeout(t);
  }, [toast, onDone]);

  if (!toast) return null;
  return (
    <div
      role="status"
      key={toast.id}
      className="animate-toast-in absolute inset-x-[18px] bottom-[18px] z-20 flex items-center justify-between gap-3 rounded-2xl bg-ink py-2.5 pr-2.5 pl-4 text-on-ink shadow-[0_14px_36px_rgba(27,29,42,0.24)]"
    >
      <span className="text-[13px]">{toast.message}</span>
      {toast.onAction && (
        <button
          type="button"
          onClick={() => {
            toast.onAction?.();
            onDone();
          }}
          className="h-[34px] cursor-pointer rounded-full bg-on-ink px-3 text-[13px] font-semibold text-ink"
        >
          {toast.actionLabel ?? 'Undo'}
        </button>
      )}
    </div>
  );
}
