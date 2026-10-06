import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Pin, PinOff, Trash2 } from 'lucide-react';
import { db, type Clip } from '@/lib/db';
import { togglePin } from '@/lib/clips';
import { createCollection, moveClip } from '@/lib/collections';
import { hostOf } from '@/lib/format';
import { formatBytes } from '@/lib/images';
import { useObjectUrl } from '@/lib/useObjectUrl';
import { Button, IconButton } from '@/components/ui';
import { PasteAs } from './PasteAs';

export function ClipDetail({
  id,
  onBack,
  onCopy,
  onDelete,
  notify,
}: {
  id: string;
  notify: (message: string) => void;
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
        {clip.kind === 'image' && <ImagePreview clip={clip} />}
        <h1 className="mt-1 font-display text-[22px] leading-tight font-extrabold break-words">{clip.title}</h1>
        <p className="mt-1 text-[13px] text-text-3">
          {host ? (
            <>
              {clip.kind === 'image' ? 'Saved from' : 'Copied from'}{' '}
              <a href={clip.source?.url} target="_blank" rel="noreferrer" className="text-link hover:text-link-hover">
                {host}
              </a>{' '}
              on {saved}
            </>
          ) : (
            <>Saved on {saved}</>
          )}
          {clip.image && (
            <>
              . {clip.image.mime.replace('image/', '').toUpperCase()}, {clip.image.width} × {clip.image.height},{' '}
              {formatBytes(clip.image.bytes)}
            </>
          )}
        </p>
        <MoveTo clip={clip} />
        {clip.kind !== 'image' && (
          <pre
            className={`mt-4 rounded-2xl border border-line-strong p-4 text-sm leading-[21px] break-words whitespace-pre-wrap ${
              clip.kind === 'code' ? 'font-mono text-[13px]' : 'font-sans'
            }`}
          >
            {clip.text}
          </pre>
        )}
        {clip.kind !== 'image' && <PasteAs clip={clip} onCopyOriginal={() => onCopy(clip)} notify={notify} />}
        <p className="mt-3 text-xs text-text-3">
          {clip.useCount > 0 ? `Used ${clip.useCount} ${clip.useCount === 1 ? 'time' : 'times'}.` : 'Not used yet.'}
        </p>
      </main>

      <div className="flex gap-2 px-[18px] pt-3 pb-[18px]">
        <Button variant="primary" size="lg" className="flex-1" onClick={() => onCopy(clip)}>
          {clip.kind === 'image' ? 'Copy image' : 'Copy'}
        </Button>
        {clip.kind === 'image' && <DownloadButton clip={clip} />}
      </div>
    </>
  );
}

function ImagePreview({ clip }: { clip: Clip }) {
  const blob = useLiveQuery(() => (clip.image ? db.images.get(clip.image.imageId) : undefined), [clip.image?.imageId]);
  const url = useObjectUrl(blob?.blob ?? clip.image?.thumb);
  return (
    <div className="mb-3 flex max-h-72 items-center justify-center overflow-hidden rounded-2xl bg-surface">
      {url && <img src={url} alt={clip.text || clip.title} className="max-h-72 max-w-full object-contain" />}
    </div>
  );
}

function DownloadButton({ clip }: { clip: Clip }) {
  const stored = useLiveQuery(() => (clip.image ? db.images.get(clip.image.imageId) : undefined), [clip.image?.imageId]);
  const url = useObjectUrl(stored?.blob);
  const ext = clip.image?.mime.split('/')[1] ?? 'png';
  const base = clip.title.replace(/\.(png|jpe?g|gif|webp)$/i, '').replace(/[^\w\- ]+/g, '').trim().slice(0, 60);
  const name = `${base || 'image'}.${ext}`;
  return (
    <a
      href={url}
      download={name}
      className="inline-flex h-[52px] items-center justify-center rounded-full bg-surface px-5 text-[15px] font-semibold text-ink"
    >
      Download
    </a>
  );
}

const NEW = '__new__';

function MoveTo({ clip }: { clip: Clip }) {
  const collections = useLiveQuery(() => db.collections.orderBy('order').toArray(), []);
  if (!collections) return null;
  async function change(value: string) {
    if (value === NEW) {
      const name = prompt('Name the new collection');
      if (!name?.trim()) return;
      const created = await createCollection(name);
      await moveClip(clip.id, created.id);
      return;
    }
    await moveClip(clip.id, value || undefined);
  }
  return (
    <label className="mt-3 flex items-center gap-2 text-[13px] text-text-2">
      Collection
      <select
        value={clip.collectionId ?? ''}
        onChange={(e) => void change(e.target.value)}
        className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-bg px-2 text-[13px] text-ink"
      >
        <option value="">None</option>
        {collections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value={NEW}>New collection…</option>
      </select>
    </label>
  );
}
