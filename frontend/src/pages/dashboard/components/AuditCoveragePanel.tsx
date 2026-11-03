import type { ApiError } from "../../../api/client";
import type { AuditListItem } from "../../../api/types";
import { DistributionBar } from "../../../components/ui/DistributionBar";
import { formatCount, formatNumber } from "../../../lib/format";
import { auditStatusLabels } from "../../../lib/labels";
import { auditStatusTones } from "../../../lib/statusTones";
import {
  AUDIT_STATUSES,
  countAuditsByStatus,
  countAuditsWithOpenFindings,
  countAuditsWithOverdueActions,
} from "../dashboardData";
import { DashboardSection } from "./DashboardSection";
import { PanelLink } from "./PanelLink";

interface AuditCoveragePanelProps {
  data: AuditListItem[] | null;
  total: number | null;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  href: string;
  className?: string;
}

export function AuditCoveragePanel({
  data,
  total,
  loading,
  error,
  onRetry,
  href,
  className,
}: AuditCoveragePanelProps) {
  const counts = data ? countAuditsByStatus(data) : null;
  const segments = AUDIT_STATUSES.map((status) => ({
    key: status,
    label: auditStatusLabels[status],
    value: counts?.[status] ?? 0,
    tone: auditStatusTones[status],
  }));
  const summary = segments
    .map((segment) => `${segment.label} ${formatNumber(segment.value)}`)
    .join(", ");

  return (
    <DashboardSection
      title="Audit coverage"
      description="Audits that started on or before the selected date."
      actions={<PanelLink to={href}>View audits</PanelLink>}
      className={className}
      loading={loading}
      error={error}
      onRetry={onRetry}
      isEmpty={!data || total === 0}
      emptyTitle="No audits at this date"
      emptyDescription="Audits appear here once their start date is on or before the selected evaluation date."
      skeletonRows={4}
    >
      {data && total !== null && counts && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-3xl font-semibold tabular-nums text-slate-950">
              {formatNumber(total)}
            </p>
            <p className="text-sm text-slate-500">
              {formatCount(counts.in_progress, "audit")} in progress
            </p>
          </div>

          <DistributionBar
            className="mt-4"
            segments={segments}
            total={total}
            ariaLabel={`Audits by status: ${summary}.`}
          />

          <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">With open findings</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                {formatNumber(countAuditsWithOpenFindings(data))}
              </dd>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">With overdue actions</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                {formatNumber(countAuditsWithOverdueActions(data))}
              </dd>
            </div>
          </dl>
        </>
      )}
    </DashboardSection>
  );
}
