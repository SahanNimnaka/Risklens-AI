import { Link } from "react-router-dom";

import type { AuditListItem } from "../../../api/types";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { formatCount, formatDate, formatNumber } from "../../../lib/format";
import {
  auditStatusLabels,
  auditTypeLabels,
  departmentLabels,
} from "../../../lib/labels";
import { withAsOf } from "../../../lib/links";
import { auditStatusTones } from "../../../lib/statusTones";

interface AuditDetailPanelProps {
  audit: AuditListItem;
  asOf: string;
  isDefault: boolean;
}

interface CountTileProps {
  label: string;
  value: number;
  detail?: string;
  emphasis?: "default" | "warning" | "critical";
}

function CountTile({
  label,
  value,
  detail,
  emphasis = "default",
}: CountTileProps) {
  const valueClass =
    emphasis === "critical"
      ? "text-red-800"
      : emphasis === "warning"
        ? "text-amber-900"
        : "text-slate-950";

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className={`mt-0.5 text-xl font-semibold tabular-nums ${valueClass}`}>
        {formatNumber(value)}
        {detail && (
          <span className="mt-0.5 block text-xs font-normal leading-relaxed text-slate-600">
            {detail}
          </span>
        )}
      </dd>
    </div>
  );
}

export function AuditDetailPanel({
  audit,
  asOf,
  isDefault,
}: AuditDetailPanelProps) {
  const findingsHref = withAsOf(
    `/findings?audit_ref=${encodeURIComponent(audit.audit_ref)}`,
    asOf,
    isDefault,
  );
  const actionsHref = withAsOf(
    `/actions?audit_ref=${encodeURIComponent(audit.audit_ref)}`,
    asOf,
    isDefault,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={auditStatusTones[audit.status]} dot>
          {auditStatusLabels[audit.status]}
        </Badge>
        <Badge>{departmentLabels[audit.department]}</Badge>
        <Badge tone="info">{auditTypeLabels[audit.audit_type]}</Badge>
      </div>

      <p className="text-sm leading-relaxed text-slate-600">
        Audit engagement recorded as of {formatDate(asOf)}. All counts below are
        calculated by the API for this evaluation date.
      </p>

      <section aria-labelledby="audit-metadata-heading">
        <h3
          id="audit-metadata-heading"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Engagement details
        </h3>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Audit reference</dt>
            <dd className="mt-0.5 font-mono text-sm text-slate-900">
              {audit.audit_ref}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Lead auditor</dt>
            <dd className="mt-0.5 text-sm text-slate-900">
              {audit.lead_auditor}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Start date</dt>
            <dd className="mt-0.5 text-sm text-slate-900">
              {formatDate(audit.start_date)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">End date</dt>
            <dd className="mt-0.5 text-sm text-slate-900">
              {formatDate(audit.end_date)}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="audit-counts-heading">
        <h3
          id="audit-counts-heading"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Findings and actions
        </h3>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CountTile
            label="Findings raised"
            value={audit.finding_count}
            detail={`${formatCount(audit.open_finding_count, "finding")} still open or in progress`}
          />
          <CountTile
            label="Open findings"
            value={audit.open_finding_count}
            emphasis={audit.open_finding_count > 0 ? "warning" : "default"}
          />
          <CountTile label="Actions raised" value={audit.action_count} />
          <CountTile
            label="Overdue actions"
            value={audit.overdue_action_count}
            emphasis={audit.overdue_action_count > 0 ? "critical" : "default"}
            detail="Using the API overdue rule at the selected date"
          />
        </dl>
      </section>

      <section aria-labelledby="audit-links-heading">
        <h3
          id="audit-links-heading"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Related records
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to={findingsHref} className={buttonClasses("secondary", "sm")}>
            View findings ({formatNumber(audit.finding_count)})
          </Link>
          <Link to={actionsHref} className={buttonClasses("secondary", "sm")}>
            View action plans ({formatNumber(audit.action_count)})
          </Link>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          These links open the related register filtered to this audit and keep
          the current evaluation date.
        </p>
      </section>
    </div>
  );
}
