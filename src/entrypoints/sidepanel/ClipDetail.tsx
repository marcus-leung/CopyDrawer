import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Copy, Pencil, Pin, PinOff, StickyNote, Trash2 } from 'lucide-react';
import { db, type Clip } from '@/lib/db';
import { editClip, togglePin } from '@/lib/clips';
import { moveClip } from '@/lib/collections';
import { NewCollectionForm } from '@/components/NewCollectionForm';
import { hostOf } from '@/lib/format';
import { formatBytes } from '@/lib/images';
import { useObjectUrl } from '@/lib/useObjectUrl';
import { Button, IconButton } from '@/components/ui';
import { ExpandButton } from '@/components/ExpandButton';
import { PasteAs } from './PasteAs';
import { SmartActions } from '@/components/SmartActions';
import { CodeView } from '@/components/CodeView';

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
  // undefined while loading, null once it's gone (deleted from the popup, by Undo on a page, or by auto-delete).
  const clip = useLiveQuery(async () => (await db.clips.get(id)) ?? null, [id]);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (clip === null) onBack();
  }, [clip, onBack]);
  if (!clip) return null;
  if (editing) {
    return (
      <EditClip
        clip={clip}
        onDone={(saved) => {
          setEditing(false);
          if (saved) notify('Saved your changes');
        }}
      />
    );
  }

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
          <ExpandButton className="bg-surface" />
          <IconButton label="Edit" className="bg-surface" onClick={() => setEditing(true)}>
            <Pencil size={18} aria-hidden />
          </IconButton>
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
        {clip.kind === 'image' &&
          (clip.note ? (
            <section aria-labelledby="note-title" className="mt-3 rounded-2xl bg-surface p-3.5">
              <h2 id="note-title" className="text-[13px] font-semibold text-text-2">
                Note
              </h2>
              <p className="mt-1 text-sm break-words whitespace-pre-wrap">{clip.note}</p>
            </section>
          ) : (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setEditing(true)}>
              <StickyNote size={16} aria-hidden />
              Add a note
            </Button>
          ))}
        <MoveTo clip={clip} />
        {clip.kind !== 'image' && (
          <pre
            className={`mt-4 rounded-2xl border border-line-strong p-4 text-sm leading-[21px] break-words whitespace-pre-wrap ${
              clip.kind === 'code' || clip.kind === 'json' ? 'font-mono text-[13px]' : 'font-sans'
            }`}
          >
            {clip.kind === 'code' ? <CodeView code={clip.text} /> : clip.text}
          </pre>
        )}
        <SmartActions clip={clip} notify={notify} />
        {clip.html && clip.kind !== 'image' && <PasteAs clip={clip} onCopyOriginal={() => onCopy(clip)} notify={notify} />}
      </main>

      <div className="flex gap-2 px-[18px] pt-3 pb-[18px]">
        <Button variant="primary" size="lg" className="flex-1" onClick={() => onCopy(clip)}>
          <Copy size={18} aria-hidden />
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
  const base = clip.title
    .replace(/\.(png|jpe?g|gif|webp)$/i, '')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .slice(0, 60);
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
  const [creating, setCreating] = useState(false);
  if (!collections) return null;
  return (
    <>
      <label className="mt-3 flex items-center gap-2 text-[13px] text-text-2">
        Collection
        <select
          value={creating ? NEW : (clip.collectionId ?? '')}
          onChange={(e) => {
            const value = e.target.value;
            setCreating(value === NEW);
            if (value !== NEW) void moveClip(clip.id, value || undefined);
          }}
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
      {creating && (
        <div className="mt-2.5">
          <NewCollectionForm
            onCancel={() => setCreating(false)}
            onCreated={(c) => {
              setCreating(false);
              void moveClip(clip.id, c.id);
            }}
          />
        </div>
      )}
    </>
  );
}

function EditClip({ clip, onDone }: { clip: Clip; onDone: (saved: boolean) => void }) {
  const [title, setTitle] = useState(clip.title);
  const [text, setText] = useState(clip.text);
  const [note, setNote] = useState(clip.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const isImage = clip.kind === 'image';

  async function save() {
    if (!isImage && !text.trim()) {
      setError("The clip can't be empty. Delete it instead if you don't need it.");
      return;
    }
    await editClip(clip.id, { title, ...(isImage ? { note } : { text }) });
    onDone(true);
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onDone(false);
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save();
      }}
    >
      <header className="flex items-center gap-1.5 px-3.5 pt-3.5 pb-2">
        <IconButton label="Cancel editing" onClick={() => onDone(false)}>
          <ChevronLeft size={20} aria-hidden />
        </IconButton>
        <h1 className="font-display text-[22px] font-extrabold">Edit clip</h1>
      </header>
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[18px] pb-3">
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-text-2">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Made from the text when empty"
            className="h-11 rounded-xl border border-line-strong bg-bg px-3 text-sm font-normal text-ink"
          />
        </label>
        {isImage && (
          <label className="flex min-h-0 flex-1 flex-col gap-1.5 text-[13px] font-semibold text-text-2">
            Note
            <textarea
              value={note}
              autoFocus
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything to remember about this image"
              className="min-h-32 flex-1 resize-none rounded-xl border border-line-strong bg-bg p-3 text-sm leading-[21px] font-normal text-ink placeholder:text-text-3"
            />
          </label>
        )}
        {!isImage && (
          <label className="flex min-h-0 flex-1 flex-col gap-1.5 text-[13px] font-semibold text-text-2">
            Text
            <textarea
              value={text}
              autoFocus
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              aria-invalid={!!error}
              aria-describedby={error ? 'edit-error' : undefined}
              className={`min-h-48 flex-1 resize-none rounded-xl border border-line-strong bg-bg p-3 text-sm leading-[21px] font-normal text-ink ${
                clip.kind === 'code' || clip.kind === 'json' ? 'font-mono text-[13px]' : ''
              }`}
            />
          </label>
        )}
        {error && (
          <p id="edit-error" role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
        {clip.html && text.replace(/\r\n/g, '\n') !== clip.text && (
          <p className="text-[13px] text-text-2">Changing the text removes its formatting. It will paste as plain text.</p>
        )}
        <p className="text-xs text-text-3">Edits only change this saved copy, not the page it came from.</p>
      </main>
      <div className="flex gap-2 px-[18px] pt-3 pb-[18px]">
        <Button type="submit" variant="primary" size="lg" className="flex-1">
          Save
        </Button>
        <Button size="lg" onClick={() => onDone(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
