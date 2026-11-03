import { useEffect, useMemo, useState } from "react";

import { fetchAnomalyAudits } from "../../api/anomalies";
import type { AuditAnomaly, Department } from "../../api/types";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import {
  DataTable,
  type DataTableColumn,
} from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { AnomaliesIcon } from "../../components/ui/icons";
import { LoadingState } from "../../components/ui/LoadingState";
import { Select } from "../../components/ui/Select";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAsOf } from "../../hooks/useAsOf";
import { formatSignedRobustZ } from "../../lib/anomalyFeatures";
import {
  formatDate,
  formatDecimal,
  formatNumber,
  formatPercent,
} from "../../lib/format";
import {
  anomalyFeatureLabel,
  departmentLabels,
  departmentOptions,
  deviationDirectionLabel,
} from "../../lib/labels";
import {
  DEFAULT_ANOMALY_SORT,
  filterAnomalies,
  nextAnomalySort,
  sortAnomalies,
  summarizeAnomalies,
  type AnomalySortKey,
} from "./anomalyRegister";
import { AnomalyDetailPanel } from "./components/AnomalyDetailPanel";
import { AnomalySummaryStrip } from "./components/AnomalySummaryStrip";

const flaggedOptions = [
  { value: "true", label: "Flagged only" },
  { value: "false", label: "Not flagged" },
];

