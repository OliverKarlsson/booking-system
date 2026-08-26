import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** A "Create the first…" button. An empty list is the best place to offer the action. */
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-ink-300 bg-white px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? <div className="mb-3 text-ink-400">{icon}</div> : null}
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
