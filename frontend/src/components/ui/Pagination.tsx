import { cn } from '@/lib/cn';
import { Button } from './Button';

export interface PaginationProps {
  /** 1-based, matching the list envelope of §3.5. */
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
  /** Plural noun for the count line, e.g. "reservations". */
  itemLabel?: string;
}

/**
 * Offset pagination controls, mirroring the API's `page`/`limit`/`total`/`totalPages`
 * envelope. Cursor pagination would scale better on a large dataset, but the envelope
 * is offset-based and this control follows it rather than inventing a second model.
 */
export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  className,
  itemLabel = 'results',
}: PaginationProps) {
  // A single page of results needs no controls; rendering disabled arrows just adds
  // noise to the common case.
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex items-center justify-between gap-4 py-2', className)}
    >
      <p className="text-sm text-ink-500" aria-live="polite">
        Page {page} of {totalPages} · {total} {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
