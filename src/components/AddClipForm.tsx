import { useId, useState } from 'react';
import { saveClip } from '@/lib/clips';
import { modKey } from '@/lib/format';
import { Button } from './ui';

/** Type or paste text to save it as a clip, right in the panel. */
export function AddClipForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState(false);

  async function save() {
    if (!text.trim()) return setError(true);
    await saveClip({ text });
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
      className="flex flex-col gap-3 rounded-2xl border border-line-strong p-3.5"
    >
      <label htmlFor={id} className="text-[13px] font-semibold text-text-2">
        Clip
      </label>
      <textarea
        id={id}
        autoFocus
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(false);
        }}
        aria-invalid={error || undefined}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
        placeholder="Type or paste something to keep"
        className="-mt-1.5 resize-y rounded-xl border border-line-strong bg-bg px-3 py-2 text-sm text-ink placeholder:text-text-3"
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="-mt-1.5 text-[13px] text-danger">
          Type or paste something to save.
        </p>
      ) : (
        <p id={`${id}-hint`} className="-mt-1.5 text-xs text-text-3">
          {modKey('Enter')} saves, Esc cancels.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary">
          Save
        </Button>
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
