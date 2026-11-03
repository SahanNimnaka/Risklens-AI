import { useEffect, useMemo, useState } from "react";

import { fetchActions } from "../../api/actions";
import type {
  ActionPlanListItem,
  ActionStatus,
  Department,
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
import { ActionsIcon } from "../../components/ui/icons";
import { Input } from "../../components/ui/Input";
import { LoadingState } from "../../components/ui/LoadingState";
import { Select } from "../../components/ui/Select";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAsOf } from "../../hooks/useAsOf";
import { useUrlSearchParams } from "../../hooks/useUrlSearchParams";
import {
  formatCount,
  formatDate,
  formatNumber,
} from "../../lib/format";
import {
  actionStatusLabels,
  actionStatusOptions,
  departmentLabels,
  departmentOptions,
  findingSeverityLabels,
  isLabelValue,
} from "../../lib/labels";
import { readSearchParam } from "../../lib/links";
import { findingSeverityTones } from "../../lib/severity";
import { actionStatusTones } from "../../lib/statusTones";
import {
  DEFAULT_ACTION_SORT,
  nextActionSort,
  sortActions,
  summarizeActions,
  type ActionSortKey,
} from "./actionRegister";
import { ActionDetailPanel } from "./components/ActionDetailPanel";
import { ActionsSummaryStrip } from "./components/ActionsSummaryStrip";

const SEARCH_DEBOUNCE_MS = 300;

const overdueOptions = [
  { value: "true", label: "Overdue only" },
  { value: "false", label: "Not overdue" },
];

