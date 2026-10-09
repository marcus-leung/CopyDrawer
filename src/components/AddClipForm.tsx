import { useEffect, useId, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { saveClip } from '@/lib/clips';
import { fromDataTransfer } from '@/lib/clipboard';
import { ImageError, saveImageClip } from '@/lib/images';
import { modKey } from '@/lib/format';
import { Button, IconButton } from './ui';

/** Type or paste text or images to save them as clips, right in the panel. Text typed with images is their note. */
export function AddClipForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const id = useId();
  const [text, setText] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const previews = useMemo(() => images.map((f) => URL.createObjectURL(f)), [images]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  async function save() {
    if (!text.trim() && !images.length) return setError('Type or paste something to save.');
    for (const [i, blob] of images.entries()) {
      try {
        await saveImageClip({ blob, fileName: blob.name || undefined, note: text });
      } catch (e) {
        setImages(images.slice(i));
        return setError(e instanceof ImageError ? e.message : "Couldn't save that image.");
      }
    }
    if (!images.length && text.trim()) await saveClip({ text });
    onSaved();
  }

  return (
    <form
      aria-label="Add a clip"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void save();
        }
      }}
      onPaste={(e) => {
        const pasted = fromDataTransfer(e.clipboardData).images;
        if (!pasted.length) return;
        e.preventDefault();
        setImages([...images, ...pasted]);
        setError(null);
      }}
      className="flex flex-col gap-2.5 rounded-2xl bg-info-bg p-3.5 text-info-fg"
    >
      <div className="-mt-1 -mr-1.5 flex items-center justify-between">
        <label htmlFor={id} className="font-display text-[15px] font-semibold">
          New clip
        </label>
        <IconButton label="Close" className="size-8! hover:bg-bg/60" onClick={onCancel}>
          <X size={16} aria-hidden />
        </IconButton>
      </div>
      <textarea
        id={id}
        autoFocus
        rows={3}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
        placeholder={images.length ? 'Add a note (optional)' : 'Type, or paste text or an image'}
        className="resize-y rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-text-3"
      />
      {images.length > 0 && (
        <ul aria-label="Images to save" className="flex flex-wrap gap-2">
          {previews.map((url, i) => (
            <li key={url} className="relative">
              <img src={url} alt="" className="size-16 rounded-lg bg-bg object-cover" />
              <button
                type="button"
                aria-label={`Remove image ${i + 1}`}
                onClick={() => setImages(images.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 flex size-6 cursor-pointer items-center justify-center rounded-full bg-ink text-on-ink"
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-xs">
          {modKey('Enter')} saves, Esc cancels.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary">
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
