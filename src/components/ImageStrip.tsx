import type { Clip } from '@/lib/db';
import { colorFormats, parseColor } from '@/lib/actions';
import { useObjectUrl } from '@/lib/useObjectUrl';

/** Recent images and colors, side by side (home, Folders design). */
export function ImageStrip({ clips, onOpen, onSeeAll }: { clips: Clip[]; onOpen: (clip: Clip) => void; onSeeAll: () => void }) {
  const items = clips.filter((c) => c.kind === 'image' || (c.kind === 'text' && c.text.length <= 40 && parseColor(c.text))).slice(0, 12);
  if (!items.length) return null;
  return (
    <section aria-labelledby="strip-title" className="pb-4">
      <div className="flex items-center justify-between pb-2">
        <h2 id="strip-title" className="font-display text-[17px] font-semibold">
          Images and colors
        </h2>
        <button type="button" onClick={onSeeAll} className="h-8 cursor-pointer rounded-full px-2 text-[13px] font-semibold text-link hover:text-link-hover">
          See all
        </button>
      </div>
      <ul className="-mx-[18px] flex gap-2 overflow-x-auto px-[18px] pb-1" aria-label="Images and colors">
        {items.map((c) => (
          <li key={c.id} className="shrink-0">
            <button type="button" onClick={() => onOpen(c)} className="block cursor-pointer" aria-label={c.title}>
              {c.kind === 'image' ? <Thumb clip={c} /> : <ColorChip text={c.text} />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Thumb({ clip }: { clip: Clip }) {
  const url = useObjectUrl(clip.image?.thumb);
  return (
    <span
      className="block size-[72px] rounded-xl bg-surface bg-cover bg-center"
      style={url ? { backgroundImage: `url("${url}")` } : undefined}
    />
  );
}

function ColorChip({ text }: { text: string }) {
  const rgb = parseColor(text)!;
  const f = colorFormats(rgb);
  return (
    <span className="flex size-[72px] flex-col justify-end overflow-hidden rounded-xl border border-line-strong" style={{ background: f.rgb }}>
      <span className="bg-bg/85 px-1.5 py-0.5 font-mono text-[10px] text-ink">{f.hex}</span>
    </span>
  );
}
