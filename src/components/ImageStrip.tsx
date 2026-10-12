import { useMemo, useState } from 'react';
import type { Clip } from '@/lib/db';
import { colorFormats, parseColor } from '@/lib/actions';
import { moveInStrip, stripRank } from '@/lib/clips';
import { useObjectUrl } from '@/lib/useObjectUrl';
import { useDragOut } from '@/lib/useDragOut';
import { CLIP_DRAG_TYPE, isPickClick, keepTextUnselected, PickBox } from './ClipRow';
import { useListPicks, type RowPick, type Selection } from '@/lib/useSelection';

/** Marks a drag that started in the strip, so dropping on another tile reorders. */
const STRIP_DRAG_TYPE = 'application/x-copydrawer-strip';

/** Recent images and colors, side by side on home. Drag to reorder, file or drag out. */
export function ImageStrip({
  clips,
  onOpen,
  onSeeAll,
  selection,
}: {
  clips: Clip[];
  onOpen: (clip: Clip) => void;
  onSeeAll: () => void;
  selection: Selection;
}) {
  const items = useMemo(
    () =>
      clips
        .filter((c) => c.kind === 'image' || c.kind === 'color')
        .sort((a, b) => stripRank(b) - stripRank(a))
        .slice(0, 12),
    [clips],
  );
  const pickFor = useListPicks(
    selection,
    useMemo(() => items.map((c) => c.id), [items]),
  );
  if (!items.length) return null;
  return (
    <section aria-labelledby="strip-title" className="pb-4">
      <div className="flex items-center justify-between pb-2">
        <h2 id="strip-title" className="font-display text-[17px] font-semibold">
          Images and colors
        </h2>
        <button
          type="button"
          onClick={onSeeAll}
          className="h-8 cursor-pointer rounded-full px-2 text-[13px] font-semibold text-link hover:text-link-hover"
        >
          See all
        </button>
      </div>
      <ul className="-mx-[18px] flex gap-2 overflow-x-auto px-[18px] pb-1" aria-label="Images and colors">
        {items.map((c) => (
          <StripItem
            key={c.id}
            clip={c}
            onOpen={onOpen}
            onReorder={(id) => void moveInStrip(id, c.id, items)}
            pick={pickFor(c.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function StripItem({
  clip,
  onOpen,
  onReorder,
  pick,
}: {
  clip: Clip;
  onOpen: (clip: Clip) => void;
  onReorder: (id: string) => void;
  pick?: RowPick;
}) {
  const dragOut = useDragOut(clip);
  const [over, setOver] = useState(false);
  const isStripDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(STRIP_DRAG_TYPE);
  return (
    <li
      className="group relative shrink-0 rounded-xl data-[drop-target]:outline-2 data-[drop-target]:outline-offset-2 data-[drop-target]:outline-ink"
      data-drop-target={over || undefined}
      onDragOver={(e) => {
        if (!isStripDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!isStripDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        onReorder(e.dataTransfer.getData(CLIP_DRAG_TYPE));
      }}
    >
      <button
        type="button"
        draggable
        onPointerEnter={() => void dragOut.prepare()}
        onFocus={() => void dragOut.prepare()}
        onDragStart={(e) => {
          e.dataTransfer.setData(CLIP_DRAG_TYPE, clip.id);
          e.dataTransfer.setData(STRIP_DRAG_TYPE, clip.id);
          dragOut.setData(e.dataTransfer);
          e.dataTransfer.effectAllowed = 'copyMove';
        }}
        onMouseDown={keepTextUnselected(pick)}
        onClick={(e) => (isPickClick(pick, e) ? pick.onPick(e) : onOpen(clip))}
        className={`block cursor-pointer rounded-xl ${pick?.number ? 'outline-2 outline-offset-2 outline-ink' : ''}`}
        aria-label={clip.title}
      >
        {clip.kind === 'image' ? <Thumb clip={clip} /> : <ColorChip text={clip.text} />}
      </button>
      {pick && <PickBox title={clip.title} pick={pick} className="absolute top-0 left-0 size-9" />}
    </li>
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
    <span
      className="flex size-[72px] flex-col justify-end overflow-hidden rounded-xl border border-line-strong"
      style={{ background: f.rgb }}
    >
      <span className="bg-bg/85 px-1.5 py-0.5 font-mono text-[10px] text-ink">{f.hex}</span>
    </span>
  );
}
