import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { ActionPlanListItem } from "../../../api/types";
import { RuleHitCard } from "../../../components/risk/RuleHitCard";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { formatCount, formatDate, formatNumber } from "../../../lib/format";
import {
  actionStatusLabels,
  departmentLabels,
  findingSeverityLabels,
  findingStatusLabels,
} from "../../../lib/labels";
import { withAsOf } from "../../../lib/links";
import { findingSeverityTones } from "../../../lib/severity";
import {
  actionStatusTones,
  findingStatusTones,
} from "../../../lib/statusTones";

interface ActionDetailPanelProps {
  action: ActionPlanListItem;
  asOf: string;
  isDefault: boolean;
}

interface MetricTileProps {
  label: string;
  value: ReactNode;
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

/**
 * Read-only action detail.
 *
 * The row already contains the API's overdue state, days overdue and complete
 * R1/R5 rule hits, so no additional request is needed and nothing is
 * recalculated.
 */
export function ActionDetailPanel({
  action,
  asOf,
  isDefault,
}: ActionDetailPanelProps) {
  const auditFindingsHref = withAsOf(
    `/findings?audit_ref=${encodeURIComponent(action.audit_ref)}`,
    asOf,
    isDefault,
  );
  const auditActionsHref = withAsOf(
    `/actions?audit_ref=${encodeURIComponent(action.audit_ref)}`,
    asOf,
    isDefault,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">Action status</span>
          <Badge tone={actionStatusTones[action.status]}>
            {actionStatusLabels[action.status]}
          </Badge>
        </div>
        {action.is_overdue && (
          <Badge tone="critical" dot>
            {formatCount(action.days_overdue, "day")} overdue
          </Badge>
        )}
        <Badge>{departmentLabels[action.department]}</Badge>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">Finding severity</span>
          <Badge tone={findingSeverityTones[action.finding_severity]}>
            {findingSeverityLabels[action.finding_severity]}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">Finding status</span>
          <Badge tone={findingStatusTones[action.finding_status]}>
            {findingStatusLabels[action.finding_status]}
          </Badge>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-slate-600">
        Overdue state and days overdue are supplied by the API using the same
        rule as R1. R1 and R5 points are attributed to this action plan and also
        contribute to the parent finding's direct score; they are not
        recalculated here.
      </p>

      <section aria-labelledby="action-description-heading">
        <h3
          id="action-description-heading"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Remediation action
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-800">
          {action.action_description}
        </p>
      </section>

      <section aria-labelledby="action-metadata-heading">
        <h3
          id="action-metadata-heading"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Action details
        </h3>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Action ID</dt>
            <dd className="mt-0.5 font-mono text-sm text-slate-900">
              {action.action_id}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Assigned owner</dt>
            <dd className="mt-0.5 text-sm text-slate-900">
              {action.assigned_owner}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Due date</dt>
            <dd className="mt-0.5 text-sm text-slate-900">
              {formatDate(action.due_date)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Completion date</dt>
            <dd className="mt-0.5 text-sm text-slate-900">
              {action.completion_date
                ? formatDate(action.completion_date)
                : "Not completed"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Finding</dt>
            <dd className="mt-0.5 text-sm text-slate-900">
              <span className="font-mono text-xs text-slate-600">
                {action.finding_ref}
              </span>{" "}
              · {action.finding_title}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Audit</dt>
            <dd className="mt-0.5 text-sm text-slate-900">
              <span className="font-mono text-xs text-slate-600">
                {action.audit_ref}
              </span>{" "}
              · {action.audit_title}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="action-risk-heading">
        <h3
          id="action-risk-heading"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Action risk attribution
        </h3>

        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MetricTile
            label="Action rule points"
            value={formatNumber(action.rule_points)}
            detail="Sum of R1 and R5 hits on this action"
          />
          <MetricTile
            label="Rule hits"
            value={formatNumber(action.rule_hits.length)}
            detail="Overdue-action and blocked-action applications"
          />
          <MetricTile
            label="Overdue state"
            value={action.is_overdue ? "Overdue" : "Not overdue"}
            detail="Computed by the API, not the browser"
          />
          <MetricTile
            label="Days overdue"
            value={
              action.is_overdue ? formatNumber(action.days_overdue) : "—"
            }
            detail={
              action.is_overdue
                ? "Days past the due date at the evaluation date"
                : "No overdue period at the evaluation date"
            }
          />
        </dl>

        {action.rule_hits.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No action-level rule hits at this date"
              description="This action is not overdue, blocked or otherwise matched by R1 or R5 at the selected evaluation date. Its action rule points are zero."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {action.rule_hits.map((hit, index) => (
              <li key={`${hit.rule_id}-${hit.entity_ref}-${index}`}>
                <RuleHitCard hit={hit} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="action-links-heading">
        <h3
          id="action-links-heading"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Related records
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to={auditFindingsHref} className={buttonClasses("secondary", "sm")}>
            View findings for {action.audit_ref}
          </Link>
          <Link to={auditActionsHref} className={buttonClasses("secondary", "sm")}>
            View all actions for {action.audit_ref}
          </Link>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          These links apply the audit filter to the finding and action registers
          and keep the current evaluation date.
        </p>
      </section>
    </div>
  );
}
