/**
 * Shared API contracts mirrored from the backend Pydantic schemas.
 *
 * Only values the API actually returns are modelled here. Domain response
 * types are added with the page that consumes them so unused guesses never
 * become a second, drifting schema.
 */

export type Department =
  | "finance"
  | "procurement"
  | "human_resources"
  | "it"
  | "operations"
  | "compliance";

export type AuditType =
  | "financial"
  | "operational"
  | "compliance"
  | "it"
  | "special_review"
  | "follow_up";

export type AuditStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "cancelled";

export type FindingSeverity = "low" | "medium" | "high" | "critical";

export type FindingStatus = "open" | "in_progress" | "resolved" | "accepted";

export type ActionStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "blocked";

export type RootCauseCategory =
  | "process_gap"
  | "human_error"
  | "system_limitation"
  | "policy_non_compliance"
  | "segregation_of_duties"
  | "data_quality"
  | "external_factor";

/** Rule hits carry an alert severity, which is distinct from finding severity. */
export type AlertSeverity = FindingSeverity;

/** Fixed score bands returned by the backend. */
export type RiskBand = FindingSeverity;

export interface HealthResponse {
  status: string;
  application: string;
}

/** Envelope returned by the read-only list endpoints. */
export interface ListResponse<T> {
  as_of: string;
  total: number;
  items: T[];
}
