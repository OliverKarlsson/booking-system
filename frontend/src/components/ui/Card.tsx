import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn('rounded-card border border-ink-200 bg-white shadow-sm', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

// `title` is omitted from the DOM props: HTML's own `title` attribute is a string
// tooltip, and this one is the heading node.
export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Buttons or a badge, right-aligned on the same row as the title. */
  actions?: ReactNode;
}

export function CardHeader({ title, subtitle, actions, className, ...rest }: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4',
        className,
      )}
      {...rest}
    >
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold text-ink-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 py-4', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 border-t border-ink-200 px-5 py-3',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
