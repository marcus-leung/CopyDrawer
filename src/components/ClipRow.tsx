import { Braces, CalendarDays, Code2, Copy, Hash, Link2, Mail, MapPin, Phone, Pin, Type } from 'lucide-react';
import { IconButton } from './ui';
import type { Clip, Collection } from '@/lib/db';
import { colorOf } from '@/lib/collections';
import { hostOf, shortTime } from '@/lib/format';
import { useObjectUrl } from '@/lib/useObjectUrl';
import { useDragOut } from '@/lib/useDragOut';
import { colorFormats, parseColor } from '@/lib/actions';
import { KIND_LABEL, type ClipKind } from '@/lib/kinds';

/** Drag data type for moving a clip onto a collection (the panel's drop-to-save ignores it). */
export const CLIP_DRAG_TYPE = 'application/x-clipboard-clip';

const KIND_ICON: Record<Exclude<ClipKind, 'image' | 'color'>, typeof Type> = {
  text: Type,
  link: Link2,
  code: Code2,
  json: Braces,
  email: Mail,
  phone: Phone,
  address: MapPin,
  date: CalendarDays,
  number: Hash,
};

export function ClipRow({
  clip,
  onOpen,
  onCopy,
  collection,
}: {
  clip: Clip;
  collection?: Collection;
  onOpen: (clip: Clip) => void;
  onCopy: (clip: Clip) => void;
}) {
  const host = hostOf(clip.source?.url);
  const from = host ? `from ${host}` : 'saved by hand';
  // Text and links need no label: the icon and title already say what they are.
  const type = clip.kind === 'text' || clip.kind === 'link' ? undefined : KIND_LABEL[clip.kind][0];
  const meta = [type, collection?.name, from, shortTime(clip.createdAt)].filter(Boolean).join(', ');
  const dragOut = useDragOut(clip);
  return (
    <li className="flex min-h-14 items-center gap-3 border-b border-line">
      <button
        type="button"
        draggable
        onPointerEnter={() => void dragOut.prepare()}
        onFocus={() => void dragOut.prepare()}
        onDragStart={(e) => {
          e.dataTransfer.setData(CLIP_DRAG_TYPE, clip.id);
          dragOut.setData(e.dataTransfer);
          e.dataTransfer.effectAllowed = 'copyMove';
        }}
        onClick={() => onOpen(clip)}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2.5 text-left"
      >
        <ClipIcon clip={clip} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
            {collection && <CollectionDot collection={collection} />}
            {clip.pinned === 1 && <Pin size={12} className="shrink-0 text-text-3" aria-label="Pinned" />}
            <span className="truncate">{clip.title}</span>
          </span>
          {clip.note && <span className="block truncate text-xs text-text-2">{clip.note}</span>}
          <span className="block truncate text-xs text-text-3">{meta.charAt(0).toUpperCase() + meta.slice(1)}</span>
        </span>
      </button>
      <IconButton
        label={clip.kind === 'image' ? 'Copy image' : 'Copy'}
        className="size-10 bg-surface hover:opacity-90"
        onClick={() => onCopy(clip)}
      >
        <Copy size={17} aria-hidden />
      </IconButton>
    </li>
  );
}

function ClipIcon({ clip }: { clip: Clip }) {
  const thumbUrl = useObjectUrl(clip.image?.thumb);
  if (clip.kind === 'image') {
    return (
      <span
        className="size-10 shrink-0 rounded-lg bg-surface bg-cover bg-center"
        style={thumbUrl ? { backgroundImage: `url("${thumbUrl}")` } : undefined}
        aria-hidden
      />
    );
  }
  if (clip.kind === 'color') {
    const rgb = parseColor(clip.text);
    return (
      <span
        className="size-4 shrink-0 rounded-full border border-line-strong"
        style={rgb ? { background: colorFormats(rgb).rgb } : undefined}
        aria-hidden
      />
    );
  }
  const Icon = KIND_ICON[clip.kind];
  return <Icon size={16} className="shrink-0 text-text-3" aria-hidden />;
}

function CollectionDot({ collection }: { collection: Collection }) {
  const c = colorOf(collection);
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full bg-[var(--d)] dark:bg-[var(--dd)]"
      style={{ '--d': c.accent, '--dd': c.accentDark } as React.CSSProperties}
      aria-hidden
    />
  );
}
