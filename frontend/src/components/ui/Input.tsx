import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  /** Validation message from react-hook-form. Its presence flips the field to invalid. */
  error?: string;
  hint?: string;
  id?: string;
}

/**
 * `forwardRef` is required for react-hook-form's `register()` to attach to the element.
 * Feature forms in later waves depend on it, so it is not optional polish.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className, required, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-ink-700">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        // Pointing at both means the hint stays announced when the field is valid and
        // the error is announced when it is not.
        aria-describedby={cn(hint && hintId, error && errorId) || undefined}
        className={cn(
          'h-10 rounded-md border bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400',
          'disabled:cursor-not-allowed disabled:bg-ink-100',
          error ? 'border-danger-500' : 'border-ink-200',
          className,
        )}
        {...rest}
      />
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
