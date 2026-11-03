import type {
  ActionStatus,
  AuditStatus,
  AuditType,
  Department,
  FindingSeverity,
  FindingStatus,
  RootCauseCategory,
} from "../api/types";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

function optionsFrom<T extends string>(
  labels: Record<T, string>,
): SelectOption<T>[] {
  return (Object.keys(labels) as T[]).map((value) => ({
    value,
    label: labels[value],
  }));
}

export const departmentLabels: Record<Department, string> = {
  finance: "Finance",
  procurement: "Procurement",
  human_resources: "Human Resources",
  it: "IT",
  operations: "Operations",
  compliance: "Compliance",
};

export const auditTypeLabels: Record<AuditType, string> = {
  financial: "Financial",
  operational: "Operational",
  compliance: "Compliance",
  it: "IT",
  special_review: "Special review",
  follow_up: "Follow-up",
};

export const auditStatusLabels: Record<AuditStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const findingSeverityLabels: Record<FindingSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const findingStatusLabels: Record<FindingStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  accepted: "Accepted",
};

export const actionStatusLabels: Record<ActionStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  blocked: "Blocked",
};

export const rootCauseLabels: Record<RootCauseCategory, string> = {
  process_gap: "Process gap",
  human_error: "Human error",
  system_limitation: "System limitation",
  policy_non_compliance: "Policy non-compliance",
  segregation_of_duties: "Segregation of duties",
  data_quality: "Data quality",
  external_factor: "External factor",
};

/** Entity kinds that can own a rule hit. */
export const ruleEntityLabels: Record<string, string> = {
  action_plan: "Action plan",
  finding: "Finding",
  department: "Department",
  control: "Control",
};

export function ruleEntityLabel(entityType: string): string {
  return ruleEntityLabels[entityType] ?? entityType.replaceAll("_", " ");
}

/** Labels used by typed rule evidence from R6 weak-control hits. */
export const controlEffectivenessLabels: Record<string, string> = {
  effective: "Effective",
  partially_effective: "Partially effective",
  ineffective: "Ineffective",
  not_tested: "Not tested",
};

export const controlCategoryLabels: Record<string, string> = {
  access_management: "Access management",
  segregation_of_duties: "Segregation of duties",
  reconciliation: "Reconciliation",
  approval_workflow: "Approval workflow",
  change_management: "Change management",
  vendor_management: "Vendor management",
  data_protection: "Data protection",
  physical_security: "Physical security",
  training_awareness: "Training awareness",
};

export function departmentOptions(): SelectOption<Department>[] {
  return optionsFrom(departmentLabels);
}

export function auditTypeOptions(): SelectOption<AuditType>[] {
  return optionsFrom(auditTypeLabels);
}

export function auditStatusOptions(): SelectOption<AuditStatus>[] {
  return optionsFrom(auditStatusLabels);
}

export function findingSeverityOptions(): SelectOption<FindingSeverity>[] {
  return optionsFrom(findingSeverityLabels);
}

export function findingStatusOptions(): SelectOption<FindingStatus>[] {
  return optionsFrom(findingStatusLabels);
}

export function actionStatusOptions(): SelectOption<ActionStatus>[] {
  return optionsFrom(actionStatusLabels);
}

export function rootCauseOptions(): SelectOption<RootCauseCategory>[] {
  return optionsFrom(rootCauseLabels);
}

/** Human-readable labels for the fixed anomaly feature names. */
export const anomalyFeatureLabels: Record<string, string> = {
  finding_count: "Finding count",
  critical_unresolved_count: "Unresolved criticals",
  high_critical_share: "High/critical share",
  overdue_action_rate: "Overdue action rate",
  mean_days_overdue: "Mean days overdue",
  blocked_action_count: "Blocked actions",
  weak_control_finding_share: "Weak-control finding share",
  unactioned_finding_share: "Unactioned finding share",
  resolved_share: "Resolved share",
  root_cause_diversity: "Root-cause diversity",
  mean_remediation_window_days: "Remediation window (days)",
};

export function anomalyFeatureLabel(feature: string): string {
  return anomalyFeatureLabels[feature] ?? feature.replaceAll("_", " ");
}

export const deviationDirectionLabels: Record<string, string> = {
  above_peer: "above peer median",
  below_peer: "below peer median",
  at_peer: "at peer median",
};

export function deviationDirectionLabel(direction: string): string {
  return deviationDirectionLabels[direction] ?? direction;
}
