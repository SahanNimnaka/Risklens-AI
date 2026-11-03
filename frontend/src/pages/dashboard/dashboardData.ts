import type {
  ActionPlanListItem,
  ActionStatus,
  AuditAnomaly,
  AuditListItem,
  AuditStatus,
  FindingListItem,
  FindingSeverity,
  FindingStatus,
} from "../../api/types";

/**
 * Presentation-only aggregations over API records.
 *
 * No risk points, bands or overdue flags are recalculated here. The helpers
 * count values the backend already returned and apply deterministic ordering
 * for dashboard lists.
 */

export const FINDING_STATUSES: readonly FindingStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "accepted",
];

export const ACTION_STATUSES: readonly ActionStatus[] = [
  "not_started",
  "in_progress",
  "blocked",
  "completed",
];

export const AUDIT_STATUSES: readonly AuditStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "cancelled",
];

const UNRESOLVED_STATUSES: ReadonlySet<FindingStatus> = new Set([
  "open",
  "in_progress",
]);

const SEVERITY_WEIGHT: Record<FindingSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function zeroCounts<K extends string>(
  keys: readonly K[],
): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

export function countFindingsByStatus(
  items: readonly FindingListItem[],
): Record<FindingStatus, number> {
  const counts = zeroCounts(FINDING_STATUSES);
  for (const item of items) {
    counts[item.status] += 1;
  }
  return counts;
}

export function countActionsByStatus(
  items: readonly ActionPlanListItem[],
): Record<ActionStatus, number> {
  const counts = zeroCounts(ACTION_STATUSES);
  for (const item of items) {
    counts[item.status] += 1;
  }
  return counts;
}

export function countAuditsByStatus(
  items: readonly AuditListItem[],
): Record<AuditStatus, number> {
  const counts = zeroCounts(AUDIT_STATUSES);
  for (const item of items) {
    counts[item.status] += 1;
  }
  return counts;
}

/**
 * Unresolved high and critical findings, highest direct rule score first.
 * Finding risk scores are not portfolio scores, so severity acts as the
 * tie-breaker rather than a band label.
 */
export function selectPriorityFindings(
  items: readonly FindingListItem[],
  limit = 5,
): FindingListItem[] {
  return items
    .filter(
      (item) =>
        UNRESOLVED_STATUSES.has(item.status) &&
        (item.severity === "high" || item.severity === "critical"),
    )
    .sort(
      (a, b) =>
        b.risk_score - a.risk_score ||
        SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] ||
        b.identified_date.localeCompare(a.identified_date) ||
        a.finding_ref.localeCompare(b.finding_ref),
    )
    .slice(0, Math.max(0, limit));
}

/** Newest identified findings first, without mutating the API array. */
export function selectLatestFindings(
  items: readonly FindingListItem[],
  limit = 5,
): FindingListItem[] {
  return [...items]
    .sort(
      (a, b) =>
        b.identified_date.localeCompare(a.identified_date) ||
        a.finding_ref.localeCompare(b.finding_ref),
    )
    .slice(0, Math.max(0, limit));
}

export interface ActionSummary {
  total: number;
  overdue: number;
  blocked: number;
  byStatus: Record<ActionStatus, number>;
}

export function summarizeActions(
  items: readonly ActionPlanListItem[],
): ActionSummary {
  const byStatus = countActionsByStatus(items);
  return {
    total: items.length,
    overdue: items.filter((item) => item.is_overdue).length,
    blocked: byStatus.blocked,
    byStatus,
  };
}

/** Most overdue actions first, using the API-computed days overdue. */
export function selectOverdueActions(
  items: readonly ActionPlanListItem[],
  limit = 3,
): ActionPlanListItem[] {
  return items
    .filter((item) => item.is_overdue)
    .sort(
      (a, b) =>
        b.days_overdue - a.days_overdue ||
        a.due_date.localeCompare(b.due_date) ||
        a.action_id - b.action_id,
    )
    .slice(0, Math.max(0, limit));
}

export function countAuditsWithOverdueActions(
  items: readonly AuditListItem[],
): number {
  return items.filter((item) => item.overdue_action_count > 0).length;
}

export function countAuditsWithOpenFindings(
  items: readonly AuditListItem[],
): number {
  return items.filter((item) => item.open_finding_count > 0).length;
}

/** The API already ranks anomalies; re-sorting keeps the panel stable. */
export function selectTopAnomalies(
  items: readonly AuditAnomaly[],
  limit = 3,
): AuditAnomaly[] {
  return [...items]
    .sort(
      (a, b) =>
        b.anomaly_score - a.anomaly_score ||
        a.audit_ref.localeCompare(b.audit_ref),
    )
    .slice(0, Math.max(0, limit));
}
