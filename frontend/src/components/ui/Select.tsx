import { useId, type SelectHTMLAttributes } from "react";

import { cx } from "../../lib/cx";
import type { SelectOption } from "../../lib/labels";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption<string>[];
  placeholder?: string;
  containerClassName?: string;
}

export function Select({
  id,
  label,
  hint,
  error,
  options,
  placeholder,
  className,
  containerClassName,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;
  const describedBy =
    [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx("space-y-1.5", containerClassName)}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-medium text-slate-700"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          "block w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50",
          error
            ? "border-red-300 focus:border-red-400 focus:ring-red-200"
            : "border-slate-300 focus:border-accent-500 focus:ring-accent-500/20",
          className,
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
