import type { RuleHit } from "../../api/types";
import { formatPoints } from "../../lib/format";
import { findingSeverityLabels, ruleEntityLabel } from "../../lib/labels";
import { evidenceRows } from "../../lib/ruleEvidence";
import { alertSeverityTones } from "../../lib/severity";
import { Badge } from "../ui/Badge";

interface RuleHitCardProps {
  hit: RuleHit;
}

/**
 * One rule application with its reason and typed evidence.
 *
 * The alert severity badge is deliberately labelled: it describes the rule's
 * presentation severity and is not the finding's own severity.
 */
export function RuleHitCard({ hit }: RuleHitCardProps) {
  const evidence = evidenceRows(hit.evidence);

  return (
    <article className="rounded-md border border-slate-200 bg-white p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-slate-500">
              {hit.rule_id}
            </span>
            <span className="text-sm font-medium text-slate-900">
              {hit.rule_name}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {ruleEntityLabel(hit.entity_type)} ·{" "}
            <span className="break-all font-mono">{hit.entity_ref}</span>
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-semibold tabular-nums text-slate-900">
            {formatPoints(hit.points)}
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Alert severity
          </span>
          <Badge tone={alertSeverityTones[hit.severity]}>
            {findingSeverityLabels[hit.severity]}
          </Badge>
        </div>
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-slate-700">
        {hit.reason}
      </p>

      <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Typed evidence
        </p>
        {evidence.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">
            The API returned no evidence fields for this hit.
          </p>
        ) : (
          <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {evidence.map((row) => (
              <div key={row.key} className="min-w-0">
                <dt className="text-[11px] text-slate-500">{row.label}</dt>
                <dd
                  className={
                    row.key === "finding_refs"
                      ? "break-words font-mono text-[11px] leading-relaxed text-slate-800"
                      : "break-words text-xs leading-relaxed text-slate-800"
                  }
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}
