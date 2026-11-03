import type { ApiError } from "../../../api/client";
import type { PortfolioSummary, RuleBreakdown } from "../../../api/types";
import { Badge } from "../../../components/ui/Badge";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/ui/DataTable";
import { formatCount, formatNumber } from "../../../lib/format";
import { findingSeverityLabels } from "../../../lib/labels";
import { alertSeverityTones, riskBandTones } from "../../../lib/severity";
import { DashboardSection } from "./DashboardSection";

interface PortfolioRiskPanelProps {
  data: PortfolioSummary | null;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  className?: string;
}

const columns: DataTableColumn<RuleBreakdown>[] = [
  {
    key: "rule",
    header: "Rule",
    render: (rule) => (
      <div>
        <p className="font-medium text-slate-900">{rule.rule_name}</p>
        <p className="mt-0.5 font-mono text-[11px] text-slate-500">
          {rule.rule_id}
        </p>
      </div>
    ),
  },
  {
    key: "severity",
    header: "Alert severity",
    render: (rule) => (
      <Badge tone={alertSeverityTones[rule.severity]}>
        {findingSeverityLabels[rule.severity]}
      </Badge>
    ),
  },
  {
    key: "hits",
    header: "Hits",
    align: "right",
    render: (rule) => (
      <span className="tabular-nums">{formatNumber(rule.hits)}</span>
    ),
  },
  {
    key: "points",
    header: "Points",
    align: "right",
    render: (rule) => (
      <span className="font-medium tabular-nums text-slate-900">
        {formatNumber(rule.points)}
      </span>
    ),
  },
];

export function PortfolioRiskPanel({
  data,
  loading,
  error,
  onRetry,
  className,
}: PortfolioRiskPanelProps) {
  return (
    <DashboardSection
      title="Portfolio risk"
      description="Deterministic score and rule contribution at this date."
      className={className}
      loading={loading}
      error={error}
      onRetry={onRetry}
      isEmpty={!data || data.breakdown.length === 0}
      emptyTitle="No rule hits at this date"
      emptyDescription="The portfolio score has no contributing rule hits for the selected evaluation date."
      skeletonRows={5}
    >
      {data && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="text-3xl font-semibold tabular-nums text-slate-950">
                  {formatNumber(data.score)}
                </p>
                <Badge tone={riskBandTones[data.band]}>
                  {findingSeverityLabels[data.band]} band
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {formatCount(data.total_hits, "rule hit")} across{" "}
                {formatCount(data.departments.length, "department")}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Unresolved findings
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                {formatNumber(data.open_findings.total)}
              </p>
              <p className="text-xs text-slate-500">context only, no points</p>
            </div>
          </div>

          <div className="mt-5">
            <DataTable
              columns={columns}
              rows={data.breakdown}
              rowKey={(rule) => rule.rule_id}
              caption="Rule contribution to the portfolio risk score"
            />
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Alert severity describes the rule that fired; it is not the
            severity of an individual finding.
          </p>
        </>
      )}
    </DashboardSection>
  );
}
