import { fetchActions } from "../../api/actions";
import { fetchAnomalyAudits } from "../../api/anomalies";
import { fetchAudits } from "../../api/audits";
import { fetchFindings } from "../../api/findings";
import { fetchPortfolioSummary } from "../../api/risk";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ErrorState } from "../../components/ui/ErrorState";
import {
  ActionsIcon,
  AlertCircleIcon,
  AuditsIcon,
  DashboardIcon,
  FindingsIcon,
} from "../../components/ui/icons";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAsOf } from "../../hooks/useAsOf";
import {
  formatCount,
  formatDate,
  formatNumber,
} from "../../lib/format";
import { findingSeverityLabels } from "../../lib/labels";
import { withAsOf } from "../../lib/links";
import { riskBandTones } from "../../lib/severity";
import {
  countAuditsByStatus,
  countFindingsByStatus,
  summarizeActions,
} from "./dashboardData";
import { AnomalyWatchPanel } from "./components/AnomalyWatchPanel";
import { AuditCoveragePanel } from "./components/AuditCoveragePanel";
import { DepartmentRiskPanel } from "./components/DepartmentRiskPanel";
import { FindingsOverviewPanel } from "./components/FindingsOverviewPanel";
import { KpiStrip, type KpiItem } from "./components/KpiStrip";
import { OpenFindingsPanel } from "./components/OpenFindingsPanel";
import { PortfolioRiskPanel } from "./components/PortfolioRiskPanel";
import { PriorityFindingsPanel } from "./components/PriorityFindingsPanel";
import { RemediationPanel } from "./components/RemediationPanel";

