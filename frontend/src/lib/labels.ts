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
