import { useId, type InputHTMLAttributes } from "react";

import { cx } from "../../lib/cx";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
}

export function Input({
  id,
  label,
  hint,
  error,
  className,
  containerClassName,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy =
    [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx("space-y-1.5", containerClassName)}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-medium text-slate-700"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          "block w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50",
          error
            ? "border-red-300 focus:border-red-400 focus:ring-red-200"
            : "border-slate-300 focus:border-accent-500 focus:ring-accent-500/20",
          className,
        )}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
