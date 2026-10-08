import { useId } from 'react';
import { colorOf, PRESET_COLORS } from '@/lib/collections';

const RAINBOW = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map((h) => `hsl(${h} 75% 50%)`).join(', ')})`;
const THUMB =
  '[&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[var(--pick)] [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,.35)]';

/** Preset swatches plus a rainbow bar for any hue. `value` is a preset name or "hue:<0-359>". */
export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const id = useId();
  const custom = /^hue:(\d+)$/.exec(value);
  const hue = custom ? Number(custom[1]) : 200;
  return (
    <div className="flex flex-col gap-2.5">
      <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((name) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={value === name}
            aria-label={name[0]!.toUpperCase() + name.slice(1)}
            onClick={() => onChange(name)}
            style={{ background: colorOf({ color: name }).accent }}
            className="size-7 cursor-pointer rounded-full outline-offset-2 aria-checked:outline-2 aria-checked:outline-ink"
          />
        ))}
      </div>
      <label htmlFor={id} className="sr-only">
        Custom color
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={359}
        value={hue}
        onChange={(e) => onChange(`hue:${e.target.value}`)}
        style={{ background: RAINBOW, '--pick': `hsl(${hue} 75% 50%)` } as React.CSSProperties}
        className={`h-3 w-full cursor-pointer appearance-none rounded-full ${custom ? 'outline-2 outline-offset-2 outline-ink' : ''} ${THUMB}`}
      />
    </div>
  );
}
