import type { ApiError } from "../../../api/client";
import type { ActionPlanListItem } from "../../../api/types";
import { Badge } from "../../../components/ui/Badge";
import { DistributionBar } from "../../../components/ui/DistributionBar";
import { formatCount, formatDate, formatNumber } from "../../../lib/format";
import { actionStatusLabels, findingSeverityLabels } from "../../../lib/labels";
import { findingSeverityTones } from "../../../lib/severity";
import { actionStatusTones } from "../../../lib/statusTones";
import {
  ACTION_STATUSES,
  countActionsByStatus,
  selectOverdueActions,
  summarizeActions,
} from "../dashboardData";
import { DashboardSection } from "./DashboardSection";
import { PanelLink } from "./PanelLink";

interface RemediationPanelProps {
  data: ActionPlanListItem[] | null;
  total: number | null;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  href: string;
  className?: string;
}

export function RemediationPanel({
  data,
  total,
  loading,
  error,
  onRetry,
  href,
  className,
}: RemediationPanelProps) {
  const summary = data ? summarizeActions(data) : null;
  const counts = data ? countActionsByStatus(data) : null;
  const segments = ACTION_STATUSES.map((status) => ({
    key: status,
    label: actionStatusLabels[status],
    value: counts?.[status] ?? 0,
    tone: actionStatusTones[status],
  }));
  const segmentSummary = segments
    .map((segment) => `${segment.label} ${formatNumber(segment.value)}`)
    .join(", ");
  const overdue = data ? selectOverdueActions(data, 3) : [];

  return (
    <DashboardSection
      title="Remediation"
      description="Action-plan status and the longest-overdue actions at this date."
      actions={<PanelLink to={href}>View action plans</PanelLink>}
      className={className}
      loading={loading}
      error={error}
      onRetry={onRetry}
      isEmpty={!data || total === 0}
      emptyTitle="No action plans at this date"
      emptyDescription="Remediation actions attached to visible findings will appear here."
      skeletonRows={5}
    >
      {data && total !== null && summary && counts && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-3xl font-semibold tabular-nums text-slate-950">
                {formatNumber(total)}
              </p>
              <p className="text-sm text-slate-500">
                {formatCount(summary.byStatus.completed, "action")} completed
              </p>
            </div>

            <DistributionBar
              className="mt-4"
              segments={segments}
              total={total}
              ariaLabel={`Actions by status: ${segmentSummary}.`}
            />

            <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
              <div className="rounded-md bg-red-50 px-3 py-2">
                <dt className="text-xs text-red-800">Overdue</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums text-red-900">
                  {formatNumber(summary.overdue)}
                </dd>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-500">Blocked</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                  {formatNumber(summary.blocked)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="lg:border-l lg:border-slate-100 lg:pl-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Most overdue
            </h3>

            {overdue.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                No overdue actions at this date.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {overdue.map((action) => (
                  <li key={action.action_id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="critical">
                        {formatCount(action.days_overdue, "day")} overdue
                      </Badge>
                      <Badge tone={findingSeverityTones[action.finding_severity]}>
                        {findingSeverityLabels[action.finding_severity]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {action.action_description}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {action.assigned_owner} · due {formatDate(action.due_date)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {action.finding_ref} · {action.finding_title}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Overdue status and days overdue are computed by the API for the
              selected evaluation date.
            </p>
          </div>
        </div>
      )}
    </DashboardSection>
  );
}
