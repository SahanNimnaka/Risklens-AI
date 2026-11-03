import { useEffect, useMemo, useState } from "react";

import { fetchFindings } from "../../api/findings";
import type {
  Department,
  FindingListItem,
  FindingSeverity,
  FindingStatus,
} from "../../api/types";
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
import { FindingsIcon } from "../../components/ui/icons";
import { Input } from "../../components/ui/Input";
import { LoadingState } from "../../components/ui/LoadingState";
import { Select } from "../../components/ui/Select";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAsOf } from "../../hooks/useAsOf";
import { useUrlSearchParams } from "../../hooks/useUrlSearchParams";
import { formatDate, formatNumber } from "../../lib/format";
import {
  departmentLabels,
  departmentOptions,
  findingSeverityLabels,
  findingSeverityOptions,
  findingStatusLabels,
  findingStatusOptions,
  isLabelValue,
} from "../../lib/labels";
import { readSearchParam } from "../../lib/links";
import {
  findingSeverityTones,
  riskBandTones,
} from "../../lib/severity";
import { findingStatusTones } from "../../lib/statusTones";
import {
  DEFAULT_FINDING_SORT,
  nextFindingSort,
  sortFindings,
  summarizeFindings,
  type FindingSortKey,
} from "./findingRegister";
import { FindingDetailPanel } from "./components/FindingDetailPanel";
import { FindingsSummaryStrip } from "./components/FindingsSummaryStrip";

const SEARCH_DEBOUNCE_MS = 300;