export function ActionPlansPage() {
  const { asOf, isDefault } = useAsOf();
  const [searchParams, setSearchParams] = useUrlSearchParams();

  // The audit and finding registers link here with `audit_ref` and
  // `finding_ref`. Reading them from the URL keeps those links useful and
  // preserves the evaluation date supplied by the shared as-of control. The
  // remaining filters are URL-backed so reload and back/forward restore the
  // same register view.
  const auditRef = readSearchParam(searchParams, "audit_ref", 32);
  const findingRef = readSearchParam(searchParams, "finding_ref", 32);
  const search = readSearchParam(searchParams, "search", 120);
  const statusParam = readSearchParam(searchParams, "status");
  const departmentParam = readSearchParam(searchParams, "department");
  const overdueParam = readSearchParam(searchParams, "overdue");

  // Unknown or hand-edited values are treated as "no filter" rather than being
  // forwarded to the API and causing a validation error.
  const status: ActionStatus | "" = isLabelValue(
    actionStatusLabels,
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
  const overdue: "" | "true" | "false" =
    overdueParam === "true" || overdueParam === "false" ? overdueParam : "";

  const [searchInput, setSearchInput] = useState(search);
  const [sort, setSort] = useState(DEFAULT_ACTION_SORT);
  const [selected, setSelected] = useState<ActionPlanListItem | null>(null);

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
      fetchActions(asOf, signal, {
        status,
        department,
        overdue,
        search,
        auditRef,
        findingRef,
      }),
    [asOf, status, department, overdue, search, auditRef, findingRef],
  );

  // A newly filtered or re-dated register should not leave an unrelated detail
  // panel open over the table.
  useEffect(() => {
    setSelected(null);
  }, [asOf, status, department, overdue, search, auditRef, findingRef]);

  const data = query.data;
  const hasActiveFilters = Boolean(
    status || department || overdue || search || auditRef || findingRef,
  );

  const rows = useMemo(
    () => (data ? sortActions(data.items, sort) : []),
    [data, sort],
  );
  const summary = useMemo(
    () => (data ? summarizeActions(data.items) : null),
    [data],
  );

  const clearFilters = () => {
    setSearchInput("");
    setSearchParams({
      status: "",
      department: "",
      overdue: "",
      audit_ref: "",
      finding_ref: "",
      search: "",
    });
  };

  const handleSort = (columnKey: string) => {
    setSort((current) =>
      nextActionSort(current, columnKey as ActionSortKey),
    );
  };

  const partial = Boolean(data && data.total > data.items.length);

  const columns: DataTableColumn<ActionPlanListItem>[] = [
    {
      key: "action_description",
      header: "Action",
      sortable: true,
      render: (action) => (
        <div className="max-w-[24rem] min-w-[15rem]">
          <p className="font-mono text-[11px] text-slate-500">
            Action #{action.action_id}
          </p>
          <p className="mt-0.5 font-medium text-slate-900">
            {action.action_description}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (action) => (
        <Badge tone={actionStatusTones[action.status]}>
          {actionStatusLabels[action.status]}
        </Badge>
      ),
    },
    {
      key: "assigned_owner",
      header: "Owner",
      sortable: true,
      render: (action) => (
        <span className="text-sm text-slate-800">{action.assigned_owner}</span>
      ),
    },
    {
      key: "due_date",
      header: "Due",
      sortable: true,
      render: (action) => (
        <div className="flex min-w-[8rem] flex-col gap-1">
          <span className="text-sm text-slate-800">
            {formatDate(action.due_date)}
          </span>
          {action.is_overdue && (
            <Badge tone="critical" dot>
              {formatCount(action.days_overdue, "day")} overdue
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "completion_date",
      header: "Completed",
      sortable: true,
      render: (action) => (
        <span className="text-sm text-slate-800">
          {action.completion_date
            ? formatDate(action.completion_date)
            : "—"}
        </span>
      ),
    },
    {
      key: "finding_ref",
      header: "Finding",
      sortable: true,
      render: (action) => (
        <div className="max-w-[20rem] min-w-[12rem]">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={findingSeverityTones[action.finding_severity]}>
              {findingSeverityLabels[action.finding_severity]}
            </Badge>
            <span className="font-mono text-[11px] text-slate-500">
              {action.finding_ref}
            </span>
          </div>
          <p
            className="mt-0.5 truncate text-xs text-slate-600"
            title={action.finding_title}
          >
            {action.finding_title}
          </p>
        </div>
      ),
    },
    {
      key: "department",
      header: "Department",
      sortable: true,
      render: (action) => departmentLabels[action.department],
    },
    {
      key: "rule_points",
      header: "Rule points",
      align: "right",
      sortable: true,
      render: (action) => (
        <div className="flex min-w-[6rem] flex-col items-end gap-1">
          <span className="font-medium tabular-nums text-slate-900">
            {formatNumber(action.rule_points)}{" "}
            <span className="text-xs font-normal text-slate-500">pts</span>
          </span>
          {action.rule_hits.length === 0 ? (
            <span className="text-[11px] text-slate-500">No hits</span>
          ) : (
            <div className="flex flex-wrap justify-end gap-1">
              {Array.from(
                new Set(action.rule_hits.map((hit) => hit.rule_id)),
              ).map((ruleId) => (
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
      render: (action) => (
        <button
          type="button"
          aria-label={`View details for action ${action.action_id}`}
          onClick={(event) => {
            event.stopPropagation();
            setSelected(action);
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
        title="Action plans"
        description={`Read-only register of action plans attached to findings visible by ${formatDate(asOf)}. Select an action to inspect its owner, dates, API-computed overdue state, parent finding context and R1/R5 rule attribution.`}
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
            placeholder="Description, owner, finding or audit"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            containerClassName="sm:col-span-2 xl:col-span-1"
          />
          <Select
            label="Status"
            placeholder="All statuses"
            options={actionStatusOptions()}
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
          <Select
            label="Overdue"
            placeholder="All actions"
            options={overdueOptions}
            value={overdue}
            onChange={(event) =>
              updateFilter("overdue", event.target.value)
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
                        ? "No actions match the current filters."
                        : "No actions at this date."
                      : `${formatNumber(data.total)} ${
                          data.total === 1 ? "action plan matches" : "action plans match"
                        } the current filters.`
                    : "No register data loaded yet."}
            </p>
            {auditRef && (
              <Badge tone="info">
                Audit filter:{" "}
                <span className="ml-1 font-mono text-[10px]">{auditRef}</span>
              </Badge>
            )}
            {findingRef && (
              <Badge tone="info">
                Finding filter:{" "}
                <span className="ml-1 font-mono text-[10px]">{findingRef}</span>
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

      <ActionsSummaryStrip
        total={data?.total ?? null}
        summary={summary}
        loading={query.loading}
      />

      <Card
        title="Action register"
        description="Select a row to open the action detail panel. Column headings sort the visible rows."
        contentClassName="p-0"
      >
        <div aria-busy={query.loading}>
          {query.loading ? (
            <div className="p-5">
              <LoadingState label="Loading action register" rows={8} />
            </div>
          ) : query.error ? (
            <div className="p-5">
              <ErrorState
                error={query.error}
                title="Unable to load the action register"
                onRetry={query.refetch}
              />
            </div>
          ) : !data || data.total === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<ActionsIcon className="h-5 w-5" />}
                title={
                  hasActiveFilters
                    ? "No actions match these filters"
                    : "No actions at this date"
                }
                description={
                  hasActiveFilters
                    ? "Try a different search term, status, department, overdue state, audit or finding. Filters are applied by the API to actions attached to findings visible at the evaluation date."
                    : "Action plans appear here once the finding they address is visible at the selected evaluation date."
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
                  reports {formatNumber(data.total)} matching action plans but
                  returned {formatNumber(data.items.length)}{" "}
                  {data.items.length === 1 ? "row" : "rows"}. The register and
                  its totals cover the returned rows.
                </div>
              )}
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(action) => String(action.action_id)}
                caption="Action-plan register with status, owner, due and completion dates, API-computed overdue state, parent finding, department and R1/R5 points"
                onRowClick={(action) => setSelected(action)}
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
        Synthetic data only. Overdue state, days overdue and R1/R5 points come
        from the API; the browser never re-implements the overdue comparison.
        Action points are attributed to the action plan and also contribute to
        the parent finding's direct score. Finding severity is an attribute of
        the finding, while alert severity describes an individual rule hit.
      </p>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={
          selected ? `Action plan #${selected.action_id}` : "Action plan detail"
        }
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
          <ActionDetailPanel
            action={selected}
            asOf={asOf}
            isDefault={isDefault}
          />
        )}
      </Drawer>
    </div>
  );
}
