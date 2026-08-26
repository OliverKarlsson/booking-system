import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Buttons for the footer row. */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

/**
 * A presentational dialog. It owns focus and Escape handling — mechanics every feature
 * would otherwise reimplement slightly differently — but knows nothing about what is
 * inside it or why it is open. Whether it is open is `uiSlice`'s business.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = `${titleId}-description`;

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    // Moving focus into the dialog is what makes Escape reach this handler for a
    // keyboard user, and stops Tab from wandering back into the page behind it.
    panelRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink-900/40"
        onClick={onClose}
        // The backdrop duplicates the close button, so it is decoration for assistive
        // tech rather than a second announced control.
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full rounded-card bg-white shadow-xl focus:outline-none',
          SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink-900">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-0.5 text-sm text-ink-500">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-800"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-ink-200 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
