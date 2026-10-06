type Tone = 'warning' | 'info' | 'neutral' | 'ai';

const TONES: Record<Tone, string> = {
  warning: 'bg-warning-bg border-warning-line text-warning-fg',
  info: 'bg-ai-bg border-transparent text-ai-fg',
  neutral: 'bg-surface border-line-strong text-ink',
  ai: 'bg-[#EEE8FB] border-[#CDBEF2] text-[#4A2FA0] dark:bg-[#2D2547] dark:border-[#3d3260] dark:text-[#B69CFF]',
};

export function Notice({
  tone,
  title,
  body,
  action,
}: {
  tone: Tone;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className={`rounded-2xl border px-4 py-3.5 ${TONES[tone]}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-[13px] leading-[19px] opacity-90">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2.5 h-[38px] cursor-pointer rounded-full bg-ink px-3.5 text-[13px] font-semibold text-on-ink"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
