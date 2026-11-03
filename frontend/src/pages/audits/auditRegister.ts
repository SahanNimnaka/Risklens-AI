import type { AuditListItem } from "../../api/types";
import type { SortDirection } from "../../components/ui/DataTable";

/**
 * Presentation-only ordering and totals for the audit register.
 *
 * Filtering, risk scoring and overdue state stay on the API. These helpers only
 * order the rows already returned and add up counts the API supplied, so no
 * register value is recalculated in the browser.
 */

export type AuditSortKey =
  | "audit_ref"
  | "title"
  | "department"
  | "audit_type"
  | "lead_auditor"
  | "start_date"
  | "end_date"
  | "status"
  | "finding_count"
  | "open_finding_count"
  | "action_count"
  | "overdue_action_count";

export interface AuditSort {
  key: AuditSortKey;
  direction: SortDirection;
}

/** The API returns newest start date first, so the register opens the same way. */
export const DEFAULT_AUDIT_SORT: AuditSort = {
  key: "start_date",
  direction: "desc",
};

const defaultDirections: Record<AuditSortKey, SortDirection> = {
  audit_ref: "asc",
  title: "asc",
  department: "asc",
  audit_type: "asc",
  lead_auditor: "asc",
  start_date: "desc",
  end_date: "desc",
  status: "asc",
  finding_count: "desc",
  open_finding_count: "desc",
  action_count: "desc",
  overdue_action_count: "desc",
};

const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

function compareAscending(
  a: AuditListItem,
  b: AuditListItem,
  key: AuditSortKey,
): number {
  switch (key) {
    case "finding_count":
      return a.finding_count - b.finding_count;
    case "open_finding_count":
      return a.open_finding_count - b.open_finding_count;
    case "action_count":
      return a.action_count - b.action_count;
    case "overdue_action_count":
      return a.overdue_action_count - b.overdue_action_count;
    case "start_date":
      return a.start_date.localeCompare(b.start_date);
    case "end_date":
      // Null end dates are handled by `sortAudits` so they stay last in both
      // directions; reaching here means both values are present.
      return (a.end_date ?? "").localeCompare(b.end_date ?? "");
    case "audit_ref":
      return collator.compare(a.audit_ref, b.audit_ref);
    case "title":
      return collator.compare(a.title, b.title);
    case "department":
      return collator.compare(a.department, b.department);
    case "audit_type":
      return collator.compare(a.audit_type, b.audit_type);
    case "lead_auditor":
      return collator.compare(a.lead_auditor, b.lead_auditor);
    case "status":
      return collator.compare(a.status, b.status);
  }
}

/** Returns a sorted copy; the API response array is never mutated. */
export function sortAudits(
  items: readonly AuditListItem[],
  sort: AuditSort,
): AuditListItem[] {
  const factor = sort.direction === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    // A missing completion date is not a real date, so it sorts last whether
    // the column is ascending or descending.
    if (sort.key === "end_date") {
      if (a.end_date === null || b.end_date === null) {
        if (a.end_date === b.end_date) {
          return collator.compare(a.audit_ref, b.audit_ref);
        }
        return a.end_date === null ? 1 : -1;
      }
    }

    return (
      factor * compareAscending(a, b, sort.key) ||
      collator.compare(a.audit_ref, b.audit_ref)
    );
  });
}

/** First click on a column uses its natural direction; later clicks toggle. */
export function nextAuditSort(
  current: AuditSort,
  key: AuditSortKey,
): AuditSort {
  if (current.key === key) {
    return {
      key,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }

  return { key, direction: defaultDirections[key] };
}

export interface AuditRegisterSummary {
  findings: number;
  openFindings: number;
  actions: number;
  overdueActions: number;
}

/** Totals across the rows currently visible in the register. */
export function summarizeAudits(
  items: readonly AuditListItem[],
): AuditRegisterSummary {
  return items.reduce<AuditRegisterSummary>(
    (totals, item) => ({
      findings: totals.findings + item.finding_count,
      openFindings: totals.openFindings + item.open_finding_count,
      actions: totals.actions + item.action_count,
      overdueActions: totals.overdueActions + item.overdue_action_count,
    }),
    { findings: 0, openFindings: 0, actions: 0, overdueActions: 0 },
  );
}
