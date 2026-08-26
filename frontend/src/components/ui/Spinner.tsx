import { cn } from '@/lib/cn';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Announced to screen readers. Set to `null` inside a button that already has a label. */
  label?: string | null;
}

const SIZES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
} as const;

export function Spinner({ size = 'md', className, label = 'Loading' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn('inline-flex items-center justify-center', className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'animate-spin rounded-full border-current border-r-transparent opacity-70',
          SIZES[size],
        )}
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
