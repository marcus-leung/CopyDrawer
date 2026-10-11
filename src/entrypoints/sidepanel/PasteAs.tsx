import type { Clip } from '@/lib/db';

const chip = 'h-8 cursor-pointer rounded-full border border-line-strong bg-bg px-3 text-[13px] font-semibold text-ink';

/** Paste as, for clips with formatting: keep it, or copy plain text. */
export function PasteAs({
  clip,
  onCopyOriginal,
  notify,
}: {
  clip: Clip;
  onCopyOriginal: () => void;
  notify: (message: string) => void;
}) {
  async function copyPlain() {
    await navigator.clipboard.writeText(clip.text);
    notify('Copied as plain text');
  }

  return (
    <section aria-labelledby="paste-as" className="mt-5">
      <h2 id="paste-as" className="mb-2 font-display text-[17px] font-semibold">
        Paste as
      </h2>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={chip} onClick={onCopyOriginal}>
          Paste as is
        </button>
        <button type="button" className={chip} onClick={() => void copyPlain()}>
          Plain text
        </button>
      </div>
    </section>
  );
}
