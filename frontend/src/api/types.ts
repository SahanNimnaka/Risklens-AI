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

/** One deterministic rule application, as returned inside finding/action rows. */
export interface RuleHit {
  rule_id: string;
  rule_name: string;
  severity: AlertSeverity;
  points: number;
  entity_type: string;
  entity_ref: string;
  department: Department;
  finding_ref: string | null;
  control_ref: string | null;
  audit_ref: string | null;
  reason: string;
  evidence: Record<string, unknown>;
}

/** Aggregate count and points for one rule. */
export interface RuleBreakdown {
  rule_id: string;
  rule_name: string;
  severity: AlertSeverity;
  entity_type: string;
  hits: number;
  points: number;
}

/** Unresolved findings by severity, reported as context only. */
export interface OpenFindingCounts {
  low: number;
  medium: number;
  high: number;
  critical: number;
  total: number;
}

export interface DepartmentSummary {
  department: Department;
  score: number;
  band: RiskBand;
  hit_count: number;
  breakdown: RuleBreakdown[];
  open_findings: OpenFindingCounts;
}

export interface PortfolioSummary {
  as_of: string;
  score: number;
  band: RiskBand;
  total_hits: number;
  breakdown: RuleBreakdown[];
  open_findings: OpenFindingCounts;
  departments: DepartmentSummary[];
}

export interface AuditListItem {
  audit_ref: string;
  title: string;
  department: Department;
  audit_type: AuditType;
  lead_auditor: string;
  start_date: string;
  end_date: string | null;
  status: AuditStatus;
  finding_count: number;
  open_finding_count: number;
  action_count: number;
  overdue_action_count: number;
}

export type AuditListResponse = ListResponse<AuditListItem>;

export interface FindingListItem {
  finding_ref: string;
  title: string;
  severity: FindingSeverity;
  status: FindingStatus;
  root_cause_category: RootCauseCategory;
  identified_date: string;
  audit_ref: string;
  audit_title: string;
  department: Department;
  control_ref: string | null;
  action_count: number;
  risk_score: number;
  risk_band: RiskBand;
  rule_ids: string[];
}

export type FindingListResponse = ListResponse<FindingListItem>;

/**
 * One finding with its direct rule hits and related recurrence clusters.
 *
 * `score` sums only hits attributed directly to the finding. The hits in
 * `related_department_hits` are Rule 4 clusters whose points belong to the
 * department, so they are context and never part of the direct score.
 */
export interface FindingRisk {
  as_of: string;
  finding_ref: string;
  audit_ref: string;
  department: Department;
  severity: FindingSeverity;
  status: FindingStatus;
  identified_date: string;
  included_in_scoring: boolean;
  score: number;
  band: RiskBand;
  hits: RuleHit[];
  related_department_hits: RuleHit[];
}

/** Department summary plus every rule hit attributed to it. */
export interface DepartmentRiskDetail extends DepartmentSummary {
  hits: RuleHit[];
}

export interface ActionPlanListItem {
  action_id: number;
  action_description: string;
  assigned_owner: string;
  due_date: string;
  status: ActionStatus;
  completion_date: string | null;
  is_overdue: boolean;
  days_overdue: number;
  finding_ref: string;
  finding_title: string;
  finding_severity: FindingSeverity;
  finding_status: FindingStatus;
  audit_ref: string;
  audit_title: string;
  department: Department;
  rule_points: number;
  rule_hits: RuleHit[];
}

export type ActionPlanListResponse = ListResponse<ActionPlanListItem>;

export type DeviationDirection = "above_peer" | "below_peer" | "at_peer";

export interface FeatureDeviation {
  feature: string;
  value: number;
  peer_median: number;
  robust_z: number;
  direction: DeviationDirection;
}

export interface AuditAnomaly {
  audit_ref: string;
  audit_title: string;
  department: Department;
  anomaly_score: number;
  score_percentile: number;
  is_anomaly: boolean;
  rule_points: number;
  rule_ids: string[];
  features: Record<string, number>;
  deviations: FeatureDeviation[];
}

export interface AnomalyDetector {
  method: string;
  n_estimators: number;
  contamination: number;
  random_state: number;
  min_peer_audits: number;
  feature_names: string[];
}

export interface AnomalyListResponse {
  as_of: string;
  detector: AnomalyDetector;
  disclaimer: string;
  total: number;
  flagged: number;
  audits: AuditAnomaly[];
}

export interface AuditAnomalyDetail extends AuditAnomaly {
  as_of: string;
  disclaimer: string;
  all_deviations: FeatureDeviation[];
}
