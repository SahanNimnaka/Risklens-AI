import { formatNumber } from "../../../lib/format";
import type { AuditRegisterSummary } from "../auditRegister";

interface RegisterSummaryProps {
  total: number | null;
  summary: AuditRegisterSummary | null;
  loading: boolean;
}

interface SummaryTileProps {
  label: string;
  value: number | null;
  detail: string;
  tone?: "default" | "critical";
}

function SummaryTile({
  label,
  value,
  detail,
  tone = "default",
}: SummaryTileProps) {
  const critical = tone === "critical";

  return (
    <div
      className={
        critical
          ? "rounded-lg border border-red-200 bg-red-50/60 p-4 shadow-sm"
          : "rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      }
    >
      <dt
        className={
          critical
            ? "text-[11px] font-semibold uppercase tracking-[0.12em] text-red-900"
            : "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
        }
      >
        {label}
      </dt>
      <dd
        className={
          critical
            ? "mt-2 text-2xl font-semibold tabular-nums text-red-900"
            : "mt-2 text-2xl font-semibold tabular-nums text-slate-950"
        }
      >
        {value === null ? "—" : formatNumber(value)}
        <span
          className={
            critical
              ? "mt-1 block text-xs font-normal leading-relaxed text-red-900"
              : "mt-1 block text-xs font-normal leading-relaxed text-slate-500"
          }
        >
          {detail}
        </span>
      </dd>
    </div>
  );
}

/**
 * Totals across the rows returned for the current filters. The register has no
 * pagination, so these totals describe every matching audit.
 */
export function AuditRegisterSummaryStrip({
  total,
  summary,
  loading,
}: RegisterSummaryProps) {
  return (
    <dl
      aria-busy={loading}
      className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <SummaryTile
        label="Matching audits"
        value={total}
        detail="Started on or before the evaluation date"
      />
      <SummaryTile
        label="Findings raised"
        value={summary?.findings ?? null}
        detail="Across returned audits"
      />
      <SummaryTile
        label="Open findings"
        value={summary?.openFindings ?? null}
        detail="Open or in progress"
      />
      <SummaryTile
        label="Overdue actions"
        value={summary?.overdueActions ?? null}
        detail="In returned audits"
        tone={summary && summary.overdueActions > 0 ? "critical" : "default"}
      />
    </dl>
  );
}
