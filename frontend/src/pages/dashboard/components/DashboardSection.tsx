import type { ReactNode } from "react";

import type { ApiError } from "../../../api/client";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { LoadingState } from "../../../components/ui/LoadingState";

interface DashboardSectionProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  skeletonRows?: number;
  children: ReactNode;
}

/**
 * Gives every dashboard panel the same loading, error and empty behaviour.
 * A failure in one panel never prevents the others from rendering.
 */
export function DashboardSection({
  title,
  description,
  actions,
  className,
  contentClassName,
  loading,
  error,
  onRetry,
  isEmpty = false,
  emptyTitle = "No data for this date",
  emptyDescription,
  skeletonRows = 4,
  children,
}: DashboardSectionProps) {
  return (
    <Card
      title={title}
      description={description}
      actions={actions}
      className={className}
      contentClassName={contentClassName}
    >
      <div aria-busy={loading}>
        {loading ? (
          <LoadingState label={`Loading ${title.toLowerCase()}`} rows={skeletonRows} />
        ) : error ? (
          <ErrorState
            error={error}
            title={`Unable to load ${title.toLowerCase()}`}
            onRetry={onRetry}
          />
        ) : isEmpty ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          children
        )}
      </div>
    </Card>
  );
}
