import { formatNumber, formatPoints } from "../../../lib/format";
import type { ActionRegisterSummary } from "../actionRegister";

interface ActionsSummaryStripProps {
  total: number | null;
  summary: ActionRegisterSummary | null;
  loading: boolean;
}

interface SummaryTileProps {
  label: string;
  value: string | null;
  detail: string;
  tone?: "default" | "critical" | "warning";
}

function SummaryTile({
  label,
  value,
  detail,
  tone = "default",
}: SummaryTileProps) {
  const containerClass =
    tone === "critical"
      ? "rounded-lg border border-red-200 bg-red-50/60 p-4 shadow-sm"
      : tone === "warning"
        ? "rounded-lg border border-amber-200 bg-amber-50/60 p-4 shadow-sm"
        : "rounded-lg border border-slate-200 bg-white p-4 shadow-sm";
  const labelClass =
    tone === "critical"
      ? "text-[11px] font-semibold uppercase tracking-[0.12em] text-red-900"
      : tone === "warning"
        ? "text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-900"
        : "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";
  const valueClass =
    tone === "critical"
      ? "mt-2 text-2xl font-semibold tabular-nums text-red-900"
      : tone === "warning"
        ? "mt-2 text-2xl font-semibold tabular-nums text-amber-950"
        : "mt-2 text-2xl font-semibold tabular-nums text-slate-950";
  const detailClass =
    tone === "critical"
      ? "mt-1 block text-xs font-normal leading-relaxed text-red-900"
      : tone === "warning"
        ? "mt-1 block text-xs font-normal leading-relaxed text-amber-900"
        : "mt-1 block text-xs font-normal leading-relaxed text-slate-500";

  return (
    <div className={containerClass}>
      <dt className={labelClass}>{label}</dt>
      <dd className={valueClass}>
        {value ?? "—"}
        <span className={detailClass}>{detail}</span>
      </dd>
    </div>
  );
}

/**
 * Totals across the rows returned for the current filters. The register has no
 * pagination, so these totals describe every matching action plan.
 */
export function ActionsSummaryStrip({
  total,
  summary,
  loading,
}: ActionsSummaryStripProps) {
  return (
    <dl
      aria-busy={loading}
      className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <SummaryTile
        label="Matching actions"
        value={total === null ? null : formatNumber(total)}
        detail="Attached to findings visible at the evaluation date"
      />
      <SummaryTile
        label="Overdue"
        value={summary === null ? null : formatNumber(summary.overdue)}
        detail="API overdue state, same rule as R1"
        tone={summary && summary.overdue > 0 ? "critical" : "default"}
      />
      <SummaryTile
        label="Blocked"
        value={summary === null ? null : formatNumber(summary.blocked)}
        detail="Blocked, not completed actions"
        tone={summary && summary.blocked > 0 ? "warning" : "default"}
      />
      <SummaryTile
        label="Action rule points"
        value={summary === null ? null : formatPoints(summary.rulePoints)}
        detail="R1 and R5 points on returned actions"
      />
    </dl>
  );
}
