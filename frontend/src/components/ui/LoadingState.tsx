import { cx } from "../../lib/cx";

interface LoadingStateProps {
  label?: string;
  rows?: number;
  className?: string;
}

export function LoadingState({
  label = "Loading data",
  rows = 3,
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx("space-y-3", className)}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="h-10 rounded-md bg-slate-100 motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}
