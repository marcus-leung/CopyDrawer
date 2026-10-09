import type { Clip } from '@/lib/db';
import { TRANSFORMS, type Transform } from '@/lib/transforms';

const chip = 'h-8 cursor-pointer rounded-full border border-line-strong bg-bg px-3 text-[13px] font-semibold text-ink';

/** Paste as: each option copies the reshaped clip right away. */
export function PasteAs({
  clip,
  onCopyOriginal,
  notify,
}: {
  clip: Clip;
  onCopyOriginal: () => void;
  notify: (message: string) => void;
}) {
  async function copyAs(t: Transform) {
    if (t === 'asis') return onCopyOriginal();
    await navigator.clipboard.writeText(clip.text);
    notify(`Copied as ${TRANSFORMS.find((p) => p.id === t)!.label.toLowerCase()}`);
  }

  return (
    <section aria-labelledby="paste-as" className="mt-5">
      <h2 id="paste-as" className="mb-2 font-display text-[17px] font-semibold">
        Paste as
      </h2>
      <div className="flex flex-wrap gap-2">
        {TRANSFORMS.map((t) => (
          <button key={t.id} type="button" className={chip} onClick={() => void copyAs(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
    </section>
  );
}
