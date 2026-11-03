import type { AuditAnomaly, Department } from "../../api/types";
import type { SortDirection } from "../../components/ui/DataTable";

/**
 * Presentation-only filtering, ordering and totals for the anomaly register.
 *
 * The API returns every eligible audit ranked by anomaly score. Department and
 * flag filters are applied to those rows in the browser; scores, percentiles
 * and deviations are never recalculated. Sorting only reorders the same rows.
 */

export type AnomalySortKey =
  | "audit_ref"
  | "audit_title"
  | "department"
  | "anomaly_score"
  | "score_percentile"
  | "is_anomaly"
  | "rule_points";

export interface AnomalySort {
  key: AnomalySortKey;
  direction: SortDirection;
}

/** The API returns the most unusual audit first, so the register opens that way. */
export const DEFAULT_ANOMALY_SORT: AnomalySort = {
  key: "anomaly_score",
  direction: "desc",
};

const defaultDirections: Record<AnomalySortKey, SortDirection> = {
  audit_ref: "asc",
  audit_title: "asc",
  department: "asc",
  anomaly_score: "desc",
  score_percentile: "desc",
  is_anomaly: "desc",
  rule_points: "desc",
};

export interface AnomalyFilters {
  department: Department | "";
  flagged: "" | "true" | "false";
}

export function filterAnomalies(
  audits: readonly AuditAnomaly[],
  filters: AnomalyFilters,
): AuditAnomaly[] {
  return audits.filter((audit) => {
    if (filters.department && audit.department !== filters.department) {
      return false;
    }
    if (filters.flagged === "true" && !audit.is_anomaly) {
      return false;
    }
    if (filters.flagged === "false" && audit.is_anomaly) {
      return false;
    }
    return true;
  });
}

const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

function compareAscending(
  a: AuditAnomaly,
  b: AuditAnomaly,
  key: AnomalySortKey,
): number {
  switch (key) {
    case "audit_ref":
      return collator.compare(a.audit_ref, b.audit_ref);
    case "audit_title":
      return collator.compare(a.audit_title, b.audit_title);
    case "department":
      return collator.compare(a.department, b.department);
    case "anomaly_score":
      return a.anomaly_score - b.anomaly_score;
    case "score_percentile":
      return a.score_percentile - b.score_percentile;
    case "is_anomaly":
      return Number(a.is_anomaly) - Number(b.is_anomaly);
    case "rule_points":
      return a.rule_points - b.rule_points;
  }
}

/** Returns a sorted copy; the API response array is never mutated. */
export function sortAnomalies(
  audits: readonly AuditAnomaly[],
  sort: AnomalySort,
): AuditAnomaly[] {
  const factor = sort.direction === "asc" ? 1 : -1;

  return [...audits].sort((a, b) => {
    const compared = factor * compareAscending(a, b, sort.key);
    return compared || collator.compare(a.audit_ref, b.audit_ref);
  });
}

/** First click on a column uses its natural direction; later clicks toggle. */
export function nextAnomalySort(
  current: AnomalySort,
  key: AnomalySortKey,
): AnomalySort {
  if (current.key === key) {
    return {
      key,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }

  return { key, direction: defaultDirections[key] };
}

export interface AnomalyRegisterSummary {
  matching: number;
  flagged: number;
  highestScore: number | null;
  rulePoints: number;
}

/** Totals across the rows currently visible in the register. */
export function summarizeAnomalies(
  audits: readonly AuditAnomaly[],
): AnomalyRegisterSummary {
  let flagged = 0;
  let highestScore: number | null = null;
  let rulePoints = 0;

  for (const audit of audits) {
    if (audit.is_anomaly) {
      flagged += 1;
    }
    if (highestScore === null || audit.anomaly_score > highestScore) {
      highestScore = audit.anomaly_score;
    }
    rulePoints += audit.rule_points;
  }

  return {
    matching: audits.length,
    flagged,
    highestScore,
    rulePoints,
  };
}
