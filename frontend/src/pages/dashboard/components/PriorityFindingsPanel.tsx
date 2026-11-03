import type { ApiError } from "../../../api/client";
import type { FindingListItem } from "../../../api/types";
import { Badge } from "../../../components/ui/Badge";
import { formatDate, formatNumber } from "../../../lib/format";
import {
  departmentLabels,
  findingSeverityLabels,
  findingStatusLabels,
} from "../../../lib/labels";
import {
  findingSeverityTones,
} from "../../../lib/severity";
import { findingStatusTones } from "../../../lib/statusTones";
import { selectPriorityFindings } from "../dashboardData";
import { DashboardSection } from "./DashboardSection";
import { PanelLink } from "./PanelLink";

interface PriorityFindingsPanelProps {
  findings: FindingListItem[] | null;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  href: string;
  className?: string;
}

export function PriorityFindingsPanel({
  findings,
  loading,
  error,
  onRetry,
  href,
  className,
}: PriorityFindingsPanelProps) {
  const priorityFindings = findings ? selectPriorityFindings(findings, 5) : [];

  return (
    <DashboardSection
      title="Priority findings"
      description="Unresolved high and critical findings, highest direct rule score first."
      actions={<PanelLink to={href}>View findings</PanelLink>}
      className={className}
      loading={loading}
      error={error}
      onRetry={onRetry}
      isEmpty={priorityFindings.length === 0}
      emptyTitle="No unresolved high or critical findings"
      emptyDescription="Unresolved high and critical findings identified by the selected date will appear here."
      skeletonRows={5}
    >
      <ol className="divide-y divide-slate-100">
        {priorityFindings.map((finding) => (
          <li key={finding.finding_ref} className="py-3 first:pt-0 last:pb-0">
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
              <span className="ml-auto text-xs text-slate-500">
                Direct score {formatNumber(finding.risk_score)}
              </span>
            </div>

            <p className="mt-1.5 text-sm font-medium text-slate-900">
              {finding.title}
            </p>
            <p
              className="mt-0.5 truncate text-xs text-slate-500"
              title={finding.audit_title}
            >
              {finding.audit_ref} · {finding.audit_title}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {departmentLabels[finding.department]} · identified{" "}
              {formatDate(finding.identified_date)}
            </p>
          </li>
        ))}
      </ol>

      <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
        Direct scores come from rule hits attached to each finding. They are not
        portfolio-calibrated risk bands.
      </p>
    </DashboardSection>
  );
}
