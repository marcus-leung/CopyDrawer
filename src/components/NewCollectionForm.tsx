import { useEffect, useId, useState } from 'react';
import { createCollection, MAX_COLLECTION_NAME, nextColor } from '@/lib/collections';
import type { Collection } from '@/lib/db';
import { ColorPicker } from './ColorPicker';
import { Button } from './ui';

export function NewCollectionForm({ onCreated, onCancel }: { onCreated: (c: Collection) => void; onCancel: () => void }) {
  const id = useId();
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  const [error, setError] = useState(false);
  useEffect(() => {
    void nextColor().then(setColor);
  }, []);

  return (
    <form
      aria-label="New collection"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError(true);
        void createCollection(name, color).then(onCreated);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
      className="flex flex-col gap-3 rounded-2xl border border-line-strong p-3.5"
    >
      <label htmlFor={id} className="text-[13px] font-semibold text-text-2">
        Collection name
      </label>
      <input
        id={id}
        autoFocus
        value={name}
        maxLength={MAX_COLLECTION_NAME}
        onChange={(e) => {
          setName(e.target.value);
          setError(false);
        }}
        aria-invalid={error || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        placeholder="e.g. Thesis sources"
        className="-mt-1.5 h-11 rounded-xl border border-line-strong bg-bg px-3 text-sm text-ink placeholder:text-text-3"
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="-mt-1.5 text-[13px] text-danger">
          Give the collection a name.
        </p>
      )}
      <ColorPicker value={color} onChange={setColor} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary">
          Create
        </Button>
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
