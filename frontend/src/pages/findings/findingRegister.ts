import type {
  FindingListItem,
  FindingSeverity,
  FindingStatus,
} from "../../api/types";
import type { SortDirection } from "../../components/ui/DataTable";

/**
 * Presentation-only ordering and totals for the finding register.
 *
 * Filtering, risk scoring and rule attribution stay on the API. These helpers
 * only order the rows already returned and add up values the API supplied, so
 * no score, band or rule hit is recalculated in the browser.
 */

export type FindingSortKey =
  | "finding_ref"
  | "title"
  | "severity"
  | "status"
  | "department"
  | "root_cause_category"
  | "identified_date"
  | "audit_ref"
  | "rule_ids"
  | "risk_score"
  | "action_count";

export interface FindingSort {
  key: FindingSortKey;
  direction: SortDirection;
}

/** The API returns newest identification first, so the register opens the same way. */
export const DEFAULT_FINDING_SORT: FindingSort = {
  key: "identified_date",
  direction: "desc",
};

const defaultDirections: Record<FindingSortKey, SortDirection> = {
  finding_ref: "asc",
  title: "asc",
  severity: "asc",
  status: "asc",
  department: "asc",
  root_cause_category: "asc",
  identified_date: "desc",
  audit_ref: "asc",
  rule_ids: "desc",
  risk_score: "desc",
  action_count: "desc",
};

const severityOrder: Record<FindingSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const statusOrder: Record<FindingStatus, number> = {
  open: 0,
  in_progress: 1,
  resolved: 2,
  accepted: 3,
};

const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

function compareAscending(
  a: FindingListItem,
  b: FindingListItem,
  key: FindingSortKey,
): number {
  switch (key) {
    case "severity":
      return severityOrder[a.severity] - severityOrder[b.severity];
    case "status":
      return statusOrder[a.status] - statusOrder[b.status];
    case "identified_date":
      return a.identified_date.localeCompare(b.identified_date);
    case "rule_ids":
      return a.rule_ids.length - b.rule_ids.length;
    case "risk_score":
      return a.risk_score - b.risk_score;
    case "action_count":
      return a.action_count - b.action_count;
    case "finding_ref":
      return collator.compare(a.finding_ref, b.finding_ref);
    case "title":
      return collator.compare(a.title, b.title);
    case "department":
      return collator.compare(a.department, b.department);
    case "root_cause_category":
      return collator.compare(a.root_cause_category, b.root_cause_category);
    case "audit_ref":
      return collator.compare(a.audit_ref, b.audit_ref);
  }
}

/** Returns a sorted copy; the API response array is never mutated. */
export function sortFindings(
  items: readonly FindingListItem[],
  sort: FindingSort,
): FindingListItem[] {
  const factor = sort.direction === "asc" ? 1 : -1;

  return [...items].sort(
    (a, b) =>
      factor * compareAscending(a, b, sort.key) ||
      collator.compare(a.finding_ref, b.finding_ref),
  );
}

/** First click on a column uses its natural direction; later clicks toggle. */
export function nextFindingSort(
  current: FindingSort,
  key: FindingSortKey,
): FindingSort {
  if (current.key === key) {
    return {
      key,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }

  return { key, direction: defaultDirections[key] };
}

export interface FindingRegisterSummary {
  highCritical: number;
  unresolved: number;
  withRuleHits: number;
  directPoints: number;
}

/** Totals across the rows currently visible in the register. */
export function summarizeFindings(
  items: readonly FindingListItem[],
): FindingRegisterSummary {
  return items.reduce<FindingRegisterSummary>(
    (totals, item) => ({
      highCritical:
        totals.highCritical +
        (item.severity === "high" || item.severity === "critical" ? 1 : 0),
      unresolved:
        totals.unresolved +
        (item.status === "open" || item.status === "in_progress" ? 1 : 0),
      withRuleHits:
        totals.withRuleHits + (item.rule_ids.length > 0 ? 1 : 0),
      directPoints: totals.directPoints + item.risk_score,
    }),
    {
      highCritical: 0,
      unresolved: 0,
      withRuleHits: 0,
      directPoints: 0,
    },
  );
}
