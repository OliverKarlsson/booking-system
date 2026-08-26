import clsx from 'clsx';
import type { ClassValue } from 'clsx';

/**
 * Class-name joiner. Every primitive puts the caller's `className` last so a feature
 * can override a token without reaching into the component.
 */
export function cn(...values: ClassValue[]): string {
  return clsx(values);
}
