'use client';

import { forwardRef, InputHTMLAttributes, useId } from 'react';
import { clsx } from 'clsx';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({
    className,
    label,
    error,
    helperText,
    id,
    'aria-describedby': providedDescribedBy,
    'aria-invalid': providedInvalid,
    ...props
  }, ref) => {
    const generatedId = useId().replace(/:/g, '');
    const inputId = id || `input-${generatedId}`;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;
    const describedBy = [
      providedDescribedBy,
      error ? errorId : helperText ? helperId : undefined,
    ].filter(Boolean).join(' ') || undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1 block text-sm font-medium text-zinc-200"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : providedInvalid}
          aria-describedby={describedBy}
          aria-errormessage={error ? errorId : undefined}
          className={clsx(
            'w-full rounded-md border px-4 py-2 text-sm transition-colors',
            'border-border bg-background-secondary text-white placeholder-zinc-600',
            'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
            error
              ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
              : '',
            className
          )}
          {...props}
        />
        {error && (
          <p id={errorId} role="alert" className="mt-1 text-sm text-rose-400">{error}</p>
        )}
        {helperText && !error && (
          <p id={helperId} className="mt-1 text-sm text-zinc-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
