import type { ClipKind } from '@/lib/db';
import type { DateFilter, SearchFilters } from '@/lib/search';

const KINDS: { id: ClipKind | 'any'; label: string }[] = [
  { id: 'any', label: 'Any type' },
  { id: 'text', label: 'Text' },
  { id: 'link', label: 'Links' },
  { id: 'image', label: 'Images' },
  { id: 'code', label: 'Code' },
];
const DATES: { id: DateFilter; label: string }[] = [
  { id: 'any', label: 'Any time' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
];

function Chip({
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
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-8 max-w-[9.5rem] shrink-0 cursor-pointer appearance-none rounded-full px-3 text-[13px] font-semibold ${
        active ? 'bg-ink text-on-ink' : 'border border-line-strong bg-bg text-ink'
      }`}
    >
      {children}
    </select>
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
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filters">
      <Chip
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
      </Chip>
      <Chip label="Site" value={filters.site} active={filters.site !== 'any'} onChange={(v) => onChange({ ...filters, site: v })}>
        <option value="any">Any site</option>
        {sites.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Chip>
      <Chip
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
      </Chip>
    </div>
  );
}
