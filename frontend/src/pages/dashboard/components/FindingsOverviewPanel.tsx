import type { ApiError } from "../../../api/client";
import type { FindingListItem } from "../../../api/types";
import { Badge } from "../../../components/ui/Badge";
import { DistributionBar } from "../../../components/ui/DistributionBar";
import { formatDate, formatNumber } from "../../../lib/format";
import {
  findingSeverityLabels,
  findingStatusLabels,
} from "../../../lib/labels";
import { findingSeverityTones } from "../../../lib/severity";
import { findingStatusTones } from "../../../lib/statusTones";
import {
  FINDING_STATUSES,
  countFindingsByStatus,
  selectLatestFindings,
} from "../dashboardData";
import { DashboardSection } from "./DashboardSection";
import { PanelLink } from "./PanelLink";

interface FindingsOverviewPanelProps {
  data: FindingListItem[] | null;
  total: number | null;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  href: string;
  className?: string;
}

export function FindingsOverviewPanel({
  data,
  total,
  loading,
  error,
  onRetry,
  href,
  className,
}: FindingsOverviewPanelProps) {
  const counts = data ? countFindingsByStatus(data) : null;
  const segments = FINDING_STATUSES.map((status) => ({
    key: status,
    label: findingStatusLabels[status],
    value: counts?.[status] ?? 0,
    tone: findingStatusTones[status],
  }));
  const summary = segments
    .map((segment) => `${segment.label} ${formatNumber(segment.value)}`)
    .join(", ");
  const latest = data ? selectLatestFindings(data, 5) : [];

  return (
    <DashboardSection
      title="Findings overview"
      description="Status mix and the most recently identified findings."
      actions={<PanelLink to={href}>View findings</PanelLink>}
      className={className}
      loading={loading}
      error={error}
      onRetry={onRetry}
      isEmpty={!data || total === 0}
      emptyTitle="No findings at this date"
      emptyDescription="Findings identified on or before the selected evaluation date will appear here."
      skeletonRows={5}
    >
      {data && total !== null && counts && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-3xl font-semibold tabular-nums text-slate-950">
              {formatNumber(total)}
            </p>
            <p className="text-sm text-slate-500">
              {formatNumber(counts.open + counts.in_progress)} unresolved
            </p>
          </div>

          <DistributionBar
            className="mt-4"
            segments={segments}
            total={total}
            ariaLabel={`Findings by status: ${summary}.`}
          />

          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Latest identified
            </h3>
            <ul className="mt-2 divide-y divide-slate-100">
              {latest.map((finding) => (
                <li key={finding.finding_ref} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={findingSeverityTones[finding.severity]}>
                      {findingSeverityLabels[finding.severity]}
                    </Badge>
                    <span className="font-mono text-[11px] text-slate-500">
                      {finding.finding_ref}
                    </span>
                    <Badge tone={findingStatusTones[finding.status]}>
                      {findingStatusLabels[finding.status]}
                    </Badge>
                  </div>
                  <p
                    className="mt-1 truncate text-sm font-medium text-slate-900"
                    title={finding.title}
                  >
                    {finding.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDate(finding.identified_date)} ·{" "}
                    {finding.audit_ref}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </DashboardSection>
  );
}
