import { ApiError } from "../../api/client";
import { cx } from "../../lib/cx";
import { Button } from "./Button";
import { AlertCircleIcon } from "./icons";

interface ErrorStateProps {
  error?: ApiError | string | null;
  title?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  error,
  title = "Unable to load data",
  onRetry,
  className,
}: ErrorStateProps) {
  const message =
    typeof error === "string"
      ? error
      : error?.message ?? "An unexpected error occurred while loading data.";
  const status = error instanceof ApiError && error.status > 0 ? error.status : null;

  return (
    <div
      role="alert"
      className={cx(
        "flex flex-col items-start gap-3 rounded-md border border-red-200 bg-red-50/60 p-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex gap-3">
        <AlertCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div>
          <p className="text-sm font-semibold text-red-900">{title}</p>
          <p className="mt-0.5 text-sm text-red-800">{message}</p>
          {status !== null && (
            <p className="mt-1 text-xs text-red-700">HTTP status {status}</p>
          )}
        </div>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
