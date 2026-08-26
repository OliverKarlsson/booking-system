import { forwardRef, useId } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  /** Options as data. Pass `children` instead when you need `<optgroup>`. */
  options?: SelectOption[];
  /** Rendered as the first, empty-valued option — e.g. "All units". */
  placeholder?: string;
  error?: string;
  hint?: string;
  id?: string;
  children?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, placeholder, error, hint, id, className, required, children, ...rest },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;
  const hintId = `${selectId}-hint`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="text-sm font-medium text-ink-700">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <select
        ref={ref}
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(hint && hintId, error && errorId) || undefined}
        className={cn(
          'h-10 rounded-md border bg-white px-3 text-sm text-ink-900',
          'disabled:cursor-not-allowed disabled:bg-ink-100',
          error ? 'border-danger-500' : 'border-ink-200',
          className,
        )}
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
      {hint && !error ? (
        <p id={hintId} className="text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
});
