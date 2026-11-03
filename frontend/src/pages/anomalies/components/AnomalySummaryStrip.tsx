import { formatDecimal, formatNumber, formatPercent } from "../../../lib/format";
import type { AnomalyRegisterSummary } from "../anomalyRegister";

interface AnomalySummaryStripProps {
  summary: AnomalyRegisterSummary | null;
  contamination: number | null;
  loading: boolean;
}

interface SummaryTileProps {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warning";
}

function SummaryTile({
  label,
  value,
  detail,
  tone = "default",
}: SummaryTileProps) {
  const containerClass =
    tone === "warning"
      ? "rounded-lg border border-amber-200 bg-amber-50/60 p-4 shadow-sm"
      : "rounded-lg border border-slate-200 bg-white p-4 shadow-sm";
  const labelClass =
    tone === "warning"
      ? "text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-900"
      : "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";
  const valueClass =
    tone === "warning"
      ? "mt-2 text-2xl font-semibold tabular-nums text-amber-950"
      : "mt-2 text-2xl font-semibold tabular-nums text-slate-950";
  const detailClass =
    tone === "warning"
      ? "mt-1 block text-xs font-normal leading-relaxed text-amber-900"
      : "mt-1 block text-xs font-normal leading-relaxed text-slate-500";

  return (
    <div className={containerClass}>
      <dt className={labelClass}>{label}</dt>
      <dd className={valueClass}>
        {value}
        <span className={detailClass}>{detail}</span>
      </dd>
    </div>
  );
}

/**
 * Totals across the rows visible after the department and flag filters. The
 * anomaly API has no pagination, so these totals describe every matching audit.
 */
export function AnomalySummaryStrip({
  summary,
  contamination,
  loading,
}: AnomalySummaryStripProps) {
  return (
    <dl
      aria-busy={loading}
      className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <SummaryTile
        label="Matching audits"
        value={summary === null ? "—" : formatNumber(summary.matching)}
        detail="Eligible audits after the selected filters"
      />
      <SummaryTile
        label="Advisory flags"
        value={summary === null ? "—" : formatNumber(summary.flagged)}
        detail={
          contamination === null
            ? "Advisory cut at the detector contamination"
            : `Advisory cut at ${formatPercent(contamination * 100, 0)} contamination`
        }
        tone={summary && summary.flagged > 0 ? "warning" : "default"}
      />
      <SummaryTile
        label="Highest score"
        value={
          summary === null
            ? "—"
            : summary.highestScore === null
              ? "—"
              : formatDecimal(summary.highestScore, 3)
        }
        detail="Continuous score; higher means more unusual"
      />
      <SummaryTile
        label="Rule points (context)"
        value={summary === null ? "—" : formatNumber(summary.rulePoints)}
        detail="Joined after scoring; never a model input"
      />
    </dl>
  );
}
