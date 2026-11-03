import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { fetchFindingRisk } from "../../../api/findings";
import { fetchDepartmentRisk } from "../../../api/risk";
import type { FindingListItem } from "../../../api/types";
import { RuleHitCard } from "../../../components/risk/RuleHitCard";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { LoadingState } from "../../../components/ui/LoadingState";
import { useApiQuery } from "../../../hooks/useApiQuery";
import {
  formatCount,
  formatDate,
  formatNumber,
} from "../../../lib/format";
import {
  departmentLabels,
  findingSeverityLabels,
  findingStatusLabels,
  rootCauseLabels,
} from "../../../lib/labels";
import { withAsOf } from "../../../lib/links";
import { selectRuleHits } from "../../../lib/ruleEvidence";
import {
  findingSeverityTones,
  riskBandTones,
} from "../../../lib/severity";
import { findingStatusTones } from "../../../lib/statusTones";

interface FindingDetailPanelProps {
  finding: FindingListItem;
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

export function FindingDetailPanel({
  finding,
  asOf,
  isDefault,
}: FindingDetailPanelProps) {
  // The list row already carries the direct score and rule IDs. The risk-detail
  // request adds the reasons and typed evidence; the department request adds
  // R6 control context. Each request has its own loading and error state so one
  // failing does not hide the other.
  const riskQuery = useApiQuery(
    (signal) => fetchFindingRisk(finding.finding_ref, asOf, signal),
    [finding.finding_ref, asOf],
  );
  const departmentQuery = useApiQuery(
    (signal) => fetchDepartmentRisk(finding.department, asOf, signal),
    [finding.department, asOf],
  );

  const detail = riskQuery.data;
  const department = departmentQuery.data;
  const relatedHits = detail?.related_department_hits ?? [];
  const weakControlHits = department
    ? selectRuleHits(department.hits, "R6_weak_control")
    : [];

  const score = detail?.score ?? finding.risk_score;
  const band = detail?.band ?? finding.risk_band;
  const directHitCount = detail?.hits.length ?? finding.rule_ids.length;

  const auditFindingsHref = withAsOf(
    `/findings?audit_ref=${encodeURIComponent(finding.audit_ref)}`,
    asOf,
    isDefault,
  );
  const findingActionsHref = withAsOf(
    `/actions?finding_ref=${encodeURIComponent(finding.finding_ref)}`,
    asOf,
    isDefault,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">Finding severity</span>
          <Badge tone={findingSeverityTones[finding.severity]}>
            {findingSeverityLabels[finding.severity]}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">Status</span>
          <Badge tone={findingStatusTones[finding.status]}>
            {findingStatusLabels[finding.status]}
          </Badge>
        </div>
        <Badge>{departmentLabels[finding.department]}</Badge>
      </div>

      <p className="text-sm leading-relaxed text-slate-600">
        Finding severity is an attribute of the finding. Each rule hit below
        also carries its own alert severity, which describes the rule that fired
        and can differ from the finding severity.
      </p>

      <section aria-labelledby="finding-metadata-heading">
        <h3
          id="finding-metadata-heading"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Finding details
        </h3>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Finding reference</dt>
            <dd className="mt-0.5 font-mono text-sm text-slate-900">
              {finding.finding_ref}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Audit</dt>
            <dd className="mt-0.5 text-sm text-slate-900">
              <span className="font-mono text-xs text-slate-600">
                {finding.audit_ref}
              </span>{" "}
              · {finding.audit_title}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Identified date</dt>
            <dd className="mt-0.5 text-sm text-slate-900">
              {formatDate(finding.identified_date)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Root cause</dt>
            <dd className="mt-0.5 text-sm text-slate-900">
              {rootCauseLabels[finding.root_cause_category]}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Control</dt>
            <dd className="mt-0.5 font-mono text-sm text-slate-900">
              {finding.control_ref ?? "Not linked"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Actions raised</dt>
            <dd className="mt-0.5 text-sm text-slate-900">
              {formatCount(finding.action_count, "action plan")}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="finding-direct-heading">
        <h3
          id="finding-direct-heading"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Direct risk attribution
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          The direct score sums only rule hits attributed to this finding. R4
          recurrence and R6 control hits are department-level context and are
          never added to it.
        </p>

        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MetricTile
            label="Direct score"
            value={formatNumber(score)}
            detail="Sum of this finding's direct rule hits"
          />
          <MetricTile
            label="Direct band"
            value={
              <Badge tone={riskBandTones[band]}>
                {findingSeverityLabels[band]}
              </Badge>
            }
            detail="Risk band derived from the direct score only"
          />
          <MetricTile
            label="Direct rule hits"
            value={formatNumber(directHitCount)}
            detail="R1, R2, R3 and R5 applications"
          />
          <MetricTile
            label="Rules on the register row"
            value={formatNumber(finding.rule_ids.length)}
            detail={
              finding.rule_ids.length > 0
                ? finding.rule_ids.join(", ")
                : "No direct rule IDs"
            }
          />
        </dl>

        {riskQuery.loading ? (
          <div className="mt-4">
            <LoadingState label="Loading direct rule attribution" rows={4} />
          </div>
        ) : riskQuery.error ? (
          <div className="mt-4">
            <ErrorState
              error={riskQuery.error}
              title="Unable to load direct rule attribution"
              onRetry={riskQuery.refetch}
            />
          </div>
        ) : detail ? (
          <div className="mt-4">
            {!detail.included_in_scoring && (
              <div
                role="status"
                className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                This finding was identified after the evaluation date, so it is
                not included in scoring.
              </div>
            )}

            {detail.hits.length === 0 ? (
              <EmptyState
                title="No direct rule hits at this date"
                description="The finding has no overdue action, unresolved-critical, stale-finding or blocked-action hit at the selected evaluation date. Its direct score is zero."
              />
            ) : (
              <ul className="space-y-3">
                {detail.hits.map((hit, index) => (
                  <li key={`${hit.rule_id}-${hit.entity_ref}-${index}`}>
                    <RuleHitCard hit={hit} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="finding-entity-heading">
        <h3
          id="finding-entity-heading"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Entity-level context
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          These hits are attributed to the department or its controls, not to
          this finding. They are shown for context only and do not change the
          finding's direct score.
        </p>

        {department && (
          <p className="mt-2 text-xs text-slate-600">
            Department context: {departmentLabels[department.department]} ·{" "}
            {formatNumber(department.score)} points ·{" "}
            <Badge tone={riskBandTones[department.band]}>
              {findingSeverityLabels[department.band]}
            </Badge>
          </p>
        )}

        <div className="mt-4">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            R4 recurrence context
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Recurrence clusters belong to the department. Only clusters that
            include this finding are listed.
          </p>

          {riskQuery.loading ? (
            <div className="mt-3">
              <LoadingState label="Loading recurrence context" rows={2} />
            </div>
          ) : riskQuery.error ? (
            <div className="mt-3">
              <ErrorState
                error={riskQuery.error}
                title="Unable to load recurrence context"
                onRetry={riskQuery.refetch}
              />
            </div>
          ) : relatedHits.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
              No R4 recurrence cluster includes this finding at the selected
              date.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {relatedHits.map((hit, index) => (
                <li key={`${hit.rule_id}-${hit.entity_ref}-${index}`}>
                  <RuleHitCard hit={hit} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            R6 weak-control context
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Weak active controls in the finding's department. These points
            belong to the department's control score, not to the finding.
          </p>

          {departmentQuery.loading ? (
            <div className="mt-3">
              <LoadingState label="Loading department controls" rows={2} />
            </div>
          ) : departmentQuery.error ? (
            <div className="mt-3">
              <ErrorState
                error={departmentQuery.error}
                title="Unable to load department control context"
                onRetry={departmentQuery.refetch}
              />
            </div>
          ) : weakControlHits.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
              No weak active controls are recorded for this department at the
              selected date.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {weakControlHits.map((hit, index) => (
                <li key={`${hit.rule_id}-${hit.entity_ref}-${index}`}>
                  <RuleHitCard hit={hit} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="finding-links-heading">
        <h3
          id="finding-links-heading"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Related records
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to={auditFindingsHref} className={buttonClasses("secondary", "sm")}>
            View all findings for {finding.audit_ref}
          </Link>
          <Link to={findingActionsHref} className={buttonClasses("secondary", "sm")}>
            View action plans for this finding
          </Link>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          The finding link applies the audit filter to this register. The action
          link applies the finding filter to the action register. Both keep the
          current evaluation date.
        </p>
      </section>
    </div>
  );
}
