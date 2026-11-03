import type { ApiError } from "../../../api/client";
import type { AnomalyListResponse } from "../../../api/types";
import { Badge } from "../../../components/ui/Badge";
import {
  formatDecimal,
  formatNumber,
  formatPercent,
} from "../../../lib/format";
import {
  anomalyFeatureLabel,
  departmentLabels,
  deviationDirectionLabel,
} from "../../../lib/labels";
import { selectTopAnomalies } from "../dashboardData";
import { DashboardSection } from "./DashboardSection";
import { PanelLink } from "./PanelLink";

interface AnomalyWatchPanelProps {
  data: AnomalyListResponse | null;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  href: string;
  className?: string;
}

export function AnomalyWatchPanel({
  data,
  loading,
  error,
  onRetry,
  href,
  className,
}: AnomalyWatchPanelProps) {
  const topAudits = data ? selectTopAnomalies(data.audits, 3) : [];

  return (
    <DashboardSection
      title="Anomaly watch"
      description="Peer-relative signals; advisory only."
      actions={<PanelLink to={href}>View anomalies</PanelLink>}
      className={className}
      loading={loading}
      error={error}
      onRetry={onRetry}
      isEmpty={!data || data.total === 0}
      emptyTitle="No eligible audits at this date"
      emptyDescription="An audit becomes eligible for anomaly scoring after it starts and has at least one finding identified by the selected date."
      skeletonRows={4}
    >
      {data && (
        <>
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-3xl font-semibold tabular-nums text-slate-950">
              {formatNumber(data.flagged)}
            </p>
            <p className="text-sm text-slate-500">
              of {formatNumber(data.total)} eligible audits flagged
            </p>
          </div>

          <p className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-900">
            {data.disclaimer}
          </p>

          <ul className="mt-4 divide-y divide-slate-100">
            {topAudits.map((audit, index) => {
              const deviation = audit.deviations[0];

              return (
                <li key={audit.audit_ref} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        #{index + 1} {audit.audit_ref}
                      </p>
                      <p
                        className="truncate text-sm font-medium text-slate-900"
                        title={audit.audit_title}
                      >
                        {audit.audit_title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {departmentLabels[audit.department]}
                      </p>
                    </div>
                    <Badge tone={audit.is_anomaly ? "warning" : "neutral"} dot>
                      {audit.is_anomaly ? "Flagged" : "Ranked"}
                    </Badge>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                    <span>Score {formatDecimal(audit.anomaly_score, 3)}</span>
                    <span>
                      Percentile {formatPercent(audit.score_percentile)}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    {deviation
                      ? `${anomalyFeatureLabel(deviation.feature)} ${deviationDirectionLabel(deviation.direction)}`
                      : "No material peer deviation reported"}
                  </p>
                </li>
              );
            })}
          </ul>

          <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
            Detector: {data.detector.method}, contamination{" "}
            {formatPercent(data.detector.contamination * 100, 0)}. An unusual
            audit is not necessarily a risky or fraudulent one.
          </p>
        </>
      )}
    </DashboardSection>
  );
}