export function FindingsPage() {
  const { asOf, isDefault } = useAsOf();
  const [searchParams, setSearchParams] = useUrlSearchParams();

  // The audit register links here with `audit_ref`. Reading it from the URL
  // keeps that link useful and preserves the evaluation date supplied by the
  // shared as-of control. The remaining filters are URL-backed too, so a
  // reload or browser back/forward restores the same register view.
  const auditRef = readSearchParam(searchParams, "audit_ref", 32);
  const ruleId = readSearchParam(searchParams, "rule_id", 64);
  const search = readSearchParam(searchParams, "search", 120);
  const severityParam = readSearchParam(searchParams, "severity");
  const statusParam = readSearchParam(searchParams, "status");
  const departmentParam = readSearchParam(searchParams, "department");

  // Unknown or hand-edited values are treated as "no filter" rather than being
  // forwarded to the API and causing a validation error.
  const severity: FindingSeverity | "" = isLabelValue(
    findingSeverityLabels,
    severityParam,
  )
    ? severityParam
    : "";
  const status: FindingStatus | "" = isLabelValue(
    findingStatusLabels,
    statusParam,
  )
    ? statusParam
    : "";
  const department: Department | "" = isLabelValue(
    departmentLabels,
    departmentParam,
  )
    ? departmentParam
    : "";

  const [searchInput, setSearchInput] = useState(search);
  const [sort, setSort] = useState(DEFAULT_FINDING_SORT);
  const [selected, setSelected] = useState<FindingListItem | null>(null);

  // Keep the typed value in step with browser back/forward. Trailing spaces are
  // preserved while the user types; only the trimmed value reaches the API.
  useEffect(() => {
    setSearchInput((current) => (current.trim() === search ? current : search));
  }, [search]);

  // Typing is local; the URL, and therefore the API request, updates after a
  // short pause.
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === search) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSearchParams({ search: trimmed });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchInput, search, setSearchParams]);

  const updateFilter = (key: string, value: string) => {
    setSearchParams({ [key]: value });
  };

  const query = useApiQuery(
    (signal) =>
      fetchFindings(asOf, signal, {
        severity,
        status,
        department,
        search,
        auditRef,
        ruleId,
      }),
    [asOf, severity, status, department, search, auditRef, ruleId],
  );

  // A newly filtered or re-dated register should not leave an unrelated detail
  // panel open over the table.
  useEffect(() => {
    setSelected(null);
  }, [asOf, severity, status, department, search, auditRef, ruleId]);

  const data = query.data;
  const hasActiveFilters = Boolean(
    severity || status || department || search || auditRef || ruleId,
  );

  const rows = useMemo(
    () => (data ? sortFindings(data.items, sort) : []),
    [data, sort],
  );
  const summary = useMemo(
    () => (data ? summarizeFindings(data.items) : null),
    [data],
  );

  const clearFilters = () => {
    setSearchInput("");
    setSearchParams({
      severity: "",
      status: "",
      department: "",
      audit_ref: "",
      rule_id: "",
      search: "",
    });
  };

  const handleSort = (columnKey: string) => {
    setSort((current) =>
      nextFindingSort(current, columnKey as FindingSortKey),
    );
  };

  const partial = Boolean(data && data.total > data.items.length);

  const columns: DataTableColumn<FindingListItem>[] = [
    {
      key: "title",
      header: "Finding",
      sortable: true,
      render: (finding) => (
        <div className="max-w-[22rem] min-w-[14rem]">
          <p className="font-mono text-[11px] text-slate-500">
            {finding.finding_ref}
          </p>
          <p className="mt-0.5 font-medium text-slate-900">{finding.title}</p>
        </div>
      ),
    },
    {
      key: "severity",
      header: "Finding severity",
      sortable: true,
      render: (finding) => (
        <Badge tone={findingSeverityTones[finding.severity]}>
          {findingSeverityLabels[finding.severity]}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (finding) => (
        <Badge tone={findingStatusTones[finding.status]}>
          {findingStatusLabels[finding.status]}
        </Badge>
      ),
    },
    {
      key: "department",
      header: "Department",
      sortable: true,
      render: (finding) => departmentLabels[finding.department],
    },
    {
      key: "identified_date",
      header: "Identified",
      sortable: true,
      render: (finding) => formatDate(finding.identified_date),
    },
    {
      key: "audit_ref",
      header: "Audit",
      sortable: true,
      render: (finding) => (
        <div className="max-w-[18rem] min-w-[10rem]">
          <p className="font-mono text-[11px] text-slate-500">
            {finding.audit_ref}
          </p>
          <p
            className="mt-0.5 truncate text-xs text-slate-600"
            title={finding.audit_title}
          >
            {finding.audit_title}
          </p>
        </div>
      ),
    },
    {
      key: "rule_ids",
      header: "Direct rules",
      sortable: true,
      render: (finding) =>
        finding.rule_ids.length === 0 ? (
          <span className="text-xs text-slate-500">None</span>
        ) : (
          <div className="flex max-w-[12rem] flex-wrap gap-1">
            {finding.rule_ids.map((ruleId) => (
              <Badge key={ruleId} className="font-mono text-[10px]">
                {ruleId}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: "risk_score",
      header: "Direct score",
      align: "right",
      sortable: true,
      render: (finding) => (
        <div className="flex flex-col items-end gap-1">
          <p className="font-medium tabular-nums text-slate-900">
            {formatNumber(finding.risk_score)}{" "}
            <span className="text-xs font-normal text-slate-500">pts</span>
          </p>
          <Badge tone={riskBandTones[finding.risk_band]}>
            {findingSeverityLabels[finding.risk_band]}
          </Badge>
        </div>
      ),
    },
    {
      key: "details",
      header: <span className="sr-only">Details</span>,
      align: "right",
      render: (finding) => (
        <button
          type="button"
          aria-label={`View details for ${finding.finding_ref}`}
          onClick={(event) => {
            event.stopPropagation();
            setSelected(finding);
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
        eyebrow="Assurance register"
        title="Risk findings"
        description={`Read-only register of findings identified by ${formatDate(asOf)}. Select a finding to inspect its direct rule hits, reasons and typed evidence, plus department-level recurrence and control context.`}
      />

      <Card
        title="Filters"
        description="Search and filters are applied by the API. Sorting applies to the returned rows."
        className="mb-5"
        contentClassName="p-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Search"
            type="search"
            maxLength={120}
            placeholder="Reference, title or audit"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            containerClassName="sm:col-span-2 xl:col-span-1"
          />
          <Select
            label="Finding severity"
            placeholder="All severities"
            options={findingSeverityOptions()}
            value={severity}
            onChange={(event) =>
              updateFilter("severity", event.target.value)
            }
          />
          <Select
            label="Status"
            placeholder="All statuses"
            options={findingStatusOptions()}
            value={status}
            onChange={(event) => updateFilter("status", event.target.value)}
          />
          <Select
            label="Department"
            placeholder="All departments"
            options={departmentOptions()}
            value={department}
            onChange={(event) =>
              updateFilter("department", event.target.value)
            }
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <p
              role="status"
              aria-live="polite"
              className="text-xs text-slate-600"
            >
              {query.loading
                ? "Updating register…"
                : query.error
                  ? "Register unavailable at this time."
                  : data
                    ? data.total === 0
                      ? hasActiveFilters
                        ? "No findings match the current filters."
                        : "No findings at this date."
                      : `${formatNumber(data.total)} ${
                          data.total === 1 ? "finding matches" : "findings match"
                        } the current filters.`
                    : "No register data loaded yet."}
            </p>
            {auditRef && (
              <Badge tone="info">
                Audit filter:{" "}
                <span className="ml-1 font-mono text-[10px]">{auditRef}</span>
              </Badge>
            )}
            {ruleId && (
              <Badge tone="info">
                Rule filter:{" "}
                <span className="ml-1 font-mono text-[10px]">{ruleId}</span>
              </Badge>
            )}
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      <FindingsSummaryStrip
        total={data?.total ?? null}
        summary={summary}
        loading={query.loading}
      />

      <Card
        title="Finding register"
        description="Select a row to open the finding detail panel. Column headings sort the visible rows."
        contentClassName="p-0"
      >
        <div aria-busy={query.loading}>
          {query.loading ? (
            <div className="p-5">
              <LoadingState label="Loading finding register" rows={8} />
            </div>
          ) : query.error ? (
            <div className="p-5">
              <ErrorState
                error={query.error}
                title="Unable to load the finding register"
                onRetry={query.refetch}
              />
            </div>
          ) : !data || data.total === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<FindingsIcon className="h-5 w-5" />}
                title={
                  hasActiveFilters
                    ? "No findings match these filters"
                    : "No findings at this date"
                }
                description={
                  hasActiveFilters
                    ? "Try a different search term, severity, status, department or audit. Filters are applied by the API to findings identified on or before the evaluation date."
                    : "Findings appear here once their identified date is on or before the selected evaluation date."
                }
                action={
                  hasActiveFilters ? (
                    <Button variant="secondary" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
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
                  reports {formatNumber(data.total)} matching findings but
                  returned {formatNumber(data.items.length)}{" "}
                  {data.items.length === 1 ? "row" : "rows"}. The register and
                  its totals cover the returned rows.
                </div>
              )}
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(finding) => finding.finding_ref}
                caption="Finding register with finding severity, status, department, audit, direct rule IDs and direct score"
                onRowClick={(finding) => setSelected(finding)}
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
        Synthetic data only. Direct scores, bands and rule attribution come from
        the API. A direct score includes only hits attributed to the finding; R4
        recurrence and R6 control hits belong to the department and are never
        added. Finding severity is an attribute of the finding, while alert
        severity describes an individual rule hit.
      </p>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? "Finding detail"}
        description={selected?.finding_ref}
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>
        }
      >
        {selected && (
          <FindingDetailPanel
            finding={selected}
            asOf={asOf}
            isDefault={isDefault}
          />
        )}
      </Drawer>
    </div>
  );
}
