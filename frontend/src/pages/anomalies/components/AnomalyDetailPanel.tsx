import { Link } from "react-router-dom";

import { fetchAnomalyAudit } from "../../../api/anomalies";
import type {
  AnomalyDetector,
  AuditAnomaly,
  FeatureDeviation,
} from "../../../api/types";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { LoadingState } from "../../../components/ui/LoadingState";
import { useApiQuery } from "../../../hooks/useApiQuery";
import {
  formatAnomalyFeature,
  formatSignedRobustZ,
} from "../../../lib/anomalyFeatures";
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
import { withAsOf } from "../../../lib/links";

interface AnomalyDetailPanelProps {
  audit: AuditAnomaly;
  rank: number | null;
  asOf: string;
  isDefault: boolean;
  detector: AnomalyDetector | null;
  disclaimer: string | null;
}

interface MetricTileProps {
  label: string;
  value: string;
  detail: string;
}

function MetricTile({ label, value, detail }: MetricTileProps) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums text-slate-950">
        {value}
        <span className="mt-0.5 block text-xs font-normal leading-relaxed text-slate-600">
          {detail}
        </span>
      </dd>
    </div>
  );
}

function DeviationCard({ deviation }: { deviation: FeatureDeviation }) {
  const above = deviation.direction === "above_peer";
  const magnitude = Math.min(Math.abs(deviation.robust_z) / 5, 1) * 50;

  return (
    <li className="rounded-md border border-slate-200 bg-white p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">
            {anomalyFeatureLabel(deviation.feature)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Observed {formatAnomalyFeature(deviation.feature, deviation.value)}
            {" · "}peer median{" "}
            {formatAnomalyFeature(deviation.feature, deviation.peer_median)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-semibold tabular-nums text-slate-900">
            {formatSignedRobustZ(deviation.robust_z)}
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Robust z
          </span>
          <Badge tone={deviation.direction === "at_peer" ? "neutral" : "info"}>
            {deviation.direction === "above_peer"
              ? "↑ "
              : deviation.direction === "below_peer"
                ? "↓ "
                : ""}
            {deviationDirectionLabel(deviation.direction)}
          </Badge>
        </div>
      </div>

      <div
        className="relative mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100"
        aria-hidden="true"
      >
        <span className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
        {magnitude > 0 && (
          <span
            className="absolute inset-y-0 rounded-full bg-sky-400"
            style={
              above
                ? { left: "50%", width: `${magnitude}%` }
                : { right: "50%", width: `${magnitude}%` }
            }
          />
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">
        Bar capped at a robust z-score of 5; the value above is unclipped.
      </p>
    </li>
  );
}

/**
 * Read-only anomaly detail.
 *
 * The list row already supplies the score, percentile, flag and the three
 * largest deviations. The drawer requests the detail endpoint for all 11
 * deviations. Neither response is recalculated in the browser, and rule points
 * remain context rather than model input.
 */
export function AnomalyDetailPanel({
  audit,
  rank,
  asOf,
  isDefault,
  detector,
  disclaimer,
}: AnomalyDetailPanelProps) {
  const query = useApiQuery(
    (signal) => fetchAnomalyAudit(audit.audit_ref, asOf, signal),
    [audit.audit_ref, asOf],
  );

  const detail = query.data;
  const deviations = detail?.all_deviations ?? [];
  const score = detail?.anomaly_score ?? audit.anomaly_score;
  const percentile = detail?.score_percentile ?? audit.score_percentile;
  const rulePoints = detail?.rule_points ?? audit.rule_points;
  const ruleIds = detail?.rule_ids ?? audit.rule_ids;

  const auditFindingsHref = withAsOf(
    `/findings?audit_ref=${encodeURIComponent(audit.audit_ref)}`,
    asOf,
    isDefault,
  );
  const auditActionsHref = withAsOf(
    `/actions?audit_ref=${encodeURIComponent(audit.audit_ref)}`,
    asOf,
    isDefault,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Badge>{departmentLabels[audit.department]}</Badge>
        <Badge tone={audit.is_anomaly ? "warning" : "neutral"} dot>
          {audit.is_anomaly ? "Flagged as unusual" : "Ranked, not flagged"}
        </Badge>
        <Badge tone="info">Advisory only</Badge>
      </div>

      <p className="text-sm leading-relaxed text-slate-600">
        This score describes how unusual the audit is relative to its department
        peers. It is not a risk score, a fraud finding or a measure of accuracy.
      </p>

      <section aria-labelledby="anomaly-metrics-heading">
        <h3
          id="anomaly-metrics-heading"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Anomaly result
        </h3>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MetricTile
            label="Anomaly score"
            value={formatDecimal(score, 3)}
            detail="Continuous score; higher means more unusual"
          />
          <MetricTile
            label="Score percentile"
            value={formatPercent(percentile, 1)}
            detail="Percentage of eligible audits at or below this score"
          />
          <MetricTile
            label="API rank"
            value={rank === null ? "—" : `#${formatNumber(rank)}`}
            detail="Position in the API's ranked list"
          />
          <MetricTile
            label="Rule points (context)"
            value={formatNumber(rulePoints)}
            detail="Joined after scoring; never a model input"
          />
        </dl>
      </section>

      <div className="rounded-md border border-sky-200 bg-sky-50 px-3.5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-900">
          Advisory disclaimer
        </p>
        <p className="mt-1 text-sm leading-relaxed text-sky-900">
          {detail?.disclaimer ??
            disclaimer ??
            "Anomaly results are advisory and do not indicate fraud or misconduct."}
        </p>
      </div>

      <section aria-labelledby="anomaly-deviations-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3
            id="anomaly-deviations-heading"
            className="text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Peer-relative deviations
          </h3>
          {detail && (
            <p className="text-xs text-slate-500">
              {formatNumber(deviations.length)} features, ordered by absolute
              robust z-score
            </p>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Positive values are above the peer median and negative values below.
          Either direction can be unusual; neither is inherently better.
        </p>

        <div className="mt-3" aria-busy={query.loading}>
          {query.loading ? (
            <LoadingState label="Loading feature deviations" rows={6} />
          ) : query.error ? (
            <ErrorState
              error={query.error}
              title="Unable to load feature deviations"
              onRetry={query.refetch}
            />
          ) : deviations.length === 0 ? (
            <EmptyState
              title="No feature deviations returned"
              description="The API returned this audit's score but no feature deviations at the selected evaluation date."
            />
          ) : (
            <ul className="space-y-3">
              {deviations.map((deviation) => (
                <DeviationCard
                  key={deviation.feature}
                  deviation={deviation}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="anomaly-rules-heading">
        <h3
          id="anomaly-rules-heading"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Deterministic rule context
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Rule points and IDs are joined after scoring for context only. They
          never change the anomaly result.
        </p>
        {ruleIds.length === 0 ? (
          <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            No rule IDs are linked to this audit at the selected date.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ruleIds.map((ruleId) => (
              <Badge key={ruleId} className="font-mono text-[10px]">
                {ruleId}
              </Badge>
            ))}
          </div>
        )}
      </section>

      {detector && (
        <section aria-labelledby="anomaly-detector-heading">
          <h3
            id="anomaly-detector-heading"
            className="text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Detector configuration
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] text-slate-500">Method</dt>
              <dd className="mt-0.5 text-sm text-slate-900">
                {detector.method}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Estimators</dt>
              <dd className="mt-0.5 text-sm tabular-nums text-slate-900">
                {formatNumber(detector.n_estimators)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Contamination</dt>
              <dd className="mt-0.5 text-sm tabular-nums text-slate-900">
                {formatPercent(detector.contamination * 100, 0)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Random state</dt>
              <dd className="mt-0.5 text-sm tabular-nums text-slate-900">
                {formatNumber(detector.random_state)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Min peer audits</dt>
              <dd className="mt-0.5 text-sm tabular-nums text-slate-900">
                {formatNumber(detector.min_peer_audits)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Features</dt>
              <dd className="mt-0.5 text-sm tabular-nums text-slate-900">
                {formatNumber(detector.feature_names.length)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Fixed configuration returned by the API. Scores are deterministic
            for this dataset and evaluation date.
          </p>
        </section>
      )}

      <section aria-labelledby="anomaly-links-heading">
        <h3
          id="anomaly-links-heading"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Related records
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to={auditFindingsHref} className={buttonClasses("secondary", "sm")}>
            View findings for {audit.audit_ref}
          </Link>
          <Link to={auditActionsHref} className={buttonClasses("secondary", "sm")}>
            View action plans for {audit.audit_ref}
          </Link>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          These links apply the audit filter to the registers and keep the
          current evaluation date.
        </p>
      </section>
    </div>
  );
}
