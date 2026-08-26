import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export interface ErrorBannerProps {
  title?: string;
  /** The message to show. Pass a resolved string — the banner does not inspect errors. */
  message: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * A persistent, in-place error.
 *
 * Deliberately not a toast: a booking conflict has to stay on screen next to the form
 * while the user picks different dates. `role="alert"` makes it announced the moment
 * it appears.
 */
export function ErrorBanner({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-md border border-danger-500/40 bg-danger-100 px-4 py-3',
        className,
      )}
    >
      <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 text-danger-600" fill="none">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 6v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="10" cy="14" r="0.9" fill="currentColor" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-danger-800">{title}</p>
        <div className="mt-0.5 text-sm text-danger-800/90">{message}</div>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
