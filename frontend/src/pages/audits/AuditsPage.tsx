import { useEffect, useMemo, useState } from "react";

import { fetchAudits } from "../../api/audits";
import type {
  AuditListItem,
  AuditStatus,
  AuditType,
  Department,
} from "../../api/types";
import { PageHeader } from "../../components/layout/PageHeader";
import { AuditsIcon } from "../../components/ui/icons";
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
import { Input } from "../../components/ui/Input";
import { LoadingState } from "../../components/ui/LoadingState";
import { Select } from "../../components/ui/Select";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAsOf } from "../../hooks/useAsOf";
import { useUrlSearchParams } from "../../hooks/useUrlSearchParams";
import { formatDate, formatNumber } from "../../lib/format";
import {
  auditStatusLabels,
  auditStatusOptions,
  auditTypeLabels,
  auditTypeOptions,
  departmentLabels,
  departmentOptions,
  isLabelValue,
} from "../../lib/labels";
import { readSearchParam } from "../../lib/links";
import { auditStatusTones } from "../../lib/statusTones";
import {
  DEFAULT_AUDIT_SORT,
  nextAuditSort,
  sortAudits,
  summarizeAudits,
  type AuditSortKey,
} from "./auditRegister";
import { AuditDetailPanel } from "./components/AuditDetailPanel";
import { AuditRegisterSummaryStrip } from "./components/AuditRegisterSummaryStrip";

const SEARCH_DEBOUNCE_MS = 300;

