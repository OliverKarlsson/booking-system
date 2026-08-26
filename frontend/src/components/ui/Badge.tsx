import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'accent';

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  success: 'bg-success-100 text-success-800',
  danger: 'bg-danger-100 text-danger-800',
  warning: 'bg-warning-100 text-warning-800',
  accent: 'bg-accent-100 text-accent-800',
};

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        // Colour alone must not carry the meaning, so the label is always spelled out
        // ("Occupied", "Cancelled") rather than being a bare coloured dot.
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
