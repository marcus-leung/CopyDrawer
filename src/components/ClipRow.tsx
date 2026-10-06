import { Link2, Pin, Code2, Type } from 'lucide-react';
import type { Clip } from '@/lib/db';
import { hostOf, shortTime } from '@/lib/format';
import { useObjectUrl } from '@/lib/useObjectUrl';

const KIND_ICON = { text: Type, link: Link2, code: Code2, image: Type } as const;

export function ClipRow({
  clip,
  onOpen,
  onCopy,
}: {
  clip: Clip;
  onOpen: (clip: Clip) => void;
  onCopy: (clip: Clip) => void;
}) {
  const host = hostOf(clip.source?.url);
  return (
    <li className="flex min-h-14 items-center gap-3 border-b border-line">
      <button
        type="button"
        onClick={() => onOpen(clip)}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2.5 text-left"
      >
        <ClipIcon clip={clip} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
            {clip.pinned === 1 && <Pin size={12} className="shrink-0 text-text-3" aria-label="Pinned" />}
            <span className="truncate">{clip.title}</span>
          </span>
          <span className="block truncate text-xs text-text-3">
            {host ? `From ${host}` : 'Saved by hand'}, {shortTime(clip.createdAt)}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onCopy(clip)}
        className="h-9 shrink-0 cursor-pointer rounded-full bg-surface px-3 text-[13px] font-semibold text-ink hover:opacity-90"
      >
        Copy
      </button>
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
  const Icon = KIND_ICON[clip.kind];
  return <Icon size={16} className="shrink-0 text-text-3" aria-hidden />;
}
