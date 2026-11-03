import type {
  ActionPlanListItem,
  ActionStatus,
  FindingSeverity,
} from "../../api/types";
import type { SortDirection } from "../../components/ui/DataTable";

/**
 * Presentation-only ordering and totals for the action-plan register.
 *
 * Filtering, overdue state, days overdue and R1/R5 points stay on the API.
 * These helpers only order the rows already returned and add up values the API
 * supplied, so no register value is recalculated in the browser.
 */

export type ActionSortKey =
  | "action_id"
  | "action_description"
  | "status"
  | "assigned_owner"
  | "due_date"
  | "completion_date"
  | "finding_ref"
  | "finding_severity"
  | "department"
  | "days_overdue"
  | "rule_points";

export interface ActionSort {
  key: ActionSortKey;
  direction: SortDirection;
}

/** The API returns the earliest due date first, so the register opens that way. */
export const DEFAULT_ACTION_SORT: ActionSort = {
  key: "due_date",
  direction: "asc",
};

const defaultDirections: Record<ActionSortKey, SortDirection> = {
  action_id: "asc",
  action_description: "asc",
  status: "asc",
  assigned_owner: "asc",
  due_date: "asc",
  completion_date: "asc",
  finding_ref: "asc",
  finding_severity: "asc",
  department: "asc",
  days_overdue: "desc",
  rule_points: "desc",
};

const severityOrder: Record<FindingSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

// Blocked work is shown first when the column opens ascending because it needs
// attention; completed work sits last.
const statusOrder: Record<ActionStatus, number> = {
  blocked: 0,
  not_started: 1,
  in_progress: 2,
  completed: 3,
};

const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

function compareAscending(
  a: ActionPlanListItem,
  b: ActionPlanListItem,
  key: ActionSortKey,
): number {
  switch (key) {
    case "action_id":
      return a.action_id - b.action_id;
    case "status":
      return statusOrder[a.status] - statusOrder[b.status];
    case "due_date":
      return a.due_date.localeCompare(b.due_date);
    case "completion_date":
      // Null completion dates are handled by `sortActions` so they stay last in
      // both directions; reaching here means both values are present.
      return (a.completion_date ?? "").localeCompare(b.completion_date ?? "");
    case "finding_severity":
      return severityOrder[a.finding_severity] - severityOrder[b.finding_severity];
    case "days_overdue":
      return a.days_overdue - b.days_overdue;
    case "rule_points":
      return a.rule_points - b.rule_points;
    case "action_description":
      return collator.compare(a.action_description, b.action_description);
    case "assigned_owner":
      return collator.compare(a.assigned_owner, b.assigned_owner);
    case "finding_ref":
      return collator.compare(a.finding_ref, b.finding_ref);
    case "department":
      return collator.compare(a.department, b.department);
  }
}

/** Returns a sorted copy; the API response array is never mutated. */
export function sortActions(
  items: readonly ActionPlanListItem[],
  sort: ActionSort,
): ActionPlanListItem[] {
  const factor = sort.direction === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    // A missing completion date is not a real date, so it sorts last whether
    // the column is ascending or descending.
    if (sort.key === "completion_date") {
      if (a.completion_date === null || b.completion_date === null) {
        if (a.completion_date === b.completion_date) {
          return a.action_id - b.action_id;
        }
        return a.completion_date === null ? 1 : -1;
      }
    }

    return (
      factor * compareAscending(a, b, sort.key) || a.action_id - b.action_id
    );
  });
}

/** First click on a column uses its natural direction; later clicks toggle. */
export function nextActionSort(
  current: ActionSort,
  key: ActionSortKey,
): ActionSort {
  if (current.key === key) {
    return {
      key,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }

  return { key, direction: defaultDirections[key] };
}

export interface ActionRegisterSummary {
  overdue: number;
  blocked: number;
  rulePoints: number;
}

/** Totals across the rows currently visible in the register. */
export function summarizeActions(
  items: readonly ActionPlanListItem[],
): ActionRegisterSummary {
  return items.reduce<ActionRegisterSummary>(
    (totals, item) => ({
      overdue: totals.overdue + (item.is_overdue ? 1 : 0),
      blocked: totals.blocked + (item.status === "blocked" ? 1 : 0),
      rulePoints: totals.rulePoints + item.rule_points,
    }),
    { overdue: 0, blocked: 0, rulePoints: 0 },
  );
}
