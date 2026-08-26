import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. Use for in-flight mutations. */
  loading?: boolean;
  leadingIcon?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent-500 text-white hover:bg-accent-600 disabled:hover:bg-accent-500',
  secondary:
    'bg-white text-ink-800 border border-ink-200 hover:bg-ink-50 disabled:hover:bg-white',
  ghost: 'bg-transparent text-ink-600 hover:bg-ink-100 disabled:hover:bg-transparent',
  danger: 'bg-danger-600 text-white hover:bg-danger-500 disabled:hover:bg-danger-600',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leadingIcon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      // Defaulting to `button` rather than the HTML default `submit` — a stray button
      // inside a form otherwise submits it, which for the reservation form means an
      // accidental booking attempt.
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : leadingIcon}
      {children}
    </button>
  );
}
