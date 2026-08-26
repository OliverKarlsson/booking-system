import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/** The page gutter and max width, in one place so every screen lines up with the header. */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn('mx-auto w-full max-w-page px-gutter py-section', className)}>
      {children}
    </div>
  );
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Primary action for the page, right-aligned. */
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-ink-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
