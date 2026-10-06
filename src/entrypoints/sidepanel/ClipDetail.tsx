import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Pin, PinOff, Trash2 } from 'lucide-react';
import { db, type Clip } from '@/lib/db';
import { togglePin } from '@/lib/clips';
import { hostOf } from '@/lib/format';
import { Button, IconButton } from '@/components/ui';

export function ClipDetail({
  id,
  onBack,
  onCopy,
  onDelete,
}: {
  id: string;
  onBack: () => void;
  onCopy: (clip: Clip) => void;
  onDelete: (id: string) => void;
}) {
  const clip = useLiveQuery(() => db.clips.get(id), [id]);
  if (clip === undefined) return null;

  const host = hostOf(clip.source?.url);
  const saved = new Date(clip.createdAt).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <>
      <header className="flex items-center justify-between px-3.5 pt-3.5 pb-2">
        <IconButton label="Back" onClick={onBack}>
          <ChevronLeft size={20} aria-hidden />
        </IconButton>
        <div className="flex gap-1.5">
          <IconButton label={clip.pinned ? 'Unpin' : 'Pin'} className="bg-surface" onClick={() => void togglePin(clip.id)}>
            {clip.pinned ? <PinOff size={18} aria-hidden /> : <Pin size={18} aria-hidden />}
          </IconButton>
          <IconButton label="Delete" className="bg-surface text-danger" onClick={() => onDelete(clip.id)}>
            <Trash2 size={18} aria-hidden />
          </IconButton>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-[18px]">
        <h1 className="font-display text-[22px] leading-tight font-extrabold break-words">{clip.title}</h1>
        <p className="mt-1 text-[13px] text-text-3">
          {host ? (
            <>
              Copied from{' '}
              <a href={clip.source?.url} target="_blank" rel="noreferrer" className="text-link hover:text-link-hover">
                {host}
              </a>{' '}
              on {saved}
            </>
          ) : (
            <>Saved on {saved}</>
          )}
        </p>
        <pre
          className={`mt-4 rounded-2xl border border-line-strong p-4 text-sm leading-[21px] break-words whitespace-pre-wrap ${
            clip.kind === 'code' ? 'font-mono text-[13px]' : 'font-sans'
          }`}
        >
          {clip.text}
        </pre>
        <p className="mt-3 text-xs text-text-3">
          {clip.useCount > 0 ? `Used ${clip.useCount} ${clip.useCount === 1 ? 'time' : 'times'}.` : 'Not used yet.'}
        </p>
      </main>

      <div className="px-[18px] pt-3 pb-[18px]">
        <Button variant="primary" size="lg" className="w-full" onClick={() => onCopy(clip)}>
          Copy
        </Button>
      </div>
    </>
  );
}