export function DashboardPage() {
  const { asOf, isDefault } = useAsOf();

  // Five independent read-only requests let one failing section degrade
  // without hiding the rest of the portfolio view.
  const riskQuery = useApiQuery(
    (signal) => fetchPortfolioSummary(asOf, signal),
    [asOf],
  );
  const auditsQuery = useApiQuery(
    (signal) => fetchAudits(asOf, signal),
    [asOf],
  );
  const findingsQuery = useApiQuery(
    (signal) => fetchFindings(asOf, signal),
    [asOf],
  );
  const actionsQuery = useApiQuery(
    (signal) => fetchActions(asOf, signal),
    [asOf],
  );
  const anomaliesQuery = useApiQuery(
    (signal) => fetchAnomalyAudits(asOf, signal),
    [asOf],
  );

  const risk = riskQuery.data;
  const audits = auditsQuery.data;
  const findings = findingsQuery.data;
  const actions = actionsQuery.data;
  const anomalies = anomaliesQuery.data;

  const auditCounts = audits ? countAuditsByStatus(audits.items) : null;
  const findingCounts = findings
    ? countFindingsByStatus(findings.items)
    : null;
  const actionSummary = actions ? summarizeActions(actions.items) : null;

  const queries = [
    riskQuery,
    auditsQuery,
    findingsQuery,
    actionsQuery,
    anomaliesQuery,
  ];
  const allFailed = queries.every((query) => query.error !== null);
  const anyLoading = queries.some((query) => query.loading);
  const someFailed = !allFailed && queries.some((query) => query.error !== null);

  const retryAll = () => {
    riskQuery.refetch();
    auditsQuery.refetch();
    findingsQuery.refetch();
    actionsQuery.refetch();
    anomaliesQuery.refetch();
  };

  const retryFailed = () => {
    if (riskQuery.error) riskQuery.refetch();
    if (auditsQuery.error) auditsQuery.refetch();
    if (findingsQuery.error) findingsQuery.refetch();
    if (actionsQuery.error) actionsQuery.refetch();
    if (anomaliesQuery.error) anomaliesQuery.refetch();
  };

  const failedSections = [
    riskQuery.error ? "portfolio risk and departments" : null,
    auditsQuery.error ? "audit coverage" : null,
    findingsQuery.error ? "findings" : null,
    actionsQuery.error ? "remediation" : null,
    anomaliesQuery.error ? "anomaly watch" : null,
  ].filter((label): label is string => label !== null);

  const firstError =
    riskQuery.error ??
    auditsQuery.error ??
    findingsQuery.error ??
    actionsQuery.error ??
    anomaliesQuery.error;

  const to = (path: string) => withAsOf(path, asOf, isDefault);

  const kpis: KpiItem[] = [
    {
      key: "portfolio-risk",
      label: "Portfolio risk",
      icon: <DashboardIcon />,
      loading: riskQuery.loading,
      failed: Boolean(riskQuery.error),
      value: risk ? formatNumber(risk.score) : "—",
      badge: risk ? (
        <Badge tone={riskBandTones[risk.band]}>
          {findingSeverityLabels[risk.band]}
        </Badge>
      ) : null,
      detail: risk ? (
        <>
          {formatCount(risk.total_hits, "rule hit")} ·{" "}
          {formatNumber(risk.open_findings.total)} unresolved
        </>
      ) : (
        "—"
      ),
    },
    {
      key: "open-findings",
      label: "Unresolved findings",
      icon: <FindingsIcon />,
      loading: riskQuery.loading,
      failed: Boolean(riskQuery.error),
      value: risk ? formatNumber(risk.open_findings.total) : "—",
      detail: risk ? (
        <>
          {formatNumber(risk.open_findings.critical)} critical ·{" "}
          {formatNumber(risk.open_findings.high)} high
        </>
      ) : (
        "—"
      ),
    },
    {
      key: "audits",
      label: "Audits",
      icon: <AuditsIcon />,
      loading: auditsQuery.loading,
      failed: Boolean(auditsQuery.error),
      value: audits ? formatNumber(audits.total) : "—",
      detail: auditCounts ? (
        <>
          {formatNumber(auditCounts.in_progress)} in progress ·{" "}
          {formatNumber(auditCounts.completed)} completed
        </>
      ) : (
        "—"
      ),
    },
    {
      key: "findings",
      label: "Findings identified",
      icon: <FindingsIcon />,
      loading: findingsQuery.loading,
      failed: Boolean(findingsQuery.error),
      value: findings ? formatNumber(findings.total) : "—",
      detail: findingCounts ? (
        <>
          {formatNumber(findingCounts.open)} open ·{" "}
          {formatNumber(findingCounts.in_progress)} in progress
        </>
      ) : (
        "—"
      ),
    },
    {
      key: "overdue-actions",
      label: "Overdue actions",
      icon: <ActionsIcon />,
      loading: actionsQuery.loading,
      failed: Boolean(actionsQuery.error),
      value: actionSummary ? formatNumber(actionSummary.overdue) : "—",
      detail: actionSummary ? (
        <>
          {formatNumber(actionSummary.blocked)} blocked ·{" "}
          {formatCount(actionSummary.total, "action")}
        </>
      ) : (
        "—"
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Portfolio overview"
        title="Dashboard"
        description={`Read-only risk posture as of ${formatDate(asOf)}. All scores, flags and overdue states are calculated by the API; nothing is recalculated in the browser.`}
      />

      {allFailed ? (
        <ErrorState
          error={firstError}
          title="Unable to load the dashboard"
          onRetry={retryAll}
        />
      ) : (
        <>
          {someFailed && !anyLoading && failedSections.length > 0 && (
            <div
              role="status"
              className="mb-5 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex gap-3">
                <AlertCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    Some dashboard data is unavailable
                  </p>
                  <p className="mt-0.5 text-sm text-amber-800">
                    Showing the sections that loaded. Failed:{" "}
                    {failedSections.join(", ")}.
                  </p>
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={retryFailed}>
                Retry failed panels
              </Button>
            </div>
          )}

          <KpiStrip items={kpis} />

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
            <PortfolioRiskPanel
              data={risk}
              loading={riskQuery.loading}
              error={riskQuery.error}
              onRetry={riskQuery.refetch}
              className="lg:col-span-2 xl:col-span-2"
            />
            <OpenFindingsPanel
              data={risk?.open_findings ?? null}
              loading={riskQuery.loading}
              error={riskQuery.error}
              onRetry={riskQuery.refetch}
            />
            <DepartmentRiskPanel
              data={risk?.departments ?? null}
              loading={riskQuery.loading}
              error={riskQuery.error}
              onRetry={riskQuery.refetch}
            />
            <AnomalyWatchPanel
              data={anomalies}
              loading={anomaliesQuery.loading}
              error={anomaliesQuery.error}
              onRetry={anomaliesQuery.refetch}
              href={to("/anomalies")}
            />
            <AuditCoveragePanel
              data={audits?.items ?? null}
              total={audits?.total ?? null}
              loading={auditsQuery.loading}
              error={auditsQuery.error}
              onRetry={auditsQuery.refetch}
              href={to("/audits")}
            />
            <PriorityFindingsPanel
              findings={findings?.items ?? null}
              loading={findingsQuery.loading}
              error={findingsQuery.error}
              onRetry={findingsQuery.refetch}
              href={to("/findings")}
              className="lg:col-span-2 xl:col-span-2"
            />
            <FindingsOverviewPanel
              data={findings?.items ?? null}
              total={findings?.total ?? null}
              loading={findingsQuery.loading}
              error={findingsQuery.error}
              onRetry={findingsQuery.refetch}
              href={to("/findings")}
            />
            <RemediationPanel
              data={actions?.items ?? null}
              total={actions?.total ?? null}
              loading={actionsQuery.loading}
              error={actionsQuery.error}
              onRetry={actionsQuery.refetch}
              href={to("/actions")}
              className="lg:col-span-2 xl:col-span-3"
            />
          </div>

          <p className="mt-6 max-w-4xl text-xs leading-relaxed text-slate-600">
            Synthetic data only. Risk scores are deterministic rule results.
            Anomaly flags are peer-relative and advisory: they indicate unusual
            patterns, not confirmed misconduct.
          </p>
        </>
      )}
    </div>
  );
}
