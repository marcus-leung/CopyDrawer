type Tone = 'warning' | 'info' | 'neutral';

const TONES: Record<Tone, string> = {
  warning: 'bg-warning-bg border-warning-line text-warning-fg',
  info: 'bg-info-bg border-transparent text-info-fg',
  neutral: 'bg-surface border-line-strong text-ink',
};

export function Notice({
  tone,
  title,
  body,
  action,
  secondary,
}: {
  tone: Tone;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <div className={`rounded-2xl border px-4 py-3.5 ${TONES[tone]}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-[13px] leading-[19px] opacity-90">{body}</p>
      {(action || secondary) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              className="h-[38px] cursor-pointer rounded-full bg-ink px-3.5 text-[13px] font-semibold text-on-ink disabled:cursor-default disabled:opacity-60"
            >
              {action.label}
            </button>
          )}
          {secondary && (
            <button
              type="button"
              onClick={secondary.onClick}
              className="cursor-pointer text-[13px] font-semibold underline-offset-2 hover:underline"
            >
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
