import { ChevronDown } from 'lucide-react';
import { CLIP_KINDS, KIND_LABEL } from '@/lib/kinds';
import { NO_FILTERS, type DateFilter, type SearchFilters, type SortOrder } from '@/lib/search';

const KINDS = [{ id: 'any', label: 'Any type' }, ...CLIP_KINDS.map((k) => ({ id: k, label: KIND_LABEL[k][1] }))];
const SORTS: { id: SortOrder; label: string }[] = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'used', label: 'Most used' },
  { id: 'az', label: 'A–Z' },
];
const DATES: { id: DateFilter; label: string }[] = [
  { id: 'any', label: 'Any time' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
];

function Field({
  label,
  value,
  active,
  onChange,
  children,
}: {
  label: string;
  value: string;
  active: boolean;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  const id = `filter-${label.toLowerCase()}`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="px-1 text-[11px] font-semibold tracking-wide text-text-3 uppercase">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`h-10 w-full cursor-pointer appearance-none truncate rounded-xl bg-surface pr-8 pl-3 text-[13px] text-ink ${
            active ? 'font-semibold shadow-[inset_0_0_0_1.5px_var(--color-ink)]' : ''
          }`}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-text-3"
          aria-hidden
        />
      </div>
    </div>
  );
}

export function FilterBar({
  filters,
  sites,
  onChange,
}: {
  filters: SearchFilters;
  sites: string[];
  onChange: (f: SearchFilters) => void;
}) {
  const changed = (Object.keys(NO_FILTERS) as (keyof SearchFilters)[]).some((k) => filters[k] !== NO_FILTERS[k]);
  return (
    <div role="group" aria-label="Filters">
      <div className="grid grid-cols-2 gap-x-2 gap-y-2.5">
        <Field
          label="Sort"
          value={filters.sort}
          active={filters.sort !== 'newest'}
          onChange={(v) => onChange({ ...filters, sort: v as SortOrder })}
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Field>
        <Field
          label="Type"
          value={filters.kind}
          active={filters.kind !== 'any'}
          onChange={(v) => onChange({ ...filters, kind: v as SearchFilters['kind'] })}
        >
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </Field>
        <Field
          label="Site"
          value={filters.site}
          active={filters.site !== 'any'}
          onChange={(v) => onChange({ ...filters, site: v })}
        >
          <option value="any">Any site</option>
          {sites.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Field>
        <Field
          label="Date"
          value={filters.date}
          active={filters.date !== 'any'}
          onChange={(v) => onChange({ ...filters, date: v as DateFilter })}
        >
          {DATES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </Field>
      </div>
      {changed && (
        <button
          type="button"
          onClick={() => onChange(NO_FILTERS)}
          className="mt-2 cursor-pointer px-1 text-[13px] font-semibold text-link hover:text-link-hover"
        >
          Reset
        </button>
      )}
    </div>
  );
}