export function AnomaliesPage() {
  const { asOf, isDefault } = useAsOf();

  const [department, setDepartment] = useState<Department | "">("");
  const [flagged, setFlagged] = useState<"" | "true" | "false">("");
  const [sort, setSort] = useState(DEFAULT_ANOMALY_SORT);
  const [selected, setSelected] = useState<AuditAnomaly | null>(null);

  const query = useApiQuery(
    (signal) => fetchAnomalyAudits(asOf, signal),
    [asOf],
  );

  // A newly filtered or re-dated ranking should not leave an unrelated detail
  // panel open over the table.
  useEffect(() => {
    setSelected(null);
  }, [asOf, department, flagged]);

  const data = query.data;
  const hasActiveFilters = Boolean(department || flagged);

  const filtered = useMemo(
    () =>
      data
        ? filterAnomalies(data.audits, { department, flagged })
        : [],
    [data, department, flagged],
  );
  const rows = useMemo(
    () => sortAnomalies(filtered, sort),
    [filtered, sort],
  );
  const summary = useMemo(
    () => (data ? summarizeAnomalies(filtered) : null),
    [data, filtered],
  );
  // The API rank must stay tied to the original ranked list, even when the
  // register is re-sorted or filtered.
  const rankByRef = useMemo(
    () =>
      new Map(
        (data?.audits ?? []).map((audit, index) => [audit.audit_ref, index + 1]),
      ),
    [data],
  );

  const clearFilters = () => {
    setDepartment("");
    setFlagged("");
  };

  const handleSort = (columnKey: string) => {
    setSort((current) =>
      nextAnomalySort(current, columnKey as AnomalySortKey),
    );
  };

  const partial = Boolean(data && data.total > data.audits.length);

  const columns: DataTableColumn<AuditAnomaly>[] = [
    {
      key: "rank",
      header: "Rank",
      align: "right",
      render: (audit) => (
        <span className="font-mono text-xs text-slate-500">
          #{rankByRef.get(audit.audit_ref) ?? "—"}
        </span>
      ),
    },
    {
      key: "audit_ref",
      header: "Audit",
      sortable: true,
      render: (audit) => (
        <div className="max-w-[22rem] min-w-[13rem]">
          <p className="font-mono text-[11px] text-slate-500">
            {audit.audit_ref}
          </p>
          <p className="mt-0.5 font-medium text-slate-900" title={audit.audit_title}>
            {audit.audit_title}
          </p>
        </div>
      ),
    },
    {
      key: "department",
      header: "Department",
      sortable: true,
      render: (audit) => departmentLabels[audit.department],
    },
    {
      key: "anomaly_score",
      header: "Score",
      align: "right",
      sortable: true,
      render: (audit) => (
        <span className="font-medium tabular-nums text-slate-900">
          {formatDecimal(audit.anomaly_score, 3)}
        </span>
      ),
    },
    {
      key: "score_percentile",
      header: "Percentile",
      align: "right",
      sortable: true,
      render: (audit) => (
        <span className="tabular-nums text-slate-800">
          {formatPercent(audit.score_percentile, 1)}
        </span>
      ),
    },
    {
      key: "is_anomaly",
      header: "Flag",
      sortable: true,
      render: (audit) => (
        <Badge tone={audit.is_anomaly ? "warning" : "neutral"} dot>
          {audit.is_anomaly ? "Flagged" : "Ranked"}
        </Badge>
      ),
    },
    {
      key: "largest_deviation",
      header: "Largest deviation",
      render: (audit) => {
        const deviation = audit.deviations[0];
        if (!deviation) {
          return <span className="text-xs text-slate-500">None reported</span>;
        }
        return (
          <div className="max-w-[15rem] min-w-[10rem]">
            <p className="text-xs font-medium text-slate-800">
              {anomalyFeatureLabel(deviation.feature)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {formatSignedRobustZ(deviation.robust_z)} ·{" "}
              {deviationDirectionLabel(deviation.direction)}
            </p>
          </div>
        );
      },
    },
    {
      key: "rule_points",
      header: "Rule points",
      align: "right",
      sortable: true,
      render: (audit) => (
        <div className="flex min-w-[6rem] flex-col items-end gap-1">
          <span className="font-medium tabular-nums text-slate-900">
            {formatNumber(audit.rule_points)}{" "}
            <span className="text-xs font-normal text-slate-500">pts</span>
          </span>
          {audit.rule_ids.length === 0 ? (
            <span className="text-[11px] text-slate-500">No rule IDs</span>
          ) : (
            <div className="flex flex-wrap justify-end gap-1">
              {audit.rule_ids.map((ruleId) => (
                <Badge key={ruleId} className="font-mono text-[10px]">
                  {ruleId}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "details",
      header: <span className="sr-only">Details</span>,
      align: "right",
      render: (audit) => (
        <button
          type="button"
          aria-label={`View anomaly details for ${audit.audit_ref}`}
          onClick={(event) => {
            event.stopPropagation();
            setSelected(audit);
          }}
          className="rounded-sm text-xs font-medium text-accent-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
        >
          View
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Supplementary analysis"
        title="Anomalies"
        description={`Audits ranked by how unusual they look relative to department peers at ${formatDate(asOf)}. A flag is advisory: it is not a risk score, a fraud finding or a measure of accuracy.`}
      />

      <Card
        title="Filters"
        description="Department and flag filters apply to the ranked list returned by the API. Sorting reorders the same rows."
        className="mb-5"
        contentClassName="p-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Select
            label="Department"
            placeholder="All departments"
            options={departmentOptions()}
            value={department}
            onChange={(event) =>
              setDepartment(event.target.value as Department | "")
            }
          />
          <Select
            label="Flag status"
            placeholder="All audits"
            options={flaggedOptions}
            value={flagged}
            onChange={(event) =>
              setFlagged(event.target.value as "" | "true" | "false")
            }
          />
          <p className="self-end text-xs leading-relaxed text-slate-500">
            Eligibility is evaluated by the API: an audit must start on or
            before the date and have at least one finding identified by it.
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <p
            role="status"
            aria-live="polite"
            className="text-xs text-slate-600"
          >
            {query.loading
              ? "Updating anomaly ranking…"
              : query.error
                ? "Anomaly ranking unavailable at this time."
                : data
                  ? filtered.length === 0
                    ? hasActiveFilters
                      ? "No audits match the current filters."
                      : "No eligible audits at this date."
                    : `${formatNumber(filtered.length)} of ${formatNumber(
                        data.total,
                      )} eligible audits shown; ${formatNumber(
                        summary?.flagged ?? 0,
                      )} flagged.`
                  : "No ranking loaded yet."}
          </p>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      <AnomalySummaryStrip
        summary={summary}
        contamination={data?.detector.contamination ?? null}
        loading={query.loading}
      />

      <Card
        title="Anomaly ranking"
        description="Select an audit to open the full feature deviations. Column headings sort the visible rows."
        contentClassName="p-0"
      >
        <div aria-busy={query.loading}>
          {query.loading ? (
            <div className="p-5">
              <LoadingState label="Loading anomaly ranking" rows={8} />
            </div>
          ) : query.error ? (
            <div className="p-5">
              <ErrorState
                error={query.error}
                title="Unable to load the anomaly ranking"
                onRetry={query.refetch}
              />
            </div>
          ) : !data || data.total === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<AnomaliesIcon className="h-5 w-5" />}
                title="No eligible audits at this date"
                description="An audit becomes eligible for anomaly scoring after it starts and has at least one finding identified by the selected date. Try a later evaluation date."
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No audits match these filters"
                description="Try a different department or flag status. The filters apply to the audits the API returned as eligible at this date."
                action={
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              {partial && (
                <div
                  role="status"
                  className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900"
                >
                  <span className="font-semibold">Partial data.</span> The API
                  reports {formatNumber(data.total)} eligible audits but returned{" "}
                  {formatNumber(data.audits.length)}{" "}
                  {data.audits.length === 1 ? "row" : "rows"}. The register and
                  its totals cover the returned rows.
                </div>
              )}
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(audit) => audit.audit_ref}
                caption="Audit anomaly ranking with API rank, score, percentile, advisory flag, largest peer deviation and joined rule points"
                onRowClick={(audit) => setSelected(audit)}
                sort={{
                  columnKey: sort.key,
                  direction: sort.direction,
                  onSort: handleSort,
                }}
              />
            </>
          )}
        </div>
      </Card>

      <p className="mt-6 max-w-4xl text-xs leading-relaxed text-slate-600">
        Synthetic data only. Anomaly scores describe how unusual an audit is
        relative to its department peers. They are advisory, do not change the
        deterministic risk score, and are not a measure of accuracy. Rule points
        are joined for context and never used as model inputs.
      </p>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? selected.audit_ref : "Audit anomaly detail"}
        description={selected?.audit_title}
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>
        }
      >
        {selected && (
          <AnomalyDetailPanel
            audit={selected}
            rank={rankByRef.get(selected.audit_ref) ?? null}
            asOf={asOf}
            isDefault={isDefault}
            detector={data?.detector ?? null}
            disclaimer={data?.disclaimer ?? null}
          />
        )}
      </Drawer>
    </div>
  );
}
