import type { ButtonHTMLAttributes, ComponentProps, InputHTMLAttributes, ReactNode } from 'react';
import { Search } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent',
  secondary: 'bg-surface text-ink',
  outline: 'border-[1.5px] border-ink bg-transparent text-ink',
  danger: 'border-[1.5px] border-danger bg-transparent text-danger',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-[13px]',
  md: 'h-11 px-4 text-sm',
  lg: 'h-[52px] px-5 text-[15px]',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}

export function IconButton({
  label,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink hover:bg-surface ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SearchField({ label, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label
      className={`flex h-11 items-center gap-2.5 rounded-full bg-surface px-4 focus-within:shadow-[inset_0_0_0_1px_var(--color-line-strong)] ${className}`}
    >
      <Search size={18} className="shrink-0 text-text-3" aria-hidden />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-text-3"
        {...props}
      />
    </label>
  );
}