export function AuditsPage() {
  const { asOf, isDefault } = useAsOf();
  const [searchParams, setSearchParams] = useUrlSearchParams();

  const search = readSearchParam(searchParams, "search", 120);
  const departmentParam = readSearchParam(searchParams, "department");
  const statusParam = readSearchParam(searchParams, "status");
  const auditTypeParam = readSearchParam(searchParams, "audit_type");

  // URL values are validated against the known option keys. A hand-edited or
  // stale value is treated as "no filter" instead of being sent to the API.
  const department: Department | "" = isLabelValue(
    departmentLabels,
    departmentParam,
  )
    ? departmentParam
    : "";
  const status: AuditStatus | "" = isLabelValue(
    auditStatusLabels,
    statusParam,
  )
    ? statusParam
    : "";
  const auditType: AuditType | "" = isLabelValue(
    auditTypeLabels,
    auditTypeParam,
  )
    ? auditTypeParam
    : "";

  const [searchInput, setSearchInput] = useState(search);
  const [sort, setSort] = useState(DEFAULT_AUDIT_SORT);
  const [selected, setSelected] = useState<AuditListItem | null>(null);

  // Keep the typed value in step with browser back/forward. Trailing spaces
  // are preserved while the user types; only the trimmed value reaches the API.
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
      fetchAudits(asOf, signal, {
        department,
        status,
        auditType,
        search,
      }),
    [asOf, department, status, auditType, search],
  );

  // A newly filtered or re-dated register should not leave an unrelated detail
  // panel open over the table.
  useEffect(() => {
    setSelected(null);
  }, [asOf, department, status, auditType, search]);

  const data = query.data;
  const hasActiveFilters = Boolean(
    department || status || auditType || search,
  );

  const rows = useMemo(
    () => (data ? sortAudits(data.items, sort) : []),
    [data, sort],
  );
  const summary = useMemo(
    () => (data ? summarizeAudits(data.items) : null),
    [data],
  );

  const clearFilters = () => {
    setSearchInput("");
    setSearchParams({
      department: "",
      status: "",
      audit_type: "",
      search: "",
    });
  };

  const handleSort = (columnKey: string) => {
    setSort((current) => nextAuditSort(current, columnKey as AuditSortKey));
  };

  const partial = Boolean(data && data.total > data.items.length);

  const columns: DataTableColumn<AuditListItem>[] = [
    {
      key: "title",
      header: "Audit",
      sortable: true,
      render: (audit) => (
        <div className="max-w-[22rem] min-w-[14rem]">
          <p className="font-mono text-[11px] text-slate-500">
            {audit.audit_ref}
          </p>
          <p className="mt-0.5 font-medium text-slate-900">{audit.title}</p>
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
      key: "audit_type",
      header: "Type",
      sortable: true,
      render: (audit) => auditTypeLabels[audit.audit_type],
    },
    {
      key: "lead_auditor",
      header: "Lead auditor",
      sortable: true,
      render: (audit) => audit.lead_auditor,
    },
    {
      key: "start_date",
      header: "Start",
      sortable: true,
      render: (audit) => formatDate(audit.start_date),
    },
    {
      key: "end_date",
      header: "End",
      sortable: true,
      render: (audit) => formatDate(audit.end_date),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (audit) => (
        <Badge tone={auditStatusTones[audit.status]}>
          {auditStatusLabels[audit.status]}
        </Badge>
      ),
    },
    {
      key: "finding_count",
      header: "Findings",
      align: "right",
      sortable: true,
      render: (audit) => (
        <div>
          <p className="font-medium tabular-nums text-slate-900">
            {formatNumber(audit.finding_count)}
          </p>
          <p className="text-xs text-slate-500">
            {formatNumber(audit.open_finding_count)} open
          </p>
        </div>
      ),
    },
    {
      key: "action_count",
      header: "Actions",
      align: "right",
      sortable: true,
      render: (audit) => (
        <div>
          <p className="font-medium tabular-nums text-slate-900">
            {formatNumber(audit.action_count)}
          </p>
          <p
            className={
              audit.overdue_action_count > 0
                ? "text-xs text-red-700"
                : "text-xs text-slate-500"
            }
          >
            {formatNumber(audit.overdue_action_count)} overdue
          </p>
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
          aria-label={`View details for ${audit.audit_ref}`}
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
        eyebrow="Assurance register"
        title="Audits"
        description={`Read-only register of audit engagements visible as of ${formatDate(asOf)}. Select an audit to inspect its coverage and the findings and actions raised against it.`}
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
            placeholder="Reference, title or lead auditor"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            containerClassName="sm:col-span-2 xl:col-span-1"
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
          <Select
            label="Audit type"
            placeholder="All types"
            options={auditTypeOptions()}
            value={auditType}
            onChange={(event) =>
              updateFilter("audit_type", event.target.value)
            }
          />
          <Select
            label="Status"
            placeholder="All statuses"
            options={auditStatusOptions()}
            value={status}
            onChange={(event) => updateFilter("status", event.target.value)}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
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
                      ? "No audits match the current filters."
                      : "No audits at this date."
                    : `${formatNumber(data.total)} ${
                        data.total === 1 ? "audit matches" : "audits match"
                      } the current filters.`
                  : "No register data loaded yet."}
          </p>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      <AuditRegisterSummaryStrip
        total={data?.total ?? null}
        summary={summary}
        loading={query.loading}
      />

      <Card
        title="Audit register"
        description="Select a row to open the audit detail panel. Column headings sort the visible rows."
        contentClassName="p-0"
      >
        <div aria-busy={query.loading}>
          {query.loading ? (
            <div className="p-5">
              <LoadingState label="Loading audit register" rows={8} />
            </div>
          ) : query.error ? (
            <div className="p-5">
              <ErrorState
                error={query.error}
                title="Unable to load the audit register"
                onRetry={query.refetch}
              />
            </div>
          ) : !data || data.total === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<AuditsIcon className="h-5 w-5" />}
                title={
                  hasActiveFilters
                    ? "No audits match these filters"
                    : "No audits at this date"
                }
                description={
                  hasActiveFilters
                    ? "Try a different search term, department, type or status. Filters are applied by the API to audits that started on or before the evaluation date."
                    : "Audits appear here once their start date is on or before the selected evaluation date."
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
                  reports {formatNumber(data.total)} matching audits but returned{" "}
                  {formatNumber(data.items.length)}{" "}
                  {data.items.length === 1 ? "row" : "rows"}. The register and
                  its totals cover the returned rows.
                </div>
              )}
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(audit) => audit.audit_ref}
                caption="Audit register with department, type, dates, status and finding and action counts"
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
        Synthetic data only. Finding, action and overdue counts are calculated by
        the API at the selected evaluation date; the register does not
        recalculate them.
      </p>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? "Audit detail"}
        description={selected?.audit_ref}
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>
        }
      >
        {selected && (
          <AuditDetailPanel
            audit={selected}
            asOf={asOf}
            isDefault={isDefault}
          />
        )}
      </Drawer>
    </div>
  );
}
